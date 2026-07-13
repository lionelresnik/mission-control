import { NextResponse } from "next/server"
import { getMissions } from "@/lib/db/queries"
import { getTodos } from "@/lib/db/queries"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

const { missionQuestions } = schema

export async function GET() {
  try {
    const [missions, todos, questions] = await Promise.all([
      getMissions(),
      getTodos("pending"),
      getDb().select().from(missionQuestions).where(eq(missionQuestions.answer, null as unknown as string)),
    ])

    const running = missions.filter(m => m.status === "running")
    const pending = missions.filter(m => m.status === "pending")
    const topTodos = todos.slice(0, 5)
    const openQuestions = questions.slice(0, 5)

    const lines: string[] = ["## @lu status\n"]

    if (running.length > 0) {
      lines.push("**Missions running:**")
      running.forEach(m => lines.push(`  - ${m.name} — ${m.progressPercent ?? 0}%`))
    } else {
      lines.push("**Missions:** none running")
    }

    if (pending.length > 0) {
      lines.push(`\n**Queued:** ${pending.map(m => m.name).join(", ")}`)
    }

    if (topTodos.length > 0) {
      lines.push("\n**Todos (pending):**")
      topTodos.forEach(t => lines.push(`  - [${t.priority}] ${t.content}`))
    } else {
      lines.push("\n**Todos:** none pending")
    }

    if (openQuestions.length > 0) {
      lines.push(`\n**Open questions:** ${openQuestions.length} waiting for answers`)
      openQuestions.forEach(q => lines.push(`  - ${q.question} (${q.roleName ?? "agent"})`))
    }

    return NextResponse.json({
      text: lines.join("\n"),
      data: { running: running.length, pending: pending.length, todos: topTodos.length, openQuestions: openQuestions.length },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
