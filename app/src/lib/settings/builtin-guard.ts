import { NextRequest, NextResponse } from "next/server"
import { getExecutionModeFromDb } from "@/lib/settings/store"

export async function requireBuiltinMode() {
  const mode = await getExecutionModeFromDb()
  if (mode === "cursor") {
    return NextResponse.json(
      {
        error:
          "Built-in AI is disabled (Cursor mode). Run roles from Cursor via mc_get_next_role and mc_complete_role, or switch to Built-in AI in Settings.",
      },
      { status: 403 }
    )
  }
  return null
}

export function wrapBuiltinGuard(
  handler: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
) {
  return async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const blocked = await requireBuiltinMode()
    if (blocked) return blocked
    return handler(req, ctx)
  }
}
