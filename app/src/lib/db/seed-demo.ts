import { count, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

const {
  projects,
  knowledgeEntries,
  missions,
  roles,
  teams,
  settings,
  workspaces,
  todos,
  artifacts,
  missionQuestions,
  missionEvents,
} = schema

export type AppDb = BetterSQLite3Database<typeof schema>

export type BuiltinSeedIds = {
  architect: string
  backend: string
  qa: string
  security: string
  docs: string
  backendCrew: string
  bugHunter: string
}

const BUILTIN_ROLE_NAMES = ["architect", "backend", "qa", "security", "docs"] as const

export async function isDbEmpty(db: AppDb): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(missions)
  return (row?.n ?? 0) === 0
}

async function lookupBuiltinIds(db: AppDb): Promise<BuiltinSeedIds | null> {
  const allRoles = await db.select().from(roles)
  const allTeams = await db.select().from(teams)
  const byName = Object.fromEntries(allRoles.map(r => [r.name, r.id]))
  const backendCrew = allTeams.find(t => t.name === "Backend Crew")
  const bugHunter = allTeams.find(t => t.name === "Bug Hunter")
  if (!byName.architect || !byName.backend || !byName.qa || !byName.security || !byName.docs || !backendCrew || !bugHunter) {
    return null
  }
  return {
    architect: byName.architect,
    backend: byName.backend,
    qa: byName.qa,
    security: byName.security,
    docs: byName.docs,
    backendCrew: backendCrew.id,
    bugHunter: bugHunter.id,
  }
}

