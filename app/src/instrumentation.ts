export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { getDb } = await import("@/lib/db")
  const { ensureBuiltinRolesAndCrews, ensureSampleTodoLinks, isDbEmpty, seedDemoData, seedDemoExtras } = await import("@/lib/db/seed-demo")
  const db = getDb()
  await ensureBuiltinRolesAndCrews(db)
  if (await isDbEmpty(db)) {
    await seedDemoData(db)
  } else {
    await seedDemoExtras(db)
  }
  await ensureSampleTodoLinks(db)
}
