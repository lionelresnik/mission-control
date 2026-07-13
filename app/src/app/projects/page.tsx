"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, GitBranch, ExternalLink, Brain, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"

const agentsMdBadge: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  merged:   { label: "AGENTS.md ✓ in repo", variant: "success" },
  pr_open:  { label: "AGENTS.md PR open",   variant: "warning" },
  local:    { label: "AGENTS.md local only", variant: "secondary" },
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [allKnowledge, setAllKnowledge] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch("/api/projects").then(r => r.json()),
      apiFetch("/api/knowledge").then(r => r.json()),
    ]).then(([p, k]) => {
      setProjects(p)
      setAllKnowledge(k)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  const knowledgeCountByProject = allKnowledge.reduce<Record<string, number>>((acc, k) => {
    if (k.projectId) acc[k.projectId] = (acc[k.projectId] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">{projects.length} projects configured</p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="h-4 w-4" />
            Add Project
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">No projects yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
            Add a project to connect your repos and start running missions
          </p>
          <Button className="mt-4 gap-2" asChild>
            <Link href="/projects/new"><Plus className="h-4 w-4" /> Add Project</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {projects.map(project => {
            const badge = agentsMdBadge[project.agentsMdStatus ?? "local"]
            const knowledgeCount = knowledgeCountByProject[project.id] ?? 0

            return (
              <Card key={project.id} className="hover:border-primary/30 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color ?? "#6b7280" }} />
                      <CardTitle className="text-base">{project.name}</CardTitle>
                    </div>
                  </div>
                  {project.description && (
                    <p className="text-xs text-muted-foreground">{project.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {project.githubRepo && (
                      <a
                        href={`https://github.com/${project.githubOwner}/${project.githubRepo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        {project.githubOwner}/{project.githubRepo}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                    {project.jiraProject && (
                      <><span>·</span><span>{project.jiraProject}</span></>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Brain className="h-3.5 w-3.5" />
                    <span>{knowledgeCount} knowledge entries</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" asChild>
                        <Link href={`/knowledge?projectId=${project.id}`}>
                          <Brain className="h-3 w-3" />
                          Knowledge
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" asChild>
                        <Link href={`/projects/${project.id}`}>
                          <FileText className="h-3 w-3" />
                          Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
