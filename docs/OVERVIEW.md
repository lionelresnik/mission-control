# Mission Control — Complete Documentation

> Orchestrate crews of AI agents across workspaces and projects — complete missions and build your knowledge base.
> Orchestrate multi-agent AI workflows, manage your knowledge base, and stay in flow.

---

## Table of Contents

1. [What is Mission Control?](#what)
2. [Why it exists — the problem it solves](#why)
3. [Architecture decisions](#architecture)
4. [Core concepts](#concepts)
5. [How it works end-to-end](#how)
6. [Tech stack — and why each choice](#tech-stack)
7. [Setup and installation](#setup)
8. [Pages and features](#pages)
9. [Integrations](#integrations)
10. [The @lu assistant](#lu)
11. [Phases completed](#phases)
12. [Roadmap](#roadmap)

---

## 1. What is Mission Control? {#what}

Mission Control is a **local-first AI mission control dashboard** — a web dashboard + Cursor integration that lets you:

- Define **Missions**: a goal, a Jira ticket, a project, and a crew of AI agents to accomplish it
- Watch AI agents (Architect, Backend Engineer, QA, Security Analyst, Docs) execute the mission step by step, producing real artifacts
- Build a persistent **Knowledge Base** of architecture, patterns, database schemas, and runbooks — queryable semantically
- Keep a running **daily log** and **todo list** surfaced inside Cursor via `@lu`
- Track token usage and estimated cost per mission
- Export mission results as Markdown, post to Slack, comment on Jira tickets

It runs entirely on your machine. No cloud required. All data lives in a local SQLite DB at `~/.mission-control/mc.db`.

---

## 2. Why it exists {#why}

### The problem

Engineering teams using AI agents face three compounding problems:

1. **Context amnesia** — every AI session starts from zero. The agent doesn't know your stack, your patterns, your recent decisions.
2. **No orchestration** — current tools (ChatGPT, Cursor, Copilot) are single-turn. You can't define a multi-step workflow where an Architect plans, a Backend Engineer implements, a QA reviews, and a Security Analyst audits — each with the output of the previous as context.
3. **Lost knowledge** — agents discover things (JWT middleware bug, rate-limit behavior, DB connection pattern) but that knowledge disappears when the session ends.

### The solution

Mission Control solves all three:

1. **Persistent knowledge**: every insight gets captured to a semantic knowledge base. Every agent reads it before starting.
2. **Mission orchestration**: declare a crew of roles with sequential dependencies. One click runs the whole pipeline.
3. **Contextual continuity**: the `@lu` assistant in Cursor surfaces live mission status, todos, and knowledge without leaving the IDE.

---

## 3. Architecture decisions {#architecture}

### Why Next.js with App Router?

- Full-stack TypeScript in one repo — server actions, API routes, and React UI share types
- Server Components for fast initial loads (missions list, knowledge base)
- Client Components only where interactivity is needed
- Works as a local dev server, trivially deployable to Vercel for demos

### Why SQLite (not Postgres)?

This is a **local-first tool**. SQLite requires zero infrastructure — no connection strings, no Docker, no cloud accounts. The entire app starts with `npm run dev`. The DB file at `~/.mission-control/mc.db` travels with the developer.

For a tool running on a single developer's machine with thousands (not millions) of records, SQLite is the correct choice.

### Why Drizzle ORM?

- Fully typed queries that catch schema changes at compile time
- Lightweight — no runtime overhead vs raw SQL
- Migrations are straightforward for a local DB
- The schema is the single source of truth (see `src/lib/db/schema.ts`)

### Why Vercel AI SDK?

- Single abstraction over Anthropic, OpenAI, Gemini, and Ollama
- Built-in streaming via `streamText` — mission artifacts appear word by word
- Token usage is captured via `result.usage` after streaming completes
- Easy model switching per role — the Architect can use Claude Opus while QA uses Haiku

### Why no `sqlite-vec` for semantic search?

`sqlite-vec` requires a native compiled binary that varies by platform and Node version. Instead, embeddings are stored as `Float32Array` blobs in the DB and cosine similarity is computed in-memory in Node. For a knowledge base of hundreds to low thousands of entries, this is fast enough (< 50ms) and requires zero native dependencies.

### Why custom `ThemeProvider` instead of `next-themes`?

`next-themes` v0.4.x has an unfixed SSR regression with React 19 that produces hydration mismatches. The custom implementation is 35 lines: read from `localStorage` on mount, apply `dark`/`light` class to `<html>`, persist on change. An inline `<script>` in `<head>` applies the stored theme before first paint to prevent flash.

---

## 4. Core concepts {#concepts}

### Project
A codebase you work on. Has a name, color, GitHub repo slug, Jira project key, Slack channel. Hosts an `AGENTS.md` — a living document that every agent reads before executing.

### Role
An AI agent persona. Has a system prompt, a model, a temperature, a memory scope. Examples: Architect, Backend Engineer, QA Engineer, Security Analyst, Documentation.

### Crew
A named collection of roles with an execution order and workflow (plan → implement → test → audit → review). Crews are reusable across missions.

### Mission
A unit of work. Has:
- A goal (natural language)
- A linked project and optionally a crew
- A Jira ticket ID
- An agent behavior mode (see below)
- A task graph (roles + their dependency order)
- Artifacts (the output of each role)
- Token usage and estimated cost

### Agent behavior
Controls how agents handle ambiguity:
- **Assume & document** — never pauses, logs every assumption as an artifact detail
- **Ask me** — pauses and surfaces up to 3 blocking questions before continuing
- **Async** — logs questions without blocking, you answer when you have time

### Artifact
The output produced by a role during a mission. Types: plan, code, review, findings, runbook. Stored in DB, displayed in the mission detail view, exportable as Markdown.

### Knowledge entry
A piece of persistent knowledge about a project. Has a type (architecture, database, pattern, runbook, etc.), a confidence level (confirmed, assumed, investigating), and an optional semantic embedding. Agents read the knowledge base before every run.

### @lu
Lucius — the ambient Cursor assistant. Responds to `@lu <command>` inside Cursor. Backed by the real DB via the dashboard API. See [The @lu assistant](#lu).

---

## 5. How it works end-to-end {#how}

### Creating a mission

1. User opens `/missions/new`
2. Enters a goal, selects a project, optionally picks a crew and agent behavior
3. Dashboard creates a mission record with a task graph derived from the crew's members
4. User is redirected to the mission detail page

### Running a mission

1. User clicks **Run next role** on the mission detail page
2. Frontend calls `POST /api/missions/[id]/run`
3. Server finds the next pending task in the graph (respecting `dependsOn`)
4. Loads the role's system prompt from the DB
5. Builds context: `mission.goal` + knowledge base entries + previous artifacts
6. Calls `streamText()` via the Vercel AI SDK
7. Streams chunks back as Server-Sent Events — UI renders them in real time
8. After the stream completes:
   - Token usage is captured and accumulated on the mission
   - The artifact is saved to the DB
   - If the role produced questions (`QUESTION:` prefix), they're saved and sent as SSE events
   - The task is marked done, progress updated
   - If all tasks are done: mission marked done, Slack notified, Jira commented
9. If a git worktree was created for this role (when the project has a local repo path), it exists at `~/.mission-control/worktrees/`

### Knowledge accumulation

Every time an agent discovers something — a DB pattern, an architecture constraint, a bug root cause — it can be captured:
- Manually via the Knowledge Base UI or `@lu capture`
- Automatically (future: agent-triggered via tool call)

Entries are optionally embedded (OpenAI `text-embedding-3-small`) and become searchable semantically.

---

## 6. Tech stack {#tech-stack}

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 + App Router | Full-stack TS, SSR, streaming, easy deploy |
| Language | TypeScript | End-to-end type safety across DB, API, and UI |
| Database | SQLite via Drizzle ORM | Local-first, zero infra, typed queries |
| AI | Vercel AI SDK | Provider abstraction, streaming, usage tracking |
| UI | Tailwind CSS v4 + shadcn/ui | Fast, composable, dark/light theming |
| Icons | Lucide React | Consistent, tree-shakeable |
| Styling | CSS variables + `@theme` | Tailwind v4 native approach |
| Embeddings | OpenAI `text-embedding-3-small` | Best quality/cost ratio, 1536 dims |
| Theme | Custom `ThemeProvider` | Zero deps, no SSR issues |
| Integrations | GitHub API, Jira REST API v3, Slack API | Direct HTTP — no SDK bloat |

---

## 7. Setup {#setup}

```bash
# 1. Clone and install
cd app
npm install

# 2. Start the dev server
npm run dev

# 3. Seed the DB with demo data
curl -X POST http://localhost:3000/api/seed

# 4. Open the dashboard
open http://localhost:3000

# 5. (Optional) Add AI provider key in Settings
# Settings → AI Providers → Anthropic/OpenAI key
```

### Cursor integration

Copy the contents of `cursor/` into your `.cursor/` folder:

```bash
cp -r cursor/rules/* .cursor/rules/
cp -r cursor/agents/* .cursor/agents/
```

Then use `@lu` anywhere in Cursor.

---

## 8. Pages and features {#pages}

| Page | URL | What it does |
|---|---|---|
| Dashboard | `/` | Live stats: running missions, todos, recent activity |
| Projects | `/projects` | All projects with AGENTS.md status badges |
| Project detail | `/projects/[id]` | AGENTS.md editor with edit/preview tabs |
| Crews | `/crews` | Configured crews with workflow visualization |
| Roles | `/roles` | All agent roles with inline edit drawer |
| Missions | `/missions` | Mission list with search + multi-filter |
| Mission detail | `/missions/[id]` | 3-column: task graph · artifact viewer · questions |
| New Mission | `/missions/new` | Goal, project, crew, behavior selection |
| Knowledge | `/knowledge` | Knowledge base with semantic search toggle |
| Settings | `/settings` | AI provider keys, integrations (GitHub/Jira/Slack), @lu commands |

---

## 9. Integrations {#integrations}

All integrations are credential-driven — they activate when the relevant key is present in Settings.

### GitHub
- Configured with a personal access token (needs `repo` scope)
- Creates PRs from mission worktree branches after completion
- Check PR status via `POST /api/mcp { action: "github.getPR", ... }`

### Jira
- Configured with Jira base URL, email, and API token
- Posts a mission summary comment on the linked ticket when a mission completes
- Fetch ticket details before a mission run to enrich agent context

### Slack
- Configured with a bot token (`xoxb-...`)
- Posts a formatted summary to the project's Slack channel on mission completion
- Includes artifact count, status, ticket link, and a "View in Mission Control" button

---

## 10. The @lu assistant {#lu}

`@lu` is the ambient Cursor assistant backed by the live DB. Type it anywhere in Cursor.

| Command | What it does |
|---|---|
| `@lu status` | Running missions, pending todos, open questions |
| `@lu open` | Open the dashboard in your browser |
| `@lu new mission` | Create a mission interactively |
| `@lu todo add <text>` | Add a todo to the DB |
| `@lu todo list` | List pending todos |
| `@lu standup` | Generate today's standup from missions + log |
| `@lu recap` | Log what you did today |
| `@lu capture` | Save current context to the Knowledge Base |
| `@lu search <query>` | Semantic search the Knowledge Base |
| `@lu mission status <name>` | Get mission details |
| `@lu batman` | 🦇 |

---

## 11. Phases completed {#phases}

### Phase 1 — Foundation ✅
- Next.js 15/16 app with SQLite + Drizzle schema
- All pages wired to real DB (no mock data)
- AI provider abstraction via Vercel AI SDK
- Mission run with SSE streaming

### Phase 2 — UI/UX ✅
- shadcn/ui component library
- Sidebar with logo, theme toggle
- Missions page with search and filters
- Role edit drawer
- Mission agent behavior selector
- Dark/light theme (custom, no hydration issues)

### Phase 3 — Intelligence ✅
- AGENTS.md editor per project (edit/preview/save)
- Knowledge semantic search (OpenAI embeddings, cosine similarity)
- `@lu` wired to real DB (all commands use live API)
- Mission history + artifact export to Markdown

### Phase 4 — Integrations ✅
- Token usage tracking per mission (input, output, cost estimate)
- Git worktrees per agent role (isolated branches)
- GitHub, Jira, Slack integrations (credential-driven, fire on mission complete)
- MCP settings UI in dashboard

---

## 12. Roadmap {#roadmap}

### Near term
- [ ] Record demo video
- [ ] GitHub PR with polished README
- [ ] Deploy demo to Vercel/GitHub Pages
- [ ] Auto-PR creation from worktree branch after mission completes
- [ ] Mission templates (save a mission config as a reusable template)

### Medium term
- [ ] Jira ticket → mission auto-create (webhook or scheduled pull)
- [ ] Multi-mission dashboard (kanban view)
- [ ] Agent tool use (read_file, write_file, run_tests as real tool calls)
- [ ] Mission branching (run multiple crews in parallel on the same goal)

### Long term
- [ ] Self-improvement loop: missions that improve AGENTS.md
- [ ] Shared knowledge base across team members (optional Postgres backend)
- [ ] Cursor extension (native panel instead of browser)
