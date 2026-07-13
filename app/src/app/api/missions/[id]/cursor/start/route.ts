import { NextRequest, NextResponse } from "next/server"
import { CursorExecutionError, startRole } from "@/lib/missions/cursor-execution"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({})) as { taskId?: string }
    const result = await startRole(id, body.taskId)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof CursorExecutionError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
