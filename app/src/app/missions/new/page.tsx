"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Crosshair, MessageSquare, FileText, Clock, Layers, FolderOpen, LayoutGrid, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type AgentBehavior = "assume_and_document" | "ask_me" | "async"

const behaviorOptions = [
  { id: "assume_and_document" as AgentBehavior, label: "Assume & document", description: "Never pauses. Logs every assumption for your review at the end.", icon: <FileText className="h-4 w-4" /> },
  { id: "ask_me" as AgentBehavior, label: "Ask me", description: "Pauses when stuck and asks you up to 3 questions before continuing.", icon: <MessageSquare className="h-4 w-4" /> },
  { id: "async" as AgentBehavior, label: "Async", description: "Logs questions without blocking. Answer when you have time.", icon: <Clock className="h-4 w-4" /> },
]

type Project = { id: string; name: string; color: string | null; workspaceId: string | null }
type Team = { id: string; name: string; members: { roleId: string; order: number }[] }
type Workspace = { id: string; name: string; color: string; projects: Project[] }

type ScopeMode = "workspace" | "multi" | "project"

const scopeModes: { id: ScopeMode; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: "workspace", label: "Workspace",      desc: "All repos in a workspace",        icon: <Layers className="h-4 w-4" /> },
  { id: "multi",     label: "Multi-project",  desc: "Pick specific repos ad-hoc",      icon: <LayoutGrid className="h-4 w-4" /> },
  { id: "project",   label: "Single project", desc: "One repo",                        icon: <FolderOpen className="h-4 w-4" /> },
]

