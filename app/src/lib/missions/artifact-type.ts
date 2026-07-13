import type { schema } from "@/lib/db"

type ArtifactType = typeof schema.artifacts.$inferInsert.type

export function detectArtifactType(roleName: string, roleSlug?: string): ArtifactType {
  const key = (roleSlug ?? roleName).toLowerCase()
  const artifactTypeMap: Record<string, ArtifactType> = {
    architect: "plan",
    "backend-engineer": "code",
    backend: "code",
    qa: "review",
    security: "findings",
    docs: "runbook",
  }
  if (artifactTypeMap[key]) return artifactTypeMap[key]
  if (roleName.toLowerCase().includes("architect")) return "plan"
  if (roleName.toLowerCase().includes("qa")) return "review"
  if (roleName.toLowerCase().includes("security")) return "findings"
  return "code"
}
