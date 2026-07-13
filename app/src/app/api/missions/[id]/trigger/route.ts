import { NextRequest, NextResponse } from "next/server"
import { getMission, updateMission, createArtifact, createQuestion, getKnowledgeEntries, getProject } from "@/lib/db/queries"
import { getModel } from "@/lib/ai/providers"
import { generateText } from "ai"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

/**
 * POST /api/missions/[id]/trigger
 *
 * Non-streaming version of /run. Executes the next pending role fully,
 * saves artifacts and questions to DB, and returns a JSON summary.
 * Used by the MCP server so it doesn't need to consume an SSE stream.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mission = await getMission(id)
  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  if (mission.status === "done" || mission.status === "failed") {
    return NextResponse.json({ error: `Mission is already ${mission.status}` }, { status: 400 })
  }

  const taskGraph = (mission.taskGraph ?? []) as Array<{
    id: string; roleId: string; roleName: string
    status: "pending" | "running" | "done" | "failed" | "skipped"
    dependsOn: string[]
  }>

  // Find next runnable task
  const nextTask = taskGraph.find(t => {
    if (t.status !== "pending") return false
    return t.dependsOn.every(dep => taskGraph.find(d => d.id === dep)?.status === "done")
  })

  if (!nextTask) {
    const allDone = taskGraph.every(t => t.status === "done" || t.status === "skipped")
    if (allDone) {
      await updateMission(id, { status: "done", progressPercent: 100, completedAt: new Date().toISOString() })
      return NextResponse.json({ status: "mission_done", message: "All roles completed." })
    }
    return NextResponse.json({ error: "No runnable task found — check dependencies." }, { status: 400 })
  }

  // Mark task as running
  const updatedGraph = taskGraph.map(t =>
    t.id === nextTask.id ? { ...t, status: "running" as const, startedAt: new Date().toISOString() } : t
  )
  const doneCount = taskGraph.filter(t => t.status === "done").length
  await updateMission(id, {
    status: "running",
    taskGraph: updatedGraph,
    currentRoleId: nextTask.roleId,
    progressPercent: Math.round((doneCount / taskGraph.length) * 100),
  })

  // Fetch role
  const roleRows = await getDb().select().from(schema.roles).where(eq(schema.roles.id, nextTask.roleId))
  const role = roleRows[0]
  if (!role) return NextResponse.json({ error: `Role ${nextTask.roleId} not found` }, { status: 500 })

  // Build context from previous artifacts
  const prevArtifacts = await getDb().select().from(schema.artifacts)
    .where(eq(schema.artifacts.missionId, id))
  const prevContext = prevArtifacts.map(a =>
    `=== ${a.roleName ?? "unknown"} (${a.type}) ===\n${a.content}`
  ).join("\n\n")

  // Fetch relevant knowledge
  const kb = await getKnowledgeEntries(mission.projectId ?? undefined)
  const kbContext = kb.slice(0, 8).map(k => `[KB:${k.type}] ${k.title}: ${k.content.slice(0, 300)}`).join("\n")

  const project = mission.projectId ? await getProject(mission.projectId) : null

  const behaviorInstruction = mission.agentBehavior === "assume_and_document"
    ? "When uncertain, make a clear assumption and document it. Do NOT ask questions — keep moving."
    : mission.agentBehavior === "ask_me"
    ? "If you have blocking questions (max 3), state them clearly prefixed with 'QUESTION:'. Then continue with your best assumption."
    : "Log any open questions at the end prefixed with 'ASYNC_QUESTION:'. Continue without blocking."

  const systemPrompt = `${role.systemPrompt}\n\n${behaviorInstruction}`

  const userPrompt = `# Mission: ${mission.name}
Goal: ${mission.goal}
Project: ${project?.name ?? mission.projectId}

${kbContext ? `## Relevant Knowledge\n${kbContext}\n` : ""}
${prevContext ? `## Previous Work\n${prevContext}\n` : ""}

## Your Task
You are the ${nextTask.roleName}. Execute your part of this mission now.`

  try {
    const model = getModel(role.model ?? "claude-sonnet")
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: role.maxTokens ?? 4096,
    })

    const fullContent = result.text

    // Detect artifact type from role
    const artifactTypeMap: Record<string, "plan" | "code" | "review" | "findings" | "runbook" | "other"> = {
      architect: "plan", "backend-engineer": "code", backend: "code",
      qa: "review", security: "findings", docs: "runbook",
    }
    const artifactType = artifactTypeMap[role.name] ?? "other"

    const artifact = await createArtifact({
      missionId: id,
      roleId: nextTask.roleId,
      roleName: nextTask.roleName,
      type: artifactType,
      title: `${nextTask.roleName} — ${artifactType}`,
      content: fullContent,
    })

    // Parse questions
    const questions: string[] = []
    const questionLines = fullContent.split("\n").filter(l =>
      /^(ASYNC_)?QUESTION:/i.test(l.trim())
    )
    for (const qLine of questionLines) {
      const question = qLine.replace(/^(ASYNC_)?QUESTION:\s*/i, "").trim()
      if (question) {
        await createQuestion({ missionId: id, roleId: nextTask.roleId, roleName: nextTask.roleName, question, isAssumption: false })
        questions.push(question)
      }
    }

    // Mark task done
    const tokensIn = result.usage?.inputTokens ?? 0
    const tokensOut = result.usage?.outputTokens ?? 0
    const costUsd = (tokensIn * 0.000003) + (tokensOut * 0.000015)

    const finalGraph = updatedGraph.map(t =>
      t.id === nextTask.id ? { ...t, status: "done" as const, completedAt: new Date().toISOString() } : t
    )
    const newDoneCount = finalGraph.filter(t => t.status === "done").length
    const newProgress = Math.round((newDoneCount / finalGraph.length) * 100)
    const allDone = finalGraph.every(t => t.status === "done" || t.status === "skipped")

    await updateMission(id, {
      taskGraph: finalGraph,
      status: allDone ? "done" : "review",
      progressPercent: newProgress,
      tokensInput: (mission.tokensInput ?? 0) + tokensIn,
      tokensOutput: (mission.tokensOutput ?? 0) + tokensOut,
      tokensTotal: (mission.tokensTotal ?? 0) + tokensIn + tokensOut,
      estimatedCostUsd: (mission.estimatedCostUsd ?? 0) + costUsd,
      ...(allDone ? { completedAt: new Date().toISOString() } : {}),
    })

    return NextResponse.json({
      status: allDone ? "mission_done" : "role_done",
      roleName: nextTask.roleName,
      artifactId: artifact?.id,
      artifactPreview: fullContent.slice(0, 400),
      questions,
      tokensUsed: tokensIn + tokensOut,
      progress: newProgress,
      nextRole: allDone ? null : finalGraph.find(t => t.status === "pending")?.roleName ?? null,
    })
  } catch (err) {
    await updateMission(id, { status: "failed" })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
