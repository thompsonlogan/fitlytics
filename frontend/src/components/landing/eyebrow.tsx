import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Mono uppercase section label with the leading rule. */
export function Eyebrow({ centered, children }: { centered?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase",
        "before:h-px before:w-5 before:bg-foreground before:opacity-50 before:content-['']",
        centered && "justify-center"
      )}
    >
      {children}
    </span>
  )
}
