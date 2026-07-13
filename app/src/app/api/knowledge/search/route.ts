import { NextRequest, NextResponse } from "next/server"
import { getKnowledgeEntries } from "@/lib/db/queries"
import { embed, decodeEmbedding, cosineSimilarity } from "@/lib/embeddings"

export async function POST(req: NextRequest) {
  try {
    const { query, projectId, limit = 8 } = await req.json()
    if (!query?.trim()) return NextResponse.json([])

    const all = await getKnowledgeEntries(projectId)

    // Try semantic search first
    const queryVec = await embed(query)
    if (queryVec) {
      const scored = all
        .map(entry => {
          const vec = decodeEmbedding(entry.embedding as Buffer | null)
          const score = vec ? cosineSimilarity(queryVec, vec) : 0
          return { ...entry, score }
        })
        .filter(e => e.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)

      return NextResponse.json(scored.map(({ score, ...e }) => ({ ...e, _score: score, _mode: "semantic" })))
    }

    // Fallback: keyword search
    const q = query.toLowerCase()
    const results = all
      .filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        (e.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
      )
      .slice(0, limit)
      .map(e => ({ ...e, _score: null, _mode: "text" }))

    return NextResponse.json(results)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
