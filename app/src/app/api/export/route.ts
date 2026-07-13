import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { projects, roles, teams, knowledgeEntries, settings, todos } from "@/lib/db/schema"
import * as yaml from "js-yaml"
import JSZip from "jszip"

// ─── v1 YAML conversion helpers ──────────────────────────────────────────────

function roleToV1Yaml(role: Record<string, unknown>): string {
  const v1 = {
    id: role.id,
    name: role.name,
    display_name: role.displayName,
    description: role.description ?? null,
    color: role.color ?? null,
    icon: role.icon ?? null,
    model: role.model ?? "claude-sonnet",
    temperature: role.temperature ?? 0.7,
    max_tokens: role.maxTokens ?? 4096,
    memory_scope: role.memoryScope ?? "mission",
    is_built_in: role.isBuiltIn ?? false,
    system_prompt: role.systemPrompt,
    tools: role.tools ?? [],
    allowed_actions: role.allowedActions ?? [],
  }
  return yaml.dump(v1, { lineWidth: 120 })
}

function teamToV1Yaml(
  team: Record<string, unknown>,
  roleById: Record<string, { name: string }>
): string {
  const members = (team.members as { roleId: string; order: number }[] ?? [])
    .sort((a, b) => a.order - b.order)
    .map(m => ({ role: roleById[m.roleId]?.name ?? m.roleId, order: m.order }))

  const v1 = {
    id: team.id,
    name: team.name,
    description: team.description ?? null,
    is_built_in: team.isBuiltIn ?? false,
    leader: team.leaderId ? roleById[team.leaderId as string]?.name ?? team.leaderId : null,
    members,
    workflow: team.workflow ?? [],
    knowledge_filters: team.knowledgeFilters ?? [],
    mcps: team.mcps ?? [],
  }
  return yaml.dump(v1, { lineWidth: 120 })
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const format = searchParams.get("format") ?? "json" // json | yaml-zip

  const db = getDb()
  const [
    projectRows, roleRows, teamRows, knowledgeRows, settingRows, todoRows,
  ] = await Promise.all([
    db.select().from(projects),
    db.select().from(roles),
    db.select().from(teams),
    db.select().from(knowledgeEntries),
    db.select().from(settings),
    db.select().from(todos),
  ])

  // Strip embeddings (binary blobs, not portable)
  const knowledgeSafe = knowledgeRows.map(({ embedding: _emb, ...rest }) => rest)

  const settingsMap = Object.fromEntries(settingRows.map(s => [s.key, s.value]))

  const bundle = {
    _schema: "mission-control",
    _version: "1.0",
    _exported: new Date().toISOString(),
    projects: projectRows,
    roles: roleRows,
    teams: teamRows,
    knowledge: knowledgeSafe,
    settings: settingsMap,
    todos: todoRows,
  }

  if (format === "yaml-zip") {
    const zip = new JSZip()
    const roleById = Object.fromEntries(roleRows.map(r => [r.id, r]))

    zip.folder("roles")
    for (const role of roleRows) {
      zip.file(`roles/${role.name}.yaml`, roleToV1Yaml(role as Record<string, unknown>))
    }

    zip.folder("teams")
    for (const team of teamRows) {
      const safeName = (team.name as string).toLowerCase().replace(/\s+/g, "-")
      zip.file(
        `teams/${safeName}.yaml`,
        teamToV1Yaml(team as Record<string, unknown>, roleById as Record<string, { name: string }>)
      )
    }

    // Also include full JSON bundle for knowledge/settings/projects
    zip.file("mission-control-bundle.json", JSON.stringify(bundle, null, 2))

    const content = await zip.generateAsync({ type: "nodebuffer" })
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="mission-control-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      },
    })
  }

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="mission-control-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
