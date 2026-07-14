# 🎯 Mission Control

> **Orchestrate crews of AI agents across workspaces and projects** — complete missions and build your knowledge base.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/lionelresnik/mission-control)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen.svg)](https://lionelresnik.github.io/mission-control/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-optional-purple.svg)](https://modelcontextprotocol.io)
[![AI](https://img.shields.io/badge/AI-built--in_or_Cursor-blue.svg)]()

---

## Live demo

Try Mission Control with mock data — no install, read-only:

**[https://lionelresnik.github.io/mission-control/](https://lionelresnik.github.io/mission-control/)**

Built from the local `demo` branch (static export + sample workspace). The full app runs locally with SQLite and MCP.

---

## What is this?

Mission Control is a **local-first mission dashboard** for orchestrating AI agent crews across workspaces and projects. You define missions (goals + crews), run roles in sequence, capture artifacts and knowledge, and track progress — all in a SQLite database you own.

**One app, two ways to run AI:**

| | **Cursor mode** (default) | **Built-in AI mode** |
|---|---|---|
| **Who runs the agents?** | Cursor (your subscription) | Mission Control (your API keys) |
| **Where you work** | Cursor chat + MCP (web UI optional — see below) | Web UI at localhost:3000 |
| **API keys in Settings** | Hidden — not needed | Required (Anthropic / OpenAI / Gemini) |
| **Run a role** | `mc_get_next_role` → work in chat → `mc_complete_role` | **Run next role** button + live SSE stream |
| **Best for** | Daily dev in Cursor, full codebase context | Demos, no Cursor, or API-only setups |

Both modes share the **same database**: crews, roles, missions, artifacts, knowledge, todos, workspaces. Switch anytime in **Settings → Execution mode**.

---

## Execution modes in detail

### Shared (both modes)

These work the same regardless of how AI runs:

- **Dashboard** — active missions, stats, workspaces, todos, knowledge highlights
- **Workspaces & projects** — group repos, AGENTS.md per project, Jira/Slack/GitHub metadata
- **Crews & roles** — 5 built-in roles + 2 default crews seeded on first start
- **Knowledge base** — CRUD, tags, confidence, semantic search (OpenAI embeddings)
- **Todos** — web UI, dashboard, `@lu todo add` / `@lu todo list`, MCP `mc_list_todos`
- **Import / export** — JSON bundle + v1 YAML compatibility
- **MCP observability** — status, list missions, search knowledge, todos (both modes)
- **`@lu`** — ambient assistant in Cursor (`cursor/agents/lucius.md`)

### Cursor mode only

| Feature | What you get |
|---|---|
| **Mission orchestration** | MC builds task graph, stores prompts, artifacts, progress |
| **Cursor MCP tools** | `mc_get_next_role`, `mc_role_start`, `mc_role_checkpoint`, `mc_complete_role`, `mc_list_crews` |
| **Activity feed** | Mission page shows role start / checkpoints / done (no token stream) |
| **Questions in chat** | Agent asks in Cursor; you answer in chat — no DB polling loop |
| **Web UI** | Status board, artifacts, task graph, **Continue in Cursor** CTA — no Run button |

**Blocked in Cursor mode** (MCP returns a helpful message): `mc_run_mission`, built-in `/run` and `/trigger` API routes.

### Built-in AI mode only

| Feature | What you get |
|---|---|
| **Web Run button** | Stream each role's output live on the mission page (SSE) |
| **Provider keys** | Settings → Anthropic / OpenAI / Gemini |
| **Model per role** | Roles page: model + temperature per agent |
| **Question UI** | Answer blocking agent questions on the mission page |
| **MCP run** | `mc_run_mission` from Cursor chat (optional) |

**Blocked in built-in mode:** Cursor execution MCP tools (`mc_get_next_role`, etc.) — use the web Run button instead.

---

## Full flow: Cursor mode (recommended)

This is the default. Mission Control is the **control plane**; Cursor is the **execution engine**.

```
┌─────────────────┐     mc_get_next_role      ┌──────────────────┐
│ Mission Control │ ────────────────────────► │ Cursor chat      │
│ (web + SQLite)  │     prompts + context     │ (you + Claude)   │
│                 │ ◄──────────────────────── │                  │
│                 │     mc_complete_role      │                  │
│  task graph     │     artifact + progress   │  edit real code  │
│  artifacts      │                           │  run tests       │
│  activity feed  │                           │                  │
└─────────────────┘                           └──────────────────┘
```

### 1. One-time setup

```bash
git clone https://github.com/lionelresnik/mission-control
cd mission-control/app && npm install && npm run dev
cd ../mcp && npm install && npm run build
```

On first start the DB auto-seeds **5 roles**, **2 crews**, and a **sample workspace** (Platform API, Auth Service, 3 missions, todos, knowledge).

**Where to open the dashboard** (pick one):

| Option | When to use |
|---|---|
| **Cursor Simple Browser** (recommended in Cursor) | Cmd+Shift+P → **Simple Browser: Show** → `http://localhost:3000`, or run task **Mission Control: dev + open in Cursor** |
| **Live demo (no local server)** | [lionelresnik.github.io/mission-control](https://lionelresnik.github.io/mission-control/) — read-only mock data |
| **External browser** (Chrome, etc.) | Best for built-in AI **live SSE streaming**; optional for Cursor mode |
| **MCP only** | Skip the web UI — `mc_*` tools + `@lu` cover most Cursor-mode workflows |

> Cursor’s embedded browser may show harmless Next.js dev DOM noise (`<nextjs-portal>`). Use the live demo or an external browser if that bothers you; it does not affect MCP or the database.

Add MCP to `~/.cursor/mcp.json` (path from **Settings → MCP**):

```json
{
  "mcpServers": {
    "mission-control": {
      "command": "node",
      "args": ["/path/to/mission-control/mcp/dist/index.js"]
    }
  }
}
```

Restart Cursor. Confirm **Settings → Execution mode → Cursor**.

### 2. Create a mission

**Web:** Missions → New mission → goal, project, crew, behavior.

**Cursor (natural language):** *"Create a mission: fix JWT refresh bug, Bug Hunter crew, Auth Service project"* → `mc_create_mission`.

### 3. Run roles (the Cursor loop)

In Cursor chat (MCP connected):

1. **`mc_get_next_role`** with mission ID — returns system prompt, user prompt, task ID, AGENTS.md context, prior artifacts, knowledge
2. Optional: **`mc_role_start`** — marks role running; shows on web activity feed
3. **Do the work in Cursor** — edit code, run tests, answer questions in chat if needed
4. Optional: **`mc_role_checkpoint`** — short status line for the web UI (*"Reviewed auth middleware patterns"*)
5. **`mc_complete_role`** — paste full role output; MC saves artifact, updates task graph, may capture knowledge
6. Repeat from step 1 until mission done

**What you see on the web:** task graph turns green step-by-step, artifacts appear, activity feed updates, progress bar moves. No token stream — that stays in Cursor.

**Best practices:**

- Keep mission ID in chat context (copy from mission page **Continue in Cursor**)
- Complete roles with **full output** in `mc_complete_role` so artifacts are useful for the next role
- Use checkpoints sparingly for long roles — they're for the activity feed, not required
- Configure crews/roles/AGENTS.md in the web UI; execute in Cursor where you have the repo

### 4. Day-to-day with `@lu`

| Command | Use when |
|---|---|
| `@lu status` | Quick snapshot: running missions, open todos, open questions |
| `@lu todo add …` / `@lu todo list` | Capture and review work outside a mission |
| `@lu search …` | Find knowledge before starting a role |
| `@lu capture …` | Save a decision without a full mission |

---

## Full flow: Built-in AI mode

Mission Control calls your provider directly. No Cursor required.

### 1. Setup

Same install as above. In **Settings**:

1. Switch **Execution mode → Built-in AI**
2. Add **Anthropic** and/or **OpenAI** API key
3. Optional: OpenAI key for knowledge embeddings

### 2. Create & run

1. **Missions → New mission** — pick crew (task graph auto-built from crew role order)
2. Open mission → **Run next role**
3. Watch **live streaming** output in the browser
4. If the agent asks a **blocking question**, answer on the mission page
5. Click **Run next role** again for each step until done

**Optional from Cursor:** with MCP connected, say *"run the next role on mission X"* → `mc_run_mission` (disabled in Cursor mode).

### 3. When to use built-in

- Quick demo without Cursor open
- Headless / API-only environment
- You want streaming in the browser, not in chat

---

## Getting Started (quick)

```bash
git clone https://github.com/lionelresnik/mission-control
cd mission-control/app
npm install
npm run dev
```

Open the dashboard in **Cursor Simple Browser** (`Cmd+Shift+P` → **Simple Browser: Show** → `http://localhost:3000`) or an external browser.

**First start:** sample data loads automatically (roles, crews, projects, missions, todos). To reset: delete `~/.mission-control/mc.db` and restart, or **Settings → Load sample data** on an empty DB.

**Cursor mode (default):** build MCP (`mcp/`), add to Cursor config, create a mission, use `mc_get_next_role` loop.

**Built-in mode:** Settings → Built-in AI + API keys → Run next role on a mission.

### Optional: semantic search

Set OpenAI key in Settings → Knowledge → **Embed all**.

### Optional: integrations

Settings + per-project: GitHub token, Jira, Slack — notifications on mission complete.

---

[![Mission Control — product overview](docs/screenshots/overview.png)](docs/screenshots/overview.png)

It gives you:

- A **mission system** — sequential crew roles with artifacts and progress tracking
- A **knowledge base** — architecture decisions, runbooks, assumptions; semantic search
- **Crews & roles** — Architect, Backend, QA, Security, Documentation + default crews
- **Workspaces** — multi-repo scopes for cross-project missions
- **`@lu`** — ambient assistant in Cursor for status, todos, knowledge
- **MCP server** — optional; required for Cursor mode execution, useful for observability in both modes
- **Integrations** — GitHub PRs, Jira comments, Slack on mission complete
- **Import/export** — v1 YAML compatible

---

## Screenshots

_Click any image to view full size._

### Dashboard — Mission Control

[![Dashboard — active missions, stats, workspaces sidebar](docs/screenshots/dashboard.png)](docs/screenshots/dashboard.png)

### Workspaces

[![Workspaces — group projects into multi-repo scopes](docs/screenshots/workspaces.png)](docs/screenshots/workspaces.png)

### Projects

[![Projects — repo links, knowledge counts, AGENTS.md status](docs/screenshots/projects.png)](docs/screenshots/projects.png)

### Project detail — AGENTS.md editor

[![AGENTS.md editor — context file read by AI agents before every mission](docs/screenshots/project-agents-md.png)](docs/screenshots/project-agents-md.png)

### Crews

[![Crews — compose teams with roles and workflow steps](docs/screenshots/crews.png)](docs/screenshots/crews.png)

### Roles

[![Roles — system prompts, models, tools, and memory scope per agent](docs/screenshots/roles.png)](docs/screenshots/roles.png)

### Missions

[![Missions — filter by workspace, project, and status](docs/screenshots/missions.png)](docs/screenshots/missions.png)

---

## Architecture

```
mission-control/
├── app/                        # Next.js 16 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Dashboard
│   │   │   ├── missions/           # Mission list + detail (SSE streaming)
│   │   │   ├── projects/           # Project settings + AGENTS.md editor
│   │   │   ├── crews/              # Crew CRUD (teams of AI roles)
│   │   │   ├── roles/              # Role editor (system prompts, tools)
│   │   │   ├── knowledge/          # Knowledge base (semantic search)
│   │   │   ├── settings/           # API keys, integrations, import/export
│   │   │   └── api/                # All REST API routes
│   │   ├── components/
│   │   │   ├── layout/             # Sidebar, ThemeProvider
│   │   │   └── ui/                 # shadcn/ui components + ConfirmDialog
│   │   └── lib/
│   │       ├── db/                 # Drizzle ORM + SQLite schema + queries
│   │       ├── embeddings.ts       # OpenAI text-embedding-3-small + cosine sim
│   │       ├── git/worktrees.ts    # Git worktree management per mission role
│   │       └── mcp/client.ts       # GitHub / Jira / Slack MCP integrations
│   └── package.json
├── mcp/                        # Optional MCP server (Cursor integration)
│   ├── src/index.ts                # MCP tools (Cursor + built-in + observability)
│   └── package.json
├── cursor/
│   ├── agents/lucius.md            # @lu ambient assistant definition
│   ├── roles/*.yaml                # v1-compatible role definitions
│   ├── teams/*.yaml                # v1-compatible team definitions
│   └── rules/*.mdc                 # Cursor rule files
└── docs/
    └── OVERVIEW.md
```

**Tech stack:**
| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS, shadcn/ui |
| Database | SQLite via Drizzle ORM (local, zero-config) |
| AI execution | Built-in: Vercel AI SDK (Anthropic, OpenAI, Gemini, Ollama). Optional: Cursor via MCP |
| Semantic search | OpenAI `text-embedding-3-small` + cosine similarity |
| Streaming | Server-Sent Events (SSE) — built-in AI mode |
| Integrations | GitHub REST API, Jira REST API, Slack Web API |
| IDE (optional) | MCP server (`@modelcontextprotocol/sdk`, stdio transport) |

### Prerequisites

- Node.js 18+
- **Cursor mode:** Cursor + MCP config (no provider API key in MC)
- **Built-in mode:** Anthropic and/or OpenAI API key in Settings

---

## Cursor MCP Integration

Mission Control ships a **native MCP server** for Cursor. Same DB as the web UI — changes sync instantly.

### Setup

See [Full flow: Cursor mode](#full-flow-cursor-mode-recommended) for install + `mcp.json` config.

### MCP tools by mode

**Both modes**

| Tool | Purpose |
|---|---|
| `mc_status` | Overview: missions, todos, activity |
| `mc_list_missions` / `mc_get_mission` | List and inspect missions |
| `mc_create_mission` | Create mission + task graph from crew |
| `mc_list_projects` / `mc_get_project_context` | Project + KB context |
| `mc_list_workspaces` / `mc_create_workspace` / `mc_open` | Workspace management |
| `mc_list_crews` | Crews and role order |
| `mc_list_todos` / `mc_add_todo` / `mc_complete_todo` | Todo management |
| `mc_search_knowledge` / `mc_add_knowledge` | Knowledge base |
| `mc_export` / `mc_import_v1` | Data portability |

**Cursor mode only** (execution)

| Tool | Purpose |
|---|---|
| `mc_get_next_role` | Full prompt package for the next pending role |
| `mc_role_start` | Mark role running → activity feed |
| `mc_role_checkpoint` | Optional progress line → activity feed |
| `mc_complete_role` | Save artifact, advance task graph |

**Built-in mode only**

| Tool | Purpose |
|---|---|
| `mc_run_mission` | Run next role via Mission Control API (streaming in web UI) |
| `mc_get_questions` / `mc_answer_question` | Agent Q&A when using built-in run |

### Cursor chat examples

**Cursor mode — natural language:**

```
"create mission: add Azure registry support, Backend Crew, Platform API"
→ mc_create_mission

"what's the next role for mission <id>?"
→ mc_get_next_role

[you implement in Cursor]

"complete role — here's the architect plan: …"
→ mc_complete_role
```

**Built-in mode:**

```
"run the next role on mission <id>"
→ mc_run_mission (streams in web UI)
```

### `@lu` vs MCP

| | **`@lu`** | **MCP tools** |
|---|---|---|
| **What** | Lucius agent (`cursor/agents/lucius.md`) | Mission Control server |
| **Use for** | Status, todos, knowledge, standup, capture | Missions, crews, Cursor execution loop |
| **Examples** | `@lu status`, `@lu todo list`, `@lu search auth` | `mc_get_next_role`, `mc_create_mission` |

`@lu new mission` opens the web form — it does not run the full MCP create flow.

---

## v1 Compatibility

This project is the successor to the original Mission Control CLI + Cursor plugin. v1 YAML files are fully importable:

```yaml
# cursor/roles/architect.yaml  (v1 format)
id: architect
display_name: Architect
system_prompt: |
  You are the Architect...
```

```yaml
# cursor/teams/backend-team.yaml  (v1 format)
id: backend-crew
leader: architect
members:
  - role: architect
    order: 1
workflow:
  - plan
  - implement
```

Use **Settings → Import** to load these files into Mission Control.

---

## Roadmap

- [x] Dual execution — built-in AI (web UI) + optional Cursor MCP ✅
- [x] Mission lifecycle — create, run, answer questions (built-in or Cursor) ✅
- [x] Export to clipboard / import from v1 files ✅
- [x] Workspaces — group repos, multi-repo missions ✅
- [x] `mc_open` — auto-detect git repo in Cursor and open/create project ✅
- [ ] Deploy to Vercel (one-click)
- [ ] Demo video
- [ ] Mobile-friendly view
- [ ] Real-time multi-user collaboration

---

## Contributing

PRs welcome. The codebase is intentionally small and self-contained — no external database, no cloud required.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit and push
4. Open a PR

---

## Author

**Lionel Resnik**
[LinkedIn](https://www.linkedin.com/in/lionel-resnik)

> *"It's not who I am underneath, but what I build that defines me."*

---

## License

[MIT](./LICENSE) — free to use, modify, and distribute.
