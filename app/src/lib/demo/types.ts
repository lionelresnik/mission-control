export type DemoBundle = {
  projects: Record<string, unknown>[]
  workspaces: Record<string, unknown>[]
  missions: Record<string, unknown>[]
  knowledge: Record<string, unknown>[]
  teams: Record<string, unknown>[]
  roles: Record<string, unknown>[]
  todos: Record<string, unknown>[]
  settings: Record<string, unknown>
  mcpStatus: Record<string, unknown>
  missionDetails: Record<string, {
    artifacts: Record<string, unknown>[]
    questions: Record<string, unknown>[]
    project: { jiraBaseUrl: string | null; slackChannel: string | null } | null
  }>
  missionActivities: Record<string, Record<string, unknown>[]>
  projectAgentsMd: Record<string, { content: string; source: "db" | "file" | "template" }>
}
