import { NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { nanoid } from "nanoid"

const { projects, knowledgeEntries, missions, roles, teams, settings, workspaces } = schema

export async function POST() {
  try {
    const db = getDb()

    // ── Built-in roles ────────────────────────────────────────────────────────
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
5. Make technical decisions and document your reasoning as assumptions

Output a structured plan:
## Mission Plan: <name>
### Understanding
<What needs to be done and why>
### Approach
<High-level technical approach>
### Tasks
1. [Backend] <task>
2. [QA] <test scenarios>
3. [Security] <what to audit>
### Assumptions
- <assumption>
### Open questions
- <question> (blocking/non-blocking)`,
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
3. Follow existing patterns in the codebase
4. Write code that is correct, testable, and readable
5. Document any deviation as an assumption
Never modify files outside the scope of the task.`,
      },
      {
        id: r3id, name: "qa", displayName: "QA Engineer", isBuiltIn: true,
        color: "#fb923c", icon: "TestTube", model: "claude-sonnet", temperature: 0.4, memoryScope: "mission",
        description: "Reviews implementation, writes and runs tests, flags issues",
        tools: ["read_file", "run_tests", "create_issue"],
        allowedActions: ["read_file", "run_command"],
        systemPrompt: `You are the QA Engineer for this mission.
1. Review the implemented code against the Architect's plan
2. Identify gaps between plan and implementation
3. Write test cases: happy path, edge cases, error cases
4. Report issues with severity (BLOCKER / MINOR)
Produce a QA report as your artifact.`,
      },
      {
        id: r4id, name: "security", displayName: "Security Analyst", isBuiltIn: true,
        color: "#f87171", icon: "Shield", model: "claude-sonnet", temperature: 0.2, memoryScope: "mission",
        description: "Audits code for security vulnerabilities, checks dependencies, reviews permissions",
        tools: ["read_file", "search_codebase", "create_issue"],
        allowedActions: ["read_file"],
        systemPrompt: `You are the Security Analyst for this mission.
Review all new and modified code for:
- Input validation and output sanitization
- Authentication and authorization logic
- Hardcoded secrets or credentials
- Dependency vulnerabilities
Rate findings: CRITICAL / HIGH / MEDIUM / LOW
Produce a security review artifact.`,
      },
      {
        id: r5id, name: "docs", displayName: "Documentation", isBuiltIn: true,
        color: "#94a3b8", icon: "FileText", model: "claude-sonnet", temperature: 0.5, memoryScope: "mission",
        description: "Updates docs, READMEs, and AGENTS.md based on implemented changes",
        tools: ["read_file", "write_file"],
        allowedActions: ["read_file", "write_file"],
        systemPrompt: `You are the Documentation writer for this mission.
1. Review what was implemented
2. Update or write relevant documentation
3. Update AGENTS.md if architecture changed
4. Keep docs concise and accurate`,
      },
    ])

    // ── Crews ─────────────────────────────────────────────────────────────────
    const t1id = nanoid(), t2id = nanoid()

    await db.insert(teams).values([
      {
        id: t1id, name: "Backend Crew", isBuiltIn: false,
        description: "Full backend feature development with security and QA review",
        leaderId: r1id,
        members: [{ roleId: r1id, order: 1 }, { roleId: r2id, order: 2 }, { roleId: r3id, order: 3 }, { roleId: r4id, order: 4 }],
        workflow: ["plan", "implement", "test", "audit", "review"],
        knowledgeFilters: ["architecture", "patterns", "database"],
        mcps: ["github", "jira"],
      },
      {
        id: t2id, name: "Bug Hunter", isBuiltIn: true,
        description: "Rapid bug investigation and fix — no ceremonies, fast loop",
        leaderId: r1id,
        members: [{ roleId: r1id, order: 1 }, { roleId: r2id, order: 2 }, { roleId: r3id, order: 3 }],
        workflow: ["investigate", "fix", "verify"],
        knowledgeFilters: ["architecture", "database", "logs"],
        mcps: ["github"],
      },
    ])

    // ── Workspaces ────────────────────────────────────────────────────────────
    const ws1id = nanoid()

    await db.insert(workspaces).values([
      {
        id: ws1id,
        name: "Core Platform",
        description: "Shared backend services — API layer and authentication",
        color: "#6366f1",
        repoPaths: ["/repos/platform-api", "/repos/auth-service"],
      },
    ])

    // ── Projects ──────────────────────────────────────────────────────────────
    const p1id = nanoid(), p2id = nanoid(), p3id = nanoid()

    await db.insert(projects).values([
      {
        id: p1id, name: "Platform API", description: "Core backend platform and API layer", color: "#3b82f6",
        githubRepo: "platform-api", githubOwner: "my-org", jiraProject: "PLAT", jiraUrl: "https://my-org.atlassian.net",
        slackChannel: "platform-api", workspaceId: ws1id, agentsMdStatus: "merged",
      },
      {
        id: p2id, name: "Auth Service", description: "Authentication and authorization service", color: "#10b981",
        githubRepo: "auth-service", githubOwner: "my-org", jiraProject: "AUTH", jiraUrl: "https://my-org.atlassian.net",
        slackChannel: "auth-service", workspaceId: ws1id, agentsMdStatus: "pr_open",
      },
      {
        id: p3id, name: "Billing", description: "Billing and subscription management", color: "#f59e0b",
        githubRepo: "billing", githubOwner: "my-org", jiraProject: "BILL", agentsMdStatus: "local",
      },
    ])

    // ── Missions ──────────────────────────────────────────────────────────────
    const m1id = nanoid(), m2id = nanoid(), m3id = nanoid()

    await db.insert(missions).values([
      {
        id: m1id, name: "Add Azure Registry Support",
        goal: "Implement Azure Container Registry integration, matching the existing GCP and AWS patterns",
        projectId: p1id, teamId: t1id, ticketId: "PLAT-101",
        agentBehavior: "ask_me", status: "pending", progressPercent: 0,
        taskGraph: [
          { id: "t1", roleId: r1id, roleName: "Architect",  status: "pending", dependsOn: [] },
          { id: "t2", roleId: r2id, roleName: "Backend",    status: "pending", dependsOn: ["t1"] },
          { id: "t3", roleId: r3id, roleName: "QA",         status: "pending", dependsOn: ["t2"] },
          { id: "t4", roleId: r4id, roleName: "Security",   status: "pending", dependsOn: ["t3"] },
        ],
      },
      {
        id: m2id, name: "Fix Auth Token Refresh",
        goal: "Debug and fix the JWT refresh loop causing intermittent 401s in production",
        projectId: p2id, ticketId: "AUTH-42",
        agentBehavior: "assume_and_document", status: "done", progressPercent: 100,
        taskGraph: [
          { id: "t1", roleId: r1id, roleName: "Architect", status: "done", dependsOn: [] },
          { id: "t2", roleId: r2id, roleName: "Backend",   status: "done", dependsOn: ["t1"] },
          { id: "t3", roleId: r3id, roleName: "QA",        status: "done", dependsOn: ["t2"] },
        ],
      },
      {
        id: m3id, name: "Unified Auth Middleware Rollout",
        goal: "Roll out shared auth middleware across Platform API and Auth Service with consistent JWT handling",
        projectId: p1id, workspaceId: ws1id, projectIds: [p1id, p2id],
        teamId: t1id, ticketId: "PLAT-220",
        agentBehavior: "assume_and_document", status: "running", progressPercent: 35,
        taskGraph: [
          { id: "t1", roleId: r1id, roleName: "Architect", status: "done", dependsOn: [] },
          { id: "t2", roleId: r2id, roleName: "Backend",   status: "running", dependsOn: ["t1"] },
          { id: "t3", roleId: r3id, roleName: "QA",        status: "pending", dependsOn: ["t2"] },
        ],
      },
    ])

    // ── Knowledge ─────────────────────────────────────────────────────────────
    await db.insert(knowledgeEntries).values([
      { id: nanoid(), projectId: p1id, type: "database",       title: "Postgres — main DB connection pattern",   confidence: "confirmed", tags: ["postgres","db"],           content: "Connection via DB_HOST env var, port 5432, SSL required.\nPort-forward: ssh -L 5432:db.yourhost.internal:5432 your-bastion.example.com\nUpdate this with your actual DB host and bastion." },
      { id: nanoid(), projectId: p1id, type: "infrastructure", title: "events-queue — async processing",         confidence: "confirmed", tags: ["queue","events"],          content: "Used by the worker service for async job processing.\nUpdate this with your actual queue ARN/URL.", sourceMissionId: m1id },
      { id: nanoid(), projectId: p2id, type: "architecture",   title: "JWT refresh loop root cause",             confidence: "confirmed", tags: ["jwt","auth"],              content: "The refresh endpoint was not excluded from the auth middleware, causing an infinite 401 loop on expired tokens.", sourceMissionId: m2id },
      { id: nanoid(), projectId: p2id, type: "architecture",   title: "Rate limiting — per-tenant assumption",   confidence: "assumed",   tags: ["rate-limiting"],           content: "Based on observed 429 behavior — appears to be 100 req/min per tenant. Not verified in source code." },
      { id: nanoid(), projectId: p1id, type: "logs",           title: "Log groups — service naming convention",  confidence: "confirmed", tags: ["logs","observability"],    content: "Pattern: /logs/{service-name}\nUpdate this with your actual log group paths and tail commands." },
      { id: nanoid(), workspaceId: ws1id, type: "architecture", title: "Shared auth middleware contract",         confidence: "confirmed", tags: ["auth","middleware","workspace"], content: "All services in Core Platform use the same JWT validation middleware. Token issuer: auth-service. Audience claim must match service name. Refresh tokens are service-scoped." },
    ])

    // ── Default settings ──────────────────────────────────────────────────────
    await db.insert(settings).values([
      { key: "executionMode",    value: "cursor" },
      { key: "defaultModel",     value: "claude-sonnet" },
      { key: "anthropicApiKey",  value: "" },
      { key: "openaiApiKey",     value: "" },
      { key: "geminiApiKey",     value: "" },
    ])

    return NextResponse.json({ ok: true, message: "Seeded: 5 roles, 2 crews, 1 workspace, 3 projects, 3 missions, 6 knowledge entries — using generic demo data" })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
