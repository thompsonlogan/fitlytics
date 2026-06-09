import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowRight, Check } from "lucide-react"

import { Eyebrow, Wrap } from "@/components/landing/landing-primitives"
import { REVEAL } from "@/components/landing/use-reveal"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type FeatureItem = {
  lead: string
  body: string
}

type FeatureSectionProps = {
  id: string
  /** Adds the `alt` background band. */
  alt?: boolean
  /** Renders the visual on the left and copy on the right (desktop only). */
  flip?: boolean
  eyebrow: string
  heading: string
  body: string
  items: FeatureItem[]
  ctaLabel: string
  /** App route the CTA links into. */
  ctaTo: string
  visual: ReactNode
}

export function FeatureSection({
  id,
  alt,
  flip,
  eyebrow,
  heading,
  body,
  items,
  ctaLabel,
  ctaTo,
  visual,
}: FeatureSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "py-[clamp(4.5rem,9vw,7.5rem)]",
        alt && "border-y border-border bg-[oklch(0.985_0_0)] dark:bg-[oklch(0.185_0_0)]"
      )}
    >
      <Wrap>
        <div className="grid grid-cols-1 items-center gap-[clamp(2rem,5vw,4.5rem)] min-[821px]:grid-cols-2">
          <div data-reveal className={cn(flip && "min-[821px]:order-2", REVEAL)}>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h3 className="mt-[0.875rem] text-[clamp(1.5rem,2.6vw,2rem)] leading-[1.1] font-semibold tracking-[-0.02em]">
              {heading}
            </h3>
            <p className="mt-4 text-[1.0625rem] leading-[1.6] text-muted-foreground text-pretty">{body}</p>
            <ul className="mt-6 grid list-none gap-[0.875rem] p-0">
              {items.map((item) => (
                <li key={item.lead} className="flex items-start gap-3 text-[0.9375rem]">
                  <span className="mt-[0.0625rem] inline-flex size-[1.375rem] flex-none items-center justify-center rounded-full bg-secondary [&_svg]:size-[0.875rem] [&_svg]:[stroke-width:2.25]">
                    <Check />
                  </span>
                  <span className="text-muted-foreground">
                    <b className="font-semibold">{item.lead}</b> {item.body}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              to={ctaTo}
              className="mt-7 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium [&_svg]:size-4 [&_svg]:transition-transform hover:[&_svg]:translate-x-[3px]"
            >
              {ctaLabel} <ArrowRight />
            </Link>
          </div>
          <Card
            data-reveal
            className={cn(
              "gap-0 rounded-xl border border-border py-0 shadow-lg ring-0 max-[820px]:max-w-[32rem]",
              flip && "min-[821px]:order-1",
              REVEAL
            )}
          >
            {visual}
          </Card>
        </div>
      </Wrap>
    </section>
  )
}
