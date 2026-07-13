"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "@/components/layout/theme-provider"
import { useState, useEffect } from "react"
import {
  LayoutDashboard,
  FolderOpen,
  Layers,
  UsersRound,
  UserCog,
  Crosshair,
  Brain,
  ListTodo,
  Settings,
  Sun,
  Moon,
  ChevronRight,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspaces", label: "Workspaces", icon: Layers },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/crews", label: "Crews", icon: UsersRound },
  { href: "/roles", label: "Roles", icon: UserCog },
  { href: "/missions", label: "Missions", icon: Crosshair },
  { href: "/todos", label: "Todos", icon: ListTodo },
  { href: "/knowledge", label: "Knowledge", icon: Brain },
]

const bottom = [
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [logoClicks, setLogoClicks] = useState(0)
  const [showEasterEgg, setShowEasterEgg] = useState(false)
  const [batPhase, setBatPhase] = useState(0)

  const handleLogoClick = () => {
    const next = logoClicks + 1
    setLogoClicks(next)
    if (next >= 5) {
      setLogoClicks(0)
      setShowEasterEgg(true)
      setBatPhase(0)
      setTimeout(() => setBatPhase(1), 400)
      setTimeout(() => setBatPhase(2), 900)
      setTimeout(() => setBatPhase(3), 1400)
    }
  }

  return (
    <>
    {/* ── Easter egg modal ── */}
    {showEasterEgg && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center"
      >
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

        {/* Bat signal beam */}
        <div className={cn(
          "absolute bottom-0 left-1/2 -translate-x-1/2 w-[2px] transition-all duration-700",
          batPhase >= 1 ? "h-full opacity-100" : "h-0 opacity-0"
        )}>
          <div className="w-64 h-full -translate-x-1/2 bg-gradient-to-t from-yellow-400/30 via-yellow-300/10 to-transparent" />
        </div>

        {/* Flying bats */}
        {batPhase >= 2 && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <span
                key={i}
                className="absolute text-2xl animate-bounce"
                style={{
                  left: `${8 + (i * 7.5) % 85}%`,
                  top: `${10 + (i * 11) % 60}%`,
                  animationDelay: `${i * 0.12}s`,
                  animationDuration: `${0.9 + (i % 3) * 0.3}s`,
                  opacity: 0.6 + (i % 4) * 0.1,
                  fontSize: `${16 + (i % 3) * 8}px`,
                }}
              >🦇</span>
            ))}
          </div>
        )}

        {/* Main card */}
        <div
          className={cn(
            "relative z-10 mx-4 rounded-2xl border border-yellow-400/30 bg-zinc-900/95 p-8 text-center shadow-2xl max-w-sm w-full transition-all duration-500",
            batPhase >= 3 ? "opacity-100 scale-100" : "opacity-0 scale-90"
          )}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setShowEasterEgg(false)}
            className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Batman symbol */}
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="text-6xl filter drop-shadow-[0_0_20px_rgba(234,179,8,0.8)]">🦇</div>
              <div className="absolute inset-0 animate-ping text-6xl opacity-20">🦇</div>
            </div>
          </div>

          <p className="text-xs text-yellow-400/60 uppercase tracking-[0.3em] mb-1">Mission Control</p>
          <h2 className="text-2xl font-black text-white mb-0.5">Built by</h2>
          <h1 className="text-3xl font-black bg-gradient-to-r from-yellow-400 to-yellow-200 bg-clip-text text-transparent mb-4">
            Lionel Resnik
          </h1>

          <p className="text-xs text-zinc-500 italic mb-5">
            "It&apos;s not who I am underneath,<br />but what I build that defines me."
          </p>

          <div className="flex gap-3 justify-center mb-5">
            <a
              href="https://www.linkedin.com/in/lionel-resnik"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-[#0077B5]/20 border border-[#0077B5]/40 px-4 py-2 text-sm text-[#0a66c2] hover:bg-[#0077B5]/30 transition-colors font-medium"
              onClick={e => e.stopPropagation()}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                <rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
              </svg>
              LinkedIn
            </a>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center border-t border-zinc-800 pt-4">
            {[
              { label: "Missions", value: "∞" },
              { label: "Coffee", value: "☕️" },
              { label: "Bugs", value: "0*" },
            ].map(s => (
              <div key={s.label}>
                <p className="text-lg font-bold text-yellow-400">{s.value}</p>
                <p className="text-[10px] text-zinc-500">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">*approximate</p>

        </div>
      </div>
    )}

    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      {/* Logo — click 5× for a surprise */}
      <div
        className="flex h-14 items-center gap-3 border-b border-border px-4 cursor-pointer select-none"
        onClick={handleLogoClick}
        title={logoClicks > 0 ? `${5 - logoClicks} more…` : undefined}
      >
        <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center">
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 opacity-20" />
          <div className="absolute inset-0 rounded-lg border border-blue-500/40" />
          <span className="relative text-[11px] font-black tracking-tighter text-blue-400">MC</span>
        </div>
        <div className="leading-none">
          <p className="text-sm font-bold tracking-tight">Mission Control</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                  {active && <ChevronRight className="ml-auto h-3 w-3 opacity-50" />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom */}
      <div className="border-t border-border p-2 space-y-1">
        {/* Settings + theme toggle row */}
        <div className="flex items-center gap-1">
          {bottom.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(href)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark"
              ? <Sun className="h-4 w-4" />
              : <Moon className="h-4 w-4" />
            }
          </button>
        </div>

        {/* @lu indicator */}
        <div className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-blue-400">@lu active</p>
            <p className="text-[10px] text-muted-foreground/60">Type @lu in Cursor</p>
          </div>
        </div>
      </div>
    </aside>
    </>
  )
}
