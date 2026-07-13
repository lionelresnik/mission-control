import fs from "fs"
import os from "os"
import path from "path"

export const DATA_DIR = path.join(os.homedir(), ".mission-control")
export const DB_PATH = path.join(DATA_DIR, "mc.db")

const LEGACY_DATA_DIR = path.join(os.homedir(), ".command-center")
const LEGACY_DB_PATH = path.join(LEGACY_DATA_DIR, "cc.db")

/** Copy Command Center DB on first run if Mission Control DB does not exist yet. */
export function ensureDataDirAndDb(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
    fs.copyFileSync(LEGACY_DB_PATH, DB_PATH)
  }
}
