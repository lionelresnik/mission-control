import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { maybeClearSampleData } from "@/lib/db/clear-sample-data"
import { getMissions, createMission } from "@/lib/db/queries"

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined
    const data = await getMissions(projectId)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.goal) {
      return NextResponse.json({ error: "goal required" }, { status: 400 })
    }
    if (!body.projectId && !body.workspaceId && !(Array.isArray(body.projectIds) && body.projectIds.length > 0)) {
      return NextResponse.json({ error: "projectId, projectIds, or workspaceId required" }, { status: 400 })
    }
    const mission = await createMission(body)
    await maybeClearSampleData(getDb())
    return NextResponse.json(mission, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
