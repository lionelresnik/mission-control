import type { NextConfig } from "next"

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true"
const repoBase = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

const nextConfig: NextConfig = {
  ...(isDemo ? { output: "export" as const } : {}),
  ...(repoBase ? { basePath: repoBase, assetPrefix: repoBase } : {}),
  images: { unoptimized: true },
  devIndicators: isDemo ? false : { position: "bottom-right" },
}

export default nextConfig
