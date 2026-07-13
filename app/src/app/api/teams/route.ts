import { NextRequest, NextResponse } from "next/server"
import { getTeams, createTeam } from "@/lib/db/queries"

export async function GET() {
  try {
    return NextResponse.json(await getTeams())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 })
    const team = await createTeam(body)
    return NextResponse.json(team, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