/** Built-in roles + default crews — always present on first run, like Command Center. */
export async function ensureBuiltinRolesAndCrews(db: AppDb): Promise<BuiltinSeedIds> {
  const existing = await lookupBuiltinIds(db)
  if (existing) return existing

  const [roleRow] = await db.select({ n: count() }).from(roles)
  let ids: Omit<BuiltinSeedIds, "backendCrew" | "bugHunter">

  if ((roleRow?.n ?? 0) === 0) {
    const r1id = nanoid(), r2id = nanoid(), r3id = nanoid(), r4id = nanoid(), r5id = nanoid()
    await db.insert(roles).values([
      {
        id: r1id, name: "architect", displayName: "Architect", isBuiltIn: true,
        color: "#818cf8", icon: "Layers", model: "claude-sonnet", temperature: 0.7, memoryScope: "project",
        description: "Plans implementation, breaks work into tasks, makes key technical decisions",
        tools: ["read_file", "search_codebase", "read_knowledge"],
        allowedActions: ["read_file", "create_plan", "log_assumption"],
        systemPrompt: `You are the Architect for this mission. Your job is to:
1. Understand the goal fully before writing any code
2. Read the relevant parts of the codebase and AGENTS.md
3. Identify existing patterns and follow them
4. Break the work into clear, ordered tasks for the rest of the team
5. Make technical decisions and document your reasoning as assumptions`,
      },
      {
        id: r2id, name: "backend", displayName: "Backend Engineer", isBuiltIn: true,
        color: "#34d399", icon: "Code", model: "claude-sonnet", temperature: 0.3, memoryScope: "mission",
        description: "Implements backend code following the architect's plan and coding standards",
        tools: ["read_file", "write_file", "run_tests", "git"],
        allowedActions: ["read_file", "write_file", "run_command"],
        systemPrompt: `You are the Backend Engineer for this mission.
1. Read the Architect's plan before writing anything
2. Implement exactly what the plan specifies — no scope creep
3. Follow existing patterns in the codebase`,
      },
      {
        id: r3id, name: "qa", displayName: "QA Engineer", isBuiltIn: true,
        color: "#fb923c", icon: "TestTube", model: "claude-sonnet", temperature: 0.4, memoryScope: "mission",
        description: "Reviews implementation, writes and runs tests, flags issues",
        tools: ["read_file", "run_tests", "create_issue"],
        allowedActions: ["read_file", "run_command"],
        systemPrompt: `You are the QA Engineer for this mission.
1. Review the implemented code against the Architect's plan
2. Write test cases: happy path, edge cases, error cases
3. Report issues with severity (BLOCKER / MINOR)`,
      },
      {
        id: r4id, name: "security", displayName: "Security Analyst", isBuiltIn: true,
        color: "#f87171", icon: "Shield", model: "claude-sonnet", temperature: 0.2, memoryScope: "mission",
        description: "Audits code for security vulnerabilities, checks dependencies, reviews permissions",
        tools: ["read_file", "search_codebase", "create_issue"],
        allowedActions: ["read_file"],
        systemPrompt: `You are the Security Analyst for this mission.
Review all new and modified code for input validation, auth logic, and hardcoded secrets.`,
      },
      {
        id: r5id, name: "docs", displayName: "Documentation", isBuiltIn: true,
        color: "#94a3b8", icon: "FileText", model: "claude-sonnet", temperature: 0.5, memoryScope: "mission",
        description: "Updates docs, READMEs, and AGENTS.md based on implemented changes",
        tools: ["read_file", "write_file"],
        allowedActions: ["read_file", "write_file"],
        systemPrompt: `You are the Documentation writer for this mission.
Update relevant documentation and AGENTS.md when architecture changes.`,
      },
    ])
    ids = { architect: r1id, backend: r2id, qa: r3id, security: r4id, docs: r5id }
  } else {
    const allRoles = await db.select().from(roles)
    const byName = Object.fromEntries(allRoles.map(r => [r.name, r.id]))
    for (const name of BUILTIN_ROLE_NAMES) {
      if (!byName[name]) {
        throw new Error(`Missing built-in role "${name}" — delete ~/.mission-control/mc.db or run Settings → Load sample data on an empty DB`)
      }
    }
    ids = {
      architect: byName.architect,
      backend: byName.backend,
      qa: byName.qa,
      security: byName.security,
      docs: byName.docs,
    }
  }

  const [teamRow] = await db.select({ n: count() }).from(teams)
  let backendCrew: string
  let bugHunter: string

  if ((teamRow?.n ?? 0) === 0) {
    backendCrew = nanoid()
    bugHunter = nanoid()
    await db.insert(teams).values([
      {
        id: backendCrew, name: "Backend Crew", isBuiltIn: false,
        description: "Full backend feature development with security and QA review",
        leaderId: ids.architect,
        members: [
          { roleId: ids.architect, order: 1 },
          { roleId: ids.backend, order: 2 },
          { roleId: ids.qa, order: 3 },
          { roleId: ids.security, order: 4 },
        ],
        workflow: ["plan", "implement", "test", "audit", "review"],
        knowledgeFilters: ["architecture", "patterns", "database"],
        mcps: ["github", "jira"],
      },
      {
        id: bugHunter, name: "Bug Hunter", isBuiltIn: true,
        description: "Rapid bug investigation and fix — no ceremonies, fast loop",
        leaderId: ids.architect,
        members: [
          { roleId: ids.architect, order: 1 },
          { roleId: ids.backend, order: 2 },
          { roleId: ids.qa, order: 3 },
        ],
        workflow: ["investigate", "fix", "verify"],
        knowledgeFilters: ["architecture", "database", "logs"],
        mcps: ["github"],
      },
    ])
  } else {
    const allTeams = await db.select().from(teams)
    const bc = allTeams.find(t => t.name === "Backend Crew")
    const bh = allTeams.find(t => t.name === "Bug Hunter")
    if (!bc || !bh) {
      backendCrew = nanoid()
      bugHunter = nanoid()
      const toInsert = []
      if (!bc) {
        toInsert.push({
          id: backendCrew, name: "Backend Crew", isBuiltIn: false,
          description: "Full backend feature development with security and QA review",
          leaderId: ids.architect,
          members: [
            { roleId: ids.architect, order: 1 },
            { roleId: ids.backend, order: 2 },
            { roleId: ids.qa, order: 3 },
            { roleId: ids.security, order: 4 },
          ],
          workflow: ["plan", "implement", "test", "audit", "review"],
          knowledgeFilters: ["architecture", "patterns", "database"],
          mcps: ["github", "jira"],
        })
      } else {
        backendCrew = bc.id
      }
      if (!bh) {
        toInsert.push({
          id: bugHunter, name: "Bug Hunter", isBuiltIn: true,
          description: "Rapid bug investigation and fix — no ceremonies, fast loop",
          leaderId: ids.architect,
          members: [
            { roleId: ids.architect, order: 1 },
            { roleId: ids.backend, order: 2 },
            { roleId: ids.qa, order: 3 },
          ],
          workflow: ["investigate", "fix", "verify"],
          knowledgeFilters: ["architecture", "database", "logs"],
          mcps: ["github"],
        })
      } else {
        bugHunter = bh.id
      }
      if (toInsert.length > 0) await db.insert(teams).values(toInsert)
    } else {
      backendCrew = bc.id
      bugHunter = bh.id
    }
  }

  return { ...ids, backendCrew, bugHunter }
}

