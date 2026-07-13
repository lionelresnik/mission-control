import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import {
  projects, roles, teams, knowledgeEntries, settings, todos,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import * as yaml from "js-yaml"
import JSZip from "jszip"

// ─── v1 → v2 normalizers ─────────────────────────────────────────────────────

function normalizeRole(raw: Record<string, unknown>): Omit<typeof roles.$inferInsert, "createdAt"> {
  return {
    id: (raw.id as string) ?? crypto.randomUUID(),
    name: raw.name as string,
    displayName: (raw.display_name ?? raw.displayName ?? raw.name) as string,
    description: (raw.description as string) ?? null,
    systemPrompt: (raw.system_prompt ?? raw.systemPrompt ?? "") as string,
    tools: (raw.tools as string[]) ?? [],
    allowedActions: ((raw.allowed_actions ?? raw.allowedActions) as string[]) ?? [],
    temperature: (raw.temperature as number) ?? 0.7,
    maxTokens: ((raw.max_tokens ?? raw.maxTokens) as number) ?? 4096,
    model: (raw.model as string) ?? "claude-sonnet",
    memoryScope: ((raw.memory_scope ?? raw.memoryScope) as "mission" | "project" | "global") ?? "mission",
    isBuiltIn: ((raw.is_built_in ?? raw.isBuiltIn) as boolean) ?? false,
    icon: (raw.icon as string) ?? "User",
    color: (raw.color as string) ?? "#6b7280",
  }
}

function normalizeTeam(
  raw: Record<string, unknown>,
  roleNameToId: Record<string, string>
): Omit<typeof teams.$inferInsert, "createdAt"> {
  // v1 members use {role: name, order: n}, v2 uses {roleId: id, order: n}
  const rawMembers = (raw.members ?? []) as Array<{ role?: string; roleId?: string; order: number }>
  const members = rawMembers.map(m => ({
    roleId: m.roleId ?? roleNameToId[m.role ?? ""] ?? m.role ?? "",
    order: m.order,
  }))

  // v1 leader is a role name, v2 is roleId
  const leaderRaw = (raw.leader ?? raw.leaderId) as string | null
  const leaderId = leaderRaw
    ? (roleNameToId[leaderRaw] ?? leaderRaw)
    : null

  return {
    id: (raw.id as string) ?? crypto.randomUUID(),
    name: raw.name as string,
    description: (raw.description as string) ?? null,
    leaderId,
    members,
    knowledgeFilters: ((raw.knowledge_filters ?? raw.knowledgeFilters) as string[]) ?? [],
    mcps: (raw.mcps as string[]) ?? [],
    workflow: (raw.workflow as string[]) ?? [],
    yamlPath: (raw.yaml_path ?? raw.yamlPath) as string ?? null,
    isBuiltIn: ((raw.is_built_in ?? raw.isBuiltIn) as boolean) ?? false,
  }
}

function normalizeKnowledge(
  raw: Record<string, unknown>,
  projectIdFallback: string
): Omit<typeof knowledgeEntries.$inferInsert, "createdAt" | "updatedAt" | "embedding"> {
  return {
    id: (raw.id as string) ?? crypto.randomUUID(),
    projectId: (raw.projectId ?? raw.project_id ?? projectIdFallback) as string,
    type: (raw.type as typeof knowledgeEntries.$inferInsert["type"]) ?? "other",
    title: raw.title as string,
    content: raw.content as string,
    confidence: (raw.confidence as "confirmed" | "assumed" | "investigating") ?? "confirmed",
    sourceMissionId: (raw.sourceMissionId ?? raw.source_mission_id) as string ?? null,
    sourceFile: (raw.sourceFile ?? raw.source_file) as string ?? null,
    tags: (raw.tags as string[]) ?? [],
  }
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

async function upsertRole(db: ReturnType<typeof getDb>, role: ReturnType<typeof normalizeRole>) {
  const existing = await db.select().from(roles).where(eq(roles.id, role.id))
  if (existing.length > 0) {
    await db.update(roles).set(role).where(eq(roles.id, role.id))
  } else {
    await db.insert(roles).values({ ...role, createdAt: new Date().toISOString() }).onConflictDoNothing()
  }
}

async function upsertTeam(db: ReturnType<typeof getDb>, team: ReturnType<typeof normalizeTeam>) {
  const existing = await db.select().from(teams).where(eq(teams.id, team.id))
  if (existing.length > 0) {
    await db.update(teams).set(team).where(eq(teams.id, team.id))
  } else {
    await db.insert(teams).values({ ...team, createdAt: new Date().toISOString() }).onConflictDoNothing()
  }
}

// ─── Parse YAML content (single file or array of docs) ───────────────────────

function parseYamlDocs(content: string): Record<string, unknown>[] {
  const docs: Record<string, unknown>[] = []
  yaml.loadAll(content, doc => { if (doc) docs.push(doc as Record<string, unknown>) })
  return docs
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const db = getDb()
  const stats = { roles: 0, teams: 0, knowledge: 0, projects: 0, settings: 0, todos: 0, errors: [] as string[] }

  try {
    const contentType = req.headers.get("content-type") ?? ""

    // ── Multipart (file upload) ──────────────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      const file = form.get("file") as File | null
      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

      const buffer = Buffer.from(await file.arrayBuffer())
      const name = file.name.toLowerCase()

      if (name.endsWith(".zip")) {
        const zip = await JSZip.loadAsync(buffer)
        const roleNameToId: Record<string, string> = {}

        // First pass: roles
        const roleFiles = Object.keys(zip.files).filter(f => f.startsWith("roles/") && f.endsWith(".yaml"))
        for (const path of roleFiles) {
          const content = await zip.files[path].async("string")
          const docs = parseYamlDocs(content)
          for (const raw of docs) {
            const role = normalizeRole(raw)
            roleNameToId[role.name] = role.id
            await upsertRole(db, role)
            stats.roles++
          }
        }

        // Second pass: teams (need role name → id mapping)
        const teamFiles = Object.keys(zip.files).filter(f => f.startsWith("teams/") && f.endsWith(".yaml"))
        for (const path of teamFiles) {
          const content = await zip.files[path].async("string")
          const docs = parseYamlDocs(content)
          for (const raw of docs) {
            const team = normalizeTeam(raw, roleNameToId)
            await upsertTeam(db, team)
            stats.teams++
          }
        }

        // JSON bundle inside zip
        const bundleFile = zip.files["mission-control-bundle.json"]
        if (bundleFile) {
          const content = await bundleFile.async("string")
          const bundle = JSON.parse(content)
          await importBundle(db, bundle, stats)
        }

      } else if (name.endsWith(".yaml") || name.endsWith(".yml")) {
        const content = buffer.toString("utf-8")
        const docs = parseYamlDocs(content)
        const allRoles = await db.select().from(roles)
        const roleNameToId = Object.fromEntries(allRoles.map(r => [r.name, r.id]))

        for (const raw of docs) {
          if (raw.system_prompt || raw.systemPrompt) {
            const role = normalizeRole(raw)
            roleNameToId[role.name] = role.id
            await upsertRole(db, role)
            stats.roles++
          } else if (raw.members || raw.workflow) {
            const team = normalizeTeam(raw, roleNameToId)
            await upsertTeam(db, team)
            stats.teams++
          }
        }

      } else if (name.endsWith(".json")) {
        const bundle = JSON.parse(buffer.toString("utf-8"))
        await importBundle(db, bundle, stats)
      } else {
        return NextResponse.json({ error: "Unsupported file type. Use .json, .yaml, or .zip" }, { status: 400 })
      }

    } else {
      // ── JSON body (API usage) ─────────────────────────────────────────────
      const bundle = await req.json()
      await importBundle(db, bundle, stats)
    }

  } catch (e) {
    stats.errors.push(String(e))
  }

  return NextResponse.json({ ok: true, stats })
}

// ─── Bundle importer (v2 JSON format) ────────────────────────────────────────

async function importBundle(
  db: ReturnType<typeof getDb>,
  bundle: Record<string, unknown>,
  stats: { roles: number; teams: number; knowledge: number; projects: number; settings: number; todos: number; errors: string[] }
) {
  // Build roleNameToId from the bundle roles first
  const bundleRoles = (bundle.roles as Record<string, unknown>[] | undefined) ?? []
  const bundleRoleNameToId: Record<string, string> = {}

  // Projects
  if (Array.isArray(bundle.projects)) {
    for (const raw of bundle.projects as Record<string, unknown>[]) {
      try {
        await db.insert(projects).values(raw as typeof projects.$inferInsert).onConflictDoNothing()
        stats.projects++
      } catch { /* skip dup */ }
    }
  }

  // Roles
  for (const raw of bundleRoles) {
    const role = normalizeRole(raw)
    bundleRoleNameToId[role.name] = role.id
    await upsertRole(db, role)
    stats.roles++
  }

  // Teams
  if (Array.isArray(bundle.teams)) {
    for (const raw of bundle.teams as Record<string, unknown>[]) {
      const team = normalizeTeam(raw, bundleRoleNameToId)
      await upsertTeam(db, team)
      stats.teams++
    }
  }

  // Knowledge — need at least one project to exist
  if (Array.isArray(bundle.knowledge) && (bundle.knowledge as []).length > 0) {
    const firstProject = await db.select().from(projects).limit(1)
    const fallbackProjectId = firstProject[0]?.id ?? ""
    for (const raw of bundle.knowledge as Record<string, unknown>[]) {
      try {
        const entry = normalizeKnowledge(raw, fallbackProjectId)
        await db.insert(knowledgeEntries)
          .values({ ...entry, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() })
          .onConflictDoNothing()
        stats.knowledge++
      } catch { /* skip dup */ }
    }
  }

  // Settings
  if (bundle.settings && typeof bundle.settings === "object") {
    for (const [key, value] of Object.entries(bundle.settings as Record<string, unknown>)) {
      try {
        await db.insert(settings)
          .values({ key, value, updatedAt: new Date().toISOString() })
          .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } })
        stats.settings++
      } catch { /* skip */ }
    }
  }

  // Todos
  if (Array.isArray(bundle.todos)) {
    for (const raw of bundle.todos as Record<string, unknown>[]) {
      try {
        await db.insert(todos).values(raw as typeof todos.$inferInsert).onConflictDoNothing()
        stats.todos++
      } catch { /* skip dup */ }
    }
  }
}
