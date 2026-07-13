import { exec } from "child_process"
import { promisify } from "util"
import path from "path"
import fs from "fs/promises"
import os from "os"

const execAsync = promisify(exec)

const WORKTREES_BASE = path.join(os.homedir(), ".mission-control", "worktrees")

export interface WorktreeInfo {
  path: string
  branch: string
  missionId: string
  roleId: string
  createdAt: string
}

/** Ensure the worktrees base directory exists */
async function ensureBase() {
  await fs.mkdir(WORKTREES_BASE, { recursive: true })
}

/** Get the git root for a given repo path */
async function getGitRoot(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git rev-parse --show-toplevel", { cwd: repoPath })
    return stdout.trim()
  } catch {
    return null
  }
}

/** Create a git worktree for a mission role */
export async function createWorktree(opts: {
  repoPath: string
  missionId: string
  roleId: string
  roleName: string
  baseBranch?: string
}): Promise<WorktreeInfo | null> {
  try {
    await ensureBase()

    const gitRoot = await getGitRoot(opts.repoPath)
    if (!gitRoot) return null

    const slug = opts.roleName.toLowerCase().replace(/\s+/g, "-")
    const branchName = `cc/mission-${opts.missionId.slice(0, 8)}-${slug}`
    const worktreePath = path.join(WORKTREES_BASE, `${opts.missionId.slice(0, 8)}-${slug}`)
    const baseBranch = opts.baseBranch ?? "main"

    // Create branch from base
    await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" "${baseBranch}"`, { cwd: gitRoot })

    const info: WorktreeInfo = {
      path: worktreePath,
      branch: branchName,
      missionId: opts.missionId,
      roleId: opts.roleId,
      createdAt: new Date().toISOString(),
    }

    // Persist metadata
    const metaPath = path.join(WORKTREES_BASE, `${opts.missionId.slice(0, 8)}-${slug}.json`)
    await fs.writeFile(metaPath, JSON.stringify(info, null, 2))

    return info
  } catch (err) {
    console.error("[worktrees] createWorktree error:", err)
    return null
  }
}

/** Remove a worktree when the role is done */
export async function removeWorktree(worktreePath: string, repoPath: string): Promise<void> {
  try {
    const gitRoot = await getGitRoot(repoPath)
    if (!gitRoot) return
    await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: gitRoot })
  } catch (err) {
    console.error("[worktrees] removeWorktree error:", err)
  }
}

/** List all active worktrees for a mission */
export async function listMissionWorktrees(missionId: string): Promise<WorktreeInfo[]> {
  try {
    await ensureBase()
    const files = await fs.readdir(WORKTREES_BASE)
    const metaFiles = files.filter(f => f.startsWith(missionId.slice(0, 8)) && f.endsWith(".json"))
    const results: WorktreeInfo[] = []
    for (const f of metaFiles) {
      try {
        const raw = await fs.readFile(path.join(WORKTREES_BASE, f), "utf8")
        results.push(JSON.parse(raw))
      } catch { /* skip corrupted */ }
    }
    return results
  } catch {
    return []
  }
}

/** Get worktree status summary for the API */
export async function getWorktreeStatus(repoPath: string): Promise<{
  supported: boolean
  gitRoot: string | null
  worktreesPath: string
}> {
  const gitRoot = await getGitRoot(repoPath)
  return {
    supported: !!gitRoot,
    gitRoot,
    worktreesPath: WORKTREES_BASE,
  }
}
