import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { maybeClearSampleData } from "@/lib/db/clear-sample-data"
import { nanoid } from "nanoid"

export async function GET() {
  try {
    const db = getDb()
    const rows = await db.select().from(schema.workspaces)
    // attach projects to each workspace
    const projects = await db.select().from(schema.projects)
    const result = rows.map(ws => ({
      ...ws,
      projects: projects.filter(p => p.workspaceId === ws.id),
    }))
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 })

    const db = getDb()
    const id = nanoid()
    await db.insert(schema.workspaces).values({
      id,
      name: body.name,
      description: body.description ?? null,
      color: body.color ?? "#8b5cf6",
      repoPaths: body.repoPaths ?? [],
    })

    // If projectIds provided, attach them to this workspace
    if (Array.isArray(body.projectIds) && body.projectIds.length > 0) {
      const { eq } = await import("drizzle-orm")
      for (const pid of body.projectIds) {
        await db.update(schema.projects).set({ workspaceId: id }).where(eq(schema.projects.id, pid))
      }
    }

    const rows = await db.select().from(schema.workspaces)
    const ws = rows.find(w => w.id === id)
    const projects = await db.select().from(schema.projects)
    await maybeClearSampleData(db)
    return NextResponse.json({ ...ws, projects: projects.filter(p => p.workspaceId === id) }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
