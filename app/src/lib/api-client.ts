import { isDemoMode } from "@/lib/demo/config"
import { demoFetch } from "@/lib/demo/client"

/** Drop-in fetch replacement — uses demo-bundle.json on GitHub Pages, real API locally. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isDemoMode()) return fetch(input, init)

  const path = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.pathname + input.search
      : input.url

  return demoFetch(path, init)
}
