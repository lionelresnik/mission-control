import { nanoid } from "nanoid"
import { eq } from "drizzle-orm"
import type { getDb } from "@/lib/db"
import { classifyCcPath, titleFromContent } from "@/lib/knowledge/content-format"
import { knowledgeEntries, projects, settings, todos, workspaces } from "@/lib/db/schema"

export type CcImportStats = {
  workspaces: number
  projects: number
  todos: number
  knowledge: number
  profile: number
  standups: number
  errors: string[]
}

export function isCommandCenterExport(bundle: Record<string, unknown>): boolean {
  if (bundle.projects || bundle.roles || bundle.teams) return false
  return (
    bundle.version === "2.0" &&
    typeof bundle.workspaces === "object" &&
    bundle.workspaces !== null &&
    (typeof bundle.todos === "string" ||
      typeof bundle.task_history === "object" ||
      typeof bundle.profile === "object")
  )
}

function parseTodosMarkdown(raw: string): Array<{
  content: string
  status: "pending" | "in_progress" | "done"
  priority: "high" | "medium" | "low"
  ticketTag: string | null
}> {
  const parsed: Array<{
    content: string
    status: "pending" | "in_progress" | "done"
    priority: "high" | "medium" | "low"
    ticketTag: string | null
  }> = []
  let currentStatus: "pending" | "in_progress" | "done" = "pending"

  for (const line of raw.split("\n")) {
    if (/^##\s+In Progress/i.test(line)) currentStatus = "in_progress"
    else if (/^##\s+Pending/i.test(line)) currentStatus = "pending"
    else if (/^##\s+Done/i.test(line)) currentStatus = "done"
    else if (line.startsWith("### ")) {
      const title = line.slice(4).trim()
      const ticketMatch = title.match(/^([A-Z]+-\d+)/)
      parsed.push({
        content: title,
        status: currentStatus,
        priority: currentStatus === "in_progress" ? "high" : "medium",
        ticketTag: ticketMatch ? ticketMatch[1] : null,
      })
    }
  }
  return parsed
}

async function upsertWorkspace(
  db: ReturnType<typeof getDb>,
  name: string,
  repoPaths: string[]
): Promise<string> {
  const existing = await db.select().from(workspaces).where(eq(workspaces.name, name)).limit(1)
  const now = new Date().toISOString()
  if (existing[0]) {
    await db
      .update(workspaces)
      .set({ repoPaths, updatedAt: now })
      .where(eq(workspaces.id, existing[0].id))
    return existing[0].id
  }
  const id = nanoid()
  await db.insert(workspaces).values({
    id,
    name,
    repoPaths,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

async function upsertProject(
  db: ReturnType<typeof getDb>,
  name: string,
  workspaceId: string,
  repoPath: string | null
): Promise<string> {
  const all = await db.select().from(projects).where(eq(projects.workspaceId, workspaceId))
  const existing = all.find(p => p.name === name)
  const now = new Date().toISOString()
  if (existing) {
    if (repoPath && !existing.githubRepo) {
      await db.update(projects).set({ updatedAt: now }).where(eq(projects.id, existing.id))
    }
    return existing.id
  }
  const id = nanoid()
  const repoBase = repoPath?.split("/").pop() ?? name
  await db.insert(projects).values({
    id,
    name,
    workspaceId,
    githubRepo: repoBase,
    description: repoPath ? `Imported from ${repoPath}` : `Workspace project for ${name}`,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

/** workspace → repo name → project id */
async function importProjectsFromWorkspaces(
  db: ReturnType<typeof getDb>,
  wsMap: Record<string, { repos?: Array<{ name: string; path: string }>; dirs?: string[] }>,
  workspaceIds: Record<string, string>
): Promise<{ map: Record<string, Record<string, string>>; count: number }> {
  const map: Record<string, Record<string, string>> = {}
  let count = 0

  for (const [wsName, def] of Object.entries(wsMap)) {
    const wsId = workspaceIds[wsName]
    if (!wsId) continue
    map[wsName] = {}

    const repos = def.repos ?? []
    if (repos.length === 0) {
      map[wsName]["_default"] = await upsertProject(db, wsName, wsId, def.dirs?.[0] ?? null)
      count++
      continue
    }

    for (const repo of repos) {
      map[wsName][repo.name] = await upsertProject(db, repo.name, wsId, repo.path)
      count++
    }
  }

  return { map, count }
}

function resolveProjectId(
  filePath: string,
  wsKey: string,
  projectMap: Record<string, Record<string, string>>
): string | null {
  const wsProjects = projectMap[wsKey]
  if (!wsProjects) return null
  for (const segment of filePath.split("/")) {
    if (wsProjects[segment]) return wsProjects[segment]
  }
  return wsProjects["_default"] ?? Object.values(wsProjects)[0] ?? null
}

async function importFilesAsKnowledge(
  db: ReturnType<typeof getDb>,
  files: Record<string, string>,
  workspaceIds: Record<string, string>,
  projectMap: Record<string, Record<string, string>>,
  stats: CcImportStats,
  sourcePrefix: string
) {
  for (const [filePath, content] of Object.entries(files)) {
    if (!content?.trim() || filePath === "README.md") continue
    try {
      const segments = filePath.split("/")
      const wsKey = segments.length > 1 ? segments[0] : "shared"
      const workspaceId = workspaceIds[wsKey] ?? workspaceIds["shared"] ?? null
      const projectId = resolveProjectId(filePath, wsKey, projectMap)
      const title = titleFromContent(content, filePath)
      const { type, tags } = classifyCcPath(filePath, sourcePrefix)

      const existing = await db
        .select({ id: knowledgeEntries.id })
        .from(knowledgeEntries)
        .where(eq(knowledgeEntries.sourceFile, `${sourcePrefix}:${filePath}`))
        .limit(1)

      const now = new Date().toISOString()
      const values = {
        projectId,
        workspaceId: projectId ? null : workspaceId,
        type,
        title,
        content: content.slice(0, 500000),
        confidence: "confirmed" as const,
        sourceFile: `${sourcePrefix}:${filePath}`,
        tags,
        updatedAt: now,
      }

      if (existing.length > 0) {
        await db.update(knowledgeEntries).set(values).where(eq(knowledgeEntries.id, existing[0].id))
        stats.knowledge++
        continue
      }

      await db.insert(knowledgeEntries).values({
        id: nanoid(),
        ...values,
        createdAt: now,
      })
      stats.knowledge++
    } catch (e) {
      stats.errors.push(`${filePath}: ${String(e)}`)
    }
  }
}

export async function importCommandCenterExport(
  db: ReturnType<typeof getDb>,
  bundle: Record<string, unknown>,
  stats: CcImportStats
) {
  const workspaceIds: Record<string, string> = {}

  const wsMap = bundle.workspaces as Record<
    string,
    { repos?: Array<{ name: string; path: string }>; dirs?: string[] }
  > | undefined

  if (wsMap && typeof wsMap === "object") {
    for (const [name, def] of Object.entries(wsMap)) {
      try {
        const repoPaths = [
          ...(def.repos?.map(r => r.path).filter(Boolean) ?? []),
          ...(def.dirs ?? []),
        ]
        workspaceIds[name] = await upsertWorkspace(db, name, repoPaths)
        stats.workspaces++
      } catch (e) {
        stats.errors.push(`workspace ${name}: ${String(e)}`)
      }
    }
  }

  const { map: projectMap, count: projectCount } = wsMap
    ? await importProjectsFromWorkspaces(db, wsMap, workspaceIds)
    : { map: {}, count: 0 }
  stats.projects = projectCount

  const profile = bundle.profile as Record<string, unknown> | undefined
  if (profile && typeof profile === "object") {
    try {
      const now = new Date().toISOString()
      await db
        .insert(settings)
        .values({ key: "ccProfile", value: profile, updatedAt: now })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: profile, updatedAt: now },
        })
      stats.profile++
    } catch (e) {
      stats.errors.push(`profile: ${String(e)}`)
    }
  }

  for (const key of ["todos", "todos_archive"] as const) {
    const raw = bundle[key]
    if (typeof raw !== "string" || !raw.trim()) continue
    for (const t of parseTodosMarkdown(raw)) {
      try {
        const existing = await db
          .select({ id: todos.id })
          .from(todos)
          .where(eq(todos.content, t.content))
          .limit(1)
        if (existing.length > 0) continue
        const now = new Date().toISOString()
        await db.insert(todos).values({
          id: nanoid(),
          content: t.content,
          status: t.status,
          priority: t.priority,
          ticketTag: t.ticketTag,
          createdAt: now,
          updatedAt: now,
        })
        stats.todos++
      } catch (e) {
        stats.errors.push(`todo "${t.content.slice(0, 40)}": ${String(e)}`)
      }
    }
  }

  const taskHistory = bundle.task_history as Record<string, string> | undefined
  if (taskHistory && typeof taskHistory === "object") {
    await importFilesAsKnowledge(db, taskHistory, workspaceIds, projectMap, stats, "task-history")
  }

  const docs = bundle.docs as Record<string, string> | undefined
  if (docs && typeof docs === "object") {
    await importFilesAsKnowledge(db, docs, workspaceIds, projectMap, stats, "docs")
  }

  const standups = bundle.standups as Record<string, string> | undefined
  if (standups && typeof standups === "object") {
    for (const [filePath, content] of Object.entries(standups)) {
      if (!content?.trim()) continue
      try {
        const title = `Standup ${filePath.replace(/\.md$/, "")}`
        const sourceFile = `standups:${filePath}`
        const existing = await db
          .select({ id: knowledgeEntries.id })
          .from(knowledgeEntries)
          .where(eq(knowledgeEntries.sourceFile, sourceFile))
          .limit(1)
        if (existing.length > 0) continue
        const { type, tags } = classifyCcPath(filePath, "standups")
        const now = new Date().toISOString()
        await db.insert(knowledgeEntries).values({
          id: nanoid(),
          projectId: null,
          workspaceId: null,
          type,
          title,
          content: content.slice(0, 50000),
          confidence: "confirmed",
          sourceFile,
          tags,
          createdAt: now,
          updatedAt: now,
        })
        stats.standups++
        stats.knowledge++
      } catch (e) {
        stats.errors.push(`standup ${filePath}: ${String(e)}`)
      }
    }
  }
}

export function ccImportTotal(stats: CcImportStats): number {
  return stats.workspaces + stats.projects + stats.todos + stats.knowledge + stats.profile
}
