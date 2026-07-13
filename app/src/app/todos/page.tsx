"use client"

import { useEffect, useState } from "react"
import { ListTodo, Plus, CheckCircle2, Circle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

type Todo = {
  id: string
  content: string
  status: "pending" | "in_progress" | "done"
  priority: string | null
  ticketTag: string | null
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [newContent, setNewContent] = useState("")

  const load = () =>
    apiFetch("/api/todos")
      .then(r => r.json())
      .then(setTodos)
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const addTodo = async () => {
    if (!newContent.trim()) return
    await apiFetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent.trim(), priority: "medium" }),
    })
    setNewContent("")
    load()
  }

  const setStatus = async (id: string, status: Todo["status"]) => {
    await apiFetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    load()
  }

  const open = todos.filter(t => t.status !== "done")

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListTodo className="h-6 w-6" />
          Todos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {open.length} open · also available via <code className="text-xs">@lu todo add</code>
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add a todo…"
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTodo()}
        />
        <Button onClick={addTodo} className="gap-1">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      <ul className="space-y-2">
        {todos.map(t => (
          <li
            key={t.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3",
              t.status === "done" && "opacity-50"
            )}
          >
            <button
              type="button"
              onClick={() => setStatus(t.id, t.status === "done" ? "pending" : "done")}
              className="mt-0.5 text-muted-foreground hover:text-primary"
            >
              {t.status === "done"
                ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                : <Circle className="h-4 w-4" />
              }
            </button>
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm", t.status === "done" && "line-through")}>{t.content}</p>
              <div className="flex gap-2 mt-1">
                {t.priority && <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>}
                {t.ticketTag && <Badge variant="secondary" className="text-[10px]">{t.ticketTag}</Badge>}
              </div>
            </div>
          </li>
        ))}
        {todos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No todos yet.</p>
        )}
      </ul>
    </div>
  )
}
