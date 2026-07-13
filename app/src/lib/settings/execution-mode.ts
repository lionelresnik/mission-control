export type ExecutionMode = "cursor" | "builtin"

export const EXECUTION_MODE_KEY = "executionMode"
export const DEFAULT_EXECUTION_MODE: ExecutionMode = "cursor"

export function parseExecutionMode(value: unknown): ExecutionMode {
  return value === "builtin" ? "builtin" : "cursor"
}

export function isCursorMode(mode: ExecutionMode): boolean {
  return mode === "cursor"
}
