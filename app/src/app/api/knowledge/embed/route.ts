import { NextResponse } from "next/server"
import { getKnowledgeEntries } from "@/lib/db/queries"
import { embedKnowledgeEntry } from "@/lib/embeddings"

/** Embed all knowledge entries that don't yet have an embedding */
export async function POST() {
  try {
    const all = await getKnowledgeEntries()
    const unembedded = all.filter(e => !e.embedding)

    if (unembedded.length === 0) {
      return NextResponse.json({ ok: true, embedded: 0, message: "All entries already embedded" })
    }

    let embedded = 0
    let failed = 0
    for (const entry of unembedded) {
      const ok = await embedKnowledgeEntry(entry.id, entry.title, entry.content)
      ok ? embedded++ : failed++
    }

    return NextResponse.json({ ok: true, embedded, failed, total: unembedded.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** Check embedding status */
export async function GET() {
  try {
    const all = await getKnowledgeEntries()
    const withEmbedding = all.filter(e => !!e.embedding).length
    return NextResponse.json({ total: all.length, embedded: withEmbedding, missing: all.length - withEmbedding })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
