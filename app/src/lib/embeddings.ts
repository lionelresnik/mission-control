import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

const { settings, knowledgeEntries } = schema

async function getOpenAIKey(): Promise<string | null> {
  const rows = await getDb().select().from(settings).where(eq(settings.key, "openaiApiKey"))
  const val = rows[0]?.value
  return typeof val === "string" && val.length > 0 ? val : null
}

/** Generate an embedding vector for a string using OpenAI text-embedding-3-small */
export async function embed(text: string): Promise<Float32Array | null> {
  const apiKey = await getOpenAIKey()
  if (!apiKey) return null

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return new Float32Array(data.data[0].embedding)
}

/** Encode Float32Array → Buffer for SQLite blob storage */
export function encodeEmbedding(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer)
}

/** Decode Buffer from SQLite → Float32Array */
export function decodeEmbedding(buf: Buffer | Uint8Array | null): Float32Array | null {
  if (!buf) return null
  return new Float32Array(Buffer.from(buf).buffer)
}

/** Cosine similarity between two equal-length vectors */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/** Embed a knowledge entry and persist the vector */
export async function embedKnowledgeEntry(id: string, title: string, content: string) {
  const text = `${title}\n\n${content}`
  const vec = await embed(text)
  if (!vec) return false
  await getDb()
    .update(knowledgeEntries)
    .set({ embedding: encodeEmbedding(vec) })
    .where(eq(knowledgeEntries.id, id))
  return true
}
