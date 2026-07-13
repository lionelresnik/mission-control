import type { TaskGraphNode } from "@/lib/db/schema"

export function findNextPendingTask(taskGraph: TaskGraphNode[]): TaskGraphNode | undefined {
  return taskGraph.find(t => {
    if (t.status !== "pending") return false
    return t.dependsOn.every(dep => {
      const depTask = taskGraph.find(d => d.id === dep)
      return depTask?.status === "done" || depTask?.status === "skipped"
    })
  })
}

export function markTaskRunning(
  taskGraph: TaskGraphNode[],
  taskId: string
): TaskGraphNode[] {
  return taskGraph.map(t =>
    t.id === taskId
      ? { ...t, status: "running" as const, startedAt: new Date().toISOString() }
      : t
  )
}

export function markTaskDone(
  taskGraph: TaskGraphNode[],
  taskId: string,
  artifactId?: string
): TaskGraphNode[] {
  return taskGraph.map(t =>
    t.id === taskId
      ? {
          ...t,
          status: "done" as const,
          completedAt: new Date().toISOString(),
          ...(artifactId ? { artifactId } : {}),
        }
      : t
  )
}

export function calcProgress(taskGraph: TaskGraphNode[]): number {
  if (taskGraph.length === 0) return 0
  const done = taskGraph.filter(t => t.status === "done" || t.status === "skipped").length
  return Math.round((done / taskGraph.length) * 100)
}

export function allTasksComplete(taskGraph: TaskGraphNode[]): boolean {
  return taskGraph.every(t => t.status === "done" || t.status === "skipped")
}
