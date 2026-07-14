export type PlacementScope = "project" | "workspace"

export function resolveKnowledgePlacement(input: {
  scope?: PlacementScope
  projectId?: string | null
  workspaceId?: string | null
}): { projectId: string | null; workspaceId: string | null } {
  const scope = input.scope ?? (input.projectId ? "project" : input.workspaceId ? "workspace" : undefined)

  if (scope === "project") {
    if (!input.projectId) throw new Error("projectId required when scope is project")
    return { projectId: input.projectId, workspaceId: null }
  }
  if (scope === "workspace") {
    if (!input.workspaceId) throw new Error("workspaceId required when scope is workspace")
    return { projectId: null, workspaceId: input.workspaceId }
  }
  if (input.projectId) return { projectId: input.projectId, workspaceId: null }
  if (input.workspaceId) return { projectId: null, workspaceId: input.workspaceId }
  throw new Error("Provide projectId or workspaceId to move this entry")
}

export function placementScopeFromEntry(entry: {
  projectId?: string | null
  workspaceId?: string | null
}): PlacementScope {
  return entry.projectId ? "project" : "workspace"
}
