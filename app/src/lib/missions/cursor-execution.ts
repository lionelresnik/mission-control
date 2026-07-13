import { eq } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"
import {
  createArtifact,
  createKnowledgeEntry,
  getMission,
  updateMission,
} from "@/lib/db/queries"
import type { TaskGraphNode } from "@/lib/db/schema"
import { detectArtifactType } from "@/lib/missions/artifact-type"
import { buildRolePrompts } from "@/lib/missions/build-prompt"
import { addMissionEvent } from "@/lib/missions/events"
import {
  allTasksComplete,
  calcProgress,
  findNextPendingTask,
  markTaskDone,
  markTaskRunning,
} from "@/lib/missions/task-graph-utils"

export class CursorExecutionError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

function getTaskGraph(mission: { taskGraph?: TaskGraphNode[] | null }): TaskGraphNode[] {
  return (mission.taskGraph ?? []) as TaskGraphNode[]
}

export async function getNextRolePackage(missionId: string) {
  const mission = await getMission(missionId)
  if (!mission) throw new CursorExecutionError("Mission not found", 404)
  if (mission.status === "done" || mission.status === "failed") {
    throw new CursorExecutionError(`Mission is already ${mission.status}`)
  }

  const taskGraph = getTaskGraph(mission)
  const nextTask = findNextPendingTask(taskGraph)
  if (!nextTask) {
    if (allTasksComplete(taskGraph)) {
      return { status: "mission_done" as const, message: "All roles completed." }
    }
    throw new CursorExecutionError("No runnable task — check dependencies or running role.")
  }

  const roleRows = await getDb().select().from(schema.roles).where(eq(schema.roles.id, nextTask.roleId))
  const role = roleRows[0]
  if (!role) throw new CursorExecutionError(`Role ${nextTask.roleId} not found`, 500)

  let agentsMd: string | null = null
  if (mission.projectId) {
    const projectRows = await getDb().select().from(schema.projects).where(eq(schema.projects.id, mission.projectId))
    agentsMd = projectRows[0]?.agentsMdLocal ?? null
  }

  const { systemPrompt, userPrompt } = await buildRolePrompts(mission, nextTask, role, agentsMd)

  return {
    status: "ready" as const,
    missionId,
    taskId: nextTask.id,
    roleId: nextTask.roleId,
    roleName: nextTask.roleName,
    systemPrompt,
    userPrompt,
    progress: calcProgress(taskGraph),
    behavior: mission.agentBehavior,
  }
}

export async function startRole(missionId: string, taskId?: string) {
  const mission = await getMission(missionId)
  if (!mission) throw new CursorExecutionError("Mission not found", 404)

  const taskGraph = getTaskGraph(mission)
  const nextTask = taskId
    ? taskGraph.find(t => t.id === taskId)
    : findNextPendingTask(taskGraph)

  if (!nextTask || nextTask.status !== "pending") {
    throw new CursorExecutionError("No pending role to start")
  }

  const updatedGraph = markTaskRunning(taskGraph, nextTask.id)
  const progress = calcProgress(updatedGraph)

  await updateMission(missionId, {
    status: "running",
    taskGraph: updatedGraph,
    currentRoleId: nextTask.roleId,
    progressPercent: progress,
  })

  await addMissionEvent({
    missionId,
    type: "role_start",
    roleId: nextTask.roleId,
    roleName: nextTask.roleName,
    message: `${nextTask.roleName} started`,
  })

  return { taskId: nextTask.id, roleName: nextTask.roleName, progress }
}

export async function checkpointRole(missionId: string, message: string, roleName?: string) {
  const mission = await getMission(missionId)
  if (!mission) throw new CursorExecutionError("Mission not found", 404)

  const running = getTaskGraph(mission).find(t => t.status === "running")
  await addMissionEvent({
    missionId,
    type: "checkpoint",
    roleId: running?.roleId,
    roleName: roleName ?? running?.roleName,
    message: message.slice(0, 2000),
  })

  return { ok: true }
}

export async function completeRole(
  missionId: string,
  content: string,
  opts?: { taskId?: string; saveAssumptionsToKb?: boolean }
) {
  const mission = await getMission(missionId)
  if (!mission) throw new CursorExecutionError("Mission not found", 404)

  const taskGraph = getTaskGraph(mission)
  const task = opts?.taskId
    ? taskGraph.find(t => t.id === opts.taskId)
    : taskGraph.find(t => t.status === "running") ?? findNextPendingTask(taskGraph)

  if (!task) throw new CursorExecutionError("No active role to complete")

  const roleRows = await getDb().select().from(schema.roles).where(eq(schema.roles.id, task.roleId))
  const role = roleRows[0]
  const artifactType = detectArtifactType(task.roleName, role?.name)

  const artifact = await createArtifact({
    missionId,
    roleId: task.roleId,
    roleName: task.roleName,
    type: artifactType,
    title: `${task.roleName} — ${artifactType}`,
    content,
  })

  if (opts?.saveAssumptionsToKb !== false && mission.projectId) {
    const assumptions = content
      .split("\n")
      .filter(l => /^ASSUMPTION:/i.test(l.trim()))
      .map(l => l.replace(/^ASSUMPTION:\s*/i, "").trim())
      .filter(Boolean)

    for (const assumption of assumptions.slice(0, 5)) {
      await createKnowledgeEntry({
        projectId: mission.projectId,
        type: "architecture",
        title: assumption.slice(0, 80),
        content: assumption,
        confidence: "assumed",
        sourceMissionId: missionId,
        tags: ["assumption", task.roleName],
      })
    }
  }

  const graphAfterRun = markTaskRunning(taskGraph, task.id)
  const finalGraph = markTaskDone(graphAfterRun, task.id, artifact.id)
  const progress = calcProgress(finalGraph)
  const done = allTasksComplete(finalGraph)

  await updateMission(missionId, {
    taskGraph: finalGraph,
    status: done ? "done" : "review",
    progressPercent: progress,
    ...(done ? { completedAt: new Date().toISOString() } : {}),
  })

  await addMissionEvent({
    missionId,
    type: "role_done",
    roleId: task.roleId,
    roleName: task.roleName,
    message: `${task.roleName} completed`,
  })

  if (done) {
    await addMissionEvent({
      missionId,
      type: "mission_done",
      message: "Mission complete",
    })
  }

  const nextRole = finalGraph.find(t => t.status === "pending")

  return {
    status: done ? "mission_done" as const : "role_done" as const,
    roleName: task.roleName,
    artifactId: artifact.id,
    progress,
    nextRole: nextRole?.roleName ?? null,
  }
}
