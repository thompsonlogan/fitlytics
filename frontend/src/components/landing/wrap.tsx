import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Centered max-width content column used by every landing section.
export function Wrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[72rem] px-6", className)}>{children}</div>
}
