"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Brain, Plus, CheckCircle2, AlertTriangle, Search, X, Loader2, Sparkles, Zap, ChevronDown, ChevronUp, Pencil, Trash2, Check, ChevronRight, Layers } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

type KnowledgeType = "architecture" | "pattern" | "adr" | "standard" | "database" | "infrastructure" | "logs" | "services" | "runbook" | "other"
type Confidence = "confirmed" | "assumed" | "investigating"

type Entry = {
  id: string; title: string; type: KnowledgeType; content: string
  confidence: Confidence; projectId: string | null; workspaceId?: string | null
  updatedAt: string | null
  sourceMissionId: string | null; tags: string[] | null
}

type Project = { id: string; name: string; color: string | null; workspaceId?: string | null }
type Workspace = { id: string; name: string; color: string; projects: Array<{ id: string }> }

const typeColors: Record<KnowledgeType, string> = {
  architecture: "bg-blue-500/20 text-blue-400",
  pattern: "bg-purple-500/20 text-purple-400",
  adr: "bg-indigo-500/20 text-indigo-400",
  standard: "bg-cyan-500/20 text-cyan-400",
  database: "bg-green-500/20 text-green-400",
  infrastructure: "bg-orange-500/20 text-orange-400",
  logs: "bg-yellow-500/20 text-yellow-400",
  services: "bg-pink-500/20 text-pink-400",
  runbook: "bg-teal-500/20 text-teal-400",
  other: "bg-gray-500/20 text-gray-400",
}

const confidenceIcon: Record<Confidence, React.ReactNode> = {
  confirmed:    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  assumed:      <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />,
  investigating: <Search className="h-3.5 w-3.5 text-blue-400" />,
}

const knowledgeTypes: KnowledgeType[] = ["architecture", "pattern", "database", "infrastructure", "services", "logs", "runbook", "adr", "standard", "other"]

// ─── Entry card (needs page-level state passed via ctx) ──────────────────────
type CardCtx = {
  expandedId: string | null; setExpandedId: (id: string | null) => void
  editingId: string | null
  editTitle: string; setEditTitle: (v: string) => void
  editContent: string; setEditContent: (v: string) => void
  editType: KnowledgeType; setEditType: (v: KnowledgeType) => void
  editConfidence: Confidence; setEditConfidence: (v: Confidence) => void
  editTags: string; setEditTags: (v: string) => void
  editSaving: boolean
  handleSaveEdit: (id: string) => void
  setEditingId: (id: string | null) => void
  startEdit: (e: Entry) => void
  handleDelete: (id: string) => void
  setDeleteTarget: (e: Entry | null) => void
  handleConfirm: (id: string) => void
}

let _ctx: CardCtx | null = null

