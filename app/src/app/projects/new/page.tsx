"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FolderOpen } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch } from "@/lib/api-client"

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#ef4444", "#06b6d4", "#84cc16"]

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState(COLORS[0])
  const [githubOwner, setGithubOwner] = useState("")
  const [githubRepo, setGithubRepo] = useState("")
  const [jiraProject, setJiraProject] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    setSaving(true)
    setError("")
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, color, githubOwner, githubRepo, jiraProject }),
      })
      if (!res.ok) throw new Error(await res.text())
      router.push("/projects")
    } catch (err) {
      setError(String(err))
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Project</h1>
        <p className="text-sm text-muted-foreground">Connect a repo and start running missions</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Project details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Project name *" value={name} onChange={e => setName(e.target.value)} required />
            <Textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} className="min-h-[60px]" />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Color</p>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c} type="button" onClick={() => setColor(c)}
                    className="h-6 w-6 rounded-full transition-all"
                    style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : "none", outlineOffset: "2px" }}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">GitHub</CardTitle>
            <CardDescription>Optional — used for AGENTS.md PR workflow</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Owner (e.g. my-org)" value={githubOwner} onChange={e => setGithubOwner(e.target.value)} />
              <Input placeholder="Repo (e.g. trivy)" value={githubRepo} onChange={e => setGithubRepo(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Jira</CardTitle>
            <CardDescription>Optional — project key for ticket linking</CardDescription>
          </CardHeader>
          <CardContent>
            <Input placeholder="Project key (e.g. PROJ)" value={jiraProject} onChange={e => setJiraProject(e.target.value)} />
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={saving || !name} className="gap-2">
            <FolderOpen className="h-4 w-4" />
            {saving ? "Creating…" : "Create project"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
