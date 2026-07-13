"use client"

import { useEffect, useRef } from "react"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  itemName?: string
  itemMeta?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export function ConfirmDialog({
  open,
  title,
  description,
  itemName,
  itemMeta,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  danger = true,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus cancel by default, trap Escape
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus()
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel() }
      window.addEventListener("keydown", onKey)
      return () => window.removeEventListener("keydown", onKey)
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={cn(
          "relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-2xl",
          "animate-in fade-in zoom-in-95 duration-150"
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 space-y-4">
          {/* Icon + title */}
          <div className="flex items-start gap-3">
            <div className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0",
              danger ? "bg-red-500/15" : "bg-yellow-500/15"
            )}>
              <AlertTriangle className={cn("h-5 w-5", danger ? "text-red-400" : "text-yellow-400")} />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-none">{title}</h2>
              {itemName && (
                <p className="text-sm text-muted-foreground mt-1 font-mono">{itemName}</p>
              )}
            </div>
          </div>

          {/* What's being deleted */}
          {itemMeta && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">{itemMeta}</p>
            </div>
          )}

          {/* Description */}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}

          {/* Warning */}
          <p className="text-xs text-muted-foreground/70 border-t border-border pt-3">
            This action <span className="font-medium text-foreground">cannot be undone</span>.
          </p>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <Button ref={cancelRef} variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button
              variant={danger ? "destructive" : "default"}
              onClick={onConfirm}
              className="flex-1"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
