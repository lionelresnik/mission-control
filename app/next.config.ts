import type { NextConfig } from "next"

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true"
const repoBase = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

const nextConfig: NextConfig = {
  ...(isDemo ? { output: "export" as const } : {}),
  ...(repoBase ? { basePath: repoBase, assetPrefix: repoBase } : {}),
  images: { unoptimized: true },
  // Off in dev: Next.js injects a hidden <nextjs-portal> that Cursor's embedded browser
  // surfaces in the DOM inspector; Chrome hides it. Errors still show without the badge.
  devIndicators: false,
}

export default nextConfig
