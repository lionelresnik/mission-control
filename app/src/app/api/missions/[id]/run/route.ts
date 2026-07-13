import { NextRequest } from "next/server"
import { getMission, updateMission, createArtifact, createQuestion, getKnowledgeEntries, getProject } from "@/lib/db/queries"
import { getModel } from "@/lib/ai/providers"
import { streamText } from "ai"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { createWorktree } from "@/lib/git/worktrees"
import { slackPostMissionSummary, jiraAddComment } from "@/lib/mcp/client"
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
 * POST /api/missions/[id]/run
 *
 * Streams mission execution. Runs the next pending role in the task graph.
 * Returns a Server-Sent Events stream so the UI can display output live.
 *
 * Each SSE event is JSON: { type, payload }
 * Types: "role_start" | "chunk" | "role_done" | "question" | "mission_done" | "error"
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await requireBuiltinMode()
  if (blocked) return blocked

  const { id } = await params
  const mission = await getMission(id)
  if (!mission) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, payload: unknown) => {
        const line = `data: ${JSON.stringify({ type, payload })}\n\n`
        controller.enqueue(encoder.encode(line))
      }

      try {
        // Find the next pending role in the task graph
        const taskGraph = (mission.taskGraph ?? []) as TaskGraphNode[]
        const nextTask = findNextPendingTask(taskGraph)

        if (!nextTask) {
          const allDone = allTasksComplete(taskGraph)
          if (allDone) {
            await updateMission(id, { status: "done", progressPercent: 100, completedAt: new Date().toISOString() })
            send("mission_done", { message: "All roles completed. Mission done." })
          } else {
            send("error", { message: "No runnable task found. Check task dependencies." })
          }
          controller.close()
          return
        }

        // Mark task as running
        const updatedGraph = markTaskRunning(taskGraph, nextTask.id)
        const progressPercent = calcProgress(updatedGraph)

        await updateMission(id, {
          status: "running",
          taskGraph: updatedGraph,
          currentRoleId: nextTask.roleId,
          progressPercent,
        })

        // Attempt to create an isolated git worktree for this role
        let worktreePath: string | null = null
        try {
          const project = mission.projectId ? await getProject(mission.projectId) : null
          const repoPath = project?.githubRepo
            ? `${process.env.HOME}/Projects/${project.githubRepo}`
            : null
          if (repoPath) {
            const wt = await createWorktree({
              repoPath,
              missionId: id,
              roleId: nextTask.roleId,
              roleName: nextTask.roleName,
            })
            worktreePath = wt?.path ?? null
          }
        } catch { /* worktree creation is best-effort */ }

        send("role_start", { roleId: nextTask.roleId, roleName: nextTask.roleName, taskId: nextTask.id, worktreePath })

        // Load the role's system prompt from DB
        const db = getDb()
        const roleRows = await db.select().from(schema.roles).where(eq(schema.roles.id, nextTask.roleId))
        const role = roleRows[0]

        const systemPrompt = role?.systemPrompt ?? `You are the ${nextTask.roleName}. Complete your part of the mission thoroughly.`
        const model = (role?.model ?? "claude-sonnet") as string
        const temperature = role?.temperature ?? 0.7

        const project = mission.projectId ? await getProject(mission.projectId) : null
        const prompts = await buildRolePrompts(
          mission,
          nextTask,
          { systemPrompt, name: role?.name },
          project?.agentsMdLocal
        )

        const result = streamText({
          model: await getModel(model),
          system: prompts.systemPrompt,
          prompt: prompts.userPrompt,
          temperature,
        })

        let fullContent = ""
        let tokensIn = 0
        let tokensOut = 0

        for await (const chunk of result.textStream) {
          fullContent += chunk
          send("chunk", { text: chunk })
        }

        // Capture token usage after stream finishes
        try {
          const usage = await result.usage
          tokensIn = usage?.inputTokens ?? 0
          tokensOut = usage?.outputTokens ?? 0
        } catch { /* usage unavailable for this provider */ }

        // Estimate cost (claude-sonnet pricing approximation)
        const costUsd = (tokensIn * 0.000003) + (tokensOut * 0.000015)
        send("usage", { tokensIn, tokensOut, costUsd: parseFloat(costUsd.toFixed(4)), roleName: nextTask.roleName })

        // Parse out questions if behavior is ask_me
        const questionLines = fullContent
          .split("\n")
          .filter(l => l.startsWith("QUESTION:") || l.startsWith("ASYNC_QUESTION:"))

        for (const qLine of questionLines) {
          const question = qLine.replace(/^(ASYNC_)?QUESTION:\s*/i, "").trim()
          if (question) {
            await createQuestion({
              missionId: id,
              roleId: nextTask.roleId,
              roleName: nextTask.roleName,
              question,
              isAssumption: false,
            })
            send("question", { question, roleName: nextTask.roleName })
          }
        }

        // Save artifact
        const artifactType = detectArtifactType(nextTask.roleName, role?.name)

        await createArtifact({
          missionId: id,
          roleId: nextTask.roleId,
          roleName: nextTask.roleName,
          type: artifactType,
          title: `${nextTask.roleName} — ${mission.name}`,
          content: fullContent,
        })

        // Mark task done
        const finalGraph = markTaskDone(updatedGraph, nextTask.id)
        const newProgress = calcProgress(finalGraph)
        const allComplete = allTasksComplete(finalGraph)

        // Accumulate token totals onto mission
        const currentMission = await getMission(id)
        const newTokensIn = (currentMission?.tokensInput ?? 0) + tokensIn
        const newTokensOut = (currentMission?.tokensOutput ?? 0) + tokensOut
        const newCost = (currentMission?.estimatedCostUsd ?? 0) + costUsd

        await updateMission(id, {
          taskGraph: finalGraph,
          progressPercent: newProgress,
          status: allComplete ? "done" : "running",
          currentRoleId: allComplete ? null : nextTask.roleId,
          tokensInput: newTokensIn,
          tokensOutput: newTokensOut,
          tokensTotal: newTokensIn + newTokensOut,
          estimatedCostUsd: parseFloat(newCost.toFixed(6)),
          ...(allComplete ? { completedAt: new Date().toISOString() } : {}),
        })

        send("role_done", {
          roleId: nextTask.roleId,
          roleName: nextTask.roleName,
          taskId: nextTask.id,
          progress: newProgress,
          missionDone: allComplete,
        })

        if (allComplete) {
          send("mission_done", { message: "Mission complete! All roles finished." })

          // Fire-and-forget: notify Slack and comment on Jira ticket
          const { getMissionArtifacts: getArts } = await import("@/lib/db/queries")
          const arts = await getArts(id)
          const project = mission.projectId ? await getProject(mission.projectId) : null

          if (project?.slackChannel) {
            slackPostMissionSummary({
              channel: project.slackChannel,
              missionName: mission.name,
              goal: mission.goal,
              status: "done",
              artifactCount: arts.length,
              ticketId: mission.ticketId ?? undefined,
              dashboardUrl: `http://localhost:3000/missions/${id}`,
            }).catch(() => {})
          }

          if (mission.ticketId) {
            const summary = arts.map(a => `**${a.roleName}** (${a.type}):\n${a.content.slice(0, 300)}...`).join("\n\n---\n\n")
            jiraAddComment(
              mission.ticketId,
              `Mission complete in Mission Control.\n\nArtifacts (${arts.length} total):\n${summary}\n\nFull results: http://localhost:3000/missions/${id}`
            ).catch(() => {})
          }
        }

      } catch (err) {
        send("error", { message: String(err) })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
