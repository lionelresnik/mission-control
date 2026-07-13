import { NextRequest, NextResponse } from "next/server"
import { CursorExecutionError, getNextRolePackage } from "@/lib/missions/cursor-execution"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const result = await getNextRolePackage(id)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof CursorExecutionError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
