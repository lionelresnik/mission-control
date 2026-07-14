export type ContentFormat = "html" | "markdown" | "text"
export type SourceKind = "task" | "doc" | "infra" | "standup" | "architecture" | "other"

export function detectContentFormat(content: string, sourceFile?: string | null): ContentFormat {
  const path = sourceFile?.split(":").pop() ?? ""
  if (path.endsWith(".html") || /^\s*<!DOCTYPE/i.test(content) || /^\s*<html[\s>]/i.test(content)) {
    return "html"
  }
  if (path.endsWith(".md") || /^#{1,3}\s/m.test(content)) return "markdown"
  return "text"
}

export function titleFromContent(content: string, filePath: string): string {
  const htmlTitle = content.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (htmlTitle) {
    return htmlTitle[1].replace(/^Architecture:\s*/i, "").trim() || basename(filePath)
  }
  const mdTitle = content.match(/^#\s+(.+)$/m)
  if (mdTitle) return mdTitle[1].trim()
  return basename(filePath)
}

function basename(filePath: string): string {
  return filePath.replace(/\.(md|html|json)$/i, "").replace(/.*\//, "")
}

export function classifyCcPath(filePath: string, sourcePrefix: string): {
  type: "architecture" | "pattern" | "adr" | "standard" | "database" | "infrastructure" | "logs" | "services" | "runbook" | "other"
  sourceKind: SourceKind
  tags: string[]
} {
  const lower = filePath.toLowerCase()
  const segments = filePath.split("/")
  const ws = segments.length > 1 ? segments[0] : "shared"
  const tags: string[] = [`workspace:${ws}`, `format:${filePath.endsWith(".html") ? "html" : "markdown"}`]

  if (sourcePrefix === "task-history") {
    const ticket = filePath.match(/([A-Z]+-\d+)/)
    if (ticket) tags.push(ticket[1])
    tags.push("kind:task", "task-history")
    return { type: "runbook", sourceKind: "task", tags }
  }

  if (sourcePrefix === "standups") {
    tags.push("kind:standup")
    return { type: "other", sourceKind: "standup", tags }
  }

  if (lower.includes("architecture") || lower.endsWith("architecture.html")) {
    tags.push("kind:architecture")
    return { type: "architecture", sourceKind: "architecture", tags }
  }
  if (lower.includes("runbook")) {
    tags.push("kind:doc")
    return { type: "runbook", sourceKind: "doc", tags }
  }
  if (lower.includes("database") || lower.includes("/db")) {
    tags.push("kind:infra")
    return { type: "database", sourceKind: "infra", tags }
  }
  if (lower.includes("infrastructure") || lower.includes("infra")) {
    tags.push("kind:infra")
    return { type: "infrastructure", sourceKind: "infra", tags }
  }
  if (lower.includes("logs")) {
    tags.push("kind:infra")
    return { type: "logs", sourceKind: "infra", tags }
  }
  if (lower.includes("services")) {
    tags.push("kind:doc")
    return { type: "services", sourceKind: "doc", tags }
  }
  if (lower.includes("adr")) {
    tags.push("kind:doc")
    return { type: "adr", sourceKind: "doc", tags }
  }
  if (lower.includes("pattern")) {
    tags.push("kind:doc")
    return { type: "pattern", sourceKind: "doc", tags }
  }

  tags.push("kind:doc")
  return { type: "other", sourceKind: "doc", tags }
}

export function sourceKindFromTags(tags: string[] | null | undefined): SourceKind | null {
  if (!tags) return null
  const kind = tags.find(t => t.startsWith("kind:"))
  if (!kind) return null
  return kind.slice(5) as SourceKind
}

/** Minimal safe markdown → HTML for knowledge display (no raw HTML in source). */
export function markdownToHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  return escaped
    .replace(/^### (.+)$/gm, "<h3 class=\"text-sm font-semibold mt-3 mb-1\">$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class=\"text-base font-semibold mt-4 mb-2\">$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class=\"text-lg font-bold mt-4 mb-2\">$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code class=\"rounded bg-muted px-1 py-0.5 text-[11px]\">$1</code>")
    .replace(/^- (.+)$/gm, "<li class=\"ml-4 list-disc\">$1</li>")
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul class=\"my-2 space-y-0.5\">${m}</ul>`)
    .replace(/\n\n/g, "</p><p class=\"my-2\">")
    .replace(/^(.+)$/gm, (line) =>
      line.startsWith("<") ? line : `<p class=\"my-1 leading-relaxed\">${line}</p>`
    )
}
