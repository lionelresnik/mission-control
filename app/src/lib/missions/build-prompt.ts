import {
  getKnowledgeEntries,
  getMissionArtifacts,
  getMissionQuestions,
  getProject,
} from "@/lib/db/queries"
import type { TaskGraphNode } from "@/lib/db/schema"

type MissionLike = {
  id: string
  name: string
  goal: string
  projectId?: string | null
  agentBehavior?: string | null
}

type RoleLike = {
  systemPrompt: string
  name?: string
}

export function behaviorInstruction(agentBehavior?: string | null): string {
  if (agentBehavior === "assume_and_document") {
    return "When uncertain, make a clear assumption prefixed with 'ASSUMPTION:' and document it. Do NOT ask blocking questions — keep moving."
  }
  if (agentBehavior === "ask_me") {
    return "If you have blocking questions (max 3), state them clearly prefixed with 'QUESTION:'. Then continue with your best assumption."
  }
  return "Log any open questions at the end prefixed with 'ASYNC_QUESTION:'. Continue without blocking."
}

export async function buildRolePrompts(
  mission: MissionLike,
  nextTask: TaskGraphNode,
  role: RoleLike,
  agentsMd?: string | null
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const [prevArtifacts, questions, kb, project] = await Promise.all([
    getMissionArtifacts(mission.id),
    getMissionQuestions(mission.id),
    getKnowledgeEntries(mission.projectId ?? undefined),
    mission.projectId ? getProject(mission.projectId) : Promise.resolve(null),
  ])

  const prevContext = prevArtifacts
    .map(a => `=== ${a.roleName ?? "unknown"} (${a.type}) ===\n${a.content}`)
    .join("\n\n")

  const answered = questions.filter(q => q.answer)
  const qaContext = answered.length > 0
    ? answered.map(q => `Q (${q.roleName}): ${q.question}\nA: ${q.answer}`).join("\n\n")
    : ""

  const kbContext = kb
    .slice(0, 10)
    .map(k => `[KB:${k.type}] ${k.title}: ${k.content.slice(0, 400)}`)
    .join("\n")

  const behavior = behaviorInstruction(mission.agentBehavior)
  const systemPrompt = `${role.systemPrompt}\n\n${behavior}`

  const userPrompt = `# Mission: ${mission.name}
Goal: ${mission.goal}
Project: ${project?.name ?? mission.projectId ?? "—"}

${agentsMd ? `## AGENTS.md\n${agentsMd}\n` : ""}
${kbContext ? `## Relevant Knowledge\n${kbContext}\n` : ""}
${qaContext ? `## Answered Questions\n${qaContext}\n` : ""}
${prevContext ? `## Previous Work\n${prevContext}\n` : ""}

## Your Task
You are the **${nextTask.roleName}**. Execute your part of this mission now.

${behavior}

Produce a complete, high-quality artifact for your role now.`

  return { systemPrompt, userPrompt }
}
