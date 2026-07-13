import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

export async function GET() {
  try {
    const rows = await getDb().select().from(schema.settings)
    const out: Record<string, unknown> = {}
    for (const r of rows) out[r.key] = r.value
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const db = getDb()
    for (const [key, value] of Object.entries(body)) {
      const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key))
      if (existing.length > 0) {
        await db.update(schema.settings).set({ value, updatedAt: new Date().toISOString() }).where(eq(schema.settings.key, key))
      } else {
        await db.insert(schema.settings).values({ key, value })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
