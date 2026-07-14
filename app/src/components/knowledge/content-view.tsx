"use client"

import { useMemo } from "react"
import { detectContentFormat, markdownToHtml } from "@/lib/knowledge/content-format"
import { cn } from "@/lib/utils"

type Props = {
  content: string
  sourceFile?: string | null
  compact?: boolean
  className?: string
}

export function KnowledgeContentView({ content, sourceFile, compact, className }: Props) {
  const format = useMemo(() => detectContentFormat(content, sourceFile), [content, sourceFile])

  if (format === "html") {
    return (
      <div className={cn("rounded-md border border-border overflow-hidden bg-[#1a1a2e]", className)}>
        <iframe
          title="Document preview"
          sandbox="allow-same-origin"
          srcDoc={content}
          className={cn("w-full border-0 bg-transparent", compact ? "h-[280px]" : "min-h-[420px] h-[60vh]")}
        />
      </div>
    )
  }

  if (format === "markdown") {
    const html = markdownToHtml(content)
    return (
      <div
        className={cn(
          "text-sm text-foreground/90 rounded-md border border-border/50 bg-muted/20 p-4 overflow-auto",
          compact ? "max-h-[280px]" : "max-h-[70vh]",
          className
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return (
    <pre
      className={cn(
        "text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words bg-muted/30 rounded p-3 leading-relaxed overflow-auto",
        compact ? "max-h-[280px]" : "max-h-[70vh]",
        className
      )}
    >
      {content}
    </pre>
  )
}
