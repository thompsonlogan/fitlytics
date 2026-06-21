import type { ReactNode } from "react"

import { Eyebrow } from "@/components/landing/eyebrow"

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
