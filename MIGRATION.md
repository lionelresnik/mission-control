# Mission Control — migration from Command Center

**Product:** Mission Control  
**Repo:** `lionelresnik/mission-control`  
**Data directory:** `~/.mission-control/mc.db`  
**Default execution mode:** `cursor` (Cursor runs AI; Mission Control orchestrates + persists)  
**@lu:** kept unchanged  

Command Center (`command-center-v2`) is **deprecated** — kept as backup only.

---

## Decisions (locked)

| Item | Choice |
|---|---|
| Name | Mission Control |
| Slug | `mission-control` |
| MCP server id | `mission-control` |
| MCP tools prefix | `mc_*` (was `cc_*`) |
| Default mode | Cursor |
| Lucius agent | `@lu` stays |

---

## Phase 0 — Bootstrap ✅ (this repo)

- [x] Copy `command-center-v2` → `mission-control`
- [x] Global rebrand (UI, MCP, paths, docs)
- [x] `~/.mission-control/mc.db` + auto-copy from `~/.command-center/cc.db`
- [x] `executionMode` setting (default `cursor`)
- [x] Settings UI: mode toggle; hide API keys in Cursor mode
- [ ] `git init` + first commit
- [ ] Create GitHub repo + push

---

## Phase 1 — Shared fixes (both modes)

These bugs exist in the fork and block either mode from working well:

1. **Task graph on web create** — `createMission()` must build graph from crew members (logic exists in `mc_create_mission`; extract to shared lib)
2. **Wire Settings API keys** to `getModel()` / Vercel AI SDK (built-in mode)
3. **Answered questions in next role prompt** (`/run`, `/trigger`, future Cursor prompt builder)
4. **Question answer UI** on mission detail page (built-in mode)
5. **`/todos` page** — API exists; dashboard links to missing route
6. **Temperature on `/trigger`** — match `/run` behavior

---

## Phase 2 — Cursor execution path (primary)

New MCP tools + API:

| Tool | Purpose |
|---|---|
| `mc_get_next_role` | Full prompt package: system prompt, goal, AGENTS.md, KB, prior artifacts, behavior |
| `mc_role_start` | Mark role `running` in task graph |
| `mc_role_checkpoint` | Optional status line → mission activity feed (live CC UI) |
| `mc_complete_role` | Save artifact, update progress, optional KB capture, mark `done` |
| `mc_list_crews` | List crews + role order from Cursor |

Mission page (Cursor mode):

- Hide **Run next role** / SSE stream
- Show task graph live states (poll or activity SSE)
- CTA: **Continue in Cursor** + copy mission id
- Artifacts appear as roles complete

Disable in Cursor mode (MCP returns helpful message):

- `mc_run_mission`
- `mc_get_questions` / `mc_answer_question` (questions stay in Cursor chat)

---

## Phase 3 — Mode-aware UI polish

| Area | Cursor mode | Built-in mode |
|---|---|---|
| Settings | MCP, integrations, mode | + provider keys, default model |
| Mission detail | Status board, Cursor CTA | Run + stream + tokens |
| Roles | Prompt, tools, memory scope | + model, temperature |
| Knowledge | CRUD + keyword search | + embed if OpenAI key |
| Sidebar banner | “AI runs in Cursor” | “AI runs via Mission Control” |

---

## Phase 4 — Demo + GitHub Pages

- [ ] `demo` branch with static export + seed JSON
- [ ] `.github/workflows/deploy-pages.yml`
- [ ] Live URL: `https://lionelresnik.github.io/mission-control/`
- [ ] Rebrand demo UI (no Command Center references)
- [ ] **You:** new screenshots + infographic (replace `docs/screenshots/`)

---

## Phase 5 — Deprecate Command Center

On `lionelresnik/command-center` (do not delete):

1. Add banner to README: *Superseded by [Mission Control](https://github.com/lionelresnik/mission-control)*
2. Archive repo (GitHub Settings → Archive)
3. Keep `demo` branch live or redirect note to new demo URL

Copy-paste for old README top:

```markdown
> **Deprecated:** This project is superseded by **[Mission Control](https://github.com/lionelresnik/mission-control)**.
> No further updates. Kept for reference and rollback only.
```

---

## Phase 6 — Docs & MCP migration for users

- [ ] README: two setup paths (Cursor vs built-in)
- [ ] MCP config snippet uses `mission-control` server + `mc_*` tools
- [ ] Cursor rules / `lucius.md` paths → `~/.mission-control`
- [ ] Optional: `mc_import_v1` from Command Center export

---

## Data migration

| From | To |
|---|---|
| `~/.command-center/cc.db` | `~/.mission-control/mc.db` (auto-copy on first app start) |
| MCP `cc_*` in Cursor config | Replace with `mission-control` server + `mc_*` |
| Command Center GitHub remote | Point to `mission-control`; old repo archived |

---

## What works in Cursor mode today (no Phase 2 yet)

- Workspaces, projects, crews, roles (web UI)
- Knowledge CRUD + MCP search/add
- `mc_create_mission`, `mc_get_mission`, `mc_list_*`
- `@lu` status, todos, capture, search
- Import / export

**Manual workaround until Phase 2:** create mission → `mc_get_mission` → tell Cursor which role to play → save output via web or `mc_add_knowledge`.

---

## Suggested implementation order

```
Phase 0 finish (git, GitHub) → Phase 1 fixes → Phase 2 Cursor path → Phase 3 UI → Phase 4 demo → Phase 5 deprecate
```

---

## Local dev

```bash
cd mission-control/app && npm install && npm run dev
cd mission-control/mcp && npm install && npm run build
```

MCP config (Settings page copies this):

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
