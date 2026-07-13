# Open questions & decisions log

## ✅ Resolved

| # | Question | Resolution |
|---|---|---|
| 2 | GitHub repo | ✅ Created `github.com/lionelresnik/mission-control`, pushed `v1.0.0` branch |
| 4 | Git worktrees base path | ✅ Confirmed `/Users/lionelresnik/Projects/<githubRepo>` |
| — | MCP server | ✅ Built and live — 14 tools, stdio transport, `~/.cursor/mcp.json` configured |
| — | Mission lifecycle from Cursor | ✅ `mc_create_mission`, `mc_run_mission`, `mc_get_questions`, `mc_answer_question` |
| — | Export / import v1 data | ✅ `mc_export` (to any AI), `mc_import_v1` (todos.md, daily-log, task-history) |
| — | Roles tools UI | ✅ Added checklist to role editor, tools saved to DB |
| — | Seed data / internal refs | ✅ Cleaned — no internal hostnames or org info |
| — | DB in git? | ✅ Safe — DB lives at `~/.mission-control/mc.db`, `.gitignore` updated |
| — | js-yaml ESM build error | ✅ Fixed — `import * as yaml` |
| — | TabsList JSX parse error | ✅ Fixed — `</Tabs>` → `</TabsList>` in projects page |

---

## ❓ Still needs your input

### 1. Demo video
To record the demo you need to:
- Run the app (`npm run dev` in `app/`)
- Have at least an Anthropic or OpenAI key in Settings
- Record with Loom, QuickTime, or similar

**Want me to write a shot list / demo script?**

### 3. Deploy — Vercel or GitHub Pages?
The app uses local SQLite. For a public live demo:
- **Option A** — Vercel + Turso (hosted SQLite-compatible DB, free tier). I can wire this up end-to-end.
- **Option B** — Static export with mock/seed data only. Simpler, no real DB needed.
- **Option C** — No live demo, just README + screenshots on GitHub.

**Which do you prefer?**

### 5. Token cost model
Default pricing is Claude Sonnet ($3/1M input, $15/1M output). If you mainly use a different model the cost estimates in the dashboard will be off.

**Which model will you mostly run missions with?**

---

## 🔧 Pending build items (I can do these)

| Item | Notes |
|---|---|
| Slack channel + Jira URL in project settings UI | Currently DB-only, no edit form |
| Mobile-friendly layout | Responsive pass on all pages |
| Demo script / shot list | Once you decide on video |
| Vercel deploy wiring | Once you pick Option A/B/C above |
| Real-time multi-user sync | WebSocket broadcast on DB changes |
| v1 data import | Ready — run `mc_import_v1` dry run from Cursor chat |
| Desktop app (PWA / Electron) | Low priority — parked |

---

## Decisions made — confirm or override

- **Crews renamed from Teams** ✅
- **Crosshair icon for Missions** ✅
- **Custom ThemeProvider** (removed `next-themes`) ✅ — no hydration errors
- **MCP transport: stdio** ✅ — no port, no config beyond `mcp.json`
- **Jira comment format**: plain text block. Want Slack-style rich text instead?
- **Repo name**: `mission-control` (not `mission-control`). Fine?
