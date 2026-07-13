import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Check } from "lucide-react"

import { landingButton } from "@/components/landing/landing-button"
import { SectionHead } from "@/components/landing/section-head"
import { Wrap } from "@/components/landing/wrap"
import { REVEAL } from "@/components/landing/use-reveal"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

type Feature = { label: string; muted?: boolean }

type Plan = {
  name: string
  desc: string
  featured?: boolean
  monthly: string
  annual?: string
  noteMonthly: string
  noteAnnual?: string
  per?: string
  ctaLabel: string
  ctaVariant: "primary" | "outline"
  features: Feature[]
}

const PLANS: Plan[] = [
  {
    name: "Starter",
    desc: "Everything you need to log and track a single program.",
    monthly: "$0",
    noteMonthly: "No card required",
    per: "/forever",
    ctaLabel: "Get started",
    ctaVariant: "outline",
    features: [
      { label: "Unlimited workout logging" },
      { label: "1 active program" },
      { label: "Weekly & daily tracker" },
      { label: "30-day history" },
      { label: "Advanced analytics", muted: true },
      { label: "Program builder", muted: true },
    ],
  },
  {
    name: "Pro",
    desc: "For dedicated lifters who program in blocks and chase PRs.",
    featured: true,
    monthly: "$9",
    annual: "$7",
    noteMonthly: "Billed monthly",
    noteAnnual: "$84 billed yearly",
    per: "/month",
    ctaLabel: "Start 14-day trial",
    ctaVariant: "primary",
    features: [
      { label: "Everything in Starter" },
      { label: "Unlimited programs" },
      { label: "Drag-and-drop program builder" },
      { label: "Full analytics & e1RM trends" },
      { label: "Unlimited history" },
      { label: "Auto-regulated load targets" },
    ],
  },
  {
    name: "Coach",
    desc: "Program for a roster and track every client in one place.",
    monthly: "$29",
    annual: "$23",
    noteMonthly: "Billed monthly",
    noteAnnual: "$276 billed yearly",
    per: "/month",
    ctaLabel: "Talk to us",
    ctaVariant: "outline",
    features: [
      { label: "Everything in Pro" },
      { label: "Up to 25 athletes" },
      { label: "Client dashboards & check-ins" },
      { label: "Template library & sharing" },
      { label: "Compliance & readiness alerts" },
      { label: "Priority support" },
    ],
  },
]

export function PricingSection() {
  const [annual, setAnnual] = React.useReducer((_current: boolean, checked: boolean) => checked, false)

  return (
    <section
      id="pricing"
      className="border-y border-border bg-[oklch(0.985_0_0)] py-[clamp(4.5rem,9vw,7.5rem)] dark:bg-[oklch(0.185_0_0)]"
    >
      <Wrap>
        <SectionHead
          eyebrow="Pricing"
          heading="Start free. Upgrade when you're serious."
          body="Every plan includes unlimited workout logging. No ads, no data selling, cancel anytime."
        />

        <div className="mb-12 flex items-center justify-center gap-[0.875rem]">
          <span className={cn("text-[0.9375rem] font-medium", annual ? "text-muted-foreground" : "text-foreground")}>
            Monthly
          </span>
          <Switch
            checked={annual}
            onCheckedChange={setAnnual}
            aria-label="Toggle annual billing"
          />
          <span className={cn("text-[0.9375rem] font-medium", annual ? "text-foreground" : "text-muted-foreground")}>
            Annual
          </span>
          <Badge variant="secondary" className="rounded-full border-border">
            Save 20%
          </Badge>
        </div>

        <div className="grid grid-cols-3 items-stretch gap-5 max-[820px]:mx-auto max-[820px]:max-w-[26rem] max-[820px]:grid-cols-1">
          {PLANS.map((plan) => {
            const amount = annual && plan.annual ? plan.annual : plan.monthly
            const note = annual && plan.noteAnnual ? plan.noteAnnual : plan.noteMonthly
            return (
              <Card
                key={plan.name}
                data-reveal
                className={cn(
                  "flex flex-col gap-0 overflow-visible rounded-xl border border-border p-7 ring-0",
                  plan.featured && "relative border-foreground shadow-lg max-[820px]:order-first",
                  REVEAL
                )}
              >
                {plan.featured && (
                  <Badge className="absolute -top-3 left-1/2 h-auto -translate-x-1/2 rounded-full px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
                    Most popular
                  </Badge>
                )}
                <div className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{plan.name}</div>
                <div className="mt-[0.375rem] min-h-[2.5rem] text-sm text-muted-foreground">{plan.desc}</div>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-[2.75rem] font-semibold tracking-[-0.03em] tabular-nums">{amount}</span>
                  {plan.per && <span className="text-[0.9375rem] text-muted-foreground">{plan.per}</span>}
                </div>
                <div className="mt-[0.375rem] min-h-[1rem] text-xs text-muted-foreground">{note}</div>
                <div className="mt-6">
                  <Link
                    to="/today"
                    className={landingButton({ variant: plan.ctaVariant, className: "w-full" })}
                  >
                    {plan.ctaLabel}
                  </Link>
                </div>
                <ul className="mt-6 grid list-none gap-3 border-t border-border pt-6">
                  {plan.features.map((feature) => (
                    <li
                      key={feature.label}
                      className={cn(
                        "flex items-start gap-2.5 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:flex-none [&_svg]:[stroke-width:2.25]",
                        feature.muted
                          ? "text-muted-foreground [&_svg]:text-muted-foreground [&_svg]:opacity-60"
                          : "[&_svg]:text-foreground"
                      )}
                    >
                      <Check /> {feature.label}
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      </Wrap>
    </section>
  )
}