function EntryCard({ entry, project }: { entry: Entry & { _score?: number | null }; project: Project | undefined }) {
  const ctx = _ctx!
  const isExpanded = ctx.expandedId === entry.id
  const isEditing = ctx.editingId === entry.id
  const score = entry._score ?? null

  return (
    <Card
      className={cn("transition-colors", isExpanded ? "border-primary/40" : "hover:border-primary/30 cursor-pointer")}
      onClick={() => !isEditing && ctx.setExpandedId(isExpanded ? null : entry.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {confidenceIcon[entry.confidence]}
              {isEditing ? (
                <Input
                  className="h-7 text-sm font-medium flex-1"
                  value={ctx.editTitle}
                  onChange={e => ctx.setEditTitle(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="font-medium text-sm">{entry.title}</span>
              )}
              {score !== null && (
                <span className="text-[10px] font-mono text-primary/60 bg-primary/10 rounded px-1">
                  {Math.round(score * 100)}% match
                </span>
              )}
            </div>
            {!isExpanded && (
              <p className="text-xs text-muted-foreground font-mono line-clamp-2 whitespace-pre-wrap">{entry.content}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {project && activeProjectId_ref === "all" && (
                <>
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color ?? "#6b7280" }} />
                  <span className="text-xs text-muted-foreground">{project.name}</span>
                </>
              )}
              {!project && entry.workspaceId && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Workspace-wide
                </span>
              )}
              {entry.sourceMissionId && <span className="text-xs text-muted-foreground">· from mission</span>}
              {entry.updatedAt && <span className="text-xs text-muted-foreground">· {entry.updatedAt.slice(0, 10)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {isEditing ? (
              <>
                <select
                  value={ctx.editType}
                  onChange={e => ctx.setEditType(e.target.value as KnowledgeType)}
                  className="h-7 rounded border border-input bg-background px-2 text-xs"
                >
                  {knowledgeTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex items-center gap-0.5 rounded border border-input bg-background p-0.5">
                  {(["confirmed", "assumed", "investigating"] as Confidence[]).map(c => (
                    <button
                      key={c} title={c}
                      onClick={() => ctx.setEditConfidence(c)}
                      className={cn(
                        "flex items-center gap-1 rounded px-2 h-6 text-xs transition-colors",
                        ctx.editConfidence === c ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {confidenceIcon[c]}
                      <span className="hidden sm:inline">{c}</span>
                    </button>
                  ))}
                </div>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => ctx.handleSaveEdit(entry.id)} disabled={ctx.editSaving}>
                  {ctx.editSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => ctx.setEditingId(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <span className={cn("rounded px-2 py-0.5 text-xs font-medium", typeColors[entry.type])}>{entry.type}</span>
                {entry.confidence === "assumed" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => ctx.handleConfirm(entry.id)}>
                    Confirm
                  </Button>
                )}
                {isExpanded && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => ctx.startEdit(entry)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => ctx.setDeleteTarget(entry)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
                <button
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  onClick={e => { e.stopPropagation(); ctx.setExpandedId(isExpanded ? null : entry.id) }}
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </>
            )}
          </div>
        </div>
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-2" onClick={e => e.stopPropagation()}>
            {isEditing ? (
              <>
                <Textarea
                  className="text-xs font-mono min-h-[120px]"
                  value={ctx.editContent}
                  onChange={e => ctx.setEditContent(e.target.value)}
                />
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Tags <span className="opacity-60">(comma or space separated)</span></label>
                  <Input
                    className="h-7 text-xs"
                    placeholder="postgres, auth, production"
                    value={ctx.editTags}
                    onChange={e => ctx.setEditTags(e.target.value)}
                  />
                  {ctx.editTags && (
                    <div className="flex flex-wrap gap-1">
                      {ctx.editTags.split(/[,\s]+/).map(t => t.trim().replace(/^#/, "")).filter(Boolean).map(tag => (
                        <span key={tag} className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words bg-muted/30 rounded p-3 leading-relaxed">
                {entry.content}
              </pre>
            )}
            {!isEditing && entry.tags && entry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {entry.tags.map(tag => (
                  <span key={tag} className="text-[10px] bg-secondary text-secondary-foreground rounded px-1.5 py-0.5">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

let activeProjectId_ref: string = "all"

export default function KnowledgePage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | "all">("all")
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<KnowledgeType | "">("")
  const [activeProjectId, setActiveProjectId] = useState<string | "all">("all")
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)
  const [semanticMode, setSemanticMode] = useState(false)
  const [semanticResults, setSemanticResults] = useState<(Entry & { _score: number | null; _mode: string })[] | null>(null)
  const [semanticLoading, setSemanticLoading] = useState(false)
  const [embedStatus, setEmbedStatus] = useState<{ total: number; embedded: number; missing: number } | null>(null)
  const [embedding, setEmbedding] = useState(false)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // New entry form state
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [newType, setNewType] = useState<KnowledgeType>("architecture")
  const [newConfidence, setNewConfidence] = useState<Confidence>("confirmed")
  const [newProjectId, setNewProjectId] = useState("")
  const [newWorkspaceId, setNewWorkspaceId] = useState("")
  const [newScope, setNewScope] = useState<"project" | "workspace">("project")
  const [newTags, setNewTags] = useState("")
  const [saving, setSaving] = useState(false)

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null)

  // Expanded / edit state
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")
  const [editType, setEditType] = useState<KnowledgeType>("architecture")
  const [editConfidence, setEditConfidence] = useState<Confidence>("confirmed")
  const [editTags, setEditTags] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  const load = useCallback(async () => {
    const [e, p, w] = await Promise.all([
      apiFetch("/api/knowledge").then(r => r.json()),
      apiFetch("/api/projects").then(r => r.json()),
      apiFetch("/api/workspaces").then(r => r.json()),
    ])
    setEntries(e)
    setProjects(p)
    setWorkspaces(w)
    setWorkspaces(w)
    if (p.length > 0 && !newProjectId) setNewProjectId(p[0].id)
    if (w.length > 0 && !newWorkspaceId) setNewWorkspaceId(w[0].id)
    setLoading(false)
  }, [newProjectId, newWorkspaceId])

  useEffect(() => { load() }, [load])

  // Load embed status once
  useEffect(() => {
    apiFetch("/api/knowledge/embed").then(r => r.json()).then(setEmbedStatus).catch(() => {})
  }, [entries.length])

  // Semantic search debounce
  useEffect(() => {
    if (!semanticMode || !search.trim()) { setSemanticResults(null); return }
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(async () => {
      setSemanticLoading(true)
      try {
        const res = await apiFetch("/api/knowledge/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: search }),
        })
        const data = await res.json()
        setSemanticResults(Array.isArray(data) ? data : [])
      } finally {
        setSemanticLoading(false)
      }
    }, 500)
  }, [search, semanticMode])

  async function handleEmbedAll() {
    setEmbedding(true)
    try {
      const res = await apiFetch("/api/knowledge/embed", { method: "POST" })
      const data = await res.json()
      setEmbedStatus(prev => prev ? { ...prev, embedded: prev.total, missing: 0 } : prev)
      alert(`Embedded ${data.embedded} entries${data.failed ? ` (${data.failed} failed — check OpenAI key)` : ""}`)
    } finally {
      setEmbedding(false)
    }
  }

  const projectById = Object.fromEntries(projects.map(p => [p.id, p]))

  // Workspace-scoped project IDs
  const wsProjectIds = activeWorkspaceId !== "all"
    ? new Set((workspaces.find(w => w.id === activeWorkspaceId)?.projects ?? []).map(p => p.id))
    : null

  const visibleProjects = wsProjectIds
    ? projects.filter(p => wsProjectIds.has(p.id))
    : projects

  const filtered = semanticMode && semanticResults !== null
    ? semanticResults
    : entries.filter(e => {
        const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.content.toLowerCase().includes(search.toLowerCase())
        const matchType = !filterType || e.type === filterType
        const matchProject = activeProjectId === "all" || e.projectId === activeProjectId
        const matchWorkspace = activeWorkspaceId === "all"
          || e.workspaceId === activeWorkspaceId
          || (e.projectId != null && wsProjectIds?.has(e.projectId))
        return matchSearch && matchType && matchProject && matchWorkspace
      })

  // Group entries by project for "all" view
  const grouped: { project: Project; entries: typeof filtered }[] = activeProjectId === "all" && activeWorkspaceId === "all" && !search && !semanticMode
    ? visibleProjects
        .map(p => ({ project: p, entries: filtered.filter(e => e.projectId === p.id) }))
        .filter(g => g.entries.length > 0)
    : []

  const showGrouped = grouped.length > 0

  const assumed = entries.filter(e => e.confidence === "assumed")

  const toggleProjectCollapse = (pid: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev)
      next.has(pid) ? next.delete(pid) : next.add(pid)
      return next
    })
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle || !newContent) return
    if (newScope === "project" && !newProjectId) return
    if (newScope === "workspace" && !newWorkspaceId) return
    setSaving(true)
    try {
      const tags = newTags.split(/[,\s]+/).map(t => t.trim().replace(/^#/, "")).filter(Boolean)
      await apiFetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          type: newType,
          confidence: newConfidence,
          projectId: newScope === "project" ? newProjectId : undefined,
          workspaceId: newScope === "workspace" ? newWorkspaceId : undefined,
          tags,
        }),
      })
      setNewTitle(""); setNewContent(""); setNewTags(""); setShowAdd(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (entry: Entry) => {
    setEditingId(entry.id)
    setEditTitle(entry.title)
    setEditContent(entry.content)
    setEditType(entry.type)
    setEditConfidence(entry.confidence)
    setEditTags((entry.tags ?? []).join(", "))
    setExpandedId(entry.id)
  }

  const handleSaveEdit = async (id: string) => {
    setEditSaving(true)
    const tags = editTags.split(/[,\s]+/).map(t => t.trim().replace(/^#/, "")).filter(Boolean)
    try {
      await apiFetch(`/api/knowledge/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, content: editContent, type: editType, confidence: editConfidence, tags }),
      })
      setEntries(prev => prev.map(e => e.id === id
        ? { ...e, title: editTitle, content: editContent, type: editType, confidence: editConfidence, tags }
        : e
      ))
      setEditingId(null)
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/knowledge/${id}`, { method: "DELETE" })
    setEntries(prev => prev.filter(e => e.id !== id))
    if (expandedId === id) setExpandedId(null)
    setDeleteTarget(null)
  }

  const handleConfirm = async (id: string) => {
    await apiFetch(`/api/knowledge/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confidence: "confirmed" }),
    })
    setEntries(prev => prev.map(e => e.id === id ? { ...e, confidence: "confirmed" } : e))
  }

  // Wire module-level refs so EntryCard can read them without prop-drilling
  activeProjectId_ref = activeProjectId
  _ctx = {
    expandedId, setExpandedId,
    editingId, editTitle, setEditTitle, editContent, setEditContent,
    editType, setEditType, editConfidence, setEditConfidence,
    editTags, setEditTags,
    editSaving, handleSaveEdit, setEditingId, startEdit,
    handleDelete, setDeleteTarget, handleConfirm,
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">
            {entries.length} entries{assumed.length > 0 ? ` · ${assumed.length} assumed` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {assumed.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => setFilterType(filterType === "" ? "architecture" : "")}>
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              {assumed.length} assumed
            </Button>
          )}
          <Button onClick={() => setShowAdd(v => !v)} className="gap-2">
            {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAdd ? "Cancel" : "Add entry"}
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Title *" value={newTitle} onChange={e => setNewTitle(e.target.value)} required />
                <div className="flex gap-2">
                  <select
                    value={newScope}
                    onChange={e => setNewScope(e.target.value as "project" | "workspace")}
                    className="flex h-10 rounded-md border border-input bg-background px-2 py-2 text-sm w-28"
                  >
                    <option value="project">Project</option>
                    <option value="workspace">Workspace</option>
                  </select>
                  {newScope === "project" ? (
                    <select
                      value={newProjectId}
                      onChange={e => setNewProjectId(e.target.value)}
                      className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <select
                      value={newWorkspaceId}
                      onChange={e => setNewWorkspaceId(e.target.value)}
                      className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <Textarea placeholder="Content — commands, connections, architecture notes, etc. *" value={newContent} onChange={e => setNewContent(e.target.value)} className="min-h-[80px]" required />
              <Input placeholder="Tags (comma separated) — optional" value={newTags} onChange={e => setNewTags(e.target.value)} className="text-xs" />
              <div className="flex gap-3">
                <select value={newType} onChange={e => setNewType(e.target.value as KnowledgeType)}
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {knowledgeTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex items-center gap-0.5 rounded-md border border-input bg-background p-1">
                  {(["confirmed", "assumed", "investigating"] as Confidence[]).map(c => (
                    <button
                      type="button"
                      key={c}
                      title={c}
                      onClick={() => setNewConfidence(c)}
                      className={cn(
                        "flex items-center gap-1.5 rounded px-2.5 h-7 text-xs transition-colors",
                        newConfidence === c
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {confidenceIcon[c]}
                      {c}
                    </button>
                  ))}
                </div>
                <Button type="submit" disabled={saving || !newTitle || !newContent}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Semantic search status banner */}
      {embedStatus && embedStatus.missing > 0 && (
        <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>{embedStatus.embedded}/{embedStatus.total} entries embedded for semantic search</span>
          </div>
          <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handleEmbedAll} disabled={embedding}>
            {embedding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            {embedding ? "Embedding…" : "Embed all"}
          </Button>
        </div>
      )}

      {/* Workspace tabs */}
      {workspaces.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 -mb-1">
          <button
            onClick={() => { setActiveWorkspaceId("all"); setActiveProjectId("all"); setCollapsedProjects(new Set()) }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
              activeWorkspaceId === "all"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <Layers className="h-3 w-3" />
            All workspaces
          </button>
          {workspaces.map(w => {
            const count = entries.filter(e =>
              e.workspaceId === w.id || w.projects.some(p => p.id === e.projectId)
            ).length
            if (count === 0) return null
            return (
              <button
                key={w.id}
                onClick={() => { setActiveWorkspaceId(w.id); setActiveProjectId("all") }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
                  activeWorkspaceId === w.id
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
                {w.name}
                <span className="ml-0.5 text-muted-foreground font-normal">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Project tabs */}
      {visibleProjects.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 -mb-1">
          <button
            onClick={() => { setActiveProjectId("all"); setCollapsedProjects(new Set()) }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
              activeProjectId === "all"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <Layers className="h-3 w-3" />
            All projects
            <span className="ml-0.5 text-muted-foreground font-normal">({filtered.length})</span>
          </button>
          {visibleProjects.map(p => {
            const count = entries.filter(e => e.projectId === p.id).length
            if (count === 0) return null
            return (
              <button
                key={p.id}
                onClick={() => setActiveProjectId(p.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
                  activeProjectId === p.id
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? "#6b7280" }} />
                {p.name}
                <span className="ml-0.5 text-muted-foreground font-normal">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          {semanticLoading
            ? <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary animate-spin" />
            : <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          }
          <Input
            className="pl-9"
            placeholder={semanticMode ? "Ask anything — semantic search…" : "Search knowledge…"}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {!semanticMode && (
          <select value={filterType} onChange={e => setFilterType(e.target.value as KnowledgeType | "")}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">All types</option>
            {knowledgeTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <button
          onClick={() => { setSemanticMode(v => !v); setSearch(""); setSemanticResults(null) }}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors",
            semanticMode
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          )}
          title={semanticMode ? "Switch to text search" : "Switch to semantic search (requires OpenAI key)"}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {semanticMode ? "Semantic" : "Semantic"}
        </button>
      </div>

      {/* Semantic mode results indicator */}
      {semanticMode && semanticResults !== null && (
        <p className="text-xs text-muted-foreground">
          {semanticResults.length > 0
            ? <>Found <span className="font-medium text-foreground">{semanticResults.length}</span> relevant entries · {(semanticResults[0] as Entry & { _mode: string })?._mode === "semantic" ? "🧠 semantic" : "🔤 text fallback"}</>
            : "No relevant entries found"
          }
        </p>
      )}

      {/* Entries */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Brain className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">{entries.length === 0 ? "No entries yet" : "No matching entries"}</p>
          {entries.length === 0 && <Button className="mt-4 gap-2" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" />Add first entry</Button>}
        </div>
      ) : (
        <div className="space-y-6">
          {showGrouped
            ? grouped.map(({ project, entries: groupEntries }) => {
                const isCollapsed = collapsedProjects.has(project.id)
                const assumedCount = groupEntries.filter(e => e.confidence === "assumed").length
                return (
                  <div key={project.id}>
                    {/* Project section header */}
                    <button
                      className="flex items-center gap-2 w-full text-left mb-2 group"
                      onClick={() => toggleProjectCollapse(project.id)}
                    >
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color ?? "#6b7280" }} />
                      <span className="text-sm font-semibold">{project.name}</span>
                      <span className="text-xs text-muted-foreground">{groupEntries.length} entries</span>
                      {assumedCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-yellow-400/80">
                          <AlertTriangle className="h-3 w-3" />{assumedCount} assumed
                        </span>
                      )}
                      <ChevronRight className={cn(
                        "h-3.5 w-3.5 text-muted-foreground/50 ml-auto transition-transform",
                        !isCollapsed && "rotate-90"
                      )} />
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-2 pl-4 border-l-2" style={{ borderColor: project.color ?? "#374151" }}>
                        {groupEntries.map(entry => <EntryCard key={entry.id} entry={entry} project={project} />)}
                      </div>
                    )}
                  </div>
                )
              })
            : filtered.map(entry => {
                const project = entry.projectId ? projectById[entry.projectId] : undefined
                return <EntryCard key={entry.id} entry={entry} project={project} />
              })
          }
        </div>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete knowledge entry?"
        itemName={deleteTarget?.title}
        itemMeta={deleteTarget ? `Type: ${deleteTarget.type} · Confidence: ${deleteTarget.confidence}` : undefined}
        description="This will permanently remove the entry and its embedding from the knowledge base."
        confirmLabel="Delete entry"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
