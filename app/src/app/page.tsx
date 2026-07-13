"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Crosshair, Plus, CheckCircle2, Clock, AlertCircle, Brain,
  ArrowRight, AlertTriangle, ListTodo, Sparkles, DollarSign,
  Layers,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { apiFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"

type TaskNode = { id: string; roleName: string; status: string }
type MissionStatus = "pending" | "planning" | "running" | "paused" | "review" | "done" | "failed"

type Workspace = { id: string; name: string; color: string; projects: Array<{ id: string; name: string; color?: string | null }> }

const statusConfig: Record<MissionStatus, { label: string; variant: string; color: string }> = {
  pending:  { label: "Pending",  variant: "secondary",    color: "text-muted-foreground" },
  planning: { label: "Planning", variant: "secondary",    color: "text-blue-300" },
  running:  { label: "Running",  variant: "running",      color: "text-blue-400" },
  paused:   { label: "Paused",   variant: "warning",      color: "text-yellow-400" },
  review:   { label: "Review",   variant: "warning",      color: "text-yellow-400" },
  done:     { label: "Done",     variant: "success",      color: "text-green-400" },
  failed:   { label: "Failed",   variant: "destructive",  color: "text-red-400" },
}

export default function DashboardPage() {
  const [missions, setMissions] = useState<any[]>([])
  const [knowledge, setKnowledge] = useState<any[]>([])
  const [todos, setTodos] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch("/api/missions").then(r => r.json()),
      apiFetch("/api/knowledge").then(r => r.json()),
      apiFetch("/api/todos").then(r => r.json()),
      apiFetch("/api/projects").then(r => r.json()),
      apiFetch("/api/workspaces").then(r => r.json()),
    ]).then(([m, k, t, p, w]) => {
      setMissions(m)
      setKnowledge(k)
      setTodos(t)
      setProjects(p)
      setWorkspaces(w)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  const running   = missions.filter(m => m.status === "running")
  const active    = missions.filter(m => m.status !== "done" && m.status !== "failed")
  const done      = missions.filter(m => m.status === "done")
  const failed    = missions.filter(m => m.status === "failed")
  const assumed   = knowledge.filter(k => k.confidence === "assumed")
  const openTodos = todos.filter(t => t.status === "pending" || t.status === "in_progress")

  const totalCost = missions.reduce((s, m) => s + (m.estimatedCostUsd ?? 0), 0)

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  const projectById = Object.fromEntries(projects.map(p => [p.id, p]))
  const unassignedProjects = projects.filter(p => !p.workspaceId)

  const countForProject = (projectId: string) => ({
    missions: missions.filter(m => m.projectId === projectId || (m.projectIds as string[] | null)?.includes(projectId)).length,
    knowledge: knowledge.filter(k => k.projectId === projectId).length,
  })

  const countForWorkspace = (ws: typeof workspaces[0]) => {
    const ids = new Set(ws.projects.map(p => p.id))
    return {
      missions: missions.filter(m => m.workspaceId === ws.id || (m.projectId && ids.has(m.projectId))).length,
      knowledge: knowledge.filter(k => k.workspaceId === ws.id || (k.projectId && ids.has(k.projectId))).length,
    }
  }

  const attentionItems = [
    ...assumed.map(k => ({
      type: "knowledge" as const,
      id: k.id,
      title: k.title,
      sub: "Assumed — needs confirmation",
      href: "/knowledge",
      icon: <Brain className="h-3.5 w-3.5 text-yellow-400" />,
    })),
    ...openTodos.map(t => ({
      type: "todo" as const,
      id: t.id,
      title: t.content,
      sub: t.status === "in_progress" ? "In progress" : "Pending",
      href: "/todos",
      icon: <ListTodo className="h-3.5 w-3.5 text-blue-400" />,
    })),
    ...failed.map(m => ({
      type: "mission" as const,
      id: m.id,
      title: m.name,
      sub: "Mission failed",
      href: `/missions/${m.id}`,
      icon: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
    })),
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mission Control</h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/missions/new"><Plus className="h-4 w-4" />New Mission</Link>
        </Button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active", value: active.length, icon: <Crosshair className="h-4 w-4 text-blue-400" />, href: "/missions", highlight: active.length > 0 },
          { label: "Completed", value: done.length, icon: <CheckCircle2 className="h-4 w-4 text-green-400" />, href: "/missions" },
          { label: "Knowledge", value: knowledge.length, icon: <Brain className="h-4 w-4 text-purple-400" />, href: "/knowledge" },
          { label: "AI spend", value: `$${totalCost.toFixed(3)}`, icon: <DollarSign className="h-4 w-4 text-yellow-400" />, href: "/missions" },
        ].map(stat => (
          <Link key={stat.label} href={stat.href}>
            <Card className={cn("hover:border-primary/30 transition-colors", stat.highlight && "border-blue-500/30")}>
              <CardContent className="flex items-center gap-3 p-4">
                {stat.icon}
                <div>
                  <p className="text-xl font-bold leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active missions */}
        <div className="lg:col-span-2 space-y-4">
          {active.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Missions</h2>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/missions" className="gap-1 text-xs">All missions <ArrowRight className="h-3 w-3" /></Link>
                </Button>
              </div>
              {active.map(mission => {
                const status = (mission.status ?? "pending") as MissionStatus
                const { label, variant } = statusConfig[status] ?? statusConfig.pending
                const taskGraph = (mission.taskGraph ?? []) as TaskNode[]
                const project = mission.projectId ? projectById[mission.projectId] : null
                return (
                  <Card key={mission.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            {project && (
                              <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color ?? "#6b7280" }} />
                            )}
                            <Link href={`/missions/${mission.id}`} className="font-medium text-sm hover:text-primary transition-colors truncate">
                              {mission.name}
                            </Link>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">{mission.goal}</p>
                          {taskGraph.length > 0 && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              {taskGraph.map((node, i) => (
                                <div key={node.id} className="flex items-center gap-1">
                                  {node.status === "done"    && <CheckCircle2 className="h-3 w-3 text-green-400" />}
                                  {node.status === "running" && <Clock className="h-3 w-3 text-blue-400 animate-pulse" />}
                                  {node.status === "failed"  && <AlertCircle className="h-3 w-3 text-red-400" />}
                                  {node.status === "pending" && <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />}
                                  <span className={cn("text-[11px]", node.status === "pending" ? "text-muted-foreground/50" : "text-muted-foreground")}>
                                    {node.roleName}
                                  </span>
                                  {i < taskGraph.length - 1 && <div className="h-px w-3 bg-border" />}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Badge variant={variant as any} className="flex-shrink-0">{label}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={mission.progressPercent ?? 0} isRunning={status === "running"} className="flex-1" />
                        <span className="text-xs text-muted-foreground w-8 text-right">{mission.progressPercent ?? 0}%</span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </section>
          )}

          {/* Recently completed */}
          {done.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recently Completed</h2>
              {done.slice(0, 4).map(mission => (
                <Card key={mission.id} className="opacity-60 hover:opacity-100 transition-opacity">
                  <CardContent className="flex items-center gap-3 p-3">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Link href={`/missions/${mission.id}`} className="text-sm hover:text-primary truncate block">
                        {mission.name}
                      </Link>
                      {mission.estimatedCostUsd != null && mission.estimatedCostUsd > 0 && (
                        <span className="text-[11px] text-muted-foreground">${mission.estimatedCostUsd.toFixed(3)}</span>
                      )}
                    </div>
                    <Badge variant="success" className="text-[10px]">Done</Badge>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}

          {/* Empty state */}
          {missions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-lg">
              <Crosshair className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No missions yet</p>
              <Button className="mt-3 gap-2" asChild size="sm">
                <Link href="/missions/new"><Plus className="h-4 w-4" />Create first mission</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Needs attention */}
          {attentionItems.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-yellow-400" />
                Needs Attention
                <span className="ml-auto text-yellow-400 font-bold">{attentionItems.length}</span>
              </h2>
              <div className="space-y-1.5">
                {attentionItems.slice(0, 8).map(item => (
                  <Link key={`${item.type}-${item.id}`} href={item.href}>
                    <div className="flex items-start gap-2 rounded-md border border-border/50 bg-card px-3 py-2 hover:border-primary/30 transition-colors">
                      <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Workspaces + projects quick-jump */}
          {(workspaces.length > 0 || projects.length > 0) && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3 w-3" /> Workspaces
                </h2>
                <Link href="/workspaces" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">All</Link>
              </div>

              {workspaces.map(ws => {
                const counts = countForWorkspace(ws)
                if (ws.projects.length === 0 && counts.missions === 0 && counts.knowledge === 0) return null
                return (
                  <div key={ws.id} className="space-y-1">
                    <Link href="/workspaces">
                      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 transition-colors">
                        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: ws.color ?? "#8b5cf6" }} />
                        <span className="text-xs font-semibold flex-1 truncate">{ws.name}</span>
                        <span className="text-[11px] text-muted-foreground">{counts.missions}m · {counts.knowledge}k</span>
                      </div>
                    </Link>
                    <div className="space-y-0.5 pl-3 border-l border-border/50 ml-2">
                      {ws.projects.map(p => {
                        const pc = countForProject(p.id)
                        return (
                          <Link key={p.id} href={`/projects/${p.id}`}>
                            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 transition-colors">
                              <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? "#6b7280" }} />
                              <span className="text-xs flex-1 truncate">{p.name}</span>
                              <span className="text-[11px] text-muted-foreground">{pc.missions}m · {pc.knowledge}k</span>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {unassignedProjects.length > 0 && (
                <div className="space-y-1">
                  {workspaces.length > 0 && (
                    <p className="text-[11px] text-muted-foreground px-2">Unassigned</p>
                  )}
                  {unassignedProjects.map(p => {
                    const pc = countForProject(p.id)
                    return (
                      <Link key={p.id} href={`/projects/${p.id}`}>
                        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/50 transition-colors">
                          <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color ?? "#6b7280" }} />
                          <span className="text-xs font-medium flex-1 truncate">{p.name}</span>
                          <span className="text-[11px] text-muted-foreground">{pc.missions}m · {pc.knowledge}k</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* Recent knowledge */}
          {knowledge.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-purple-400" /> Recent Knowledge
                </h2>
                <Link href="/knowledge" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">All</Link>
              </div>
              <div className="space-y-1.5">
                {knowledge.slice(0, 4).map(k => (
                  <Link key={k.id} href="/knowledge">
                    <div className="flex items-start gap-2 rounded-md px-3 py-2 hover:bg-secondary/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{k.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{k.content.slice(0, 60)}…</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
