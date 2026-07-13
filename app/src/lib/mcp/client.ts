/**
 * MCP integration client — GitHub, Jira, Slack
 * Each adapter activates automatically when its credentials exist in settings.
 */

import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

const { settings } = schema

async function getSetting(key: string): Promise<string | null> {
  const rows = await getDb().select().from(settings).where(eq(settings.key, key))
  const val = rows[0]?.value
  return typeof val === "string" && val.length > 0 ? val : null
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

export async function githubCreatePR(opts: {
  owner: string; repo: string; title: string
  body: string; head: string; base?: string
}): Promise<{ url: string; number: number } | null> {
  const token = await getSetting("githubToken")
  if (!token) return null
  const res = await fetch(`https://api.github.com/repos/${opts.owner}/${opts.repo}/pulls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" },
    body: JSON.stringify({ title: opts.title, body: opts.body, head: opts.head, base: opts.base ?? "main" }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return { url: data.html_url, number: data.number }
}

export async function githubGetPRStatus(opts: {
  owner: string; repo: string; prNumber: number
}): Promise<{ state: string; mergeable: boolean | null; checks: string } | null> {
  const token = await getSetting("githubToken")
  if (!token) return null
  const res = await fetch(`https://api.github.com/repos/${opts.owner}/${opts.repo}/pulls/${opts.prNumber}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
  })
  if (!res.ok) return null
  const data = await res.json()
  return { state: data.state, mergeable: data.mergeable, checks: data.mergeable_state }
}

// ─── Jira ─────────────────────────────────────────────────────────────────────

export async function jiraGetTicket(ticketId: string): Promise<{
  summary: string; status: string; assignee: string | null; description: string
} | null> {
  const [token, email, baseUrl] = await Promise.all([
    getSetting("jiraApiToken"), getSetting("jiraEmail"), getSetting("jiraBaseUrl"),
  ])
  if (!token || !email || !baseUrl) return null
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${ticketId}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`, Accept: "application/json" },
  })
  if (!res.ok) return null
  const data = await res.json()
  return {
    summary: data.fields.summary,
    status: data.fields.status.name,
    assignee: data.fields.assignee?.displayName ?? null,
    description: data.fields.description?.content?.[0]?.content?.[0]?.text ?? "",
  }
}

export async function jiraAddComment(ticketId: string, comment: string): Promise<boolean> {
  const [token, email, baseUrl] = await Promise.all([
    getSetting("jiraApiToken"), getSetting("jiraEmail"), getSetting("jiraBaseUrl"),
  ])
  if (!token || !email || !baseUrl) return false
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${ticketId}/comment`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] },
    }),
  })
  return res.ok
}

// ─── Slack ────────────────────────────────────────────────────────────────────

export async function slackPost(channel: string, text: string, blocks?: unknown[]): Promise<boolean> {
  const token = await getSetting("slackBotToken")
  if (!token) return false
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text, ...(blocks ? { blocks } : {}) }),
  })
  if (!res.ok) return false
  const data = await res.json()
  return data.ok
}

export async function slackPostMissionSummary(opts: {
  channel: string; missionName: string; goal: string
  status: string; artifactCount: number; ticketId?: string; dashboardUrl?: string
}): Promise<boolean> {
  const statusEmoji = opts.status === "done" ? "✅" : opts.status === "failed" ? "❌" : "🔄"
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: `${statusEmoji} *Mission ${opts.status}:* ${opts.missionName}` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Goal:*\n${opts.goal.slice(0, 100)}` },
        { type: "mrkdwn", text: `*Artifacts:*\n${opts.artifactCount} generated` },
        ...(opts.ticketId ? [{ type: "mrkdwn", text: `*Ticket:*\n${opts.ticketId}` }] : []),
      ],
    },
    ...(opts.dashboardUrl ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "View in Mission Control" }, url: opts.dashboardUrl }] }] : []),
  ]
  return slackPost(opts.channel, `${statusEmoji} Mission ${opts.status}: ${opts.missionName}`, blocks)
}

// ─── Status check ─────────────────────────────────────────────────────────────

export async function getIntegrationStatus(): Promise<{ github: boolean; jira: boolean; slack: boolean }> {
  const [github, jira, slack] = await Promise.all([
    getSetting("githubToken"), getSetting("jiraApiToken"), getSetting("slackBotToken"),
  ])
  return { github: !!github, jira: !!jira, slack: !!slack }
}
