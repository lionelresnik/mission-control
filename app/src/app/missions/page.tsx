"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Plus, CheckCircle2, Clock, AlertCircle, Search, X, Crosshair,
  ExternalLink, Hash, Layers,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"


type MissionStatus = "pending" | "planning" | "running" | "paused" | "review" | "done" | "failed"

const statusConfig: Record<MissionStatus, { label: string; variant: string }> = {
  pending:  { label: "Pending",  variant: "secondary" },
  planning: { label: "Planning", variant: "secondary" },
  running:  { label: "Running",  variant: "running" },
  paused:   { label: "Paused",   variant: "warning" },
  review:   { label: "Review",   variant: "warning" },
  done:     { label: "Done",     variant: "success" },
  failed:   { label: "Failed",   variant: "destructive" },
}

const behaviorLabel: Record<string, string> = {
  assume_and_document: "Assume",
  ask_me: "Ask me",
  async: "Async",
}

type TaskNode = { id: string; roleName: string; status: string }

type Mission = {
  id: string
  name: string
  goal: string
  status: string | null
  progressPercent: number | null
  agentBehavior: string | null
  ticketId: string | null
  taskGraph: TaskNode[] | null
  projectId: string
  workspaceId?: string | null
  projectIds?: string[] | null
  createdAt: string | null
  estimatedCostUsd: number | null
  tokensTotal: number | null
}

type Project = {
  id: string; name: string; color: string | null
  jiraUrl: string | null
  slackChannel: string | null
}

type Workspace = { id: string; name: string; color: string; projects: Array<{ id: string }> }

