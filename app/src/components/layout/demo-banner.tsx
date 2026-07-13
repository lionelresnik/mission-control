"use client"

import { isDemoMode } from "@/lib/demo/config"

export function DemoBanner() {
  if (!isDemoMode()) return null

  return (
    <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-center text-xs text-yellow-700 dark:text-yellow-300">
      <strong>Demo mode</strong> — read-only preview with sample data.{" "}
      <a
        href="https://github.com/lionelresnik/mission-control#getting-started"
        className="underline hover:text-yellow-600 dark:hover:text-yellow-200"
        target="_blank"
        rel="noopener noreferrer"
      >
        Clone and run locally
      </a>{" "}
      for full features (DB, AI missions, Cursor MCP).
    </div>
  )
}
