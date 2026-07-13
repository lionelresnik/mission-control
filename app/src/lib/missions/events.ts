import { desc, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getDb, schema } from "@/lib/db"

export type MissionEventType = "role_start" | "checkpoint" | "role_done" | "mission_done"

export async function addMissionEvent(data: {
  missionId: string
  type: MissionEventType
  roleId?: string
  roleName?: string
  message?: string
}) {
  const id = nanoid()
  await getDb().insert(schema.missionEvents).values({
    id,
    missionId: data.missionId,
    type: data.type,
    roleId: data.roleId,
    roleName: data.roleName,
    message: data.message,
  })
  return id
}

export async function getMissionEvents(missionId: string, limit = 50) {
  return getDb()
    .select()
    .from(schema.missionEvents)
    .where(eq(schema.missionEvents.missionId, missionId))
    .orderBy(desc(schema.missionEvents.createdAt))
    .limit(limit)
}
