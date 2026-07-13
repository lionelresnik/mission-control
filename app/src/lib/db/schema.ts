import { sql } from "drizzle-orm"
import {
  text,
  integer,
  real,
  sqliteTable,
  blob,
} from "drizzle-orm/sqlite-core"

// ─── Workspaces ──────────────────────────────────────────────────────────────

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#8b5cf6"),
  repoPaths: text("repo_paths", { mode: "json" }).$type<string[]>().default([]),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
})

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#3b82f6"),
  githubRepo: text("github_repo"),
  githubOwner: text("github_owner"),
  jiraProject: text("jira_project"),
  jiraUrl: text("jira_url"),
  slackChannel: text("slack_channel"),
  workspaceId: text("workspace_id"),
  mcps: text("mcps", { mode: "json" }).$type<string[]>().default([]),
  agentsMdLocal: text("agents_md_local"),
  agentsMdGithubPr: integer("agents_md_github_pr"),
  agentsMdStatus: text("agents_md_status", {
    enum: ["local", "pr_open", "merged"],
  }).default("local"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
})

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export const knowledgeEntries = sqliteTable("knowledge_entries", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id"),
  type: text("type", {
    enum: ["architecture", "pattern", "adr", "standard", "glossary", "database", "infrastructure", "logs", "services", "runbook", "other"],
  }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  confidence: text("confidence", { enum: ["confirmed", "assumed", "investigating"] }).default("confirmed"),
  sourceMissionId: text("source_mission_id"),
  sourceFile: text("source_file"),
  embedding: blob("embedding", { mode: "buffer" }),
  tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
})

// ─── Roles ───────────────────────────────────────────────────────────────────

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  tools: text("tools", { mode: "json" }).$type<string[]>().default([]),
  allowedActions: text("allowed_actions", { mode: "json" })
    .$type<string[]>()
    .default([]),
  temperature: real("temperature").default(0.7),
  maxTokens: integer("max_tokens").default(4096),
  model: text("model").default("claude-sonnet"),
  memoryScope: text("memory_scope", {
    enum: ["mission", "project", "global"],
  }).default("mission"),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).default(false),
  icon: text("icon").default("User"),
  color: text("color").default("#6b7280"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

// ─── Crews ───────────────────────────────────────────────────────────────────

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  leaderId: text("leader_id").references(() => roles.id),
  members: text("members", { mode: "json" })
    .$type<{ roleId: string; order: number }[]>()
    .default([]),
  knowledgeFilters: text("knowledge_filters", { mode: "json" })
    .$type<string[]>()
    .default([]),
  mcps: text("mcps", { mode: "json" }).$type<string[]>().default([]),
  workflow: text("workflow", { mode: "json" })
    .$type<string[]>()
    .default(["plan", "implement", "review"]),
  yamlPath: text("yaml_path"),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

// ─── Missions ────────────────────────────────────────────────────────────────

export const missions = sqliteTable("missions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  goal: text("goal").notNull(),
  projectId: text("project_id").references(() => projects.id),
  workspaceId: text("workspace_id"),
  projectIds: text("project_ids", { mode: "json" }).$type<string[]>().default([]),
  teamId: text("team_id").references(() => teams.id),
  ticketId: text("ticket_id"),
  ticketUrl: text("ticket_url"),
  agentBehavior: text("agent_behavior", {
    enum: ["assume_and_document", "ask_me", "async"],
  }).default("assume_and_document"),
  status: text("status", {
    enum: ["pending", "planning", "running", "paused", "review", "done", "failed"],
  }).default("pending"),
  taskGraph: text("task_graph", { mode: "json" })
    .$type<TaskGraphNode[]>()
    .default([]),
  currentRoleId: text("current_role_id"),
  progressPercent: integer("progress_percent").default(0),
  notes: text("notes"),
  tokensInput: integer("tokens_input").default(0),
  tokensOutput: integer("tokens_output").default(0),
  tokensTotal: integer("tokens_total").default(0),
  estimatedCostUsd: real("estimated_cost_usd").default(0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
})

export type TaskGraphNode = {
  id: string
  roleId: string
  roleName: string
  status: "pending" | "running" | "done" | "failed" | "skipped"
  dependsOn: string[]
  artifactId?: string
  startedAt?: string
  completedAt?: string
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  missionId: text("mission_id")
    .notNull()
    .references(() => missions.id, { onDelete: "cascade" }),
  roleId: text("role_id").references(() => roles.id),
  roleName: text("role_name"),
  type: text("type", {
    enum: ["plan", "code", "review", "findings", "runbook", "other"],
  }).notNull(),
  title: text("title"),
  content: text("content").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

// ─── Mission Questions ────────────────────────────────────────────────────────

export const missionQuestions = sqliteTable("mission_questions", {
  id: text("id").primaryKey(),
  missionId: text("mission_id")
    .notNull()
    .references(() => missions.id, { onDelete: "cascade" }),
  roleId: text("role_id"),
  roleName: text("role_name"),
  question: text("question").notNull(),
  answer: text("answer"),
  isAssumption: integer("is_assumption", { mode: "boolean" }).default(false),
  addedToKnowledge: integer("added_to_knowledge", { mode: "boolean" }).default(false),
  knowledgeEntryId: text("knowledge_entry_id"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  answeredAt: text("answered_at"),
})

// ─── Mission events (Cursor mode activity feed) ─────────────────────────────

export const missionEvents = sqliteTable("mission_events", {
  id: text("id").primaryKey(),
  missionId: text("mission_id")
    .notNull()
    .references(() => missions.id, { onDelete: "cascade" }),
  roleId: text("role_id"),
  roleName: text("role_name"),
  type: text("type", {
    enum: ["role_start", "checkpoint", "role_done", "mission_done"],
  }).notNull(),
  message: text("message"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

// ─── Daily Log ───────────────────────────────────────────────────────────────

export const dailyLogs = sqliteTable("daily_logs", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  workspace: text("workspace"),
  action: text("action").notNull(),
  detail: text("detail"),
  files: text("files", { mode: "json" }).$type<string[]>().default([]),
  ticketId: text("ticket_id"),
  missionId: text("mission_id"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

// ─── Todos ───────────────────────────────────────────────────────────────────

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  status: text("status", {
    enum: ["pending", "in_progress", "done"],
  }).default("pending"),
  priority: text("priority", {
    enum: ["high", "medium", "low"],
  }).default("medium"),
  workspace: text("workspace"),
  ticketTag: text("ticket_tag"),
  assignee: text("assignee"),
  missionId: text("mission_id"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
})

// ─── Settings ────────────────────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
})
