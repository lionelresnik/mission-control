#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import Database from "better-sqlite3"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"
import { z } from "zod"

// ─── DB Setup ────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(os.homedir(), ".mission-control")
const DB_PATH = path.join(DATA_DIR, "mc.db")
const LEGACY_DB_PATH = path.join(os.homedir(), ".command-center", "cc.db")

function resolveDbPath(): string {
  if (fs.existsSync(DB_PATH)) return DB_PATH
  if (fs.existsSync(LEGACY_DB_PATH)) return LEGACY_DB_PATH
  throw new Error(
    `Mission Control database not found.\n` +
    `Expected: ${DB_PATH}\n` +
    `Legacy: ${LEGACY_DB_PATH}\n` +
    `Run the Mission Control app once (npm run dev) or import from Command Center.`
  )
}

function getDb(): Database.Database {
  return new Database(resolveDbPath(), { readonly: true })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseJson<T>(val: unknown, fallback: T): T {
  if (val == null) return fallback
  if (typeof val === "string") {
    try { return JSON.parse(val) as T } catch { return fallback }
  }
  return val as T
}

function readExecutionMode(db: Database.Database): "cursor" | "builtin" {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'executionMode'`).get() as { value?: unknown } | undefined
  const raw = row?.value
  if (raw == null) return "cursor"
  const str = typeof raw === "string" ? (() => { try { return JSON.parse(raw) as string } catch { return raw } })() : String(raw)
  return str === "builtin" ? "builtin" : "cursor"
}

async function mcFetch(appUrl: string, path: string, init?: RequestInit) {
  const res = await fetch(`${appUrl}${path}`, init)
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(String(data.error ?? res.statusText))
  return data
}

async function cursorModeBlocked(db: Database.Database, appUrl: string): Promise<string | null> {
  const mode = readExecutionMode(db)
  if (mode === "cursor") {
    return `Built-in AI tools are disabled in Cursor mode.\nUse mc_get_next_role → mc_role_start → mc_complete_role instead.\nOr switch to Built-in AI in Settings: ${appUrl}/settings`
  }
  return null
}

// ─── Server ──────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mission-control",
  version: "1.0.0",
})

// ─── Tool: mc_status ─────────────────────────────────────────────────────────

server.tool(
  "mc_status",
  "Get a quick overview of Mission Control: active missions, open todos, recent activity, and project list.",
  {},
  async () => {
    const db = getDb()
    try {
      const activeMissions = db.prepare(
        `SELECT m.id, m.name, m.status, m.progress_percent, p.name as project
         FROM missions m LEFT JOIN projects p ON m.project_id = p.id
         WHERE m.status IN ('running','planning','paused','review')
         ORDER BY m.updated_at DESC LIMIT 10`
      ).all() as Array<{ id: string; name: string; status: string; progress_percent: number; project: string }>

      const todoStats = db.prepare(
        `SELECT status, COUNT(*) as count FROM todos GROUP BY status`
      ).all() as Array<{ status: string; count: number }>

      const recentLogs = db.prepare(
        `SELECT action, detail, workspace, created_at FROM daily_logs
         ORDER BY created_at DESC LIMIT 5`
      ).all() as Array<{ action: string; detail: string; workspace: string; created_at: string }>

      const projects = db.prepare(
        `SELECT id, name, description FROM projects ORDER BY name`
      ).all() as Array<{ id: string; name: string; description: string }>

      const openCount = todoStats.find(t => t.status === "pending")?.count ?? 0
      const inProgressCount = todoStats.find(t => t.status === "in_progress")?.count ?? 0
      const doneCount = todoStats.find(t => t.status === "done")?.count ?? 0

      const lines: string[] = [
        "# Mission Control Status",
        "",
        `## Projects (${projects.length})`,
        ...projects.map(p => `- **${p.name}**: ${p.description ?? "no description"}`),
        "",
        `## Active Missions (${activeMissions.length})`,
        activeMissions.length === 0
          ? "- No active missions"
          : activeMissions.map(m =>
              `- [${m.status.toUpperCase()}] **${m.name}** (${m.project}) — ${m.progress_percent}%`
            ).join("\n"),
        "",
        `## Todos`,
        `- Open: ${openCount}`,
        `- In progress: ${inProgressCount}`,
        `- Done: ${doneCount}`,
        "",
        `## Recent Activity`,
        recentLogs.length === 0
          ? "- No recent activity"
          : recentLogs.map(l =>
              `- ${l.action}${l.detail ? `: ${l.detail}` : ""}${l.workspace ? ` (${l.workspace})` : ""}`
            ).join("\n"),
      ]

      return { content: [{ type: "text", text: lines.join("\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_list_missions ───────────────────────────────────────────────────

server.tool(
  "mc_list_missions",
  "List missions, optionally filtered by status or project name.",
  {
    status: z.enum(["pending", "planning", "running", "paused", "review", "done", "failed", "all"])
      .optional()
      .describe("Filter by mission status. Defaults to all."),
    project: z.string().optional().describe("Filter by project name (partial match)."),
    limit: z.number().optional().describe("Max results to return. Defaults to 20."),
  },
  async ({ status, project, limit = 20 }) => {
    const db = getDb()
    try {
      let sql = `
        SELECT m.id, m.name, m.goal, m.status, m.progress_percent,
               m.created_at, m.updated_at, m.completed_at,
               m.tokens_total, m.estimated_cost_usd,
               p.name as project_name
        FROM missions m LEFT JOIN projects p ON m.project_id = p.id
        WHERE 1=1
      `
      const params: (string | number)[] = []

      if (status && status !== "all") {
        sql += " AND m.status = ?"
        params.push(status)
      }
      if (project) {
        sql += " AND p.name LIKE ?"
        params.push(`%${project}%`)
      }
      sql += " ORDER BY m.updated_at DESC LIMIT ?"
      params.push(limit)

      const rows = db.prepare(sql).all(...params) as Array<{
        id: string; name: string; goal: string; status: string
        progress_percent: number; created_at: string; updated_at: string
        completed_at: string | null; tokens_total: number
        estimated_cost_usd: number; project_name: string
      }>

      if (rows.length === 0) {
        return { content: [{ type: "text", text: "No missions found matching your filters." }] }
      }

      const lines = rows.map(m => [
        `### ${m.name} \`${m.id}\``,
        `**Project:** ${m.project_name ?? "unknown"}  |  **Status:** ${m.status}  |  **Progress:** ${m.progress_percent}%`,
        `**Goal:** ${m.goal}`,
        m.completed_at ? `**Completed:** ${m.completed_at}` : `**Updated:** ${m.updated_at}`,
        m.tokens_total > 0 ? `**Tokens:** ${m.tokens_total.toLocaleString()}  |  **Cost:** $${m.estimated_cost_usd.toFixed(4)}` : "",
      ].filter(Boolean).join("\n"))

      return {
        content: [{
          type: "text",
          text: `# Missions (${rows.length})\n\n` + lines.join("\n\n---\n\n"),
        }]
      }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_get_mission ─────────────────────────────────────────────────────

server.tool(
  "mc_get_mission",
  "Get full details of a specific mission including task graph, artifacts, and questions.",
  {
    id: z.string().describe("Mission ID"),
  },
  async ({ id }) => {
    const db = getDb()
    try {
      const mission = db.prepare(
        `SELECT m.*, p.name as project_name FROM missions m
         LEFT JOIN projects p ON m.project_id = p.id
         WHERE m.id = ?`
      ).get(id) as Record<string, unknown> | undefined

      if (!mission) {
        return { content: [{ type: "text", text: `Mission \`${id}\` not found.` }] }
      }

      const taskGraph = parseJson<Array<{ roleName: string; status: string; dependsOn: string[] }>>(
        mission.task_graph, []
      )

      const artifacts = db.prepare(
        `SELECT role_name, type, title, content, created_at FROM artifacts
         WHERE mission_id = ? ORDER BY created_at`
      ).all(id) as Array<{ role_name: string; type: string; title: string; content: string; created_at: string }>

      const questions = db.prepare(
        `SELECT role_name, question, answer, is_assumption FROM mission_questions
         WHERE mission_id = ? ORDER BY created_at`
      ).all(id) as Array<{ role_name: string; question: string; answer: string | null; is_assumption: number }>

      const lines: string[] = [
        `# Mission: ${mission.name}`,
        `**ID:** \`${mission.id}\`  |  **Status:** ${mission.status}  |  **Progress:** ${mission.progress_percent}%`,
        `**Project:** ${mission.project_name ?? "unknown"}`,
        `**Goal:** ${mission.goal}`,
        mission.notes ? `**Notes:** ${mission.notes}` : "",
        "",
        "## Task Graph",
        taskGraph.length === 0
          ? "_No tasks defined_"
          : taskGraph.map(t =>
              `- [${t.status}] **${t.roleName}**${t.dependsOn.length > 0 ? ` (after: ${t.dependsOn.join(", ")})` : ""}`
            ).join("\n"),
        "",
        `## Artifacts (${artifacts.length})`,
        artifacts.length === 0
          ? "_None_"
          : artifacts.map(a =>
              `### ${a.role_name} — ${a.type}: ${a.title ?? "untitled"}\n${a.content.slice(0, 500)}${a.content.length > 500 ? "\n_[truncated]_" : ""}`
            ).join("\n\n"),
        "",
        `## Questions & Assumptions (${questions.length})`,
        questions.length === 0
          ? "_None_"
          : questions.map(q =>
              `- ${q.is_assumption ? "**[ASSUMPTION]**" : "**[Q]**"} ${q.question}${q.answer ? `\n  → ${q.answer}` : " _(unanswered)_"}`
            ).join("\n"),
      ]

      return { content: [{ type: "text", text: lines.filter(l => l !== null).join("\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_list_todos ──────────────────────────────────────────────────────

server.tool(
  "mc_list_todos",
  "List todos, optionally filtered by status or priority.",
  {
    status: z.enum(["pending", "in_progress", "done", "all"]).optional().describe("Filter by status. Defaults to pending+in_progress."),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Filter by priority."),
    limit: z.number().optional().describe("Max results. Defaults to 30."),
  },
  async ({ status, priority, limit = 30 }) => {
    const db = getDb()
    try {
      let sql = `SELECT id, content, status, priority, ticket_tag, assignee, created_at FROM todos WHERE 1=1`
      const params: (string | number)[] = []

      if (!status || status === "all") {
        // default: skip done
      } else if (status === "pending") {
        sql += " AND status IN ('pending','in_progress')"
      } else {
        sql += " AND status = ?"
        params.push(status)
      }

      if (priority) {
        sql += " AND priority = ?"
        params.push(priority)
      }

      sql += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT ?"
      params.push(limit)

      const rows = db.prepare(sql).all(...params) as Array<{
        id: string; content: string; status: string; priority: string
        ticket_tag: string | null; assignee: string | null; created_at: string
      }>

      if (rows.length === 0) {
        return { content: [{ type: "text", text: "No todos found." }] }
      }

      const priorityIcon: Record<string, string> = { high: "🔴", medium: "🟡", low: "🔵" }
      const statusIcon: Record<string, string> = { pending: "⬜", in_progress: "🔄", done: "✅" }

      const lines = rows.map(t =>
        `${statusIcon[t.status] ?? "·"} ${priorityIcon[t.priority] ?? "·"} ${t.content}` +
        (t.ticket_tag ? ` \`${t.ticket_tag}\`` : "") +
        (t.assignee ? ` — @${t.assignee}` : "")
      )

      return {
        content: [{
          type: "text",
          text: `# Todos (${rows.length})\n\n` + lines.join("\n"),
        }]
      }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_add_todo ────────────────────────────────────────────────────────

server.tool(
  "mc_add_todo",
  "Add a new todo item to Mission Control.",
  {
    content: z.string().describe("The todo text"),
    priority: z.enum(["high", "medium", "low"]).optional().describe("Priority level. Defaults to medium."),
    ticketTag: z.string().optional().describe("Associated ticket ID e.g. PROJ-123"),
  },
  async ({ content, priority = "medium", ticketTag }) => {
    // Need write access — open without readonly
    if (!fs.existsSync(DB_PATH)) {
      return { content: [{ type: "text", text: `Database not found at ${DB_PATH}` }] }
    }
    const db = new Database(DB_PATH)
    try {
      const id = `todo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      db.prepare(
        `INSERT INTO todos (id, content, status, priority, ticket_tag, created_at, updated_at)
         VALUES (?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).run(id, content, priority, ticketTag ?? null)

      return {
        content: [{
          type: "text",
          text: `✅ Todo added (id: \`${id}\`)\n**${content}**\nPriority: ${priority}${ticketTag ? `  |  Ticket: ${ticketTag}` : ""}`,
        }]
      }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_complete_todo ───────────────────────────────────────────────────

server.tool(
  "mc_complete_todo",
  "Mark a todo as done.",
  {
    id: z.string().describe("Todo ID to mark as complete"),
  },
  async ({ id }) => {
    if (!fs.existsSync(DB_PATH)) {
      return { content: [{ type: "text", text: `Database not found at ${DB_PATH}` }] }
    }
    const db = new Database(DB_PATH)
    try {
      const todo = db.prepare(`SELECT content FROM todos WHERE id = ?`).get(id) as { content: string } | undefined
      if (!todo) {
        return { content: [{ type: "text", text: `Todo \`${id}\` not found.` }] }
      }
      db.prepare(
        `UPDATE todos SET status = 'done', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(id)
      return { content: [{ type: "text", text: `✅ Marked as done: **${todo.content}**` }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_search_knowledge ────────────────────────────────────────────────

server.tool(
  "mc_search_knowledge",
  "Search the knowledge base by keyword. Returns matching entries with full content.",
  {
    query: z.string().describe("Search term — matches title, content, and tags"),
    project: z.string().optional().describe("Filter by project name (partial match)"),
    type: z.string().optional().describe("Filter by entry type: architecture, pattern, adr, standard, database, etc."),
    limit: z.number().optional().describe("Max results. Defaults to 10."),
  },
  async ({ query, project, type, limit = 10 }) => {
    const db = getDb()
    try {
      let sql = `
        SELECT k.id, k.title, k.content, k.type, k.confidence, k.tags,
               k.source_file, k.created_at, p.name as project_name
        FROM knowledge_entries k LEFT JOIN projects p ON k.project_id = p.id
        WHERE (k.title LIKE ? OR k.content LIKE ? OR k.tags LIKE ?)
      `
      const like = `%${query}%`
      const params: (string | number)[] = [like, like, like]

      if (project) {
        sql += " AND p.name LIKE ?"
        params.push(`%${project}%`)
      }
      if (type) {
        sql += " AND k.type = ?"
        params.push(type)
      }
      sql += " ORDER BY k.updated_at DESC LIMIT ?"
      params.push(limit)

      const rows = db.prepare(sql).all(...params) as Array<{
        id: string; title: string; content: string; type: string
        confidence: string; tags: string | null; source_file: string | null
        created_at: string; project_name: string
      }>

      if (rows.length === 0) {
        return { content: [{ type: "text", text: `No knowledge entries found for "${query}".` }] }
      }

      const lines = rows.map(k => {
        const tags = parseJson<string[]>(k.tags, [])
        return [
          `### ${k.title}`,
          `**Project:** ${k.project_name}  |  **Type:** ${k.type}  |  **Confidence:** ${k.confidence}`,
          tags.length > 0 ? `**Tags:** ${tags.join(", ")}` : "",
          k.source_file ? `**Source:** ${k.source_file}` : "",
          "",
          k.content,
        ].filter(Boolean).join("\n")
      })

      return {
        content: [{
          type: "text",
          text: `# Knowledge: "${query}" (${rows.length} results)\n\n` + lines.join("\n\n---\n\n"),
        }]
      }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_add_knowledge ───────────────────────────────────────────────────

server.tool(
  "mc_add_knowledge",
  "Add a new entry to the knowledge base.",
  {
    projectId: z.string().describe("Project ID to attach this knowledge to"),
    title: z.string().describe("Short descriptive title"),
    content: z.string().describe("Full knowledge content"),
    type: z.enum(["architecture", "pattern", "adr", "standard", "glossary", "database", "infrastructure", "logs", "services", "runbook", "other"])
      .describe("Entry type"),
    confidence: z.enum(["confirmed", "assumed", "investigating"]).optional().describe("Confidence level. Defaults to confirmed."),
    tags: z.array(z.string()).optional().describe("Tags for filtering"),
  },
  async ({ projectId, title, content, type, confidence = "confirmed", tags = [] }) => {
    if (!fs.existsSync(DB_PATH)) {
      return { content: [{ type: "text", text: `Database not found at ${DB_PATH}` }] }
    }
    const db = new Database(DB_PATH)
    try {
      const project = db.prepare(`SELECT name FROM projects WHERE id = ?`).get(projectId) as { name: string } | undefined
      if (!project) {
        const projects = db.prepare(`SELECT id, name FROM projects ORDER BY name`).all() as Array<{ id: string; name: string }>
        return {
          content: [{
            type: "text",
            text: `Project \`${projectId}\` not found.\n\nAvailable projects:\n` +
              projects.map(p => `- \`${p.id}\` — ${p.name}`).join("\n"),
          }]
        }
      }

      const id = `kb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      db.prepare(
        `INSERT INTO knowledge_entries (id, project_id, type, title, content, confidence, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).run(id, projectId, type, title, content, confidence, JSON.stringify(tags))

      return {
        content: [{
          type: "text",
          text: `✅ Knowledge entry added (id: \`${id}\`)\n**${title}**\nProject: ${project.name}  |  Type: ${type}  |  Confidence: ${confidence}`,
        }]
      }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_list_projects ───────────────────────────────────────────────────

server.tool(
  "mc_list_projects",
  "List all projects with their IDs, descriptions, and integration settings.",
  {},
  async () => {
    const db = getDb()
    try {
      const projects = db.prepare(`SELECT * FROM projects ORDER BY name`).all() as Array<{
        id: string; name: string; description: string | null
        github_owner: string | null; github_repo: string | null
        jira_project: string | null; slack_channel: string | null
        created_at: string
      }>

      if (projects.length === 0) {
        return { content: [{ type: "text", text: "No projects found. Create one in the Mission Control UI." }] }
      }

      const lines = projects.map(p => [
        `### ${p.name} \`${p.id}\``,
        p.description ?? "_no description_",
        [
          p.github_owner && p.github_repo ? `GitHub: ${p.github_owner}/${p.github_repo}` : "",
          p.jira_project ? `Jira: ${p.jira_project}` : "",
          p.slack_channel ? `Slack: ${p.slack_channel}` : "",
        ].filter(Boolean).join("  |  "),
      ].filter(Boolean).join("\n"))

      return {
        content: [{
          type: "text",
          text: `# Projects (${projects.length})\n\n` + lines.join("\n\n"),
        }]
      }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_get_project_context ─────────────────────────────────────────────

server.tool(
  "mc_get_project_context",
  "Get full context for a project: knowledge base, active missions, and open todos. Use this to give an AI full context before working on a task.",
  {
    projectId: z.string().describe("Project ID (use mc_list_projects to find it)"),
    includeKnowledge: z.boolean().optional().describe("Include knowledge base entries. Defaults to true."),
    includeMissions: z.boolean().optional().describe("Include recent missions. Defaults to true."),
    includeTodos: z.boolean().optional().describe("Include open todos. Defaults to true."),
  },
  async ({ projectId, includeKnowledge = true, includeMissions = true, includeTodos = true }) => {
    const db = getDb()
    try {
      const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as Record<string, unknown> | undefined
      if (!project) {
        return { content: [{ type: "text", text: `Project \`${projectId}\` not found. Use mc_list_projects to see available projects.` }] }
      }

      const sections: string[] = [
        `# Project Context: ${project.name}`,
        project.description ? `\n${project.description}` : "",
      ]

      if (includeKnowledge) {
        const kb = db.prepare(
          `SELECT title, content, type, confidence, tags FROM knowledge_entries
           WHERE project_id = ? ORDER BY type, title`
        ).all(projectId) as Array<{ title: string; content: string; type: string; confidence: string; tags: string | null }>

        sections.push(`\n## Knowledge Base (${kb.length} entries)`)
        if (kb.length === 0) {
          sections.push("_No knowledge entries yet._")
        } else {
          let currentType = ""
          for (const k of kb) {
            if (k.type !== currentType) {
              sections.push(`\n### ${k.type.toUpperCase()}`)
              currentType = k.type
            }
            const tags = parseJson<string[]>(k.tags, [])
            sections.push(
              `**${k.title}** [${k.confidence}]${tags.length > 0 ? ` — tags: ${tags.join(", ")}` : ""}\n${k.content}`
            )
          }
        }
      }

      if (includeMissions) {
        const missions = db.prepare(
          `SELECT name, status, goal, progress_percent, updated_at FROM missions
           WHERE project_id = ? ORDER BY updated_at DESC LIMIT 10`
        ).all(projectId) as Array<{ name: string; status: string; goal: string; progress_percent: number; updated_at: string }>

        sections.push(`\n## Missions (${missions.length})`)
        if (missions.length === 0) {
          sections.push("_No missions yet._")
        } else {
          missions.forEach(m => {
            sections.push(`- [${m.status}] **${m.name}** (${m.progress_percent}%) — ${m.goal}`)
          })
        }
      }

      if (includeTodos) {
        const todos = db.prepare(
          `SELECT content, status, priority, ticket_tag FROM todos
           WHERE status IN ('pending','in_progress')
           ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 20`
        ).all() as Array<{ content: string; status: string; priority: string; ticket_tag: string | null }>

        sections.push(`\n## Open Todos (${todos.length})`)
        if (todos.length === 0) {
          sections.push("_No open todos._")
        } else {
          todos.forEach(t => {
            sections.push(`- [${t.priority}] ${t.content}${t.ticket_tag ? ` \`${t.ticket_tag}\`` : ""}`)
          })
        }
      }

      return { content: [{ type: "text", text: sections.join("\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_create_mission ──────────────────────────────────────────────────

server.tool(
  "mc_create_mission",
  "Create a new mission in Mission Control. Finds project and crew by name, builds the task graph, and saves to DB. Optionally scope to a workspace.",
  {
    goal: z.string().describe("What the mission should accomplish"),
    project: z.string().optional().describe("Project name (partial match OK). Required unless workspace is set."),
    crew: z.string().describe("Crew/team name (partial match OK)"),
    workspace: z.string().optional().describe("Workspace name (partial match OK). Uses all projects in workspace."),
    name: z.string().optional().describe("Mission name. Defaults to first 60 chars of goal."),
    behavior: z.enum(["assume_and_document", "ask_me", "async"]).optional()
      .describe("How agents handle uncertainty. Defaults to assume_and_document."),
    ticketId: z.string().optional().describe("Jira/GitHub ticket ID e.g. PROJ-123"),
  },
  async ({ goal, project, crew, workspace, name, behavior = "assume_and_document", ticketId }) => {
    if (!fs.existsSync(DB_PATH)) {
      return { content: [{ type: "text", text: `Database not found at ${DB_PATH}` }] }
    }
    const db = new Database(DB_PATH)
    try {
      let projectRow: { id: string; name: string } | undefined
      let workspaceRow: { id: string; name: string } | undefined
      let projectIds: string[] = []

      if (workspace) {
        workspaceRow = db.prepare(`SELECT id, name FROM workspaces WHERE name LIKE ? LIMIT 1`).get(`%${workspace}%`) as { id: string; name: string } | undefined
        if (!workspaceRow) {
          const all = db.prepare(`SELECT id, name FROM workspaces`).all() as Array<{ id: string; name: string }>
          return {
            content: [{
              type: "text",
              text: `No workspace matching "${workspace}" found.\n\nAvailable:\n` + all.map(w => `- \`${w.id}\` ${w.name}`).join("\n"),
            }]
          }
        }
        const wsProjects = db.prepare(`SELECT id, name FROM projects WHERE workspace_id = ?`).all(workspaceRow.id) as Array<{ id: string; name: string }>
        projectIds = wsProjects.map(p => p.id)
        if (project) {
          projectRow = wsProjects.find(p => p.name.toLowerCase().includes(project.toLowerCase()))
        }
        projectRow = projectRow ?? wsProjects[0]
        if (!projectRow && projectIds.length === 0) {
          return { content: [{ type: "text", text: `Workspace "${workspaceRow.name}" has no projects. Add projects first.` }] }
        }
      } else if (project) {
        projectRow = db.prepare(`SELECT id, name FROM projects WHERE name LIKE ? LIMIT 1`).get(`%${project}%`) as { id: string; name: string } | undefined
        if (!projectRow) {
          const all = db.prepare(`SELECT id, name FROM projects`).all() as Array<{ id: string; name: string }>
          return {
            content: [{
              type: "text",
              text: `No project matching "${project}" found.\n\nAvailable:\n` + all.map(p => `- \`${p.id}\` ${p.name}`).join("\n"),
            }]
          }
        }
        projectIds = [projectRow.id]
      } else {
        return { content: [{ type: "text", text: "Provide either `project` or `workspace`." }] }
      }

      // Find crew
      const crewRow = db.prepare(`SELECT id, name, members, leader_id FROM teams WHERE name LIKE ? LIMIT 1`).get(`%${crew}%`) as {
        id: string; name: string; members: string | null; leader_id: string | null
      } | undefined
      if (!crewRow) {
        const all = db.prepare(`SELECT id, name FROM teams`).all() as Array<{ id: string; name: string }>
        return {
          content: [{
            type: "text",
            text: `No crew matching "${crew}" found.\n\nAvailable:\n` + all.map(c => `- \`${c.id}\` ${c.name}`).join("\n"),
          }]
        }
      }

      const members = parseJson<Array<{ roleId: string; order: number }>>(crewRow.members, [])
        .sort((a, b) => a.order - b.order)

      // Build task graph — look up role names
      const taskGraph = members.map((m, i) => {
        const roleRow = db.prepare(`SELECT id, name, display_name FROM roles WHERE id = ?`).get(m.roleId) as { id: string; name: string; display_name: string } | undefined
        return {
          id: `task_${i + 1}`,
          roleId: m.roleId,
          roleName: roleRow?.display_name ?? roleRow?.name ?? m.roleId,
          status: "pending" as const,
          dependsOn: i === 0 ? [] : [`task_${i}`],
        }
      })

      if (taskGraph.length === 0) {
        return { content: [{ type: "text", text: `Crew "${crewRow.name}" has no members. Add roles to it first.` }] }
      }

      const missionId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const missionName = name ?? goal.slice(0, 60)

      db.prepare(`
        INSERT INTO missions (id, name, goal, project_id, workspace_id, project_ids, team_id, ticket_id, agent_behavior, status, task_graph, progress_percent, tokens_input, tokens_output, tokens_total, estimated_cost_usd, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        missionId, missionName, goal,
        projectRow?.id ?? null,
        workspaceRow?.id ?? null,
        JSON.stringify(projectIds),
        crewRow.id, ticketId ?? null, behavior,
        JSON.stringify(taskGraph),
      )

      const lines = [
        `✅ Mission created!`,
        ``,
        `**${missionName}** \`${missionId}\``,
        `**Project:** ${projectRow?.name ?? "—"}  |  **Crew:** ${crewRow.name}  |  **Behavior:** ${behavior}`,
        workspaceRow ? `**Workspace:** ${workspaceRow.name} (${projectIds.length} project${projectIds.length !== 1 ? "s" : ""})` : "",
        ticketId ? `**Ticket:** ${ticketId}` : "",
        ``,
        `**Task graph (${taskGraph.length} roles):**`,
        ...taskGraph.map((t, i) => `${i + 1}. ${t.roleName}`),
        ``,
        `To run: use mc_run_mission with id: \`${missionId}\``,
        `To watch: http://localhost:3000/missions/${missionId}`,
      ].filter(l => l !== null)

      return { content: [{ type: "text", text: lines.join("\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_list_crews ──────────────────────────────────────────────────────

server.tool(
  "mc_list_crews",
  "List all crews with their roles in execution order.",
  {},
  async () => {
    const db = getDb()
    try {
      const crews = db.prepare(`SELECT id, name, description, members FROM teams ORDER BY name`).all() as Array<{
        id: string; name: string; description: string | null; members: string | null
      }>
      const roles = db.prepare(`SELECT id, name, display_name FROM roles`).all() as Array<{
        id: string; name: string; display_name: string
      }>
      const roleMap = Object.fromEntries(roles.map(r => [r.id, r.display_name ?? r.name]))

      if (crews.length === 0) {
        return { content: [{ type: "text", text: "No crews yet. Create one in the web UI." }] }
      }

      const lines = crews.map(c => {
        const members = parseJson<Array<{ roleId: string; order: number }>>(c.members, [])
          .sort((a, b) => a.order - b.order)
        return [
          `### ${c.name} \`${c.id}\``,
          c.description ?? "",
          members.length === 0
            ? "_No roles_"
            : members.map((m, i) => `${i + 1}. ${roleMap[m.roleId] ?? m.roleId}`).join("\n"),
        ].filter(Boolean).join("\n")
      })

      return { content: [{ type: "text", text: `# Crews (${crews.length})\n\n` + lines.join("\n\n---\n\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_get_next_role ───────────────────────────────────────────────────

server.tool(
  "mc_get_next_role",
  "Get the next pending role package for Cursor execution: system prompt, user prompt, task id. Use with mc_role_start and mc_complete_role.",
  {
    missionId: z.string().describe("Mission ID"),
    appUrl: z.string().optional().describe("Mission Control URL. Defaults to http://localhost:3000"),
  },
  async ({ missionId, appUrl = "http://localhost:3000" }) => {
    try {
      const res = await fetch(`${appUrl}/api/missions/${missionId}/cursor/next-role`)
      const result = await res.json() as Record<string, unknown>
      if (!res.ok) return { content: [{ type: "text", text: `Error: ${result.error ?? res.statusText}` }] }
      if (result.status === "mission_done") {
        return { content: [{ type: "text", text: "🎉 Mission complete — all roles done." }] }
      }
      const lines = [
        `# Next role: **${result.roleName}**`,
        `**Mission:** \`${missionId}\`  |  **Task:** \`${result.taskId}\`  |  **Progress:** ${result.progress}%`,
        ``,
        `## System prompt`,
        String(result.systemPrompt),
        ``,
        `## User prompt`,
        String(result.userPrompt),
        ``,
        `Workflow: mc_role_start → execute in Cursor → mc_complete_role with full output.`,
      ]
      return { content: [{ type: "text", text: lines.join("\n") }] }
    } catch (err) {
      return { content: [{ type: "text", text: `Could not reach Mission Control at ${appUrl}. Error: ${err}` }] }
    }
  }
)

// ─── Tool: mc_role_start ──────────────────────────────────────────────────────

server.tool(
  "mc_role_start",
  "Mark the next (or specified) role as running in Mission Control. Call before executing the role in Cursor.",
  {
    missionId: z.string().describe("Mission ID"),
    taskId: z.string().optional().describe("Task ID from mc_get_next_role. Omit to start next pending role."),
    appUrl: z.string().optional().describe("Mission Control URL. Defaults to http://localhost:3000"),
  },
  async ({ missionId, taskId, appUrl = "http://localhost:3000" }) => {
    try {
      const res = await fetch(`${appUrl}/api/missions/${missionId}/cursor/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      })
      const result = await res.json() as Record<string, unknown>
      if (!res.ok) return { content: [{ type: "text", text: `Error: ${result.error ?? res.statusText}` }] }
      return {
        content: [{
          type: "text",
          text: `▶ **${result.roleName}** is now running (${result.progress}% complete).\nExecute this role in Cursor, then call mc_complete_role.`,
        }],
      }
    } catch (err) {
      return { content: [{ type: "text", text: `Could not reach Mission Control. Error: ${err}` }] }
    }
  }
)

// ─── Tool: mc_role_checkpoint ─────────────────────────────────────────────────

server.tool(
  "mc_role_checkpoint",
  "Post a short status update to Mission Control activity feed (optional, for live progress in the web UI).",
  {
    missionId: z.string().describe("Mission ID"),
    message: z.string().describe("Short status message, e.g. 'Architect: drafting API schema'"),
    roleName: z.string().optional(),
    appUrl: z.string().optional().describe("Defaults to http://localhost:3000"),
  },
  async ({ missionId, message, roleName, appUrl = "http://localhost:3000" }) => {
    try {
      const res = await fetch(`${appUrl}/api/missions/${missionId}/cursor/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, roleName }),
      })
      const result = await res.json() as Record<string, unknown>
      if (!res.ok) return { content: [{ type: "text", text: `Error: ${result.error ?? res.statusText}` }] }
      return { content: [{ type: "text", text: `✓ Checkpoint saved.` }] }
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err}` }] }
    }
  }
)

// ─── Tool: mc_complete_role ───────────────────────────────────────────────────

server.tool(
  "mc_complete_role",
  "Save role output as an artifact and mark the role done. Call after executing the role in Cursor.",
  {
    missionId: z.string().describe("Mission ID"),
    content: z.string().describe("Full role output / artifact content"),
    taskId: z.string().optional().describe("Task ID from mc_get_next_role"),
    saveAssumptionsToKb: z.boolean().optional().describe("Extract ASSUMPTION: lines to knowledge base. Default true."),
    appUrl: z.string().optional().describe("Defaults to http://localhost:3000"),
  },
  async ({ missionId, content, taskId, saveAssumptionsToKb, appUrl = "http://localhost:3000" }) => {
    try {
      const res = await fetch(`${appUrl}/api/missions/${missionId}/cursor/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, taskId, saveAssumptionsToKb }),
      })
      const result = await res.json() as Record<string, unknown>
      if (!res.ok) return { content: [{ type: "text", text: `Error: ${result.error ?? res.statusText}` }] }
      const lines = [
        result.status === "mission_done"
          ? `🎉 Mission complete!`
          : `✅ **${result.roleName}** done (${result.progress}%)`,
        result.nextRole ? `**Next role:** ${result.nextRole} — call mc_get_next_role to continue` : "",
        `Artifact: \`${result.artifactId}\``,
        `View: ${appUrl}/missions/${missionId}`,
      ].filter(Boolean)
      return { content: [{ type: "text", text: lines.join("\n") }] }
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err}` }] }
    }
  }
)

// ─── Tool: mc_list_crews ──────────────────────────────────────────────────────

server.tool(
  "mc_list_crews",
  "List all crews with their roles in execution order.",
  {},
  async () => {
    const db = getDb()
    try {
      const crews = db.prepare(`SELECT id, name, description, members FROM teams ORDER BY name`).all() as Array<{
        id: string; name: string; description: string | null; members: string | null
      }>
      const roles = db.prepare(`SELECT id, name, display_name FROM roles`).all() as Array<{ id: string; name: string; display_name: string }>
      const roleMap = Object.fromEntries(roles.map(r => [r.id, r.display_name ?? r.name]))

      if (crews.length === 0) {
        return { content: [{ type: "text", text: "No crews yet. Create one in the Mission Control web UI." }] }
      }

      const lines = crews.map(c => {
        const members = parseJson<Array<{ roleId: string; order: number }>>(c.members, [])
          .sort((a, b) => a.order - b.order)
        return [
          `### ${c.name} \`${c.id}\``,
          c.description ?? "",
          members.length === 0 ? "_no roles_" : members.map((m, i) => `${i + 1}. ${roleMap[m.roleId] ?? m.roleId}`).join("\n"),
        ].filter(Boolean).join("\n")
      })

      return { content: [{ type: "text", text: `# Crews (${crews.length})\n\n` + lines.join("\n\n---\n\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_get_next_role ───────────────────────────────────────────────────

server.tool(
  "mc_get_next_role",
  "Get the next pending role for a mission with full system + user prompts. Use in Cursor mode instead of mc_run_mission.",
  {
    id: z.string().describe("Mission ID"),
    appUrl: z.string().optional().describe("Mission Control URL. Defaults to http://localhost:3000"),
  },
  async ({ id, appUrl = "http://localhost:3000" }) => {
    try {
      const result = await mcFetch(appUrl, `/api/missions/${id}/cursor/next-role`)
      if (result.status === "mission_done") {
        return { content: [{ type: "text", text: "🎉 Mission complete — all roles done." }] }
      }
      const lines = [
        `# Next role: **${result.roleName}**`,
        `Mission: \`${id}\`  |  Task: \`${result.taskId}\`  |  Progress: ${result.progress}%`,
        "",
        "## System prompt",
        "```",
        result.systemPrompt,
        "```",
        "",
        "## User prompt",
        "```",
        result.userPrompt,
        "```",
        "",
        "When done: `mc_complete_role` with mission id and full output.",
        "Optional: `mc_role_start` before you begin, `mc_role_checkpoint` for status updates.",
      ]
      return { content: [{ type: "text", text: lines.join("\n") }] }
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err}` }] }
    }
  }
)

server.tool(
  "mc_role_start",
  "Mark a mission role as running (Cursor mode). Updates the Mission Control UI.",
  {
    id: z.string().describe("Mission ID"),
    taskId: z.string().optional().describe("Task ID from mc_get_next_role"),
    appUrl: z.string().optional(),
  },
  async ({ id, taskId, appUrl = "http://localhost:3000" }) => {
    try {
      const result = await mcFetch(appUrl, `/api/missions/${id}/cursor/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      })
      return { content: [{ type: "text", text: `▶ **${result.roleName}** is now running (${result.progress}%)` }] }
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err}` }] }
    }
  }
)

server.tool(
  "mc_role_checkpoint",
  "Post a short status update for the current role (Cursor mode). Shows in Mission Control activity feed.",
  {
    id: z.string().describe("Mission ID"),
    message: z.string().describe("Short status e.g. 'Drafting API plan…'"),
    roleName: z.string().optional(),
    appUrl: z.string().optional(),
  },
  async ({ id, message, roleName, appUrl = "http://localhost:3000" }) => {
    try {
      await mcFetch(appUrl, `/api/missions/${id}/cursor/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, roleName }),
      })
      return { content: [{ type: "text", text: `✓ Checkpoint saved` }] }
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err}` }] }
    }
  }
)

server.tool(
  "mc_complete_role",
  "Save role output and mark task done (Cursor mode). Replaces mc_run_mission for Cursor execution.",
  {
    id: z.string().describe("Mission ID"),
    content: z.string().describe("Full role output / artifact content"),
    taskId: z.string().optional(),
    appUrl: z.string().optional(),
  },
  async ({ id, content, taskId, appUrl = "http://localhost:3000" }) => {
    try {
      const result = await mcFetch(appUrl, `/api/missions/${id}/cursor/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, taskId }),
      })
      const lines = [
        result.status === "mission_done"
          ? `🎉 Mission complete!`
          : `✅ **${result.roleName}** done (${result.progress}%)`,
        result.nextRole ? `Next role: **${result.nextRole}** — call mc_get_next_role to continue` : "",
        `Artifact: \`${result.artifactId}\``,
      ].filter(Boolean)
      return { content: [{ type: "text", text: lines.join("\n") }] }
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err}` }] }
    }
  }
)

// ─── Tool: mc_run_mission ─────────────────────────────────────────────────────

server.tool(
  "mc_run_mission",
  "Trigger the next role in a mission. Calls the Mission Control API to run the next pending agent. The web app must be running (npm run dev). Returns a summary when the role finishes.",
  {
    id: z.string().describe("Mission ID"),
    appUrl: z.string().optional().describe("Mission Control URL. Defaults to http://localhost:3000"),
  },
  async ({ id, appUrl = "http://localhost:3000" }) => {
    if (!fs.existsSync(resolveDbPath())) {
      return { content: [{ type: "text", text: `Database not found.` }] }
    }
    const db = new Database(resolveDbPath(), { readonly: true })
    try {
      if (readExecutionMode(db) === "cursor") {
        return {
          content: [{
            type: "text",
            text: `mc_run_mission is disabled in Cursor mode.\n\nUse:\n1. mc_get_next_role with mission id \`${id}\`\n2. Execute the role in Cursor\n3. mc_complete_role with the output\n\nOr switch to Built-in AI in Settings.`,
          }],
        }
      }
    } finally {
      db.close()
    }

    // Check mission exists
    const db2 = new Database(resolveDbPath(), { readonly: true })
    let missionName = id
    try {
      const m = db2.prepare(`SELECT name, status FROM missions WHERE id = ?`).get(id) as { name: string; status: string } | undefined
      if (!m) return { content: [{ type: "text", text: `Mission \`${id}\` not found.` }] }
      if (m.status === "done") return { content: [{ type: "text", text: `Mission "${m.name}" is already done.` }] }
      missionName = m.name
    } finally {
      db2.close()
    }

    // Call the non-SSE trigger endpoint
    let result: Record<string, unknown>
    try {
      const res = await fetch(`${appUrl}/api/missions/${id}/trigger`, { method: "POST" })
      result = await res.json() as Record<string, unknown>
      if (!res.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error ?? res.statusText}` }] }
      }
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Could not reach Mission Control at ${appUrl}.\nMake sure the app is running: cd mission-control/app && npm run dev\n\nError: ${err}`,
        }]
      }
    }

    const lines = [
      result.status === "mission_done"
        ? `🎉 Mission complete: **${missionName}**`
        : `✅ Role done: **${result.roleName}**`,
      ``,
      result.artifactPreview ? `**Output preview:**\n${result.artifactPreview}\n…` : "",
      result.progress != null ? `**Progress:** ${result.progress}%` : "",
      result.nextRole ? `**Next role:** ${result.nextRole} — run mc_run_mission again to continue` : "",
      result.tokensUsed ? `**Tokens used:** ${(result.tokensUsed as number).toLocaleString()}` : "",
      (result.questions as string[])?.length > 0
        ? `\n⚠ **Agent has questions:**\n${(result.questions as string[]).map((q: string) => `- ${q}`).join("\n")}\nAnswer via web UI or mc_answer_question (built-in mode).`
        : "",
      ``,
      `View full output: ${appUrl}/missions/${id}`,
    ].filter(Boolean)

    return { content: [{ type: "text", text: lines.join("\n") }] }
  }
)

// ─── Tool: mc_get_questions ───────────────────────────────────────────────────

server.tool(
  "mc_get_questions",
  "Get unanswered questions from agents on a mission. Use mc_answer_question to respond.",
  {
    missionId: z.string().optional().describe("Filter by mission ID. Omit to see all unanswered questions across all missions."),
  },
  async ({ missionId }) => {
    const db = getDb()
    try {
      let sql = `
        SELECT q.id, q.question, q.role_name, q.is_assumption, q.created_at,
               m.name as mission_name, m.id as mission_id
        FROM mission_questions q JOIN missions m ON q.mission_id = m.id
        WHERE q.answer IS NULL
      `
      const params: string[] = []
      if (missionId) { sql += " AND q.mission_id = ?"; params.push(missionId) }
      sql += " ORDER BY q.created_at DESC"

      const rows = db.prepare(sql).all(...params) as Array<{
        id: string; question: string; role_name: string; is_assumption: number
        created_at: string; mission_name: string; mission_id: string
      }>

      if (rows.length === 0) {
        return { content: [{ type: "text", text: "No unanswered questions. All agents are unblocked." }] }
      }

      const lines = [
        `# Unanswered Questions (${rows.length})`,
        "",
        ...rows.map(q => [
          `**Q:** ${q.question}`,
          `_From: ${q.role_name} on "${q.mission_name}"_  |  id: \`${q.id}\``,
          `To answer: use mc_answer_question with id: "${q.id}"`,
        ].join("\n")),
      ]

      return { content: [{ type: "text", text: lines.join("\n\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_answer_question ─────────────────────────────────────────────────

server.tool(
  "mc_answer_question",
  "Answer a question from an agent. The answer is saved to the DB and used as context when the next role runs.",
  {
    id: z.string().describe("Question ID (from mc_get_questions)"),
    answer: z.string().describe("Your answer to the agent's question"),
    appUrl: z.string().optional().describe("Mission Control URL. Defaults to http://localhost:3000"),
  },
  async ({ id, answer, appUrl = "http://localhost:3000" }) => {
    try {
      const res = await fetch(`${appUrl}/api/questions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      })
      const result = await res.json() as Record<string, unknown>
      if (!res.ok) return { content: [{ type: "text", text: `Error: ${result.error ?? res.statusText}` }] }

      return {
        content: [{
          type: "text",
          text: `✅ Answer saved.\n\n**Q:** ${result.question}\n**A:** ${answer}\n\nThe next role will use this answer as context.`,
        }]
      }
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Could not reach Mission Control at ${appUrl}.\nMake sure the app is running.\n\nError: ${err}`,
        }]
      }
    }
  }
)

// ─── Tool: mc_open ────────────────────────────────────────────────────────────

server.tool(
  "mc_open",
  "Open or register the current repo as a Mission Control project. Detects git remote automatically. Creates the project if it doesn't exist, optionally assigns it to a workspace.",
  {
    repoPath: z.string().optional().describe("Path to the repo. Defaults to current directory."),
    workspaceName: z.string().optional().describe("Workspace to assign this project to (creates if missing)."),
    appUrl: z.string().optional().describe("Mission Control URL. Defaults to http://localhost:3000"),
  },
  async ({ repoPath = process.cwd(), workspaceName, appUrl = "http://localhost:3000" }) => {
    const { execSync } = await import("child_process")

    let remoteUrl = ""
    let owner = ""
    let repo = ""

    try {
      remoteUrl = execSync("git remote get-url origin", { cwd: repoPath, encoding: "utf8" }).trim()
      const match = remoteUrl.match(/[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/)
      if (match) { owner = match[1]; repo = match[2] }
    } catch {
      return {
        content: [{
          type: "text",
          text: `Could not detect git remote in ${repoPath}.\nMake sure you're in a git repo with an origin remote set.`,
        }]
      }
    }

    if (!fs.existsSync(DB_PATH)) {
      return { content: [{ type: "text", text: `Database not found at ${DB_PATH}. Run the Mission Control app first.` }] }
    }
    const db = new Database(DB_PATH)

    try {
      // Check if project exists
      let project = db.prepare(
        `SELECT * FROM projects WHERE github_owner = ? AND github_repo = ? LIMIT 1`
      ).get(owner, repo) as Record<string, unknown> | undefined

      if (!project) {
        // Create via web app API
        const res = await fetch(`${appUrl}/api/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: repo, description: `${owner}/${repo}`, githubOwner: owner, githubRepo: repo }),
        })
        if (!res.ok) {
          return { content: [{ type: "text", text: `Failed to create project: ${await res.text()}` }] }
        }
        project = await res.json() as Record<string, unknown>
      }

      // Handle workspace assignment
      let workspaceMsg = ""
      if (workspaceName) {
        let ws = db.prepare(`SELECT * FROM workspaces WHERE name LIKE ? LIMIT 1`).get(`%${workspaceName}%`) as Record<string, unknown> | undefined
        if (!ws) {
          const wsRes = await fetch(`${appUrl}/api/workspaces`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: workspaceName, projectIds: [project.id] }),
          })
          ws = await wsRes.json() as Record<string, unknown>
          workspaceMsg = `\nCreated workspace: **${workspaceName}**`
        } else {
          await fetch(`${appUrl}/api/workspaces/${ws.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addProjectIds: [project.id] }),
          })
          workspaceMsg = `\nAssigned to workspace: **${ws.name}**`
        }
      }

      // Get KB summary
      const kbCount = (db.prepare(`SELECT COUNT(*) as c FROM knowledge_entries WHERE project_id = ?`).get(project.id) as { c: number }).c
      const missionCount = (db.prepare(`SELECT COUNT(*) as c FROM missions WHERE project_id = ?`).get(project.id) as { c: number }).c

      const lines = [
        `✅ Project ready: **${repo}**`,
        `**ID:** \`${project.id}\`  |  **Repo:** ${owner}/${repo}`,
        workspaceMsg,
        ``,
        `**Knowledge entries:** ${kbCount}`,
        `**Missions:** ${missionCount}`,
        ``,
        `Web UI: ${appUrl}/projects/${project.id}`,
        ``,
        `You can now:`,
        `- "create mission: <goal>, project ${repo}"`,
        `- "search knowledge for <topic>"`,
        `- "add todo: <task>"`,
      ]

      return { content: [{ type: "text", text: lines.filter(Boolean).join("\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_list_workspaces ─────────────────────────────────────────────────

server.tool(
  "mc_list_workspaces",
  "List all workspaces with their projects.",
  {},
  async () => {
    const db = getDb()
    try {
      const wsList = db.prepare(`SELECT * FROM workspaces ORDER BY name`).all() as Array<Record<string, unknown>>
      const projects = db.prepare(`SELECT id, name, github_owner, github_repo, workspace_id, color FROM projects`).all() as Array<Record<string, unknown>>

      if (wsList.length === 0) {
        return { content: [{ type: "text", text: "No workspaces yet. Use mc_open with a workspaceName to create one." }] }
      }

      const lines = wsList.map(ws => {
        const wsProjects = projects.filter(p => p.workspace_id === ws.id)
        return [
          `### ${ws.name} \`${ws.id}\``,
          ws.description ? String(ws.description) : "",
          `**Projects (${wsProjects.length}):**`,
          wsProjects.length === 0
            ? "_none_"
            : wsProjects.map(p => `- ${p.name}${p.github_owner ? ` (${p.github_owner}/${p.github_repo})` : ""}`).join("\n"),
        ].filter(Boolean).join("\n")
      })

      const unassigned = projects.filter(p => !p.workspace_id)
      if (unassigned.length > 0) {
        lines.push(`\n### Unassigned projects (${unassigned.length})\n${unassigned.map(p => `- ${p.name}`).join("\n")}`)
      }

      return { content: [{ type: "text", text: `# Workspaces (${wsList.length})\n\n` + lines.join("\n\n---\n\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_create_workspace ────────────────────────────────────────────────

server.tool(
  "mc_create_workspace",
  "Create a new workspace and optionally assign existing projects to it.",
  {
    name: z.string().describe("Workspace name"),
    description: z.string().optional().describe("Short description"),
    projectNames: z.array(z.string()).optional().describe("Project names to add (partial match)"),
    appUrl: z.string().optional().describe("Mission Control URL. Defaults to http://localhost:3000"),
  },
  async ({ name, description, projectNames = [], appUrl = "http://localhost:3000" }) => {
    const db = new Database(DB_PATH)
    try {
      const projectIds: string[] = []
      for (const pname of projectNames) {
        const p = db.prepare(`SELECT id, name FROM projects WHERE name LIKE ? LIMIT 1`).get(`%${pname}%`) as { id: string; name: string } | undefined
        if (p) projectIds.push(p.id)
      }

      const res = await fetch(`${appUrl}/api/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, projectIds }),
      })
      const ws = await res.json() as Record<string, unknown>
      if (!res.ok) return { content: [{ type: "text", text: `Error: ${ws.error}` }] }

      return {
        content: [{
          type: "text",
          text: [
            `✅ Workspace created: **${name}** \`${ws.id}\``,
            description ? description : "",
            projectIds.length > 0 ? `\nProjects added: ${projectNames.join(", ")}` : "\nNo projects assigned yet — use mc_open to add repos.",
          ].filter(Boolean).join("\n"),
        }]
      }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_export ─────────────────────────────────────────────────────────

server.tool(
  "mc_export",
  "Export Mission Control data as clean markdown — ready to paste into Claude.ai, ChatGPT, or any AI chat. Exports knowledge base, missions, and todos for a project (or everything).",
  {
    projectId: z.string().optional().describe("Project ID to export. Omit to export all projects."),
    sections: z.array(z.enum(["knowledge", "missions", "todos", "roles"])).optional()
      .describe("Sections to include. Defaults to knowledge + missions + todos."),
  },
  async ({ projectId, sections = ["knowledge", "missions", "todos"] }) => {
    const db = getDb()
    try {
      const projects = projectId
        ? db.prepare(`SELECT * FROM projects WHERE id = ?`).all(projectId) as Array<Record<string, unknown>>
        : db.prepare(`SELECT * FROM projects ORDER BY name`).all() as Array<Record<string, unknown>>

      if (projects.length === 0) {
        return { content: [{ type: "text", text: "No projects found." }] }
      }

      const output: string[] = [
        `# Mission Control Export`,
        `Generated: ${new Date().toISOString()}`,
        `Projects: ${projects.map(p => p.name).join(", ")}`,
        "",
      ]

      for (const project of projects) {
        output.push(`\n---\n\n# Project: ${project.name}`)
        if (project.description) output.push(`${project.description}`)

        if (sections.includes("knowledge")) {
          const kb = db.prepare(
            `SELECT title, content, type, confidence, tags FROM knowledge_entries WHERE project_id = ? ORDER BY type, title`
          ).all(project.id as string) as Array<{ title: string; content: string; type: string; confidence: string; tags: string | null }>

          output.push(`\n## Knowledge Base (${kb.length} entries)`)
          if (kb.length === 0) {
            output.push("_empty_")
          } else {
            let lastType = ""
            for (const k of kb) {
              if (k.type !== lastType) { output.push(`\n### ${k.type}`); lastType = k.type }
              const tags = parseJson<string[]>(k.tags, [])
              output.push(`\n**${k.title}** [${k.confidence}]${tags.length ? ` — ${tags.join(", ")}` : ""}`)
              output.push(k.content)
            }
          }
        }

        if (sections.includes("missions")) {
          const missions = db.prepare(
            `SELECT name, status, goal, progress_percent, notes FROM missions WHERE project_id = ? ORDER BY updated_at DESC`
          ).all(project.id as string) as Array<{ name: string; status: string; goal: string; progress_percent: number; notes: string | null }>

          output.push(`\n## Missions (${missions.length})`)
          missions.forEach(m => {
            output.push(`- [${m.status}] **${m.name}** (${m.progress_percent}%) — ${m.goal}`)
            if (m.notes) output.push(`  > ${m.notes}`)
          })
        }
      }

      if (sections.includes("todos")) {
        const todos = db.prepare(
          `SELECT content, status, priority, ticket_tag FROM todos WHERE status != 'done' ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
        ).all() as Array<{ content: string; status: string; priority: string; ticket_tag: string | null }>

        output.push(`\n---\n\n## Open Todos (${todos.length})`)
        todos.forEach(t => {
          output.push(`- [${t.priority}] ${t.content}${t.ticket_tag ? ` \`${t.ticket_tag}\`` : ""}`)
        })
      }

      if (sections.includes("roles")) {
        const roles = db.prepare(`SELECT display_name, description, system_prompt FROM roles ORDER BY display_name`).all() as Array<{ display_name: string; description: string | null; system_prompt: string }>
        output.push(`\n---\n\n## Roles (${roles.length})`)
        roles.forEach(r => {
          output.push(`\n### ${r.display_name}`)
          if (r.description) output.push(r.description)
          output.push("```")
          output.push(r.system_prompt.slice(0, 300) + (r.system_prompt.length > 300 ? "\n..." : ""))
          output.push("```")
        })
      }

      return { content: [{ type: "text", text: output.join("\n") }] }
    } finally {
      db.close()
    }
  }
)

// ─── Tool: mc_import_v1 ───────────────────────────────────────────────────────

server.tool(
  "mc_import_v1",
  "Import data from v1 Mission Control files (~/.mission-control/todos.md, daily-log/*.jsonl, task-history/**/*.md) into the database. Skips duplicates.",
  {
    what: z.array(z.enum(["todos", "daily_logs", "task_history"])).optional()
      .describe("What to import. Defaults to all three."),
    projectId: z.string().optional()
      .describe("Project ID to attach task-history knowledge entries to. Required if importing task_history."),
    dryRun: z.boolean().optional()
      .describe("If true, show what would be imported without writing anything. Defaults to false."),
  },
  async ({ what = ["todos", "daily_logs", "task_history"], projectId, dryRun = false }) => {
    const CC_DIR = path.join(os.homedir(), ".mission-control")
    const report: string[] = [`# v1 Import ${dryRun ? "(dry run)" : ""}`, ""]
    let totalImported = 0

    const db = dryRun ? null : new Database(DB_PATH)

    try {
      // ── todos.md ─────────────────────────────────────────────────────────────
      if (what.includes("todos")) {
        const todosPath = path.join(CC_DIR, "todos.md")
        if (!fs.existsSync(todosPath)) {
          report.push("## Todos\n_todos.md not found, skipped_\n")
        } else {
          const raw = fs.readFileSync(todosPath, "utf8")
          const lines = raw.split("\n")
          let currentStatus = "pending"
          const parsed: Array<{ content: string; status: string; priority: string; ticketTag: string | null }> = []

          for (const line of lines) {
            if (line.startsWith("## In Progress")) currentStatus = "in_progress"
            else if (line.startsWith("## Pending")) currentStatus = "pending"
            else if (line.startsWith("## Done")) currentStatus = "done"
            else if (line.startsWith("### ")) {
              const title = line.slice(4).trim()
              const ticketMatch = title.match(/^([A-Z]+-\d+)[:\s]/)
              parsed.push({
                content: title,
                status: currentStatus,
                priority: currentStatus === "in_progress" ? "high" : "medium",
                ticketTag: ticketMatch ? ticketMatch[1] : null,
              })
            }
          }

          report.push(`## Todos\nFound ${parsed.length} entries in todos.md\n`)
          let imported = 0
          for (const t of parsed) {
            if (!dryRun && db) {
              const existing = db.prepare(`SELECT id FROM todos WHERE content = ?`).get(t.content)
              if (!existing) {
                const id = `todo_v1_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
                db.prepare(
                  `INSERT INTO todos (id, content, status, priority, ticket_tag, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
                ).run(id, t.content, t.status, t.priority, t.ticketTag)
                imported++
              }
            } else {
              report.push(`- [${t.status}] ${t.content}`)
              imported++
            }
          }
          if (!dryRun) report.push(`Imported ${imported} new todos (${parsed.length - imported} already existed)\n`)
          totalImported += imported
        }
      }

      // ── daily-log/*.jsonl ─────────────────────────────────────────────────────
      if (what.includes("daily_logs")) {
        const logDir = path.join(CC_DIR, "daily-log")
        if (!fs.existsSync(logDir)) {
          report.push("## Daily Logs\n_daily-log/ not found, skipped_\n")
        } else {
          const files = fs.readdirSync(logDir).filter(f => f.endsWith(".jsonl")).sort()
          let totalEntries = 0
          let imported = 0

          for (const file of files) {
            const date = file.replace(".jsonl", "")
            const lines = fs.readFileSync(path.join(logDir, file), "utf8")
              .split("\n").filter(Boolean)

            for (const line of lines) {
              try {
                const entry = JSON.parse(line) as { time?: string; workspace?: string; ticket?: string; action: string; detail?: string }
                totalEntries++
                if (!dryRun && db) {
                  const existing = db.prepare(
                    `SELECT id FROM daily_logs WHERE date = ? AND action = ? AND workspace = ?`
                  ).get(date, entry.action, entry.workspace ?? null)
                  if (!existing) {
                    const id = `log_v1_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
                    db.prepare(
                      `INSERT INTO daily_logs (id, date, workspace, action, detail, ticket_id, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
                    ).run(id, date, entry.workspace ?? null, entry.action, entry.detail ?? null, entry.ticket ?? null)
                    imported++
                  }
                } else {
                  imported++
                }
              } catch { /* skip malformed lines */ }
            }
          }

          report.push(`## Daily Logs\nFound ${totalEntries} entries across ${files.length} files`)
          if (!dryRun) report.push(`Imported ${imported} new log entries\n`)
          else report.push(`Would import: ${imported} entries\n`)
          totalImported += imported
        }
      }

      // ── task-history/**/*.md ──────────────────────────────────────────────────
      if (what.includes("task_history")) {
        const histDir = path.join(CC_DIR, "task-history")
        if (!fs.existsSync(histDir)) {
          report.push("## Task History\n_task-history/ not found, skipped_\n")
        } else if (!projectId && !dryRun) {
          report.push("## Task History\n⚠ `projectId` is required to import task history. Use mc_list_projects to find your project ID.\n")
        } else {
          const workspaces = fs.readdirSync(histDir).filter(f => {
            const full = path.join(histDir, f)
            return fs.statSync(full).isDirectory() && f !== "README.md"
          })

          let totalFiles = 0
          let imported = 0

          for (const ws of workspaces) {
            const wsDir = path.join(histDir, ws)
            const files = fs.readdirSync(wsDir).filter(f => f.endsWith(".md"))
            totalFiles += files.length

            for (const file of files) {
              const content = fs.readFileSync(path.join(wsDir, file), "utf8")
              const titleMatch = content.match(/^#\s+(.+)$/m)
              const title = titleMatch ? titleMatch[1] : file.replace(".md", "")
              const ticketMatch = file.match(/^([A-Z]+-\d+)/)
              const ticketTag = ticketMatch ? ticketMatch[1] : null

              if (!dryRun && db && projectId) {
                const existing = db.prepare(
                  `SELECT id FROM knowledge_entries WHERE title = ? AND project_id = ?`
                ).get(title, projectId)
                if (!existing) {
                  const id = `kb_v1_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
                  db.prepare(
                    `INSERT INTO knowledge_entries (id, project_id, type, title, content, confidence, tags, source_file, created_at, updated_at)
                     VALUES (?, ?, 'runbook', ?, ?, 'confirmed', '[]', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
                  ).run(id, projectId, title, content.slice(0, 8000), ticketTag ? `${ws}/${file}` : file)
                  imported++
                }
              } else {
                report.push(`- [${ws}] ${title}${ticketTag ? ` \`${ticketTag}\`` : ""}`)
                imported++
              }
            }
          }

          report.push(`## Task History\nFound ${totalFiles} task files across ${workspaces.length} workspaces`)
          if (!dryRun) report.push(`Imported ${imported} new knowledge entries\n`)
          else report.push(`Would import: ${imported} task files\n`)
          totalImported += imported
        }
      }

      report.push("")
      if (dryRun) {
        report.push(`**Dry run complete** — ${totalImported} items would be imported.`)
        report.push("Run again with dryRun: false to apply.")
      } else {
        report.push(`✅ Import complete — ${totalImported} items imported.`)
      }

      return { content: [{ type: "text", text: report.join("\n") }] }
    } finally {
      db?.close()
    }
  }
)

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Log to stderr so it doesn't pollute the MCP stdio stream
  process.stderr.write("Mission Control MCP server running\n")
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`)
  process.exit(1)
})
