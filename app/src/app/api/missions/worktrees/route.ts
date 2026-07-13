import { NextRequest, NextResponse } from "next/server"
import { getWorktreeStatus, listMissionWorktrees } from "@/lib/git/worktrees"

export async function GET(req: NextRequest) {
  try {
    const missionId = req.nextUrl.searchParams.get("missionId")
    const repoPath = req.nextUrl.searchParams.get("repoPath") ?? process.cwd()

    if (missionId) {
      const worktrees = await listMissionWorktrees(missionId)
      return NextResponse.json(worktrees)
    }

    const status = await getWorktreeStatus(repoPath)
    return NextResponse.json(status)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