/** Fill todos, artifacts, questions, and events when an older seed omitted them. */
export async function seedDemoExtras(db: AppDb): Promise<boolean> {
  const [todoRow] = await db.select({ n: count() }).from(todos)
  if ((todoRow?.n ?? 0) > 0) return false

  const allMissions = await db.select().from(missions)
  const m1 = allMissions.find(m => m.name === "Add Azure Registry Support")
  const m2 = allMissions.find(m => m.name === "Fix Auth Token Refresh")
  const m3 = allMissions.find(m => m.name === "Unified Auth Middleware Rollout")
  if (!m1 || !m2 || !m3) return false

  const builtin = await ensureBuiltinRolesAndCrews(db)

  await db.insert(todos).values([
    {
      id: nanoid(),
      content: "Review assumed rate-limiting knowledge entry",
      status: "pending",
      priority: "medium",
      missionId: m1.id,
      ticketTag: "AUTH-429",
      workspace: "Core Platform",
    },
    {
      id: nanoid(),
      content: "Record demo video for GitHub README",
      status: "in_progress",
      priority: "low",
      missionId: m3.id,
      workspace: "Core Platform",
    },
  ])

  const [artRow] = await db.select({ n: count() }).from(artifacts)
  if ((artRow?.n ?? 0) === 0) {
    await db.insert(artifacts).values([
      {
        id: nanoid(), missionId: m3.id, roleId: builtin.architect, roleName: "Architect", type: "plan",
        title: "Auth Middleware Rollout Plan",
        content: "## Mission Plan\n\n### Approach\nExtract shared JWT validation into `@org/auth-middleware` package.",
      },
      {
        id: nanoid(), missionId: m2.id, roleId: builtin.backend, roleName: "Backend", type: "code",
        title: "JWT bypass fix",
        content: "Added `/refresh` to auth middleware bypass list in `auth.middleware.ts`.",
      },
    ])
  }

  const [qRow] = await db.select({ n: count() }).from(missionQuestions)
  if ((qRow?.n ?? 0) === 0) {
    await db.insert(missionQuestions).values([
      {
        id: nanoid(), missionId: m1.id, roleName: "Architect",
        question: "Should Azure registry use managed identity or service principal?",
        isAssumption: false,
      },
    ])
  }

  const [evRow] = await db.select({ n: count() }).from(missionEvents)
  if ((evRow?.n ?? 0) === 0) {
    await db.insert(missionEvents).values([
      { id: nanoid(), missionId: m1.id, roleId: builtin.architect, roleName: "Architect", type: "role_start", message: "Starting architect role" },
      { id: nanoid(), missionId: m1.id, roleId: builtin.architect, roleName: "Architect", type: "checkpoint", message: "Reviewed existing GCP/AWS registry patterns" },
      { id: nanoid(), missionId: m3.id, roleId: builtin.architect, roleName: "Architect", type: "role_done", message: "Plan artifact saved" },
    ])
  }

  const platformApi = (await db.select().from(projects).where(eq(projects.name, "Platform API")))[0]
  const authService = (await db.select().from(projects).where(eq(projects.name, "Auth Service")))[0]
  if (platformApi && !platformApi.agentsMdLocal) {
    await db.update(projects).set({
      agentsMdLocal: "# Platform API\n\n## Overview\nCore backend API serving all platform features.",
    }).where(eq(projects.id, platformApi.id))
  }
  if (authService && !authService.agentsMdLocal) {
    await db.update(projects).set({
      agentsMdLocal: "# Auth Service\n\n## Overview\nHandles authentication, JWT issuance, and refresh tokens.",
    }).where(eq(projects.id, authService.id))
  }

  return true
}

