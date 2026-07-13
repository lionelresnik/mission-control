export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true"
}

export function basePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? ""
}
