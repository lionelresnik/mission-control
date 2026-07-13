import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { LanguageModel } from "ai"
import { getSettingsMap } from "@/lib/settings/store"

export type ProviderName = "anthropic" | "openai" | "google" | "ollama"

export type ModelId =
  | "claude-sonnet"
  | "claude-opus"
  | "claude-haiku"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gemini-pro"
  | "gemini-flash"
  | string

const ANTHROPIC_MODELS: Record<string, string> = {
  "claude-sonnet": "claude-sonnet-4-5",
  "claude-opus": "claude-opus-4-5",
  "claude-haiku": "claude-haiku-3-5",
}

const OPENAI_MODELS: Record<string, string> = {
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
}

const GOOGLE_MODELS: Record<string, string> = {
  "gemini-pro": "gemini-2.0-pro-exp",
  "gemini-flash": "gemini-2.0-flash",
}

let settingsCache: Record<string, string> | null = null
let settingsCacheAt = 0

async function loadSettings(): Promise<Record<string, string>> {
  const now = Date.now()
  if (settingsCache && now - settingsCacheAt < 30_000) return settingsCache
  settingsCache = await getSettingsMap()
  settingsCacheAt = now
  return settingsCache
}

export async function getModel(modelId: ModelId): Promise<LanguageModel> {
  const settings = await loadSettings()
  const id = modelId || settings.defaultModel || "claude-sonnet"

  if (id in ANTHROPIC_MODELS || id.startsWith("claude-")) {
    const apiKey = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY
    const anthropic = createAnthropic(apiKey ? { apiKey } : undefined)
    return anthropic(ANTHROPIC_MODELS[id] ?? id)
  }

  if (id in OPENAI_MODELS || id.startsWith("gpt-")) {
    const apiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY
    const openai = createOpenAI(apiKey ? { apiKey } : undefined)
    return openai(OPENAI_MODELS[id] ?? id)
  }

  if (id in GOOGLE_MODELS || id.startsWith("gemini-")) {
    const apiKey = settings.geminiApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const google = createGoogleGenerativeAI(apiKey ? { apiKey } : undefined)
    return google(GOOGLE_MODELS[id] ?? id)
  }

  const apiKey = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY
  const anthropic = createAnthropic(apiKey ? { apiKey } : undefined)
  return anthropic("claude-sonnet-4-5")
}

export function listModels(): { id: ModelId; name: string; provider: ProviderName }[] {
  return [
    { id: "claude-sonnet", name: "Claude Sonnet 4.5", provider: "anthropic" },
    { id: "claude-opus", name: "Claude Opus 4.5", provider: "anthropic" },
    { id: "claude-haiku", name: "Claude Haiku 3.5", provider: "anthropic" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "openai" },
    { id: "gemini-pro", name: "Gemini 2.0 Pro", provider: "google" },
    { id: "gemini-flash", name: "Gemini 2.0 Flash", provider: "google" },
  ]
}