export default function NewMissionPage() {
  const router = useRouter()
  const [goal, setGoal] = useState("")
  const [ticketId, setTicketId] = useState("")
  const [teamId, setTeamId] = useState("")
  const [behavior, setBehavior] = useState<AgentBehavior>("assume_and_document")
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [scopeMode, setScopeMode] = useState<ScopeMode>("project")
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("")
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())
  const [selectedProjectId, setSelectedProjectId] = useState("")

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then(r => r.json()),
      fetch("/api/workspaces").then(r => r.json()),
      fetch("/api/crews").then(r => r.json()),
    ]).then(([p, w, t]) => { setProjects(p); setWorkspaces(w); setTeams(t) })
  }, [])

  const toggleMultiProject = (id: string) => {
    setSelectedProjectIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const canSubmit = goal && (
    scopeMode === "workspace" ? !!selectedWorkspaceId :
    scopeMode === "multi" ? selectedProjectIds.size > 0 :
    !!selectedProjectId
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError("")
    try {
      const workspaceProjects = scopeMode === "workspace"
        ? workspaces.find(w => w.id === selectedWorkspaceId)?.projects ?? []
        : []

      const primaryProjectId =
        scopeMode === "project" ? selectedProjectId :
        scopeMode === "workspace" ? (workspaceProjects[0]?.id ?? "") :
        [...selectedProjectIds][0] ?? ""

      const workspaceProjectIds = workspaceProjects.map(p => p.id)

      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          ticketId: ticketId || undefined,
          projectId: primaryProjectId || undefined,
          workspaceId: scopeMode === "workspace" ? selectedWorkspaceId : undefined,
          projectIds: scopeMode === "multi"
            ? [...selectedProjectIds]
            : scopeMode === "workspace" && workspaceProjectIds.length > 0
              ? workspaceProjectIds
              : undefined,
          teamId: teamId || undefined,
          agentBehavior: behavior,
          name: goal.slice(0, 60),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const mission = await res.json()
      router.push(`/missions/${mission.id}`)
    } catch (err) {
      setError(String(err))
      setSaving(false)
    }
  }

  // Group projects by workspace for the picker
  const workspaceById = Object.fromEntries(workspaces.map(w => [w.id, w]))
  const unassignedProjects = projects.filter(p => !p.workspaceId)

  const renderProjectGrid = (list: Project[], checkMode: boolean) => (
    <div className="grid grid-cols-3 gap-2">
      {list.map(p => {
        const selected = checkMode ? selectedProjectIds.has(p.id) : selectedProjectId === p.id
        return (
          <button key={p.id} type="button"
            onClick={() => checkMode ? toggleMultiProject(p.id) : setSelectedProjectId(p.id)}
            className={cn(
              "relative flex items-center gap-2 rounded-md border p-3 text-left text-sm font-medium transition-colors",
              selected ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
            )}
          >
            <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? "#6b7280" }} />
            <span className="truncate">{p.name}</span>
            {checkMode && selected && (
              <Check className="h-3 w-3 absolute top-1.5 right-1.5 text-primary" />
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Mission</h1>
        <p className="text-sm text-muted-foreground">Define a goal, pick your crew, and let them run.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Goal */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Goal</CardTitle>
            <CardDescription>What needs to be done? Be specific.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="e.g. Add Azure Container Registry support, matching the existing GCP and AWS registry patterns"
              value={goal} onChange={e => setGoal(e.target.value)}
              className="min-h-[80px]" required
            />
            <Input placeholder="Jira ticket (optional) — e.g. PROJ-123" value={ticketId} onChange={e => setTicketId(e.target.value)} />
          </CardContent>
        </Card>

        {/* Scope */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Scope</CardTitle>
            <CardDescription>How broadly should this mission run?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode selector */}
            <div className="grid grid-cols-3 gap-2">
              {scopeModes.map(m => (
                <button key={m.id} type="button"
                  onClick={() => { setScopeMode(m.id); setSelectedWorkspaceId(""); setSelectedProjectId(""); setSelectedProjectIds(new Set()) }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-md border py-3 px-2 text-center text-xs font-medium transition-colors",
                    scopeMode === m.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent text-muted-foreground"
                  )}
                >
                  <span className={scopeMode === m.id ? "text-primary" : "text-muted-foreground"}>{m.icon}</span>
                  <span className="font-semibold text-sm">{m.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{m.desc}</span>
                </button>
              ))}
            </div>

            {/* Workspace picker */}
            {scopeMode === "workspace" && (
              workspaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workspaces yet — <a href="/workspaces" className="text-primary underline">create one first</a></p>
              ) : (
                <div className="space-y-2">
                  {workspaces.map(ws => (
                    <button key={ws.id} type="button" onClick={() => setSelectedWorkspaceId(ws.id)}
                      className={cn(
                        "w-full flex items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors",
                        selectedWorkspaceId === ws.id ? "border-primary bg-primary/10" : "hover:bg-accent"
                      )}
                    >
                      <div className="h-2.5 w-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: ws.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{ws.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ws.projects.length} project{ws.projects.length !== 1 ? "s" : ""}
                          {ws.projects.length > 0 && `: ${ws.projects.map(p => p.name).join(", ")}`}
                        </p>
                      </div>
                      {selectedWorkspaceId === ws.id && <Badge variant="outline" className="text-xs">Selected</Badge>}
                    </button>
                  ))}
                </div>
              )
            )}

            {/* Multi-project ad-hoc picker */}
            {scopeMode === "multi" && (
              projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects yet — <a href="/projects/new" className="text-primary underline">create one first</a></p>
              ) : (
                <div className="space-y-3">
                  {selectedProjectIds.size > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedProjectIds.size} project{selectedProjectIds.size !== 1 ? "s" : ""} selected
                    </p>
                  )}
                  {workspaces.map(ws => (
                    ws.projects.length === 0 ? null : (
                      <div key={ws.id}>
                        <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                          <Layers className="h-3 w-3" />{ws.name}
                        </p>
                        {renderProjectGrid(ws.projects, true)}
                      </div>
                    )
                  ))}
                  {unassignedProjects.length > 0 && (
                    <div>
                      {workspaces.length > 0 && (
                        <p className="text-xs text-muted-foreground font-medium mb-1.5">Unassigned</p>
                      )}
                      {renderProjectGrid(unassignedProjects, true)}
                    </div>
                  )}
                </div>
              )
            )}

            {/* Single project picker */}
            {scopeMode === "project" && (
              projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects yet — <a href="/projects/new" className="text-primary underline">create one first</a></p>
              ) : (
                <div className="space-y-3">
                  {workspaces.map(ws => (
                    ws.projects.length === 0 ? null : (
                      <div key={ws.id}>
                        <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                          <Layers className="h-3 w-3" />{ws.name}
                        </p>
                        {renderProjectGrid(ws.projects, false)}
                      </div>
                    )
                  ))}
                  {unassignedProjects.length > 0 && (
                    <div>
                      {workspaces.length > 0 && (
                        <p className="text-xs text-muted-foreground font-medium mb-1.5">Unassigned</p>
                      )}
                      {renderProjectGrid(unassignedProjects, false)}
                    </div>
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Crew */}
        {teams.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Crew <span className="text-muted-foreground font-normal text-xs">(optional)</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {teams.map(team => (
                <button key={team.id} type="button" onClick={() => setTeamId(teamId === team.id ? "" : team.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition-colors",
                    teamId === team.id ? "border-primary bg-primary/10" : "hover:bg-accent"
                  )}
                >
                  <span className="font-medium">{team.name}</span>
                  <Badge variant="outline" className="text-xs">{team.members?.length ?? 0} roles</Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Behavior */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agent behavior</CardTitle>
            <CardDescription>How should agents handle ambiguity?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {behaviorOptions.map(opt => (
              <button key={opt.id} type="button" onClick={() => setBehavior(opt.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors",
                  behavior === opt.id ? "border-primary bg-primary/10" : "hover:bg-accent"
                )}
              >
                <div className={cn("mt-0.5", behavior === opt.id ? "text-primary" : "text-muted-foreground")}>{opt.icon}</div>
                <div>
                  <p className="font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={!canSubmit || saving} className="gap-2">
            <Crosshair className="h-4 w-4" />
            {saving ? "Creating…" : "Launch Mission"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
