import { eq } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"
import { DEFAULT_EXECUTION_MODE, parseExecutionMode, type ExecutionMode } from "@/lib/settings/execution-mode"

export async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await getDb().select().from(schema.settings)
  const out: Record<string, string> = {}
  for (const r of rows) {
    if (r.value != null) out[r.key] = String(r.value)
  }
  return out
}

export async function getSetting(key: string): Promise<string | undefined> {
  const rows = await getDb().select().from(schema.settings).where(eq(schema.settings.key, key))
  const val = rows[0]?.value
  return val != null ? String(val) : undefined
}

export async function getExecutionModeFromDb(): Promise<ExecutionMode> {
  const raw = await getSetting("executionMode")
  return parseExecutionMode(raw ?? DEFAULT_EXECUTION_MODE)
}
