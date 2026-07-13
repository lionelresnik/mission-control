import { NextRequest, NextResponse } from "next/server"
import { getMission, updateMission, createArtifact, createQuestion, getProject } from "@/lib/db/queries"
import { getModel } from "@/lib/ai/providers"
import { generateText } from "ai"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { buildRolePrompts } from "@/lib/missions/build-prompt"
import { detectArtifactType } from "@/lib/missions/artifact-type"
import {
  allTasksComplete,
  calcProgress,
  findNextPendingTask,
  markTaskDone,
  markTaskRunning,
} from "@/lib/missions/task-graph-utils"
import { requireBuiltinMode } from "@/lib/settings/builtin-guard"
import type { TaskGraphNode } from "@/lib/db/schema"

/**
 * POST /api/missions/[id]/trigger — built-in AI only (non-streaming, MCP mc_run_mission)
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await requireBuiltinMode()
  if (blocked) return blocked

  const { id } = await params
  const mission = await getMission(id)
  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  if (mission.status === "done" || mission.status === "failed") {
    return NextResponse.json({ error: `Mission is already ${mission.status}` }, { status: 400 })
  }

  const taskGraph = (mission.taskGraph ?? []) as TaskGraphNode[]
  const nextTask = findNextPendingTask(taskGraph)

  if (!nextTask) {
    if (allTasksComplete(taskGraph)) {
      await updateMission(id, { status: "done", progressPercent: 100, completedAt: new Date().toISOString() })
      return NextResponse.json({ status: "mission_done", message: "All roles completed." })
    }
    return NextResponse.json({ error: "No runnable task found — check dependencies." }, { status: 400 })
  }

  const updatedGraph = markTaskRunning(taskGraph, nextTask.id)
  await updateMission(id, {
    status: "running",
    taskGraph: updatedGraph,
    currentRoleId: nextTask.roleId,
    progressPercent: calcProgress(updatedGraph),
  })

  const roleRows = await getDb().select().from(schema.roles).where(eq(schema.roles.id, nextTask.roleId))
  const role = roleRows[0]
  if (!role) return NextResponse.json({ error: `Role ${nextTask.roleId} not found` }, { status: 500 })

  const project = mission.projectId ? await getProject(mission.projectId) : null
  const { systemPrompt, userPrompt } = await buildRolePrompts(
    mission,
    nextTask,
    role,
    project?.agentsMdLocal
  )

  try {
    const model = await getModel(role.model ?? "claude-sonnet")
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: role.temperature ?? 0.7,
      maxOutputTokens: role.maxTokens ?? 4096,
    })

    const fullContent = result.text
    const artifactType = detectArtifactType(nextTask.roleName, role.name)

    const artifact = await createArtifact({
      missionId: id,
      roleId: nextTask.roleId,
      roleName: nextTask.roleName,
      type: artifactType,
      title: `${nextTask.roleName} — ${artifactType}`,
      content: fullContent,
    })

    const questions: Array<{ id: string; question: string }> = []
    const questionLines = fullContent.split("\n").filter(l =>
      /^(ASYNC_)?QUESTION:/i.test(l.trim())
    )
    for (const qLine of questionLines) {
      const question = qLine.replace(/^(ASYNC_)?QUESTION:\s*/i, "").trim()
      if (question) {
        const row = await createQuestion({
          missionId: id,
          roleId: nextTask.roleId,
          roleName: nextTask.roleName,
          question,
          isAssumption: false,
        })
        questions.push({ id: row.id, question })
      }
    }

    const tokensIn = result.usage?.inputTokens ?? 0
    const tokensOut = result.usage?.outputTokens ?? 0
    const costUsd = (tokensIn * 0.000003) + (tokensOut * 0.000015)

    const finalGraph = markTaskDone(updatedGraph, nextTask.id, artifact.id)
    const newProgress = calcProgress(finalGraph)
    const done = allTasksComplete(finalGraph)

    await updateMission(id, {
      taskGraph: finalGraph,
      status: done ? "done" : "review",
      progressPercent: newProgress,
      tokensInput: (mission.tokensInput ?? 0) + tokensIn,
      tokensOutput: (mission.tokensOutput ?? 0) + tokensOut,
      tokensTotal: (mission.tokensTotal ?? 0) + tokensIn + tokensOut,
      estimatedCostUsd: (mission.estimatedCostUsd ?? 0) + costUsd,
      ...(done ? { completedAt: new Date().toISOString() } : {}),
    })

    return NextResponse.json({
      status: done ? "mission_done" : "role_done",
      roleName: nextTask.roleName,
      artifactId: artifact.id,
      artifactPreview: fullContent.slice(0, 400),
      questions: questions.map(q => q.question),
      questionIds: questions,
      tokensUsed: tokensIn + tokensOut,
      progress: newProgress,
      nextRole: done ? null : finalGraph.find(t => t.status === "pending")?.roleName ?? null,
    })
  } catch (err) {
    await updateMission(id, { status: "failed" })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
