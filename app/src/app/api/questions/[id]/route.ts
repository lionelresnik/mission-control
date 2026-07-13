import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { answer } = await req.json()
    if (!answer) return NextResponse.json({ error: "answer required" }, { status: 400 })

    await getDb()
      .update(schema.missionQuestions)
      .set({ answer, answeredAt: new Date().toISOString() })
      .where(eq(schema.missionQuestions.id, id))

    const rows = await getDb().select().from(schema.missionQuestions).where(eq(schema.missionQuestions.id, id))
    return NextResponse.json(rows[0])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
