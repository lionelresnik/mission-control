import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"
import { google } from "@ai-sdk/google"
import type { LanguageModel } from "ai"

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

const MODEL_MAP: Record<string, () => LanguageModel> = {
  "claude-sonnet": () => anthropic("claude-sonnet-4-5"),
  "claude-opus":   () => anthropic("claude-opus-4-5"),
  "claude-haiku":  () => anthropic("claude-haiku-3-5"),
  "gpt-4o":        () => openai("gpt-4o"),
  "gpt-4o-mini":   () => openai("gpt-4o-mini"),
  "gemini-pro":    () => google("gemini-2.0-pro-exp"),
  "gemini-flash":  () => google("gemini-2.0-flash"),
}

export function getModel(modelId: ModelId): LanguageModel {
  const factory = MODEL_MAP[modelId]
  if (factory) return factory()
  // Fallback: default to claude-sonnet for unknown IDs
  return anthropic("claude-sonnet-4-5")
}

export function listModels(): { id: ModelId; name: string; provider: ProviderName }[] {
  return [
    { id: "claude-sonnet", name: "Claude Sonnet 4.5", provider: "anthropic" },
    { id: "claude-opus",   name: "Claude Opus 4.5",   provider: "anthropic" },
    { id: "claude-haiku",  name: "Claude Haiku 3.5",  provider: "anthropic" },
    { id: "gpt-4o",        name: "GPT-4o",            provider: "openai" },
    { id: "gpt-4o-mini",   name: "GPT-4o mini",       provider: "openai" },
    { id: "gemini-pro",    name: "Gemini 2.0 Pro",    provider: "google" },
    { id: "gemini-flash",  name: "Gemini 2.0 Flash",  provider: "google" },
  ]
}
