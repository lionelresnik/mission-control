import { NextRequest, NextResponse } from "next/server"
import { getRoles } from "@/lib/db/queries"
import { getDb, schema } from "@/lib/db"
import { nanoid } from "nanoid"

export async function GET() {
  try {
    return NextResponse.json(await getRoles())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.displayName || !body.systemPrompt) {
      return NextResponse.json({ error: "displayName and systemPrompt required" }, { status: 400 })
    }
    const id = nanoid()
    await getDb().insert(schema.roles).values({ id, name: body.name ?? id, ...body, isBuiltIn: false })
    const rows = await getDb().select().from(schema.roles).where(require("drizzle-orm").eq(schema.roles.id, id))
    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
