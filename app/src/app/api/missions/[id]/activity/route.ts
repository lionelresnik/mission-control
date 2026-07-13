import { NextRequest, NextResponse } from "next/server"
import { getMissionEvents } from "@/lib/missions/events"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const events = await getMissionEvents(id, 100)
    return NextResponse.json(events.reverse())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