/** Backfill mission/project links on sample todos from older seeds. */
export async function ensureSampleTodoLinks(db: AppDb): Promise<void> {
  const rows = await db.select().from(todos)
  if (rows.length === 0) return
  const allMissions = await db.select().from(missions)
  const m1 = allMissions.find(m => m.name === "Add Azure Registry Support")
  const m3 = allMissions.find(m => m.name === "Unified Auth Middleware Rollout")
  for (const t of rows) {
    if (t.content.includes("rate-limiting") && !t.missionId && m1) {
      await db.update(todos).set({
        missionId: m1.id,
        ticketTag: t.ticketTag ?? "AUTH-429",
        workspace: t.workspace ?? "Core Platform",
      }).where(eq(todos.id, t.id))
    }
    if (t.content.includes("demo video") && !t.missionId && m3) {
      await db.update(todos).set({
        missionId: m3.id,
        workspace: t.workspace ?? "Core Platform",
      }).where(eq(todos.id, t.id))
    }
  }
}

export async function seedDemoData(db: AppDb): Promise<{ message: string }> {
  const builtin = await ensureBuiltinRolesAndCrews(db)
  const { architect: r1id, backend: r2id, qa: r3id, security: r4id, backendCrew: t1id } = builtin

  const ws1id = nanoid()
  await db.insert(workspaces).values([{
    id: ws1id, name: "Core Platform",
    description: "Shared backend services — API layer and authentication",
    color: "#6366f1", repoPaths: ["/repos/platform-api", "/repos/auth-service"],
  }])

  const p1id = nanoid(), p2id = nanoid(), p3id = nanoid()
  await db.insert(projects).values([
    {
      id: p1id, name: "Platform API", description: "Core backend platform and API layer", color: "#3b82f6",
      githubRepo: "platform-api", githubOwner: "my-org", jiraProject: "PLAT", jiraUrl: "https://my-org.atlassian.net",
      slackChannel: "platform-api", workspaceId: ws1id, agentsMdStatus: "merged",
      agentsMdLocal: "# Platform API\n\nCore backend API serving all platform features.",
    },
    {
      id: p2id, name: "Auth Service", description: "Authentication and authorization service", color: "#10b981",
      githubRepo: "auth-service", githubOwner: "my-org", jiraProject: "AUTH", jiraUrl: "https://my-org.atlassian.net",
      slackChannel: "auth-service", workspaceId: ws1id, agentsMdStatus: "pr_open",
      agentsMdLocal: "# Auth Service\n\nHandles authentication, JWT issuance, and refresh tokens.",
    },
    {
      id: p3id, name: "Billing", description: "Billing and subscription management", color: "#f59e0b",
      githubRepo: "billing", githubOwner: "my-org", jiraProject: "BILL", agentsMdStatus: "local",
    },
  ])

  const m1id = nanoid(), m2id = nanoid(), m3id = nanoid()
  await db.insert(missions).values([
    {
      id: m1id, name: "Add Azure Registry Support",
      goal: "Implement Azure Container Registry integration, matching the existing GCP and AWS patterns",
      projectId: p1id, teamId: t1id, ticketId: "PLAT-101",
      agentBehavior: "ask_me", status: "pending", progressPercent: 0,
      taskGraph: [
        { id: "t1", roleId: r1id, roleName: "Architect", status: "pending", dependsOn: [] },
        { id: "t2", roleId: r2id, roleName: "Backend", status: "pending", dependsOn: ["t1"] },
        { id: "t3", roleId: r3id, roleName: "QA", status: "pending", dependsOn: ["t2"] },
        { id: "t4", roleId: r4id, roleName: "Security", status: "pending", dependsOn: ["t3"] },
      ],
    },
    {
      id: m2id, name: "Fix Auth Token Refresh",
      goal: "Debug and fix the JWT refresh loop causing intermittent 401s in production",
      projectId: p2id, ticketId: "AUTH-42",
      agentBehavior: "assume_and_document", status: "done", progressPercent: 100,
      tokensTotal: 1842, estimatedCostUsd: 0.024,
      taskGraph: [
        { id: "t1", roleId: r1id, roleName: "Architect", status: "done", dependsOn: [] },
        { id: "t2", roleId: r2id, roleName: "Backend", status: "done", dependsOn: ["t1"] },
        { id: "t3", roleId: r3id, roleName: "QA", status: "done", dependsOn: ["t2"] },
      ],
    },
    {
      id: m3id, name: "Unified Auth Middleware Rollout",
      goal: "Roll out shared auth middleware across Platform API and Auth Service with consistent JWT handling",
      projectId: p1id, workspaceId: ws1id, projectIds: [p1id, p2id],
      teamId: t1id, ticketId: "PLAT-220",
      agentBehavior: "assume_and_document", status: "running", progressPercent: 35,
      tokensTotal: 920, estimatedCostUsd: 0.012,
      taskGraph: [
        { id: "t1", roleId: r1id, roleName: "Architect", status: "done", dependsOn: [] },
        { id: "t2", roleId: r2id, roleName: "Backend", status: "running", dependsOn: ["t1"] },
        { id: "t3", roleId: r3id, roleName: "QA", status: "pending", dependsOn: ["t2"] },
      ],
    },
  ])

  await db.insert(knowledgeEntries).values([
    { id: nanoid(), projectId: p1id, type: "database", title: "Postgres — main DB connection pattern", confidence: "confirmed", tags: ["postgres", "db"], content: "Connection via DB_HOST env var, port 5432, SSL required." },
    { id: nanoid(), projectId: p1id, type: "infrastructure", title: "events-queue — async processing", confidence: "confirmed", tags: ["queue", "events"], content: "Used by the worker service for async job processing.", sourceMissionId: m1id },
    { id: nanoid(), projectId: p2id, type: "architecture", title: "JWT refresh loop root cause", confidence: "confirmed", tags: ["jwt", "auth"], content: "The refresh endpoint was not excluded from the auth middleware, causing an infinite 401 loop on expired tokens.", sourceMissionId: m2id },
    { id: nanoid(), projectId: p2id, type: "architecture", title: "Rate limiting — per-tenant assumption", confidence: "assumed", tags: ["rate-limiting"], content: "Based on observed 429 behavior — appears to be 100 req/min per tenant. Not verified in source code." },
    { id: nanoid(), projectId: p1id, type: "logs", title: "Log groups — service naming convention", confidence: "confirmed", tags: ["logs", "observability"], content: "Pattern: /logs/{service-name}" },
    { id: nanoid(), workspaceId: ws1id, type: "architecture", title: "Shared auth middleware contract", confidence: "confirmed", tags: ["auth", "middleware", "workspace"], content: "All services in Core Platform use the same JWT validation middleware." },
  ])

  await db.insert(todos).values([
    {
      id: nanoid(),
      content: "Review assumed rate-limiting knowledge entry",
      status: "pending",
      priority: "medium",
      missionId: m1id,
      ticketTag: "AUTH-429",
      workspace: "Core Platform",
    },
    {
      id: nanoid(),
      content: "Record demo video for GitHub README",
      status: "in_progress",
      priority: "low",
      missionId: m3id,
      workspace: "Core Platform",
    },
  ])

  await db.insert(artifacts).values([
    { id: nanoid(), missionId: m3id, roleId: r1id, roleName: "Architect", type: "plan", title: "Auth Middleware Rollout Plan", content: "## Mission Plan\n\nExtract shared JWT validation into `@org/auth-middleware` package." },
    { id: nanoid(), missionId: m2id, roleId: r2id, roleName: "Backend", type: "code", title: "JWT bypass fix", content: "Added `/refresh` to auth middleware bypass list in `auth.middleware.ts`." },
  ])

  await db.insert(missionQuestions).values([
    { id: nanoid(), missionId: m1id, roleName: "Architect", question: "Should Azure registry use managed identity or service principal?", isAssumption: false },
  ])

  await db.insert(missionEvents).values([
    { id: nanoid(), missionId: m1id, roleId: r1id, roleName: "Architect", type: "role_start", message: "Starting architect role" },
    { id: nanoid(), missionId: m1id, roleId: r1id, roleName: "Architect", type: "checkpoint", message: "Reviewed existing GCP/AWS registry patterns" },
    { id: nanoid(), missionId: m3id, roleId: r1id, roleName: "Architect", type: "role_done", message: "Plan artifact saved" },
  ])

  const [settingsRow] = await db.select({ n: count() }).from(settings)
  if ((settingsRow?.n ?? 0) === 0) {
    await db.insert(settings).values([
      { key: "executionMode", value: "cursor" },
      { key: "defaultModel", value: "claude-sonnet" },
      { key: "anthropicApiKey", value: "" },
      { key: "openaiApiKey", value: "" },
      { key: "geminiApiKey", value: "" },
    ])
  }

  return {
    message: "Seeded sample workspace: 5 roles, 2 crews, 1 workspace, 3 projects, 3 missions, 6 knowledge entries, 2 todos, artifacts, questions, and activity events",
  }
}
