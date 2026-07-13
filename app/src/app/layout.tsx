import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/layout/sidebar"
import { DemoBanner } from "@/components/layout/demo-banner"
import { ThemeProvider } from "@/components/layout/theme-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Orchestrate AI agent crews across workspaces and projects — missions and knowledge.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex-1 overflow-y-auto flex flex-col">
              <DemoBanner />
              <div className="flex-1 overflow-y-auto">{children}</div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
