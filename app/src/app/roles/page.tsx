"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Cpu, Shield, TestTube, Code, FileText, Layers, X, Loader2, Check } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const iconMap: Record<string, React.ReactNode> = {
  Layers:   <Layers className="h-5 w-5" />,
  Code:     <Code className="h-5 w-5" />,
  TestTube: <TestTube className="h-5 w-5" />,
  Shield:   <Shield className="h-5 w-5" />,
  FileText: <FileText className="h-5 w-5" />,
  Cpu:      <Cpu className="h-5 w-5" />,
}

const MODELS = ["claude-sonnet", "claude-opus", "claude-haiku", "gpt-4o", "gpt-4o-mini", "gemini-pro", "gemini-flash"]

const AVAILABLE_TOOLS = [
  { id: "read_file",       label: "read_file",       desc: "Read files from the repo" },
  { id: "write_file",      label: "write_file",      desc: "Write / modify files" },
  { id: "run_command",     label: "run_command",     desc: "Execute shell commands" },
  { id: "run_tests",       label: "run_tests",       desc: "Run test suites" },
  { id: "search_codebase", label: "search_codebase", desc: "Semantic search over code" },
  { id: "read_knowledge",  label: "read_knowledge",  desc: "Query the knowledge base" },
  { id: "git",             label: "git",             desc: "Git operations (commit, diff, log)" },
  { id: "create_issue",    label: "create_issue",    desc: "Create Jira / GitHub issues" },
  { id: "create_plan",     label: "create_plan",     desc: "Break goals into subtasks" },
  { id: "log_assumption",  label: "log_assumption",  desc: "Record assumptions to KB" },
]

type Role = {
  id: string
  name: string
  displayName: string
  description: string | null
  systemPrompt: string
  tools: string[] | null
  allowedActions: string[] | null
  temperature: number | null
  model: string | null
  memoryScope: string | null
  isBuiltIn: boolean | null
  icon: string | null
  color: string | null
}

