import { eq, desc } from "drizzle-orm"
import { getDb, schema } from "./index"
import { nanoid } from "nanoid"

/** Safely parse JSON — returns fallback instead of throwing */
function safeJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value !== "string") return value as T
  try { return JSON.parse(value) as T } catch { return fallback }
}

const {
  projects, missions, knowledgeEntries, artifacts,
  missionQuestions, todos, dailyLogs, roles, teams, workspaces,
} = schema

// ─── Projects ────────────────────────────────────────────────────────────────

export async function getProjects() {
  return getDb().select().from(projects).orderBy(desc(projects.createdAt))
}

export async function getProject(id: string) {
  const rows = await getDb().select().from(projects).where(eq(projects.id, id))
  return rows[0] ?? null
}

export async function createProject(data: {
  name: string
  description?: string
  color?: string
  githubRepo?: string
  githubOwner?: string
  jiraProject?: string
  slackChannel?: string
}) {
  const id = nanoid()
  await getDb().insert(projects).values({ id, ...data })
  return getProject(id)
}

export async function updateProject(id: string, data: Partial<typeof projects.$inferInsert>) {
  await getDb().update(projects).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(projects.id, id))
  return getProject(id)
}

// ─── Missions ────────────────────────────────────────────────────────────────

export async function getMissions(projectId?: string) {
  if (projectId) {
    return getDb().select().from(missions)
      .where(eq(missions.projectId, projectId))
      .orderBy(desc(missions.createdAt))
  }
  return getDb().select().from(missions).orderBy(desc(missions.createdAt))
}

export async function getMission(id: string) {
  const rows = await getDb().select().from(missions).where(eq(missions.id, id))
  return rows[0] ?? null
}

export async function createMission(data: {
  name?: string
  goal: string
  projectId?: string
  workspaceId?: string
  projectIds?: string[]
  teamId?: string
  ticketId?: string
  agentBehavior?: "assume_and_document" | "ask_me" | "async"
}) {
  const id = nanoid()
  const projectIds = data.projectIds?.length ? data.projectIds : data.projectId ? [data.projectId] : []
  const projectId = data.projectId ?? projectIds[0]

  if (!projectId && !data.workspaceId) {
    throw new Error("projectId, projectIds, or workspaceId required")
  }

  await getDb().insert(missions).values({
    id,
    name: data.name || data.goal.slice(0, 60),
    goal: data.goal,
    projectId: projectId ?? null,
    workspaceId: data.workspaceId ?? null,
    projectIds,
    teamId: data.teamId,
    ticketId: data.ticketId,
    agentBehavior: data.agentBehavior ?? "assume_and_document",
    status: "pending",
  })
  return getMission(id)
}

export async function updateMission(id: string, data: Partial<typeof missions.$inferInsert>) {
  await getDb()
    .update(missions)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(missions.id, id))
  return getMission(id)
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export async function getMissionArtifacts(missionId: string) {
  return getDb().select().from(artifacts)
    .where(eq(artifacts.missionId, missionId))
    .orderBy(artifacts.createdAt)
}

export async function createArtifact(data: {
  missionId: string
  roleId?: string
  roleName?: string
  type: "plan" | "code" | "review" | "findings" | "runbook" | "other"
  title?: string
  content: string
}) {
  const id = nanoid()
  await getDb().insert(artifacts).values({ id, ...data })
  const rows = await getDb().select().from(artifacts).where(eq(artifacts.id, id))
  return rows[0]
}

// ─── Mission Questions ────────────────────────────────────────────────────────

export async function getMissionQuestions(missionId: string) {
  return getDb().select().from(missionQuestions)
    .where(eq(missionQuestions.missionId, missionId))
    .orderBy(missionQuestions.createdAt)
}

export async function createQuestion(data: {
  missionId: string
  roleId?: string
  roleName?: string
  question: string
  isAssumption?: boolean
}) {
  const id = nanoid()
  await getDb().insert(missionQuestions).values({ id, ...data })
  const rows = await getDb().select().from(missionQuestions).where(eq(missionQuestions.id, id))
  return rows[0]
}

export async function answerQuestion(id: string, answer: string) {
  await getDb()
    .update(missionQuestions)
    .set({ answer, answeredAt: new Date().toISOString() })
    .where(eq(missionQuestions.id, id))
}

// ─── Knowledge ───────────────────────────────────────────────────────────────

export async function getKnowledgeEntries(projectId?: string) {
  if (projectId) {
    return getDb().select().from(knowledgeEntries)
      .where(eq(knowledgeEntries.projectId, projectId))
      .orderBy(desc(knowledgeEntries.updatedAt))
  }
  return getDb().select().from(knowledgeEntries).orderBy(desc(knowledgeEntries.updatedAt))
}

export async function createKnowledgeEntry(data: {
  projectId?: string
  workspaceId?: string
  type: "architecture" | "pattern" | "adr" | "standard" | "glossary" | "database" | "infrastructure" | "logs" | "services" | "runbook" | "other"
  title: string
  content: string
  confidence?: "confirmed" | "assumed" | "investigating"
  sourceMissionId?: string
  tags?: string[]
}) {
  if (!data.projectId && !data.workspaceId) {
    throw new Error("projectId or workspaceId required")
  }
  const id = nanoid()
  await getDb().insert(knowledgeEntries).values({ id, ...data })
  const rows = await getDb().select().from(knowledgeEntries).where(eq(knowledgeEntries.id, id))
  return rows[0]
}

export async function getWorkspaces() {
  const rows = await getDb().select().from(workspaces).orderBy(workspaces.name)
  const allProjects = await getDb().select().from(projects)
  return rows.map(ws => ({
    ...ws,
    projects: allProjects.filter(p => p.workspaceId === ws.id),
  }))
}

export async function updateKnowledgeEntry(id: string, data: Partial<typeof knowledgeEntries.$inferInsert>) {
  await getDb()
    .update(knowledgeEntries)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(knowledgeEntries.id, id))
}

export async function deleteKnowledgeEntry(id: string) {
  await getDb().delete(knowledgeEntries).where(eq(knowledgeEntries.id, id))
}

// ─── Todos ───────────────────────────────────────────────────────────────────

export async function getTodos(status?: "pending" | "in_progress" | "done") {
  if (status) {
    return getDb().select().from(todos).where(eq(todos.status, status)).orderBy(desc(todos.createdAt))
  }
  return getDb().select().from(todos).orderBy(desc(todos.createdAt))
}

export async function createTodo(data: {
  content: string
  priority?: "high" | "medium" | "low"
  workspace?: string
  ticketTag?: string
}) {
  const id = nanoid()
  await getDb().insert(todos).values({ id, ...data })
  const rows = await getDb().select().from(todos).where(eq(todos.id, id))
  return rows[0]
}

// ─── Roles & Crews ───────────────────────────────────────────────────────────

export async function getRoles() {
  return getDb().select().from(roles).orderBy(roles.name)
}

export async function getTeams() {
  return getDb().select().from(teams).orderBy(teams.name)
}

export async function createTeam(data: Partial<typeof teams.$inferInsert> & { name: string }) {
  const id = crypto.randomUUID()
  await getDb().insert(teams).values({ id, ...data })
  const rows = await getDb().select().from(teams).where(eq(teams.id, id))
  return rows[0]
}

export async function updateTeam(id: string, data: Partial<typeof teams.$inferInsert>) {
  await getDb().update(teams).set(data).where(eq(teams.id, id))
  const rows = await getDb().select().from(teams).where(eq(teams.id, id))
  return rows[0]
}

export async function deleteTeam(id: string) {
  await getDb().delete(teams).where(eq(teams.id, id))
}
