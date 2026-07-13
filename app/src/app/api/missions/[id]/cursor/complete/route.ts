import { NextRequest, NextResponse } from "next/server"
import { CursorExecutionError, completeRole } from "@/lib/missions/cursor-execution"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json() as {
      content?: string
      taskId?: string
      saveAssumptionsToKb?: boolean
    }
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "content required" }, { status: 400 })
    }
    const result = await completeRole(id, body.content, {
      taskId: body.taskId,
      saveAssumptionsToKb: body.saveAssumptionsToKb,
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof CursorExecutionError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
