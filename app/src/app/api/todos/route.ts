import { NextRequest, NextResponse } from "next/server"
import { getTodosEnriched, createTodo } from "@/lib/db/queries"

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") as "pending" | "in_progress" | "done" | null
    const todos = await getTodosEnriched(status ?? undefined)
    return NextResponse.json(todos)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.content) return NextResponse.json({ error: "content required" }, { status: 400 })
    const todo = await createTodo({
      content: body.content,
      priority: body.priority ?? "medium",
      workspace: body.workspace,
      ticketTag: body.ticketTag,
      missionId: body.missionId,
    })
    return NextResponse.json(todo, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
