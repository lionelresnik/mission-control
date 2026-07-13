import { NextRequest, NextResponse } from "next/server"
import { getIntegrationStatus, jiraGetTicket, githubGetPRStatus, slackPost } from "@/lib/mcp/client"

export async function GET() {
  try {
    const status = await getIntegrationStatus()
    return NextResponse.json(status)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, ...args } = await req.json()

    switch (action) {
      case "jira.getTicket":
        return NextResponse.json(await jiraGetTicket(args.ticketId))

      case "github.getPR":
        return NextResponse.json(await githubGetPRStatus(args))

      case "slack.post":
        return NextResponse.json({ ok: await slackPost(args.channel, args.text) })

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
