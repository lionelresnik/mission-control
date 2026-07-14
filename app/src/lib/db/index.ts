import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"
import { DB_PATH, ensureDataDirAndDb } from "@/lib/paths"

/** Run additive migrations — safe to call on every startup */
function migrateKnowledgeProjectIdNullable(sqlite: InstanceType<typeof Database>) {
  const cols = sqlite.prepare("PRAGMA table_info(knowledge_entries)").all() as Array<{ name: string; notnull: number }>
  const projectCol = cols.find(c => c.name === "project_id")
  if (!projectCol || projectCol.notnull === 0) return

  sqlite.exec(`
    CREATE TABLE knowledge_entries_mig (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      workspace_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence TEXT DEFAULT 'confirmed',
      source_mission_id TEXT,
      source_file TEXT,
      embedding BLOB,
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO knowledge_entries_mig
      SELECT id, project_id, workspace_id, type, title, content, confidence,
             source_mission_id, source_file, embedding, tags, created_at, updated_at
      FROM knowledge_entries;
    DROP TABLE knowledge_entries;
    ALTER TABLE knowledge_entries_mig RENAME TO knowledge_entries;
  `)
}

/** Run additive migrations — safe to call on every startup */
function runMigrations(sqlite: InstanceType<typeof Database>) {
  const migrations = [
    // Phase 4: token tracking columns
    `ALTER TABLE missions ADD COLUMN tokens_input INTEGER DEFAULT 0`,
    `ALTER TABLE missions ADD COLUMN tokens_output INTEGER DEFAULT 0`,
    `ALTER TABLE missions ADD COLUMN tokens_total INTEGER DEFAULT 0`,
    `ALTER TABLE missions ADD COLUMN estimated_cost_usd REAL DEFAULT 0`,
    // Phase 4: AGENTS.md columns
    `ALTER TABLE projects ADD COLUMN agents_md_local TEXT`,
    `ALTER TABLE projects ADD COLUMN agents_md_github_pr INTEGER`,
    `ALTER TABLE projects ADD COLUMN agents_md_status TEXT DEFAULT 'local'`,
    // Phase 5: Workspaces
    `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#8b5cf6',
      repo_paths TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE projects ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE missions ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE knowledge_entries ADD COLUMN workspace_id TEXT`,
    `ALTER TABLE missions ADD COLUMN project_ids TEXT DEFAULT '[]'`,
    `CREATE TABLE IF NOT EXISTS mission_events (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      role_id TEXT,
      role_name TEXT,
      type TEXT NOT NULL,
      message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
  ]

  for (const sql of migrations) {
    try {
      sqlite.exec(sql)
    } catch {
      // "duplicate column name" or similar — already applied, skip silently
    }
  }

  migrateKnowledgeProjectIdNullable(sqlite)
}

let _db: BetterSQLite3Database<typeof schema> | null = null

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) {
    ensureDataDirAndDb()
    const sqlite = new Database(DB_PATH)
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")
    runMigrations(sqlite)
    _db = drizzle(sqlite, { schema })
  }
  return _db
}

export { schema }
