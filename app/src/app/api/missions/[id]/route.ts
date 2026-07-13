import { NextRequest, NextResponse } from "next/server"
import { getMission, updateMission, getMissionArtifacts, getMissionQuestions, getProject } from "@/lib/db/queries"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const mission = await getMission(id)
    if (!mission) return NextResponse.json({ error: "not found" }, { status: 404 })

    const [artifactList, questions, project] = await Promise.all([
      getMissionArtifacts(id),
      getMissionQuestions(id),
      mission.projectId ? getProject(mission.projectId) : Promise.resolve(null),
    ])

    const projectContext = project ? {
      jiraBaseUrl: project.jiraUrl ?? null,
      slackChannel: project.slackChannel ?? null,
    } : null

    return NextResponse.json({ ...mission, artifacts: artifactList, questions, project: projectContext })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const updated = await updateMission(id, body)
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
