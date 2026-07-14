import { eq, inArray } from "drizzle-orm"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

type AppDb = BetterSQLite3Database<typeof schema>

const {
  artifacts,
  knowledgeEntries,
  missionEvents,
  missionQuestions,
  missions,
  projects,
  settings,
  todos,
  workspaces,
} = schema

export const SAMPLE_WORKSPACE_NAME = "Core Platform"
export const SAMPLE_PROJECT_NAMES = ["Platform API", "Auth Service", "Billing"] as const
export const SAMPLE_MISSION_NAMES = [
  "Add Azure Registry Support",
  "Fix Auth Token Refresh",
  "Unified Auth Middleware Rollout",
] as const
export const SAMPLE_TODO_CONTENT = [
  "Review assumed rate-limiting knowledge entry",
  "Record demo video for GitHub README",
] as const

const MARKERS_KEY = "sampleDataMarkers"

export type SampleDataMarkers = {
  workspaceIds: string[]
  projectIds: string[]
  missionIds: string[]
  todoIds: string[]
  knowledgeIds: string[]
}

export type ClearSampleResult = {
  cleared: boolean
  workspaces: number
  projects: number
  missions: number
  todos: number
  knowledge: number
}

export async function saveSampleDataMarkers(db: AppDb, markers: SampleDataMarkers): Promise<void> {
  const now = new Date().toISOString()
  await db
    .insert(settings)
    .values({ key: MARKERS_KEY, value: markers, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: markers, updatedAt: now },
    })
}

async function loadSampleDataMarkers(db: AppDb): Promise<SampleDataMarkers | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, MARKERS_KEY)).limit(1)
  const value = rows[0]?.value
  if (!value || typeof value !== "object") return null
  const m = value as SampleDataMarkers
  if (!Array.isArray(m.workspaceIds)) return null
  return m
}

async function resolveSampleIds(db: AppDb): Promise<SampleDataMarkers | null> {
  const stored = await loadSampleDataMarkers(db)
  if (stored && stored.missionIds.length > 0) return stored

  const wsRows = await db.select().from(workspaces).where(eq(workspaces.name, SAMPLE_WORKSPACE_NAME))
  const projectRows = await db.select().from(projects)
  const missionRows = await db.select().from(missions)
  const todoRows = await db.select().from(todos)

  const projectIds = projectRows
    .filter(p => (SAMPLE_PROJECT_NAMES as readonly string[]).includes(p.name))
    .map(p => p.id)
  const missionIds = missionRows
    .filter(m => (SAMPLE_MISSION_NAMES as readonly string[]).includes(m.name))
    .map(m => m.id)
  const workspaceIds = wsRows.map(w => w.id)

  if (projectIds.length === 0 && missionIds.length === 0 && workspaceIds.length === 0) {
    return null
  }

  const todoIds = todoRows
    .filter(
      t =>
        (SAMPLE_TODO_CONTENT as readonly string[]).includes(t.content) ||
        (t.missionId && missionIds.includes(t.missionId))
    )
    .map(t => t.id)

  const knowledgeRows = await db.select().from(knowledgeEntries)
  const knowledgeIds = knowledgeRows
    .filter(
      k =>
        (k.projectId && projectIds.includes(k.projectId)) ||
        (k.workspaceId && workspaceIds.includes(k.workspaceId)) ||
        (k.sourceMissionId && missionIds.includes(k.sourceMissionId))
    )
    .map(k => k.id)

  return { workspaceIds, projectIds, missionIds, todoIds, knowledgeIds }
}

export async function hasSampleData(db: AppDb): Promise<boolean> {
  const ids = await resolveSampleIds(db)
  return ids !== null && (ids.missionIds.length > 0 || ids.projectIds.length > 0 || ids.workspaceIds.length > 0)
}

/** Remove demo workspace/missions/projects/todos/knowledge. Keeps built-in roles and default crews. */
export async function clearSampleData(db: AppDb): Promise<ClearSampleResult> {
  const empty: ClearSampleResult = {
    cleared: false,
    workspaces: 0,
    projects: 0,
    missions: 0,
    todos: 0,
    knowledge: 0,
  }

  const ids = await resolveSampleIds(db)
  if (!ids) return empty

  const { workspaceIds, projectIds, missionIds, todoIds, knowledgeIds } = ids

  if (todoIds.length > 0) {
    await db.delete(todos).where(inArray(todos.id, todoIds))
  }
  if (missionIds.length > 0) {
    const todoByMission = await db
      .select({ id: todos.id })
      .from(todos)
      .where(inArray(todos.missionId, missionIds))
    const extraTodoIds = todoByMission.map(t => t.id)
    if (extraTodoIds.length > 0) {
      await db.delete(todos).where(inArray(todos.id, extraTodoIds))
    }
  }

  for (const content of SAMPLE_TODO_CONTENT) {
    await db.delete(todos).where(eq(todos.content, content))
  }

  if (knowledgeIds.length > 0) {
    await db.delete(knowledgeEntries).where(inArray(knowledgeEntries.id, knowledgeIds))
  }

  if (missionIds.length > 0) {
    await db.delete(missionEvents).where(inArray(missionEvents.missionId, missionIds))
    await db.delete(missionQuestions).where(inArray(missionQuestions.missionId, missionIds))
    await db.delete(artifacts).where(inArray(artifacts.missionId, missionIds))
    await db.delete(missions).where(inArray(missions.id, missionIds))
  }

  if (projectIds.length > 0) {
    await db.delete(knowledgeEntries).where(inArray(knowledgeEntries.projectId, projectIds))
    await db.delete(projects).where(inArray(projects.id, projectIds))
  }

  if (workspaceIds.length > 0) {
    await db.delete(knowledgeEntries).where(inArray(knowledgeEntries.workspaceId, workspaceIds))
    await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds))
  }

  await db.delete(settings).where(eq(settings.key, MARKERS_KEY))

  return {
    cleared: true,
    workspaces: workspaceIds.length,
    projects: projectIds.length,
    missions: missionIds.length,
    todos: todoIds.length,
    knowledge: knowledgeIds.length,
  }
}

/** Clear sample data once real user data is added (import, project, mission, workspace). */
export async function maybeClearSampleData(db: AppDb): Promise<ClearSampleResult | null> {
  if (!(await hasSampleData(db))) return null
  return clearSampleData(db)
}

export async function countSampleMissions(db: AppDb): Promise<number> {
  const ids = await resolveSampleIds(db)
  return ids?.missionIds.length ?? 0
}
