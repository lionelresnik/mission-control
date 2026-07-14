"use client"

import { useState, useEffect } from "react"
import { Save, Zap, Key, Terminal, Database, CheckCircle2, Loader2, GitBranch, MessageSquare, Ticket, Upload, Download, FileJson, Archive, AlertTriangle, Copy, Check, Plug } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DEFAULT_EXECUTION_MODE, type ExecutionMode } from "@/lib/settings/execution-mode"
import { apiFetch } from "@/lib/api-client"

const luCommands = [
  { command: "@lu status",        description: "Active missions, top todos, today's log count",        editable: false },
  { command: "@lu open",          description: "Open dashboard in browser",                            editable: false },
  { command: "@lu new mission",   description: "Create a mission (opens dashboard form)",              editable: false },
  { command: "@lu todo add",      description: "Add a new todo",                                       editable: true },
  { command: "@lu todo list",     description: "List open todos (pending + in progress)",              editable: false },
  { command: "@lu standup",       description: "Generate today's standup from daily log",             editable: false },
  { command: "@lu capture",       description: "Save current context to knowledge base",              editable: true },
  { command: "@lu recap",         description: "Summarize today's work to daily log",                 editable: false },
  { command: "@lu search <query>","description": "Search knowledge base",                             editable: false },
  { command: "@lu batman",        description: "🦇",                                                  editable: false },
]

const providers = [
  { id: "anthropic", name: "Anthropic Claude",  models: ["claude-sonnet", "claude-opus", "claude-haiku"], keyField: "anthropicApiKey" },
  { id: "openai",    name: "OpenAI GPT",         models: ["gpt-4o", "gpt-4o-mini"],                        keyField: "openaiApiKey" },
  { id: "gemini",    name: "Google Gemini",       models: ["gemini-pro", "gemini-flash"],                   keyField: "geminiApiKey" },
  { id: "ollama",    name: "Ollama (local)",      models: ["llama3", "mistral", "codestral"],               keyField: null },
]

type Settings = Record<string, string>

