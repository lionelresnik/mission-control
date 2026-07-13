import { eq } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"
import type { TaskGraphNode } from "@/lib/db/schema"

function parseMembers(raw: unknown): Array<{ roleId: string; order: number }> {
  if (raw == null) return []
  const val = typeof raw === "string" ? JSON.parse(raw) : raw
  if (!Array.isArray(val)) return []
  return val as Array<{ roleId: string; order: number }>
}

export async function buildTaskGraphFromTeam(teamId: string): Promise<TaskGraphNode[]> {
  const teamRows = await getDb().select().from(schema.teams).where(eq(schema.teams.id, teamId))
  const team = teamRows[0]
  if (!team) return []

  const members = parseMembers(team.members).sort((a, b) => a.order - b.order)
  if (members.length === 0) return []

  const roleRows = await getDb().select().from(schema.roles)
  const roleById = Object.fromEntries(roleRows.map(r => [r.id, r]))

  return members.map((m, i) => {
    const role = roleById[m.roleId]
    return {
      id: `task_${i + 1}`,
      roleId: m.roleId,
      roleName: role?.displayName ?? role?.name ?? m.roleId,
      status: "pending" as const,
      dependsOn: i === 0 ? [] : [`task_${i}`],
    }
  })
}
