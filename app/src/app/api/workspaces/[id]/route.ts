import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getDb()
    const rows = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id))
    if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 })
    const projects = await db.select().from(schema.projects).where(eq(schema.projects.workspaceId, id))
    const missions = await db.select().from(schema.missions).where(eq(schema.missions.workspaceId, id))
    return NextResponse.json({ ...rows[0], projects, missions })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const db = getDb()
    await db.update(schema.workspaces)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(schema.workspaces.id, id))

    // Handle project membership updates
    if (Array.isArray(body.addProjectIds)) {
      for (const pid of body.addProjectIds) {
        await db.update(schema.projects).set({ workspaceId: id }).where(eq(schema.projects.id, pid))
      }
    }
    if (Array.isArray(body.removeProjectIds)) {
      for (const pid of body.removeProjectIds) {
        await db.update(schema.projects).set({ workspaceId: null }).where(eq(schema.projects.id, pid))
      }
    }

    const rows = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id))
    const projects = await db.select().from(schema.projects).where(eq(schema.projects.workspaceId, id))
    return NextResponse.json({ ...rows[0], projects })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getDb()
    // Detach projects before deleting
    await db.update(schema.projects).set({ workspaceId: null }).where(eq(schema.projects.workspaceId, id))
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
