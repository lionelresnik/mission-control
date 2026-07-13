"use client"

import { useState, useEffect } from "react"
import { Plus, Layers, FolderGit2, X, Check, Loader2, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

type Project = {
  id: string
  name: string
  description: string | null
  color: string | null
  githubOwner: string | null
  githubRepo: string | null
  workspaceId: string | null
}

type Workspace = {
  id: string
  name: string
  description: string | null
  color: string
  repoPaths: string[]
  createdAt: string
  projects: Project[]
}

const COLORS = ["#8b5cf6","#3b82f6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#6b7280"]

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<Workspace | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Workspace | null>(null)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState(COLORS[0])
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])

  const load = async () => {
    const [ws, proj] = await Promise.all([
      fetch("/api/workspaces").then(r => r.json()),
      fetch("/api/projects").then(r => r.json()),
    ])
    setWorkspaces(ws)
    setAllProjects(proj)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setIsNew(true)
    setName("")
    setDescription("")
    setColor(COLORS[0])
    setSelectedProjectIds([])
    setSaved(false)
  }

  const openEdit = (ws: Workspace) => {
    setEditing(ws)
    setIsNew(false)
    setName(ws.name)
    setDescription(ws.description ?? "")
    setColor(ws.color ?? COLORS[0])
    setSelectedProjectIds(ws.projects.map(p => p.id))
    setSaved(false)
  }

  const closeForm = () => { setEditing(null); setIsNew(false) }

  const toggleProject = (pid: string) => {
    setSelectedProjectIds(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (isNew) {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, color, projectIds: selectedProjectIds }),
        })
        const created = await res.json()
        setWorkspaces(prev => [...prev, created])
        // Update local project workspaceIds
        setAllProjects(prev => prev.map(p =>
          selectedProjectIds.includes(p.id) ? { ...p, workspaceId: created.id } : p
        ))
      } else if (editing) {
        const prevIds = editing.projects.map(p => p.id)
        const addProjectIds = selectedProjectIds.filter(id => !prevIds.includes(id))
        const removeProjectIds = prevIds.filter(id => !selectedProjectIds.includes(id))
        await fetch(`/api/workspaces/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, color, addProjectIds, removeProjectIds }),
        })
        await load()
      }
      setSaved(true)
      setTimeout(() => { setSaved(false); closeForm() }, 700)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ws: Workspace) => {
    await fetch(`/api/workspaces/${ws.id}`, { method: "DELETE" })
    setWorkspaces(prev => prev.filter(w => w.id !== ws.id))
    setAllProjects(prev => prev.map(p => p.workspaceId === ws.id ? { ...p, workspaceId: null } : p))
    if (editing?.id === ws.id) closeForm()
  }

  const unassignedProjects = allProjects.filter(p => !p.workspaceId)
  const showForm = isNew || editing !== null

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Workspaces</h1>
            <p className="text-sm text-muted-foreground">
              {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""} · {allProjects.length} projects total
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> New Workspace
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {workspaces.map(ws => (
              <Card key={ws.id} className={cn("transition-colors", editing?.id === ws.id ? "border-primary" : "hover:border-primary/30")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                        style={{ backgroundColor: `${ws.color}20`, color: ws.color }}>
                        <Layers className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{ws.name}</h3>
                        {ws.description && <p className="text-xs text-muted-foreground mt-0.5">{ws.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(ws)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(ws)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setExpanded(expanded === ws.id ? null : ws.id)}>
                        {expanded === ws.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <FolderGit2 className="h-3 w-3" />
                    <span>{ws.projects.length} project{ws.projects.length !== 1 ? "s" : ""}</span>
                  </div>

                  {expanded === ws.id && (
                    <div className="mt-3 space-y-1.5">
                      {ws.projects.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No projects assigned yet</p>
                      ) : ws.projects.map(p => (
                        <div key={p.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
                          <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? "#6b7280" }} />
                          <span className="text-xs font-medium">{p.name}</span>
                          {p.githubOwner && p.githubRepo && (
                            <span className="text-xs text-muted-foreground ml-auto font-mono">{p.githubOwner}/{p.githubRepo}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {workspaces.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No workspaces yet</p>
                <p className="text-xs mt-1">Create one to group your projects and enable multi-repo missions</p>
              </div>
            )}

            {unassignedProjects.length > 0 && (
              <div className="border border-dashed rounded-lg p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Unassigned projects ({unassignedProjects.length})</p>
                <div className="flex flex-wrap gap-2">
                  {unassignedProjects.map(p => (
                    <Badge key={p.id} variant="outline" className="text-xs gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color ?? "#6b7280" }} />
                      {p.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Form panel */}
      {showForm && (
        <div className="w-96 flex-shrink-0 border-l border-border overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-4 py-3">
            <span className="font-semibold text-sm">{isNew ? "New Workspace" : `Edit ${editing?.name}`}</span>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Platform Team" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="All platform repos" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={cn("h-6 w-6 rounded-full border-2 transition-all",
                      color === c ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Projects</label>
              <div className="rounded-md border border-input divide-y divide-border max-h-64 overflow-y-auto">
                {allProjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">No projects yet. Create projects first.</p>
                ) : allProjects.map(p => {
                  const selected = selectedProjectIds.includes(p.id)
                  const otherWs = workspaces.find(w => w.id === p.workspaceId && w.id !== editing?.id)
                  return (
                    <button key={p.id} type="button" onClick={() => !otherWs && toggleProject(p.id)}
                      disabled={!!otherWs}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                        selected ? "bg-primary/5" : otherWs ? "opacity-40 cursor-not-allowed" : "hover:bg-accent"
                      )}>
                      <div className={cn("h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                        {selected && <Check className="h-2.5 w-2.5" />}
                      </div>
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? "#6b7280" }} />
                      <span className="text-xs font-medium flex-1">{p.name}</span>
                      {otherWs && <span className="text-xs text-muted-foreground">{otherWs.name}</span>}
                      {p.githubRepo && <span className="text-xs text-muted-foreground font-mono">{p.githubRepo}</span>}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">A project can belong to one workspace at a time</p>
            </div>

            <Button onClick={handleSave} disabled={saving || !name.trim()} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
              {saving ? "Saving…" : saved ? "Saved!" : isNew ? "Create Workspace" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete "${confirmDelete?.name}"?`}
        description="Projects will be unassigned but not deleted. Missions scoped to this workspace will remain."
        onConfirm={() => { if (confirmDelete) handleDelete(confirmDelete); setConfirmDelete(null) }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
