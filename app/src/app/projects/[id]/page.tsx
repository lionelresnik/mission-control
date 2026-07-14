"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  FileText,
  GitBranch,
  ExternalLink,
  Save,
  RefreshCw,
  Check,
  Eye,
  Pencil,
  Copy,
  Info,
  Settings2,
  Hash,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

interface Project {
  id: string
  name: string
  description: string | null
  githubOwner: string | null
  githubRepo: string | null
  jiraProject: string | null
  jiraUrl: string | null
  slackChannel: string | null
  color: string | null
  repoPath: string | null
  agentsMdStatus: string | null
  agentsMdLocal: string | null
  workspaceId: string | null
}

type Workspace = { id: string; name: string; color: string }

interface AgentsMdResponse {
  content: string
  source: "db" | "file" | "template"
}

function MarkdownPreview({ content }: { content: string }) {
  const html = content
    .split("\n")
    .map(line => {
      if (line.startsWith("# ")) return `<h1 class="text-xl font-bold mt-4 mb-2">${line.slice(2)}</h1>`
      if (line.startsWith("## ")) return `<h2 class="text-base font-semibold mt-4 mb-1.5 text-foreground/90">${line.slice(3)}</h2>`
      if (line.startsWith("### ")) return `<h3 class="text-sm font-semibold mt-3 mb-1">${line.slice(4)}</h3>`
      if (line.startsWith("- ")) return `<li class="ml-4 text-sm text-muted-foreground list-disc">${line.slice(2)}</li>`
      if (line.startsWith("```")) return line === "```" ? `</code></pre>` : `<pre class="bg-muted rounded p-3 text-xs overflow-x-auto mt-2 mb-2"><code>`
      if (line.startsWith("|")) {
        const cells = line.split("|").filter(Boolean)
        const isHeader = cells.every(c => c.trim().match(/^-+$/))
        if (isHeader) return ""
        return `<tr class="border-b border-border last:border-0">${cells.map(c => `<td class="py-1 px-2 text-xs text-muted-foreground">${c.trim()}</td>`).join("")}</tr>`
      }
      if (line.trim() === "") return `<div class="h-1.5"></div>`
      return `<p class="text-sm text-muted-foreground">${line}</p>`
    })
    .join("\n")

  return (
    <div
      className="prose prose-sm max-w-none p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

type SaveState = "idle" | "saving" | "saved" | "error"

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/60">{hint}</p>}
    </div>
  )
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [content, setContent] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [source, setSource] = useState<AgentsMdResponse["source"]>("template")
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [projRes, agentsRes, wsRes] = await Promise.all([
      apiFetch(`/api/projects/${params.id}`),
      apiFetch(`/api/projects/${params.id}/agents-md`),
      apiFetch("/api/workspaces"),
    ])
    if (projRes.ok) setProject(await projRes.json())
    if (wsRes.ok) setWorkspaces(await wsRes.json())
    if (agentsRes.ok) {
      const data: AgentsMdResponse = await agentsRes.json()
      setContent(data.content)
      setOriginalContent(data.content)
      setSource(data.source)
    }
    setLoading(false)
  }, [params.id])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    setSaveState("saving")
    const res = await apiFetch(`/api/projects/${params.id}/agents-md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      setOriginalContent(content)
      setSource("db")
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 2000)
    } else {
      setSaveState("error")
      setTimeout(() => setSaveState("idle"), 3000)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isDirty = content !== originalContent

  // ── Settings form ──────────────────────────────────────────────────────────
  const [settingsForm, setSettingsForm] = useState({
    name: "", description: "", githubOwner: "", githubRepo: "",
    jiraUrl: "", jiraProject: "", slackChannel: "", repoPath: "", color: "",
    workspaceId: "",
  })
  const [settingsSaveState, setSettingsSaveState] = useState<SaveState>("idle")

  useEffect(() => {
    if (project) {
      setSettingsForm({
        name: project.name ?? "",
        description: project.description ?? "",
        githubOwner: project.githubOwner ?? "",
        githubRepo: project.githubRepo ?? "",
        jiraUrl: project.jiraUrl ?? "",
        jiraProject: project.jiraProject ?? "",
        slackChannel: project.slackChannel ?? "",
        repoPath: project.repoPath ?? "",
        color: project.color ?? "#6b7280",
        workspaceId: project.workspaceId ?? "",
      })
    }
  }, [project])

  async function handleSettingsSave() {
    setSettingsSaveState("saving")
    const res = await apiFetch(`/api/projects/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...settingsForm,
        workspaceId: settingsForm.workspaceId || null,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setProject(updated)
      setSettingsSaveState("saved")
      setTimeout(() => setSettingsSaveState("idle"), 2000)
    } else {
      setSettingsSaveState("error")
      setTimeout(() => setSettingsSaveState("idle"), 3000)
    }
  }

  const sourceLabel: Record<AgentsMdResponse["source"], string> = {
    db: "Saved locally",
    file: "Loaded from file",
    template: "Template — not yet saved",
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="ghost" asChild className="mt-2">
          <Link href="/projects"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-0.5 h-7 w-7">
            <Link href="/projects"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color ?? "#6b7280" }} />
              <h1 className="text-2xl font-bold">{project.name}</h1>
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{project.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              {project.githubRepo && (
                <a
                  href={`https://github.com/${project.githubOwner}/${project.githubRepo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  {project.githubOwner}/{project.githubRepo}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {project.jiraProject && (
                <span className="text-xs text-muted-foreground">{project.jiraProject}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: AGENTS.md · Settings */}
      <Tabs defaultValue="agents-md" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="agents-md" className="text-xs gap-1.5">
            <FileText className="h-3.5 w-3.5" /> AGENTS.md
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        {/* ── AGENTS.md tab ── */}
        <TabsContent value="agents-md" className="space-y-3 mt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge
                variant={source === "template" ? "secondary" : source === "db" ? "success" : "warning"}
                className="text-xs"
              >
                {sourceLabel[source]}
              </Badge>
              {isDirty && (
                <Badge variant="warning" className="text-xs">Unsaved changes</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button
                size="sm" className="h-7 text-xs gap-1.5"
                onClick={handleSave}
                disabled={!isDirty || saveState === "saving"}
              >
                {saveState === "saving" ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : saveState === "saved" ? <Check className="h-3 w-3" />
                  : <Save className="h-3 w-3" />}
                {saveState === "saved" ? "Saved!" : saveState === "error" ? "Error" : "Save"}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 text-primary flex-shrink-0" />
            <p>
              <span className="font-medium text-foreground">AGENTS.md</span> is read by AI agents before every mission run.
              Keep it concise and up-to-date — architecture, services, conventions, what agents should avoid.
            </p>
          </div>

          <Tabs defaultValue="edit">
            <TabsList className="h-8">
              <TabsTrigger value="edit" className="text-xs h-7 gap-1.5"><Pencil className="h-3 w-3" /> Edit</TabsTrigger>
              <TabsTrigger value="preview" className="text-xs h-7 gap-1.5"><Eye className="h-3 w-3" /> Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="edit" className="mt-2">
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                className={cn(
                  "w-full min-h-[520px] resize-y rounded-md border border-border bg-muted/30 p-4",
                  "font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                )}
                placeholder="# AGENTS.md&#10;&#10;Describe your project for AI agents..."
                spellCheck={false}
              />
            </TabsContent>
            <TabsContent value="preview" className="mt-2">
              <div className="min-h-[520px] rounded-md border border-border bg-muted/30 overflow-auto">
                {content.trim() ? <MarkdownPreview content={content} /> : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Nothing to preview yet.</div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── Settings tab ── */}
        <TabsContent value="settings" className="mt-0">
          <div className="space-y-6 max-w-xl">
            {/* Basic */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">General</h3>
              <div className="grid gap-3">
                <Field label="Project name">
                  <Input value={settingsForm.name} onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Description">
                  <Input value={settingsForm.description} onChange={e => setSettingsForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" />
                </Field>
                <Field label="Workspace" hint="Move this project to another workspace, or leave unassigned">
                  <select
                    value={settingsForm.workspaceId}
                    onChange={e => setSettingsForm(f => ({ ...f, workspaceId: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {workspaces.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settingsForm.color || "#6b7280"}
                      onChange={e => setSettingsForm(f => ({ ...f, color: e.target.value }))}
                      className="h-9 w-14 rounded border border-input bg-background cursor-pointer p-1"
                    />
                    <span className="text-xs font-mono text-muted-foreground">{settingsForm.color}</span>
                  </div>
                </Field>
                <Field label="Local repo path" hint="Used for git worktrees during missions">
                  <Input value={settingsForm.repoPath} onChange={e => setSettingsForm(f => ({ ...f, repoPath: e.target.value }))} placeholder="/Users/you/code/my-project" className="font-mono text-xs" />
                </Field>
              </div>
            </section>

            {/* GitHub */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5" /> GitHub
              </h3>
              <div className="grid gap-3">
                <Field label="Owner / org">
                  <Input value={settingsForm.githubOwner} onChange={e => setSettingsForm(f => ({ ...f, githubOwner: e.target.value }))} placeholder="my-org" className="font-mono text-xs" />
                </Field>
                <Field label="Repository">
                  <Input value={settingsForm.githubRepo} onChange={e => setSettingsForm(f => ({ ...f, githubRepo: e.target.value }))} placeholder="my-repo" className="font-mono text-xs" />
                </Field>
              </div>
            </section>

            {/* Jira */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide flex items-center gap-2">
                <ExternalLink className="h-3.5 w-3.5" /> Jira
              </h3>
              <div className="grid gap-3">
                <Field label="Base URL" hint="e.g. https://mycompany.atlassian.net">
                  <Input value={settingsForm.jiraUrl} onChange={e => setSettingsForm(f => ({ ...f, jiraUrl: e.target.value }))} placeholder="https://mycompany.atlassian.net" className="font-mono text-xs" />
                </Field>
                <Field label="Project key" hint="Ticket prefix, e.g. PLAT">
                  <Input value={settingsForm.jiraProject} onChange={e => setSettingsForm(f => ({ ...f, jiraProject: e.target.value }))} placeholder="PLAT" className="font-mono text-xs uppercase" />
                </Field>
              </div>
              {settingsForm.jiraUrl && settingsForm.jiraProject && (
                <p className="text-xs text-muted-foreground">
                  Tickets will link to <span className="font-mono text-foreground">{settingsForm.jiraUrl}/browse/{settingsForm.jiraProject}-123</span>
                </p>
              )}
            </section>

            {/* Slack */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide flex items-center gap-2">
                <Hash className="h-3.5 w-3.5" /> Slack
              </h3>
              <Field label="Channel name" hint="Without #, e.g. platform-api">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">#</span>
                  <Input
                    value={settingsForm.slackChannel.replace(/^#/, "")}
                    onChange={e => setSettingsForm(f => ({ ...f, slackChannel: e.target.value.replace(/^#/, "") }))}
                    placeholder="platform-api"
                    className="pl-6 font-mono text-xs"
                  />
                </div>
              </Field>
              {settingsForm.slackChannel && (
                <a
                  href={`https://slack.com/app_redirect?channel=${settingsForm.slackChannel.replace(/^#/, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Test link — open #{settingsForm.slackChannel.replace(/^#/, "")} in Slack
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </section>

            <Button
              onClick={handleSettingsSave}
              disabled={settingsSaveState === "saving"}
              className="gap-2"
            >
              {settingsSaveState === "saving" ? <RefreshCw className="h-4 w-4 animate-spin" />
                : settingsSaveState === "saved" ? <Check className="h-4 w-4" />
                : <Save className="h-4 w-4" />}
              {settingsSaveState === "saved" ? "Saved!" : settingsSaveState === "error" ? "Error saving" : "Save settings"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
