import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Shared layout primitives for the landing page, Tailwind-only.

/** Centered max-width content column used by every landing section. */
export function Wrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[72rem] px-6", className)}>{children}</div>
}

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

/** Centered eyebrow + heading + lede used above grid sections. */
export function SectionHead({ eyebrow, heading, body }: { eyebrow: string; heading: ReactNode; body: ReactNode }) {
  return (
    <div className="mx-auto mb-[clamp(2.5rem,5vw,4rem)] max-w-[44rem] text-center">
      <Eyebrow centered>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-[clamp(2rem,4vw,3rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">
        {heading}
      </h2>
      <p className="mx-auto mt-4 max-w-[40ch] text-[1.0625rem] text-muted-foreground text-pretty">{body}</p>
    </div>
  )
}
