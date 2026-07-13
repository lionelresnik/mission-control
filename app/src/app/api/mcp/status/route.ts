import { NextResponse } from "next/server"
import fs from "fs"
import { DB_PATH, ensureDataDirAndDb } from "@/lib/paths"
import path from "path"

export async function GET() {
  ensureDataDirAndDb()
  const repoRoot = path.resolve(process.cwd(), "..")
  const mcpPath = path.join(repoRoot, "mcp", "dist", "index.js")

  const dbExists = fs.existsSync(DB_PATH)
  const mcpBuilt = fs.existsSync(mcpPath)

  const config = JSON.stringify({
    mcpServers: {
      "mission-control": {
        command: "node",
        args: [mcpPath],
      },
    },
  }, null, 2)

  return NextResponse.json({
    dbExists,
    mcpBuilt,
    mcpPath,
    dbPath: DB_PATH,
    config,
    toolCount: 19,
  })
}
