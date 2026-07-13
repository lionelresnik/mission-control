import { NextRequest, NextResponse } from "next/server"
import { CursorExecutionError, checkpointRole } from "@/lib/missions/cursor-execution"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json() as { message?: string; roleName?: string }
    if (!body.message?.trim()) {
      return NextResponse.json({ error: "message required" }, { status: 400 })
    }
    const result = await checkpointRole(id, body.message, body.roleName)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof CursorExecutionError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