type McpStatus = {
  dbExists: boolean
  mcpBuilt: boolean
  mcpPath: string
  config: string
  toolCount: number
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null)
  const [configCopied, setConfigCopied] = useState(false)

  // Import/export state
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: boolean; stats?: Record<string, number>; error?: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null)

  useEffect(() => {
    Promise.all([
      apiFetch("/api/settings").then(r => r.json()),
      apiFetch("/api/mcp/status").then(r => r.json()).catch(() => null),
    ]).then(([d, mcp]) => {
      setSettings(d)
      setMcpStatus(mcp)
      setLoading(false)
    })
  }, [])

  const copyMcpConfig = async () => {
    if (!mcpStatus?.config) return
    await navigator.clipboard.writeText(mcpStatus.config)
    setConfigCopied(true)
    setTimeout(() => setConfigCopied(false), 2000)
  }

  const set = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    await apiFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleSeedSampleData() {
    setSeeding(true)
    setSeedResult(null)
    try {
      const res = await apiFetch("/api/seed", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setSeedResult({ ok: false, error: data.error ?? "Seed failed" })
      } else {
        setSeedResult({ ok: true, message: data.message })
      }
    } catch (e) {
      setSeedResult({ ok: false, error: String(e) })
    } finally {
      setSeeding(false)
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await apiFetch("/api/import", { method: "POST", body: form })
      const data = await res.json()
      setImportResult(data)
    } catch (e) {
      setImportResult({ ok: false, error: String(e) })
    } finally {
      setImporting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const executionMode: ExecutionMode =
    settings.executionMode === "builtin" ? "builtin" : DEFAULT_EXECUTION_MODE
  const cursorMode = executionMode === "cursor"

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {cursorMode
            ? "Cursor mode — AI runs in Cursor; Mission Control stores crews, missions, and knowledge"
            : "Built-in AI — Mission Control runs agent roles via your provider API keys"}
        </p>
      </div>

      {/* Execution mode */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            Execution mode
          </CardTitle>
          <CardDescription>
            Choose one AI backend. Cursor mode uses your Cursor subscription; built-in mode uses API keys below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {([
            {
              id: "cursor" as ExecutionMode,
              label: "Cursor (recommended)",
              desc: "Configure crews and missions here; run roles from Cursor chat via MCP. @lu stays available.",
            },
            {
              id: "builtin" as ExecutionMode,
              label: "Built-in AI",
              desc: "Run missions from the web UI or mc_run_mission — requires Anthropic/OpenAI/Gemini API keys.",
            },
          ]).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => set("executionMode", opt.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                executionMode === opt.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/50"
              }`}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* AI Providers — built-in mode only */}
      {!cursorMode && (
      <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            AI Providers
          </CardTitle>
          <CardDescription>API keys are stored locally in your SQLite DB, never sent anywhere else</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {providers.map(provider => {
            const hasKey = provider.keyField && settings[provider.keyField] && settings[provider.keyField].length > 0
            return (
              <div key={provider.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.models.join(", ")}</p>
                  </div>
                  {provider.keyField === null
                    ? <Badge variant="secondary">No key needed</Badge>
                    : hasKey
                      ? <Badge variant="success">Configured</Badge>
                      : <Badge variant="outline">Not set</Badge>
                  }
                </div>
                {provider.keyField && (
                  <Input
                    type="password"
                    placeholder={`${provider.name} API key`}
                    value={settings[provider.keyField] ?? ""}
                    onChange={e => set(provider.keyField!, e.target.value)}
                  />
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Default model — built-in mode only */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Default model</CardTitle>
          <CardDescription>Used when a role doesn&apos;t specify its own model</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={settings.defaultModel ?? "claude-sonnet"}
            onChange={e => set("defaultModel", e.target.value)}
            placeholder="e.g. claude-sonnet"
          />
        </CardContent>
      </Card>
      </>
      )}

      {/* Integrations — GitHub, Jira, Slack */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            Integrations
          </CardTitle>
          <CardDescription>GitHub PRs, Jira tickets, Slack notifications. Auto-fire on mission complete in Built-in AI mode when configured.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* GitHub */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">GitHub</p>
              {settings.githubToken ? <Badge variant="success">Configured</Badge> : <Badge variant="outline">Not set</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Creates PRs from mission worktree branches. Needs <code>repo</code> scope.</p>
            <Input type="password" placeholder="GitHub personal access token" value={settings.githubToken ?? ""} onChange={e => set("githubToken", e.target.value)} />
          </div>

          {/* Jira */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Jira</p>
              {settings.jiraApiToken ? <Badge variant="success">Configured</Badge> : <Badge variant="outline">Not set</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Posts mission summary as a comment on the linked ticket when done.</p>
            <div className="space-y-2">
              <Input placeholder="Jira base URL (e.g. https://yourco.atlassian.net)" value={settings.jiraBaseUrl ?? ""} onChange={e => set("jiraBaseUrl", e.target.value)} />
              <Input placeholder="Jira email" value={settings.jiraEmail ?? ""} onChange={e => set("jiraEmail", e.target.value)} />
              <Input type="password" placeholder="Jira API token" value={settings.jiraApiToken ?? ""} onChange={e => set("jiraApiToken", e.target.value)} />
            </div>
          </div>

          {/* Slack */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Slack</p>
              {settings.slackBotToken ? <Badge variant="success">Configured</Badge> : <Badge variant="outline">Not set</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Posts a mission complete notification to the project's configured Slack channel.</p>
            <Input type="password" placeholder="Slack bot token (xoxb-...)" value={settings.slackBotToken ?? ""} onChange={e => set("slackBotToken", e.target.value)} />
          </div>

        </CardContent>
      </Card>

      {/* @lu commands */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            @lu commands
          </CardTitle>
          <CardDescription>Available when you type @lu in Cursor</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {luCommands.map(cmd => (
            <div key={cmd.command} className="flex items-center gap-3 rounded-md border p-3">
              <code className="text-xs font-mono text-primary min-w-[180px]">{cmd.command}</code>
              <p className="text-xs text-muted-foreground flex-1">{cmd.description}</p>
              {cmd.editable
                ? <Badge variant="secondary" className="text-xs">Custom</Badge>
                : <Badge variant="outline" className="text-xs">Built-in</Badge>
              }
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Cursor MCP */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" />
            Cursor MCP Server
          </CardTitle>
          <CardDescription>Native integration — query missions, knowledge, and todos from Cursor chat</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-muted-foreground">Database</p>
              <div className="flex items-center gap-2">
                {mcpStatus?.dbExists
                  ? <Badge variant="success">Connected</Badge>
                  : <Badge variant="destructive">Not found</Badge>}
                <span className="text-muted-foreground font-mono text-[10px]">~/.mission-control/mc.db</span>
              </div>
            </div>
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-muted-foreground">MCP server built</p>
              <div className="flex items-center gap-2">
                {mcpStatus?.mcpBuilt
                  ? <Badge variant="success">Ready</Badge>
                  : <Badge variant="warning">Not built</Badge>}
                <span className="text-muted-foreground">{mcpStatus?.toolCount ?? 17} tools</span>
              </div>
            </div>
          </div>

          {!mcpStatus?.mcpBuilt && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-muted-foreground">
              Build the MCP server first: <code className="font-mono">cd mcp && npm install && npm run build</code>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add to ~/.cursor/mcp.json</p>
            <pre className="rounded-md border bg-muted/30 p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
              {mcpStatus?.config ?? `{
  "mcpServers": {
    "mission-control": {
      "command": "node",
      "args": ["/path/to/mission-control/mcp/dist/index.js"]
    }
  }
}`}
            </pre>
            <Button variant="outline" size="sm" className="gap-2 h-8 text-xs" onClick={copyMcpConfig}>
              {configCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {configCopied ? "Copied!" : "Copy config"}
            </Button>
            <p className="text-[11px] text-muted-foreground">Restart Cursor after saving. Tools appear in every chat session.</p>
          </div>
        </CardContent>
      </Card>

      {/* Sample data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Sample data
          </CardTitle>
          <CardDescription className="text-xs">
            Load the demo workspace (Platform API, Auth Service, missions, knowledge, todos).
            Built-in roles and crews are created automatically on first start.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-8 text-xs"
            disabled={seeding}
            onClick={handleSeedSampleData}
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            Load sample data
          </Button>
          {seedResult && (
            <div className={`rounded-lg border px-4 py-3 text-xs ${seedResult.ok ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
              {seedResult.ok ? (
                <p className="text-green-400">{seedResult.message}</p>
              ) : (
                <p className="text-yellow-400">{seedResult.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data directory */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Data directory
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          {[
            ["Database",      "~/.mission-control/mc.db"],
            ["Daily logs",    "~/.mission-control/daily/"],
            ["Knowledge docs","~/.mission-control/docs/"],
            ["Todos",         "~/.mission-control/todos/"],
            ["AGENTS.md",     "~/.mission-control/agents-md/"],
          ].map(([label, path]) => (
            <div key={label} className="flex justify-between py-1 border-b border-border last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <code className="font-mono text-muted-foreground/80">{path}</code>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Import / Export */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Archive className="h-4 w-4 text-primary" />
            Import / Export
          </CardTitle>
          <CardDescription className="text-xs">
            Move data between Mission Control instances. Compatible with v1 CLI YAML files and JSON bundles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Export</p>
            <div className="flex gap-2 flex-wrap">
              <a href="/api/export?format=json" download>
                <Button variant="outline" size="sm" className="gap-2 h-8 text-xs">
                  <FileJson className="h-3.5 w-3.5 text-blue-400" />
                  Full bundle (.json)
                </Button>
              </a>
              <a href="/api/export?format=yaml-zip" download>
                <Button variant="outline" size="sm" className="gap-2 h-8 text-xs">
                  <Archive className="h-3.5 w-3.5 text-yellow-400" />
                  v1 YAML + bundle (.zip)
                </Button>
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground">
              JSON includes all projects, roles, crews, knowledge, settings and todos.
              ZIP also contains v1-compatible YAML role/team files readable by the v1 CLI and plugin.
            </p>
          </div>

          {/* Import */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Import</p>
            <div
              className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false)
                const file = e.dataTransfer.files[0]
                if (file) handleImportFile(file)
              }}
              onClick={() => document.getElementById("import-file-input")?.click()}
            >
              <input
                id="import-file-input"
                type="file"
                accept=".json,.yaml,.yml,.zip"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
              />
              {importing ? (
                <><Loader2 className="h-6 w-6 animate-spin text-primary mb-2" /><p className="text-sm text-muted-foreground">Importing…</p></>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground/40 mb-2" />
                  <p className="text-sm font-medium">Drop file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">.json · .yaml · .yml · .zip</p>
                </>
              )}
            </div>

            {/* Import result */}
            {importResult && (
              <div className={`rounded-lg border px-4 py-3 text-xs ${importResult.ok ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                {importResult.ok ? (
                  <div className="space-y-1">
                    <p className="font-medium text-green-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Import complete
                    </p>
                    {importResult.stats && (
                      <div className="flex flex-wrap gap-3 text-muted-foreground mt-1">
                        {Object.entries(importResult.stats).filter(([, v]) => (v as number) > 0).map(([k, v]) => (
                          <span key={k}><span className="font-medium text-foreground">{v as number}</span> {k}</span>
                        ))}
                      </div>
                    )}
                    <p className="text-muted-foreground/70 mt-1">Refresh the page to see imported data.</p>
                  </div>
                ) : (
                  <p className="text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {importResult.error ?? "Import failed"}
                  </p>
                )}
              </div>
            )}

            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <p>• <strong>JSON bundle</strong>: Full export from this app</p>
              <p>• <strong>v1 YAML</strong>: Role or team files from the v1 CLI/plugin (<code>cursor/roles/*.yaml</code>, <code>cursor/teams/*.yaml</code>)</p>
              <p>• <strong>ZIP</strong>: Bundle containing v1 YAML files + optional JSON bundle</p>
              <p className="text-muted-foreground/60 pt-1">Existing records are updated; new records are added. Nothing is deleted.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saving ? "Saving…" : saved ? "Saved!" : "Save settings"}
      </Button>
    </div>
  )
}
