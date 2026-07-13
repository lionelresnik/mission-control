"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Plus, Users, ChevronRight, Pencil, Trash2, Check, X,
  GripVertical, UserPlus, Crown,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

type Role = {
  id: string; name: string; displayName: string
  color: string | null; icon: string | null
}
type Member = { roleId: string; order: number }
type Team = {
  id: string; name: string; description: string | null
  leaderId: string | null; members: Member[]; workflow: string[]
  isBuiltIn: boolean | null
}

const WORKFLOW_STEPS = ["plan", "implement", "review", "test", "merge", "audit", "report", "investigate", "fix", "verify"]

const stepColors: Record<string, string> = {
  plan: "bg-blue-500/20 text-blue-400",
  implement: "bg-green-500/20 text-green-400",
  review: "bg-yellow-500/20 text-yellow-400",
  test: "bg-purple-500/20 text-purple-400",
  merge: "bg-emerald-500/20 text-emerald-400",
  audit: "bg-red-500/20 text-red-400",
  report: "bg-gray-500/20 text-gray-400",
  investigate: "bg-orange-500/20 text-orange-400",
  fix: "bg-green-500/20 text-green-400",
  verify: "bg-blue-500/20 text-blue-400",
}

export default function CrewsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null)

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [editLeader, setEditLeader] = useState("")
  const [editMembers, setEditMembers] = useState<string[]>([])
  const [editWorkflow, setEditWorkflow] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [t, r] = await Promise.all([
      apiFetch("/api/teams").then(d => d.json()),
      apiFetch("/api/roles").then(d => d.json()),
    ])
    setTeams(Array.isArray(t) ? t : [])
    setRoles(Array.isArray(r) ? r : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const roleById = Object.fromEntries(roles.map(r => [r.id, r]))

  function startEdit(team: Team) {
    setEditingId(team.id)
    setEditName(team.name)
    setEditDesc(team.description ?? "")
    setEditLeader(team.leaderId ?? "")
    setEditMembers((team.members ?? []).sort((a, b) => a.order - b.order).map(m => m.roleId))
    setEditWorkflow(team.workflow ?? [])
    setShowNew(false)
  }

  function startNew() {
    setEditingId("__new__")
    setEditName("")
    setEditDesc("")
    setEditLeader("")
    setEditMembers([])
    setEditWorkflow(["plan", "implement", "review"])
    setShowNew(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      name: editName,
      description: editDesc || null,
      leaderId: editLeader || null,
      members: editMembers.map((roleId, i) => ({ roleId, order: i })),
      workflow: editWorkflow,
    }
    try {
      if (showNew) {
        const res = await apiFetch("/api/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const created = await res.json()
        setTeams(prev => [...prev, created])
      } else if (editingId) {
        const res = await apiFetch(`/api/teams/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const updated = await res.json()
        setTeams(prev => prev.map(t => t.id === editingId ? updated : t))
      }
      setEditingId(null)
      setShowNew(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/teams/${id}`, { method: "DELETE" })
    setTeams(prev => prev.filter(t => t.id !== id))
    setDeleteTarget(null)
  }

  function toggleMember(roleId: string) {
    setEditMembers(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    )
  }

  function toggleWorkflow(step: string) {
    setEditWorkflow(prev =>
      prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step]
    )
  }

  const EditForm = ({ teamId }: { teamId: string }) => (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-4" onClick={e => e.stopPropagation()}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Name *</label>
          <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Security Audit Crew" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Description</label>
          <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="What this crew does" />
        </div>
      </div>

      {/* Leader */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground flex items-center gap-1"><Crown className="h-3 w-3 text-yellow-400" /> Leader</label>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setEditLeader("")}
            className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors",
              !editLeader ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >None</button>
          {roles.map(r => (
            <button
              key={r.id}
              onClick={() => setEditLeader(r.id)}
              className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors",
                editLeader === r.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
              )}
              style={editLeader === r.id && r.color ? { borderColor: r.color, color: r.color, backgroundColor: `${r.color}15` } : {}}
            >
              {r.displayName}
            </button>
          ))}
        </div>
      </div>

      {/* Members */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground flex items-center gap-1"><UserPlus className="h-3 w-3" /> Members <span className="text-muted-foreground/50">(click to toggle)</span></label>
        <div className="flex flex-wrap gap-1.5">
          {roles.map(r => {
            const selected = editMembers.includes(r.id)
            return (
              <button
                key={r.id}
                onClick={() => toggleMember(r.id)}
                className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors",
                  selected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                )}
                style={selected && r.color ? { borderColor: r.color, color: r.color, backgroundColor: `${r.color}15` } : {}}
              >
                {r.displayName}
              </button>
            )
          })}
        </div>
        {editMembers.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Order: {editMembers.map(id => roleById[id]?.displayName).filter(Boolean).join(" → ")}
          </p>
        )}
      </div>

      {/* Workflow */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground flex items-center gap-1"><GripVertical className="h-3 w-3" /> Workflow steps</label>
        <div className="flex flex-wrap gap-1.5">
          {WORKFLOW_STEPS.map(step => {
            const active = editWorkflow.includes(step)
            return (
              <button
                key={step}
                onClick={() => toggleWorkflow(step)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  active ? stepColors[step] : "bg-muted/30 text-muted-foreground/50 hover:text-muted-foreground"
                )}
              >
                {step}
              </button>
            )
          })}
        </div>
        {editWorkflow.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-1">
            {editWorkflow.map((step, i) => (
              <div key={step} className="flex items-center gap-1">
                <span className={cn("rounded px-2 py-0.5 text-xs font-medium", stepColors[step])}>{step}</span>
                {i < editWorkflow.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving || !editName} className="gap-1.5">
          <Check className="h-3.5 w-3.5" /> {saving ? "Saving…" : showNew ? "Create crew" : "Save changes"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setShowNew(false) }}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Crews</h1>
          <p className="text-sm text-muted-foreground">{teams.length} crews configured</p>
        </div>
        <Button onClick={startNew} className="gap-2">
          <Plus className="h-4 w-4" /> New Crew
        </Button>
      </div>

      {/* New crew form */}
      {showNew && (
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-semibold">New Crew</span>
            </div>
            <EditForm teamId="__new__" />
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
      ) : teams.length === 0 && !showNew ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">No crews yet</p>
          <Button className="mt-4 gap-2" onClick={startNew}><Plus className="h-4 w-4" />Create first crew</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map(team => {
            const members = (team.members ?? []) as Member[]
            const workflow = (team.workflow ?? []) as string[]
            const leaderRole = team.leaderId ? roleById[team.leaderId] : null
            const isEditing = editingId === team.id

            return (
              <Card key={team.id} className={cn("transition-colors", isEditing && "border-primary/40")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <h3 className="font-semibold">{team.name}</h3>
                        {team.isBuiltIn && <Badge variant="outline" className="text-xs">Built-in</Badge>}
                        {leaderRole && (
                          <span className="flex items-center gap-1 text-xs text-yellow-400/80">
                            <Crown className="h-3 w-3" />{leaderRole.displayName}
                          </span>
                        )}
                      </div>
                      {team.description && (
                        <p className="text-xs text-muted-foreground mb-2">{team.description}</p>
                      )}

                      {members.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {members
                            .sort((a, b) => a.order - b.order)
                            .map(m => roleById[m.roleId])
                            .filter(Boolean)
                            .map(r => (
                              <Badge
                                key={r.id} variant="outline" className="text-xs"
                                style={{ borderColor: r.color ?? undefined, color: r.color ?? undefined }}
                              >
                                {r.displayName}
                              </Badge>
                            ))}
                        </div>
                      )}

                      {workflow.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {workflow.map((step, i) => (
                            <div key={step} className="flex items-center gap-1">
                              <span className={cn("rounded px-2 py-0.5 text-xs font-medium", stepColors[step] ?? "bg-muted text-muted-foreground")}>
                                {step}
                              </span>
                              {i < workflow.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(team)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!team.isBuiltIn && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(team)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" asChild className="h-7 text-xs">
                        <Link href={`/missions/new?teamId=${team.id}`}>Use</Link>
                      </Button>
                    </div>
                  </div>

                  {isEditing && <EditForm teamId={team.id} />}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete crew?"
        itemName={deleteTarget?.name}
        itemMeta={deleteTarget ? `${(deleteTarget.members ?? []).length} members · ${(deleteTarget.workflow ?? []).join(" → ")}` : undefined}
        description="This will permanently delete the crew. Any missions that used this crew will keep their task graphs."
        confirmLabel="Delete crew"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
