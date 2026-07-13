import { NextResponse } from "next/server"
import { getTeams } from "@/lib/db/queries"

export async function GET() {
  try {
    const data = await getTeams()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
