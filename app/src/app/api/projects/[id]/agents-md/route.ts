import { NextRequest, NextResponse } from "next/server"
import { getProject, updateProject } from "@/lib/db/queries"
import fs from "fs/promises"
import path from "path"
import os from "os"

const agentsMdDir = path.join(os.homedir(), ".mission-control", "agents-md")

async function getLocalPath(slug: string) {
  const dir = path.join(agentsMdDir, slug)
  await fs.mkdir(dir, { recursive: true })
  return path.join(dir, "AGENTS.md")
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const project = await getProject(id)
    if (!project) return NextResponse.json({ error: "not found" }, { status: 404 })

    // Try DB first, then local file, then return default template
    if (project.agentsMdLocal) {
      return NextResponse.json({ content: project.agentsMdLocal, source: "db" })
    }

    const slug = project.githubRepo ?? project.name.toLowerCase().replace(/\s+/g, "-")
    const localPath = await getLocalPath(slug)
    try {
      const content = await fs.readFile(localPath, "utf8")
      return NextResponse.json({ content, source: "file" })
    } catch {
      // Return template
      const template = buildTemplate(project.name, project.githubRepo ?? "", project.githubOwner ?? "")
      return NextResponse.json({ content: template, source: "template" })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { content } = await req.json()
    const project = await getProject(id)
    if (!project) return NextResponse.json({ error: "not found" }, { status: 404 })

    // Save to DB
    await updateProject(id, { agentsMdLocal: content, agentsMdStatus: "local" })

    // Also write to local file
    const slug = project.githubRepo ?? project.name.toLowerCase().replace(/\s+/g, "-")
    const localPath = await getLocalPath(slug)
    await fs.writeFile(localPath, content, "utf8")

    return NextResponse.json({ ok: true, path: localPath })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function buildTemplate(name: string, repo: string, owner: string) {
  return `# AGENTS.md — ${name}

## What this project does
<Describe what this project does in 1-2 sentences>

## Architecture
<Describe the high-level architecture: services, layers, key components>

## Key services and their hosts/ports
| Service | Host | Port | Notes |
|---|---|---|---|
| <service> | <host> | <port> | <notes> |

## Databases
| Database | Type | Connection pattern |
|---|---|---|
| <db-name> | postgres/mysql/redis | via DB_HOST env var, port XXXX |

## Key environment variables
\`\`\`
DATABASE_URL=
API_KEY=
\`\`\`

## How to run locally
\`\`\`bash
# Install dependencies
npm install

# Start dev server
npm run dev
\`\`\`

## How to run tests
\`\`\`bash
npm test
\`\`\`

## Coding conventions
- Language: <TypeScript / Go / Python>
- Formatter: <prettier / gofmt / black>
- Patterns: <describe key patterns agents should follow>

## Do not touch
- <list files or directories agents must never modify>

## Current focus
- <what the team is actively working on>
- Linked repo: ${owner ? `https://github.com/${owner}/${repo}` : "<add GitHub repo>"}
`
}
