"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Crosshair, CheckCircle2, Clock, AlertCircle,
  Play, ChevronRight, MessageSquare, Brain, Loader2, Download, Copy, Check,
  ExternalLink, Hash, Terminal, ChevronDown, ChevronUp,
} from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped"

type TaskNode = {
  id: string
  roleId: string
  roleName: string
  status: TaskStatus
  dependsOn: string[]
  startedAt?: string
  completedAt?: string
}

type Artifact = {
  id: string
  roleId: string | null
  roleName: string | null
  type: string
  title: string | null
  content: string
  createdAt: string | null
}

type Question = {
  id: string
  roleName: string | null
  question: string
  answer: string | null
  isAssumption: boolean | null
  createdAt: string | null
}

type Mission = {
  id: string
  name: string
  goal: string
  status: string
  progressPercent: number | null
  agentBehavior: string | null
  ticketId: string | null
  ticketUrl: string | null
  taskGraph: TaskNode[]
  artifacts: Artifact[]
  questions: Question[]
  updatedAt: string | null
  tokensInput: number | null
  tokensOutput: number | null
  estimatedCostUsd: number | null
  project?: {
    jiraBaseUrl: string | null
    slackChannel: string | null
  } | null
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const statusBadge: Record<string, { label: string; variant: string }> = {
  pending:  { label: "Pending",  variant: "secondary" },
  planning: { label: "Planning", variant: "secondary" },
  running:  { label: "Running",  variant: "running" },
  paused:   { label: "Paused",   variant: "warning" },
  review:   { label: "Review",   variant: "warning" },
  done:     { label: "Done",     variant: "success" },
  failed:   { label: "Failed",   variant: "destructive" },
}

function TaskIcon({ status }: { status: TaskStatus }) {
  if (status === "done")    return <CheckCircle2 className="h-4 w-4 text-green-400" />
  if (status === "running") return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
  if (status === "failed")  return <AlertCircle className="h-4 w-4 text-red-400" />
  return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [mission, setMission] = useState<Mission | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [streamingRole, setStreamingRole] = useState<string | null>(null)
  const [streamBuffer, setStreamBuffer] = useState<Record<string, string>>({}) // roleId → streamed text
  const [liveLog, setLiveLog] = useState<{ role: string; text: string; ts: string }[]>([])
  const [showLog, setShowLog] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [executionMode, setExecutionMode] = useState<"cursor" | "builtin">("cursor")
  const [activity, setActivity] = useState<Array<{ roleName: string | null; type: string; message: string | null; createdAt: string | null }>>([])
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const streamRef = useRef<ReadableStreamDefaultReader | null>(null)

  // Auto-scroll log to bottom
  useEffect(() => {
    if (showLog && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [liveLog, showLog])

  function buildMarkdownExport(m: Mission): string {
    const lines: string[] = [
      `# Mission: ${m.name}`,
      ``,
      `**Goal:** ${m.goal}`,
      m.ticketId ? `**Ticket:** ${m.ticketId}` : "",
      `**Status:** ${m.status}  **Progress:** ${m.progressPercent ?? 0}%`,
      `**Agent behavior:** ${m.agentBehavior ?? "—"}`,
      m.updatedAt ? `**Updated:** ${m.updatedAt.slice(0, 16).replace("T", " ")}` : "",
      ``,
      `---`,
      ``,
    ].filter(l => l !== undefined) as string[]

    if (m.artifacts.length > 0) {
      lines.push(`## Artifacts\n`)
      m.artifacts.forEach(art => {
        lines.push(`### ${art.roleName ?? "Agent"} — ${art.type}`)
        if (art.title) lines.push(`_${art.title}_`)
        lines.push(``)
        lines.push(art.content)
        lines.push(``, `---`, ``)
      })
    }

    if (m.questions.length > 0) {
      lines.push(`## Questions & Assumptions\n`)
      m.questions.forEach(q => {
        lines.push(`**${q.roleName ?? "Agent"}:** ${q.question}`)
        lines.push(q.answer ? `> Answer: ${q.answer}` : `> _Unanswered_`)
        lines.push(``)
      })
    }

    if (m.taskGraph.length > 0) {
      lines.push(`## Task Graph\n`)
      m.taskGraph.forEach(t => {
        const check = t.status === "done" ? "✓" : t.status === "failed" ? "✗" : "○"
        lines.push(`- ${check} **${t.roleName}** — ${t.status}`)
      })
    }

    return lines.join("\n")
  }

  async function handleExport() {
    if (!mission) return
    const md = buildMarkdownExport(mission)
    const blob = new Blob([md], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `mission-${mission.name.toLowerCase().replace(/\s+/g, "-")}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleCopyMarkdown() {
    if (!mission) return
    await navigator.clipboard.writeText(buildMarkdownExport(mission))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ─── Load mission ──────────────────────────────────────────────────────────

  const loadMission = useCallback(async () => {
    try {
      const res = await fetch(`/api/missions/${id}`)
      if (!res.ok) { router.push("/missions"); return }
      const data = await res.json()
      setMission(data)
      if (data.artifacts?.length > 0 && !activeArtifactId) {
        setActiveArtifactId(data.artifacts[data.artifacts.length - 1].id)
      }
    } finally {
      setLoading(false)
    }
  }, [id, router, activeArtifactId])

  useEffect(() => { loadMission() }, [loadMission])

  useEffect(() => {
    fetch("/api/settings/execution-mode")
      .then(r => r.json())
      .then(d => setExecutionMode(d.executionMode === "builtin" ? "builtin" : "cursor"))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (executionMode !== "cursor" || !id) return
    const poll = () =>
      fetch(`/api/missions/${id}/activity`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setActivity(data) })
        .catch(() => {})
    poll()
    const timer = setInterval(poll, 4000)
    return () => clearInterval(timer)
  }, [executionMode, id, mission?.updatedAt])

  async function submitAnswer(questionId: string) {
    const answer = answerDrafts[questionId]?.trim()
    if (!answer) return
    await fetch(`/api/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    })
    setAnswerDrafts(prev => ({ ...prev, [questionId]: "" }))
    loadMission()
  }

  // ─── Run next role ─────────────────────────────────────────────────────────

  const runNextRole = async () => {
    if (running || !mission) return
    setRunning(true)

    try {
      const res = await fetch(`/api/missions/${id}/run`, { method: "POST" })
      if (!res.body) throw new Error("no stream")

      const reader = res.body.getReader()
      streamRef.current = reader
      const decoder = new TextDecoder()
      let currentRoleId = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split("\n").filter(l => l.startsWith("data: "))

        for (const line of lines) {
          const json = line.slice(6)
          try {
            const event = JSON.parse(json)
            handleSSEEvent(event, currentRoleId, (rid) => { currentRoleId = rid })
          } catch { /* partial JSON, skip */ }
        }
      }
    } catch (err) {
      console.error("Run error:", err)
    } finally {
      setRunning(false)
      setStreamingRole(null)
      loadMission()
    }
  }

  const handleSSEEvent = (
    event: { type: string; payload: Record<string, unknown> },
    currentRoleId: string,
    setCurrentRoleId: (id: string) => void
  ) => {
    switch (event.type) {
      case "role_start":
        setCurrentRoleId(event.payload.roleId as string)
        setStreamingRole(event.payload.roleName as string)
        setStreamBuffer(prev => ({ ...prev, [event.payload.roleId as string]: "" }))
        setLiveLog(prev => [...prev, { role: event.payload.roleName as string, text: `▶ Starting ${event.payload.roleName as string}…`, ts: new Date().toLocaleTimeString() }])
        setShowLog(true)
        break

      case "chunk": {
        const text = event.payload.text as string
        setStreamBuffer(prev => ({
          ...prev,
          [currentRoleId]: (prev[currentRoleId] ?? "") + text,
        }))
        setLiveLog(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === "__chunk__") {
            return [...prev.slice(0, -1), { ...last, text: last.text + text }]
          }
          return [...prev, { role: "__chunk__", text, ts: new Date().toLocaleTimeString() }]
        })
        break
      }

      case "role_done":
        setMission(prev => {
          if (!prev) return prev
          return {
            ...prev,
            progressPercent: event.payload.progress as number,
            taskGraph: prev.taskGraph.map(t =>
              t.id === (event.payload.taskId as string) ? { ...t, status: "done" as TaskStatus } : t
            ),
          }
        })
        setLiveLog(prev => [...prev, { role: event.payload.roleName as string ?? "Agent", text: `✓ Done — ${event.payload.progress as number}% complete`, ts: new Date().toLocaleTimeString() }])
        break

      case "question":
        setMission(prev => {
          if (!prev) return prev
          return {
            ...prev,
            questions: [...prev.questions, {
              id: Math.random().toString(),
              roleName: event.payload.roleName as string,
              question: event.payload.question as string,
              answer: null,
              isAssumption: false,
              createdAt: new Date().toISOString(),
            }],
          }
        })
        break

      case "usage":
        setMission(prev => {
          if (!prev) return prev
          return {
            ...prev,
            tokensInput: (prev.tokensInput ?? 0) + (event.payload.tokensIn as number),
            tokensOutput: (prev.tokensOutput ?? 0) + (event.payload.tokensOut as number),
            estimatedCostUsd: (prev.estimatedCostUsd ?? 0) + (event.payload.costUsd as number),
          }
        })
        break

      case "mission_done":
        setMission(prev => prev ? { ...prev, status: "done", progressPercent: 100 } : prev)
        break
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!mission) return null

  const sb = statusBadge[mission.status] ?? statusBadge.pending
  const canRun = executionMode === "builtin" && mission.status !== "done" && mission.status !== "failed" && !running
  const cursorMode = executionMode === "cursor"
  const taskGraph = mission.taskGraph ?? []
  const artifacts = mission.artifacts ?? []
  const questions = mission.questions ?? []

  // Active artifact content (real or streaming)
  const activeArtifact = artifacts.find(a => a.id === activeArtifactId)
  const streamingContent = streamingRole
    ? Object.values(streamBuffer).join("")
    : null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5" onClick={() => router.push("/missions")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <h1 className="text-xl font-bold">{mission.name}</h1>
                <Badge variant={sb.variant as any}>{sb.label}</Badge>
                {mission.ticketId && (() => {
                  const jiraBase = mission.ticketUrl
                    ? mission.ticketUrl.replace(/\/browse\/.*/, "")
                    : mission.project?.jiraBaseUrl ?? null
                  const href = jiraBase
                    ? `${jiraBase}/browse/${mission.ticketId}`
                    : null
                  return href ? (
                    <a
                      href={href}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-mono text-blue-400/80 hover:text-blue-400 transition-colors"
                    >
                      {mission.ticketId}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <span className="text-xs font-mono text-muted-foreground">{mission.ticketId}</span>
                  )
                })()}
                {mission.project?.slackChannel && (
                  <a
                    href={`https://slack.com/app_redirect?channel=${mission.project.slackChannel.replace(/^#/, "")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-[#4A154B] transition-colors"
                    title={`Open ${mission.project.slackChannel} in Slack`}
                  >
                    <Hash className="h-3 w-3" />
                    {mission.project.slackChannel.replace(/^#/, "")}
                  </a>
                )}
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">{mission.goal}</p>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            {artifacts.length > 0 && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleCopyMarkdown}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy MD"}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </>
            )}
            {canRun && (
              <Button onClick={runNextRole} disabled={running} className="gap-2">
                {running
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
                  : <><Play className="h-4 w-4" /> Run next role</>
                }
              </Button>
            )}
            {cursorMode && mission.status !== "done" && mission.status !== "failed" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(id)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}
                {copied ? "Copied ID" : "Continue in Cursor"}
              </Button>
            )}
            {mission.status === "done" && (
              <Badge variant="success" className="h-9 px-4 text-sm">Mission complete</Badge>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mt-3 flex items-center gap-3">
          <Progress
            value={mission.progressPercent ?? 0}
            isRunning={running}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground tabular-nums w-8">
            {mission.progressPercent ?? 0}%
          </span>
        </div>

        {/* Token usage — built-in mode only */}
        {!cursorMode && ((mission.tokensInput ?? 0) + (mission.tokensOutput ?? 0)) > 0 && (
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <span className="text-foreground/70 font-medium">{((mission.tokensInput ?? 0) + (mission.tokensOutput ?? 0)).toLocaleString()}</span> tokens
              <span className="mx-1 opacity-40">·</span>
              <span className="opacity-60">↑{(mission.tokensInput ?? 0).toLocaleString()} ↓{(mission.tokensOutput ?? 0).toLocaleString()}</span>
            </span>
            {(mission.estimatedCostUsd ?? 0) > 0 && (
              <span>
                ~<span className="text-foreground/70 font-medium">${(mission.estimatedCostUsd ?? 0).toFixed(4)}</span>
              </span>
            )}
          </div>
        )}

        {cursorMode && activity.length > 0 && (
          <div className="mt-3 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs space-y-1 max-h-24 overflow-y-auto">
            <p className="font-medium text-blue-400">Activity (Cursor)</p>
            {activity.slice(-6).map((ev, i) => (
              <p key={i} className="text-muted-foreground">
                <span className="text-foreground/80">{ev.roleName ?? "—"}</span>
                {" · "}{ev.type}{ev.message ? `: ${ev.message.slice(0, 80)}` : ""}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Body — 3-column layout */}
      <div className="flex flex-1 min-h-0">

        {/* Left — task graph */}
        <div className="w-52 flex-shrink-0 border-r border-border p-4 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Agents</p>
          <div className="space-y-1">
            {taskGraph.map((task, i) => {
              const art = artifacts.find(a => a.roleId === task.roleId)
              const isSelected = selectedNodeId === task.id
              const isStreaming = streamingRole === task.roleName
              return (
                <div key={task.id}>
                  <button
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent",
                      isStreaming && "bg-blue-500/10"
                    )}
                    onClick={() => {
                      setSelectedNodeId(isSelected ? null : task.id)
                      if (art) setActiveArtifactId(art.id)
                      else setActiveArtifactId(null)
                    }}
                  >
                    <TaskIcon status={task.status} />
                    <span className={cn(
                      "flex-1 text-left",
                      task.status === "pending" && !isSelected ? "text-muted-foreground/50" : ""
                    )}>
                      {task.roleName}
                    </span>
                    {art && <div className="h-1.5 w-1.5 rounded-full bg-green-400/60 flex-shrink-0" title="Has artifact" />}
                  </button>
                  {i < taskGraph.length - 1 && (
                    <div className="ml-4 h-3 w-px bg-border" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Agent behavior */}
          <Separator className="my-4" />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Behavior</p>
            {(["assume_and_document", "ask_me", "async"] as const).map(b => {
              const labels = {
                assume_and_document: { label: "Assume", desc: "Never pauses, logs assumptions" },
                ask_me:              { label: "Ask me", desc: "Pauses for blocking questions" },
                async:               { label: "Async",  desc: "Logs questions, keeps going" },
              }
              const active = mission.agentBehavior === b
              return (
                <button
                  key={b}
                  disabled={mission.status === "done" || running}
                  onClick={async () => {
                    await fetch(`/api/missions/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ agentBehavior: b }),
                    })
                    setMission(prev => prev ? { ...prev, agentBehavior: b } : prev)
                  }}
                  className={`w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors disabled:opacity-50 ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:bg-accent text-muted-foreground"
                  }`}
                >
                  <p className="font-medium">{labels[b].label}</p>
                  <p className={`text-[10px] mt-0.5 ${active ? "text-primary/70" : "text-muted-foreground/60"}`}>{labels[b].desc}</p>
                </button>
              )
            })}
          </div>

          {/* Questions */}
          {questions.length > 0 && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Questions ({questions.length})
                </p>
                <div className="space-y-2">
                  {questions.map(q => (
                    <div key={q.id} className="rounded-md bg-muted/50 p-2 text-xs">
                      <p className="text-muted-foreground font-medium">{q.roleName}</p>
                      <p className="mt-0.5">{q.question}</p>
                      {q.answer ? (
                        <p className="mt-1 text-green-400">→ {q.answer}</p>
                      ) : executionMode === "builtin" ? (
                        <div className="mt-2 flex gap-1">
                          <input
                            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                            placeholder="Your answer…"
                            value={answerDrafts[q.id] ?? ""}
                            onChange={e => setAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && submitAnswer(q.id)}
                          />
                          <Button size="sm" className="h-7 text-xs" onClick={() => submitAnswer(q.id)}>Save</Button>
                        </div>
                      ) : (
                        <p className="mt-1 text-yellow-400/70">Answer in Cursor chat</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Center — artifact viewer + live log */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Artifact tabs */}
          {artifacts.length > 0 && (
            <div className="flex items-center gap-1 border-b border-border px-4 py-2 overflow-x-auto">
              {artifacts.map(art => (
                <button
                  key={art.id}
                  onClick={() => setActiveArtifactId(art.id)}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    activeArtifactId === art.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <Brain className="h-3 w-3" />
                  {art.roleName} — {art.type}
                </button>
              ))}
              {streamingRole && (
                <div className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium bg-blue-500/10 text-blue-400 whitespace-nowrap">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {streamingRole} — writing…
                </div>
              )}
            </div>
          )}

          {/* Live log panel */}
          {liveLog.length > 0 && (
            <div className="border-b border-border bg-muted/20">
              <button
                onClick={() => setShowLog(v => !v)}
                className="flex w-full items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Terminal className="h-3.5 w-3.5 text-green-400" />
                <span className="font-medium">Live Log</span>
                {running && <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />}
                <span className="ml-auto flex items-center gap-1">
                  {liveLog.length} events
                  {showLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </span>
              </button>
              {showLog && (
                <div
                  ref={logRef}
                  className="max-h-40 overflow-y-auto px-4 pb-3 font-mono text-[11px] leading-relaxed space-y-0.5"
                >
                  {liveLog.map((entry, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-muted-foreground/40 flex-shrink-0 tabular-nums">{entry.ts}</span>
                      {entry.role !== "__chunk__" && (
                        <span className="text-blue-400/70 flex-shrink-0">[{entry.role}]</span>
                      )}
                      <span className={entry.role === "__chunk__" ? "text-foreground/60 pl-16 whitespace-pre-wrap break-all" : "text-green-400/80"}>
                        {entry.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Artifact content */}
          <div className="flex-1 overflow-y-auto p-6">
            {streamingRole && streamingContent ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  <span className="text-sm font-medium text-blue-400">{streamingRole} is writing…</span>
                </div>
                <pre className="whitespace-pre-wrap font-mono text-sm text-foreground/90 leading-relaxed">
                  {streamingContent}
                  <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
                </pre>
              </div>
            ) : activeArtifact ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-medium">{activeArtifact.roleName} — {activeArtifact.type}</span>
                </div>
                <pre className="whitespace-pre-wrap font-mono text-sm text-foreground/90 leading-relaxed">
                  {activeArtifact.content}
                </pre>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Crosshair className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Ready to run</p>
                <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
                  Click &quot;Run next role&quot; to start the {taskGraph[0]?.roleName ?? "Architect"}
                </p>
                {canRun && (
                  <Button className="mt-4 gap-2" onClick={runNextRole}>
                    <Play className="h-4 w-4" />
                    Run {taskGraph.find(t => t.status === "pending")?.roleName ?? "next role"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
