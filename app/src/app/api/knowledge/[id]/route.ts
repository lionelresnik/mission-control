import { NextRequest, NextResponse } from "next/server"
import { updateKnowledgeEntry, deleteKnowledgeEntry } from "@/lib/db/queries"
import { resolveKnowledgePlacement } from "@/lib/knowledge/placement"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json() as Record<string, unknown>

    const patch: Record<string, unknown> = { ...body }
    if (
      body.scope != null ||
      body.projectId != null ||
      body.workspaceId != null
    ) {
      const placement = resolveKnowledgePlacement({
        scope: body.scope as "project" | "workspace" | undefined,
        projectId: (body.projectId as string | null | undefined) ?? null,
        workspaceId: (body.workspaceId as string | null | undefined) ?? null,
      })
      patch.projectId = placement.projectId
      patch.workspaceId = placement.workspaceId
      delete patch.scope
    }

    await updateKnowledgeEntry(id, patch)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await deleteKnowledgeEntry(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
