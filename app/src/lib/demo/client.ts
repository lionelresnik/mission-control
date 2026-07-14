import type { DemoBundle } from "./types"
import { basePath } from "./config"

let bundleCache: DemoBundle | null = null

export async function loadDemoBundle(): Promise<DemoBundle> {
  if (bundleCache) return bundleCache
  const res = await fetch(`${basePath()}/demo-bundle.json`)
  if (!res.ok) throw new Error("Failed to load demo-bundle.json")
  bundleCache = await res.json()
  return bundleCache!
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function readOnlyResponse(): Response {
  return jsonResponse({ error: "Demo mode is read-only", demo: true }, 403)
}

function matchPath(path: string): { name: string; params: Record<string, string> } {
  const clean = path.replace(/\?.*$/, "")
  const segments = clean.split("/").filter(Boolean)

  if (segments[0] !== "api") return { name: "unknown", params: {} }

  if (segments[1] === "missions" && segments[2] && segments[3] === "run") {
    return { name: "mission-run", params: { id: segments[2] } }
  }
  if (segments[1] === "missions" && segments[2] && segments[3] === "activity") {
    return { name: "mission-activity", params: { id: segments[2] } }
  }
  if (segments[1] === "missions" && segments[2]) {
    return { name: "mission", params: { id: segments[2] } }
  }
  if (segments[1] === "missions") return { name: "missions", params: {} }

  if (segments[1] === "projects" && segments[2] && segments[3] === "agents-md") {
    return { name: "project-agents-md", params: { id: segments[2] } }
  }
  if (segments[1] === "projects" && segments[2]) {
    return { name: "project", params: { id: segments[2] } }
  }
  if (segments[1] === "projects") return { name: "projects", params: {} }

  if (segments[1] === "workspaces" && segments[2]) {
    return { name: "workspace", params: { id: segments[2] } }
  }
  if (segments[1] === "workspaces") return { name: "workspaces", params: {} }

  if (segments[1] === "knowledge" && segments[2] === "embed") {
    return { name: "knowledge-embed", params: {} }
  }
  if (segments[1] === "knowledge" && segments[2] === "search") {
    return { name: "knowledge-search", params: {} }
  }
  if (segments[1] === "knowledge" && segments[2]) {
    return { name: "knowledge-item", params: { id: segments[2] } }
  }
  if (segments[1] === "knowledge") return { name: "knowledge", params: {} }

  if (segments[1] === "teams" && segments[2]) {
    return { name: "team", params: { id: segments[2] } }
  }
  if (segments[1] === "teams") return { name: "teams", params: {} }
  if (segments[1] === "crews") return { name: "teams", params: {} }

  if (segments[1] === "roles" && segments[2]) {
    return { name: "role", params: { id: segments[2] } }
  }
  if (segments[1] === "roles") return { name: "roles", params: {} }

  if (segments[1] === "settings" && segments[2] === "execution-mode") {
    return { name: "execution-mode", params: {} }
  }
  if (segments[1] === "settings") return { name: "settings", params: {} }
  if (segments[1] === "questions" && segments[2]) {
    return { name: "question", params: { id: segments[2] } }
  }
  if (segments[1] === "mcp" && segments[2] === "status") return { name: "mcp-status", params: {} }
  if (segments[1] === "todos") return { name: "todos", params: {} }

  return { name: "unknown", params: {} }
}

export async function demoFetch(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase()
  const url = input.startsWith("http") ? new URL(input) : new URL(input, "http://local")
  const { name, params } = matchPath(url.pathname)

  if (method !== "GET") {
    if (name === "knowledge-search" && method === "POST") {
      const bundle = await loadDemoBundle()
      const body = init?.body ? JSON.parse(init.body as string) : {}
      const q = String(body.query ?? "").toLowerCase()
      const results = bundle.knowledge
        .filter(k => {
          const title = String(k.title ?? "").toLowerCase()
          const content = String(k.content ?? "").toLowerCase()
          return !q || title.includes(q) || content.includes(q)
        })
        .slice(0, 10)
        .map(k => ({ ...k, _score: 0.85, _mode: "text" }))
      return jsonResponse(results)
    }
    return readOnlyResponse()
  }

  const bundle = await loadDemoBundle()

  switch (name) {
    case "missions":
      return jsonResponse(bundle.missions)
    case "mission": {
      const mission = bundle.missions.find(m => m.id === params.id)
      if (!mission) return jsonResponse({ error: "not found" }, 404)
      const detail = bundle.missionDetails[params.id] ?? { artifacts: [], questions: [], project: null }
      return jsonResponse({ ...mission, ...detail })
    }
    case "mission-activity":
      return jsonResponse(bundle.missionActivities?.[params.id] ?? [])
    case "mission-run":
      return readOnlyResponse()
    case "projects":
      return jsonResponse(bundle.projects)
    case "project": {
      const project = bundle.projects.find(p => p.id === params.id)
      if (!project) return jsonResponse({ error: "not found" }, 404)
      return jsonResponse(project)
    }
    case "project-agents-md": {
      const doc = bundle.projectAgentsMd[params.id]
      if (!doc) return jsonResponse({ content: "# AGENTS.md\n\nDemo project context.", source: "template" })
      return jsonResponse(doc)
    }
    case "workspaces":
      return jsonResponse(bundle.workspaces)
    case "knowledge":
      return jsonResponse(bundle.knowledge)
    case "knowledge-embed": {
      const total = bundle.knowledge.length
      return jsonResponse({ total, embedded: total, missing: 0 })
    }
    case "teams":
      return jsonResponse(bundle.teams)
    case "roles":
      return jsonResponse(bundle.roles)
    case "settings":
      return jsonResponse(bundle.settings)
    case "execution-mode":
      return jsonResponse({ executionMode: bundle.settings.executionMode ?? "cursor" })
    case "mcp-status":
      return jsonResponse(bundle.mcpStatus)
    case "todos":
      return jsonResponse(
        bundle.todos.map(t => {
          const missionId = t.missionId as string | undefined
          const mission = missionId
            ? bundle.missions.find(m => m.id === missionId)
            : null
          const projectId = mission?.projectId as string | undefined
          const project = projectId
            ? bundle.projects.find(p => p.id === projectId)
            : null
          return {
            ...t,
            mission: mission ? { id: mission.id, name: mission.name } : null,
            project: project ? { id: project.id, name: project.name, color: project.color } : null,
          }
        }),
      )
    default:
      return jsonResponse({ error: `Demo: unknown route ${url.pathname}` }, 404)
  }
}
