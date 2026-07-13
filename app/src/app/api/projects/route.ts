import { NextRequest, NextResponse } from "next/server"
import { getProjects, createProject } from "@/lib/db/queries"

export async function GET() {
  try {
    const data = await getProjects()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 })
    const project = await createProject(body)
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
