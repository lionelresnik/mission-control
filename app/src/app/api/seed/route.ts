import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { clearSampleData, hasSampleData } from "@/lib/db/clear-sample-data"
import { ensureBuiltinRolesAndCrews, isDbEmpty, seedDemoData } from "@/lib/db/seed-demo"

export async function GET() {
  return POST()
}

export async function DELETE() {
  try {
    const db = getDb()
    if (!(await hasSampleData(db))) {
      return NextResponse.json({ ok: true, cleared: false, message: "No sample workspace data to remove." })
    }
    const result = await clearSampleData(db)
    return NextResponse.json({
      ok: true,
      cleared: result.cleared,
      message: result.cleared
        ? `Removed sample data: ${result.workspaces} workspace(s), ${result.projects} project(s), ${result.missions} mission(s). Roles and default crews were kept.`
        : "No sample workspace data to remove.",
      ...result,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
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