const BLANK_ROLE: Role = {
  id: "__new__",
  name: "", displayName: "", description: null,
  systemPrompt: "You are a specialized AI agent. Your job is to:\n1. \n2. \n\nOutput your results in a clear, structured format.",
  tools: [], allowedActions: [], temperature: 0.7,
  model: "claude-sonnet", memoryScope: "mission",
  isBuiltIn: false, icon: "Cpu", color: "#6b7280",
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Role | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Edit form state
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [model, setModel] = useState("")
  const [temperature, setTemperature] = useState("")
  const [memoryScope, setMemoryScope] = useState("")
  const [color, setColor] = useState("#6b7280")
  const [selectedTools, setSelectedTools] = useState<string[]>([])

  const load = async () => {
    const data = await fetch("/api/roles").then(r => r.json())
    setRoles(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openEdit = (role: Role) => {
    setEditing(role)
    setIsNew(false)
    setDisplayName(role.displayName)
    setDescription(role.description ?? "")
    setSystemPrompt(role.systemPrompt)
    setModel(role.model ?? "claude-sonnet")
    setTemperature(String(role.temperature ?? 0.7))
    setMemoryScope(role.memoryScope ?? "mission")
    setColor(role.color ?? "#6b7280")
    setSelectedTools((role.tools ?? []) as string[])
    setSaved(false)
  }

  const openNew = () => {
    setEditing(BLANK_ROLE)
    setIsNew(true)
    setDisplayName("")
    setDescription("")
    setSystemPrompt(BLANK_ROLE.systemPrompt)
    setModel("claude-sonnet")
    setTemperature("0.7")
    setMemoryScope("mission")
    setColor("#6b7280")
    setSelectedTools([])
    setSaved(false)
  }

  const toggleTool = (toolId: string) => {
    setSelectedTools(prev =>
      prev.includes(toolId) ? prev.filter(t => t !== toolId) : [...prev, toolId]
    )
  }

  const closeEdit = () => {
    setEditing(null)
    setIsNew(false)
    setSaved(false)
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      if (isNew) {
        const name = displayName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        const res = await fetch("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, displayName, description, systemPrompt, model, temperature: parseFloat(temperature), memoryScope, color, isBuiltIn: false, icon: "Cpu", tools: selectedTools }),
        })
        const created = await res.json()
        setRoles(prev => [...prev, created])
        setSaved(true)
        setTimeout(() => { setSaved(false); closeEdit() }, 800)
      } else {
        const res = await fetch(`/api/roles/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName, description, systemPrompt, model, temperature: parseFloat(temperature), memoryScope, color, tools: selectedTools }),
        })
        const updated = await res.json()
        setRoles(prev => prev.map(r => r.id === updated.id ? updated : r))
        setSaved(true)
        setTimeout(() => { setSaved(false); closeEdit() }, 800)
      }
    } finally {
      setSaving(false)
    }
  }

  const builtIn = roles.filter(r => r.isBuiltIn)
  const custom  = roles.filter(r => !r.isBuiltIn)

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Roles</h1>
            <p className="text-sm text-muted-foreground">
              {roles.length} roles · {builtIn.length} built-in{custom.length > 0 ? ` · ${custom.length} custom` : ""}
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> New Role
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {roles.map(role => {
              const tools   = (role.tools ?? []) as string[]
              const actions = (role.allowedActions ?? []) as string[]
              const isActive = editing?.id === role.id

              return (
                <Card key={role.id} className={cn("transition-colors", isActive ? "border-primary" : "hover:border-primary/30")}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                          style={{ backgroundColor: `${role.color ?? "#6b7280"}20`, color: role.color ?? "#6b7280" }}
                        >
                          {iconMap[role.icon ?? ""] ?? <Cpu className="h-5 w-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">{role.displayName}</h3>
                            {role.isBuiltIn && <Badge variant="outline" className="text-xs">Built-in</Badge>}
                          </div>
                          {role.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon" variant={isActive ? "default" : "ghost"}
                        className="h-7 w-7 flex-shrink-0"
                        onClick={() => isActive ? closeEdit() : openEdit(role)}
                      >
                        {isActive ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                      </Button>
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Model: <span className="text-foreground">{role.model ?? "claude-sonnet"}</span></span>
                      <span>·</span>
                      <span>Temp: <span className="text-foreground">{role.temperature ?? 0.7}</span></span>
                      <span>·</span>
                      <span>{tools.length} tools</span>
                      <span>·</span>
                      <span className="capitalize">{role.memoryScope ?? "mission"} memory</span>
                    </div>

                    {tools.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tools.map(t => (
                          <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit panel — slides in from right */}
      {editing && (
        <div className="w-96 flex-shrink-0 border-l border-border overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-4 py-3">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ backgroundColor: `${editing.color ?? "#6b7280"}20`, color: editing.color ?? "#6b7280" }}
              >
                {iconMap[editing.icon ?? ""] ?? <Cpu className="h-4 w-4" />}
              </div>
              <span className="font-semibold text-sm">{isNew ? "New Role" : `Edit ${editing.displayName}`}</span>
            </div>
            <button onClick={closeEdit} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Display name</label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="One-line description" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={e => setColor(e.target.value)}
                    className="h-9 w-14 rounded border border-input bg-background cursor-pointer p-1" />
                  <span className="text-xs font-mono text-muted-foreground">{color}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">System prompt</label>
              <Textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                className="min-h-[200px] font-mono text-xs"
                placeholder="You are the..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                >
                  {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Temperature (0–1)</label>
                <Input
                  type="number" min="0" max="1" step="0.1"
                  value={temperature}
                  onChange={e => setTemperature(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Memory scope</label>
              <div className="flex gap-2">
                {["mission", "project", "global"].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setMemoryScope(s)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                      memoryScope === s ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent text-muted-foreground"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {memoryScope === "mission" && "Only sees context from this mission"}
                {memoryScope === "project" && "Can access all knowledge from the project"}
                {memoryScope === "global" && "Can access knowledge across all projects"}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Tools</label>
                {selectedTools.length > 0 && (
                  <span className="text-xs text-muted-foreground">{selectedTools.length} selected</span>
                )}
              </div>
              <div className="rounded-md border border-input divide-y divide-border">
                {AVAILABLE_TOOLS.map(tool => {
                  const active = selectedTools.includes(tool.id)
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleTool(tool.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                        active ? "bg-primary/5" : "hover:bg-accent"
                      )}
                    >
                      <div className={cn(
                        "h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      )}>
                        {active && <Check className="h-2.5 w-2.5" />}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-mono font-medium">{tool.label}</span>
                        <p className="text-xs text-muted-foreground truncate">{tool.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
