import { NextRequest, NextResponse } from "next/server"
import { getKnowledgeEntries, createKnowledgeEntry } from "@/lib/db/queries"
import { embedKnowledgeEntry } from "@/lib/embeddings"

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined
    const data = await getKnowledgeEntries(projectId)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.title || !body.content || !body.type) {
      return NextResponse.json({ error: "title, content, type required" }, { status: 400 })
    }
    if (!body.projectId && !body.workspaceId) {
      return NextResponse.json({ error: "projectId or workspaceId required" }, { status: 400 })
    }
    const entry = await createKnowledgeEntry(body)
    // Fire-and-forget embedding (no API key = silently skipped)
    if (entry) embedKnowledgeEntry(entry.id, entry.title, entry.content).catch(() => {})
    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