const STATUS_FILTERS: { id: MissionStatus | "all"; label: string }[] = [
  { id: "all",     label: "All" },
  { id: "running", label: "Running" },
  { id: "pending", label: "Pending" },
  { id: "review",  label: "Review" },
  { id: "done",    label: "Done" },
  { id: "failed",  label: "Failed" },
]

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<MissionStatus | "all">("all")
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all")
  const [projectFilter, setProjectFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch("/api/missions").then(r => r.json()),
      apiFetch("/api/projects").then(r => r.json()),
      apiFetch("/api/workspaces").then(r => r.json()),
    ]).then(([m, p, w]) => {
      setMissions(m)
      setProjects(p)
      setWorkspaces(w)
      setLoading(false)
    })
  }, [])

  // Projects visible in project filter — limited to selected workspace
  const wsProjectIds = workspaceFilter !== "all"
    ? new Set((workspaces.find(w => w.id === workspaceFilter)?.projects ?? []).map(p => p.id))
    : null

  const visibleProjects = wsProjectIds
    ? projects.filter(p => wsProjectIds.has(p.id))
    : projects

  const filtered = missions.filter(m => {
    const matchSearch =
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.goal.toLowerCase().includes(search.toLowerCase()) ||
      (m.ticketId ?? "").toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === "all" || m.status === statusFilter
    const matchWorkspace = workspaceFilter === "all"
      || m.workspaceId === workspaceFilter
      || (wsProjectIds != null && wsProjectIds.has(m.projectId))
    const matchProject = projectFilter === "all" || m.projectId === projectFilter
    return matchSearch && matchStatus && matchWorkspace && matchProject
  })

  const projectById = Object.fromEntries(projects.map(p => [p.id, p]))

  const hasFilters = search || statusFilter !== "all" || workspaceFilter !== "all" || projectFilter !== "all"
  const clearFilters = () => { setSearch(""); setStatusFilter("all"); setWorkspaceFilter("all"); setProjectFilter("all") }

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crosshair className="h-6 w-6 text-primary" />
            Missions
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {missions.length} · {missions.filter(m => m.status === "running").length} running
          </p>
        </div>
        <Button asChild>
          <Link href="/missions/new">
            <Plus className="h-4 w-4" />
            New Mission
          </Link>
        </Button>
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="flex gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search missions, goals, tickets…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Workspace filter */}
          {workspaces.length > 0 && (
            <select
              value={workspaceFilter}
              onChange={e => { setWorkspaceFilter(e.target.value); setProjectFilter("all") }}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[140px]"
            >
              <option value="all">All workspaces</option>
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}

          {/* Project filter */}
          <select
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[140px]"
          >
            <option value="all">{workspaceFilter !== "all" ? "All in workspace" : "All projects"}</option>
            {visibleProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Clear */}
          {hasFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-1">
          {STATUS_FILTERS.map(f => {
            const count = f.id === "all"
              ? missions.length
              : missions.filter(m => m.status === f.id).length
            if (f.id !== "all" && count === 0) return null
            return (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === f.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {f.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  statusFilter === f.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Mission list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 h-20" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Crosshair className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">
            {missions.length === 0 ? "No missions yet" : "No missions match your filters"}
          </p>
          {hasFilters ? (
            <Button variant="outline" className="mt-4" onClick={clearFilters}>Clear filters</Button>
          ) : (
            <Button className="mt-4 gap-2" asChild>
              <Link href="/missions/new"><Plus className="h-4 w-4" />New Mission</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(mission => {
            const status = (mission.status ?? "pending") as MissionStatus
            const { label, variant } = statusConfig[status] ?? statusConfig.pending
            const taskGraph = (mission.taskGraph ?? []) as TaskNode[]
            const project = projectById[mission.projectId]

            return (
              <Card key={mission.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Meta row */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {project && (
                          <>
                            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color ?? "#6b7280" }} />
                            <span className="text-xs text-muted-foreground">{project.name}</span>
                          </>
                        )}
                        {mission.ticketId && (
                          project?.jiraUrl ? (
                            <a
                              href={`${project.jiraUrl}/browse/${mission.ticketId}`}
                              target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-mono text-blue-400/80 hover:text-blue-400 transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              {mission.ticketId}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : (
                            <span className="text-xs font-mono text-muted-foreground">{mission.ticketId}</span>
                          )
                        )}
                        {project?.slackChannel && (
                          <a
                            href={`https://slack.com/app_redirect?channel=${project.slackChannel.replace(/^#/, "")}`}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-xs text-muted-foreground/60 hover:text-[#4A154B] transition-colors"
                            title={`Open ${project.slackChannel} in Slack`}
                            onClick={e => e.stopPropagation()}
                          >
                            <Hash className="h-2.5 w-2.5" />
                            {project.slackChannel.replace(/^#/, "")}
                          </a>
                        )}
                        {mission.agentBehavior && (
                          <span className="text-xs text-muted-foreground">· {behaviorLabel[mission.agentBehavior]}</span>
                        )}
                      </div>

                      {/* Name */}
                      <Link href={`/missions/${mission.id}`} className="font-semibold hover:text-primary transition-colors">
                        {mission.name}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{mission.goal}</p>

                      {/* Task graph */}
                      {taskGraph.length > 0 && (
                        <div className="mt-2 flex items-center gap-3">
                          {taskGraph.map((node, i) => (
                            <div key={node.id} className="flex items-center gap-1.5">
                              {node.status === "done"    && <CheckCircle2 className="h-3 w-3 text-green-400" />}
                              {node.status === "running" && <Clock className="h-3 w-3 text-blue-400 animate-pulse" />}
                              {node.status === "failed"  && <AlertCircle className="h-3 w-3 text-red-400" />}
                              {node.status === "pending" && <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />}
                              <span className={`text-xs ${node.status === "pending" ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                                {node.roleName}
                              </span>
                              {i < taskGraph.length - 1 && <div className="h-px w-3 bg-border" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <Badge variant={variant as any}>{label}</Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">{mission.progressPercent ?? 0}%</span>
                      {(mission.estimatedCostUsd ?? 0) > 0 && (
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                          ~${(mission.estimatedCostUsd ?? 0).toFixed(3)}
                        </span>
                      )}
                    </div>
                  </div>

                  <Progress value={mission.progressPercent ?? 0} isRunning={status === "running"} className="mt-3" />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
