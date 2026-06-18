import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Shared layout primitives for the landing page, Tailwind-only.

/** Centered max-width content column used by every landing section. */
export function Wrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[72rem] px-6", className)}>{children}</div>
}

// Eyebrow and SectionHead live in their own files (one component per file);
// re-exported here so existing `@/components/landing/landing-primitives`
// imports keep working.
export { Eyebrow } from "@/components/landing/eyebrow"
export { SectionHead } from "@/components/landing/section-head"
