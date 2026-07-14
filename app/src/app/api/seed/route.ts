import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { ensureBuiltinRolesAndCrews, isDbEmpty, seedDemoData } from "@/lib/db/seed-demo"

export async function GET() {
  return POST()
}

export async function POST() {
  try {
    const db = getDb()
    await ensureBuiltinRolesAndCrews(db)
    if (!(await isDbEmpty(db))) {
      return NextResponse.json(
        { ok: false, error: "Database already has missions. Delete ~/.mission-control/mc.db to re-seed the full demo workspace." },
        { status: 409 },
      )
    }
    const { message } = await seedDemoData(db)
    return NextResponse.json({ ok: true, message })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
