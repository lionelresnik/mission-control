import fs from "fs"
import path from "path"

export function getDemoStaticParams(collection: "missions" | "projects"): { id: string }[] {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return []
  const file = path.join(process.cwd(), "public", "demo-bundle.json")
  if (!fs.existsSync(file)) return []
  const bundle = JSON.parse(fs.readFileSync(file, "utf8"))
  return (bundle[collection] ?? []).map((item: { id: string }) => ({ id: item.id }))
}
