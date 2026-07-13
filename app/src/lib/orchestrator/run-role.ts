import { streamText, type LanguageModelUsage } from "ai"
import { getModel } from "@/lib/ai/providers"
import type { ModelId } from "@/lib/ai/providers"

export type RoleRunOptions = {
  systemPrompt: string
  userPrompt: string
  model?: ModelId
  temperature?: number
  maxTokens?: number
  onChunk?: (chunk: string) => void
}

export type RoleRunResult = {
  content: string
  usage?: { promptTokens: number; completionTokens: number }
  durationMs: number
}

/**
 * Runs a single agent role with streaming output.
 * This is the core building block for mission orchestration.
 */
export async function runRole(opts: RoleRunOptions): Promise<RoleRunResult> {
  const {
    systemPrompt,
    userPrompt,
    model = "claude-sonnet",
    temperature = 0.7,
    maxTokens = 4096,
    onChunk,
  } = opts

  const startMs = Date.now()
  let fullContent = ""

  const { textStream, usage } = streamText({
    model: await getModel(model),
    system: systemPrompt,
    prompt: userPrompt,
    temperature,
  })

  for await (const chunk of textStream) {
    fullContent += chunk
    onChunk?.(chunk)
  }

  const resolvedUsage: LanguageModelUsage | undefined = await usage

  return {
    content: fullContent,
    usage: resolvedUsage
      ? {
          promptTokens: resolvedUsage.inputTokens ?? 0,
          completionTokens: resolvedUsage.outputTokens ?? 0,
        }
      : undefined,
    durationMs: Date.now() - startMs,
  }
}
