import type { Config } from "drizzle-kit"
import path from "path"
import os from "os"

const DATA_DIR = path.join(os.homedir(), ".mission-control")

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: path.join(DATA_DIR, "mc.db"),
  },
} satisfies Config
