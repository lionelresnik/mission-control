import { getDemoStaticParams } from "@/lib/demo/static-params"

export function generateStaticParams() {
  return getDemoStaticParams("missions")
}

export default function MissionLayout({ children }: { children: React.ReactNode }) {
  return children
}
