import { NextResponse } from "next/server"
import { getExecutionModeFromDb } from "@/lib/settings/store"

export async function GET() {
  const mode = await getExecutionModeFromDb()
  return NextResponse.json({ executionMode: mode })
}
