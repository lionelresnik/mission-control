import { NextRequest, NextResponse } from "next/server"
import { updateTodo } from "@/lib/db/queries"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json() as { status?: "pending" | "in_progress" | "done"; content?: string }
    const todo = await updateTodo(id, body)
    return NextResponse.json(todo)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
