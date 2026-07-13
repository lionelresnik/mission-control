import { getDemoStaticParams } from "@/lib/demo/static-params"

export function generateStaticParams() {
  return getDemoStaticParams("projects")
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return children
}
