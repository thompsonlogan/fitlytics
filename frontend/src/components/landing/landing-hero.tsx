import { Link } from "@tanstack/react-router"
import { ArrowRight, Play, Star } from "lucide-react"

import { landingButton } from "@/components/landing/landing-button"
import { Wrap } from "@/components/landing/landing-primitives"
import { MockTable, type MockRow } from "@/components/landing/mock-table"
import { REVEAL } from "@/components/landing/use-reveal"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const HERO_ROWS: MockRow[] = [
  { id: "squat-1", done: true, exercise: "Comp Squat", sets: "1", reps: "3", intensity: "300 lb", load: "300", rpe: "8" },
  { id: "squat-2", exercise: "Comp Squat", sets: "2", reps: "5", intensity: "0.95", load: "285", rpe: "8" },
  { id: "deadlift", exercise: "Comp Deadlift", sets: "1", reps: "3", intensity: "305 lb", load: "305", rpe: "9", rpeHot: true },
  { id: "quad-ext", exercise: "SL Quad Ext", sets: "2", reps: "6–10", intensity: "0–1 RIR", load: "70", rpe: "—" },
  { id: "ham-curl", exercise: "SL Ham Curl", sets: "2", reps: "6–10", intensity: "0–1 RIR", load: "80", rpe: "—" },
]

// Faint editorial grid behind the hero, masked to fade out toward the edges.
const GRID_BG =
  "pointer-events-none absolute inset-0 z-0 opacity-50 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_20%,transparent_75%)]"

const MH_NAV = "rounded-[6px] px-2 py-1 text-xs text-muted-foreground"

export function LandingHero() {
  return (
    <section className="relative overflow-hidden pt-[clamp(3.5rem,8vw,7rem)] text-center" id="top">
      <div className={GRID_BG} />
      <Wrap className="relative z-[1]">
        <span className="mb-7 inline-flex h-[1.875rem] items-center gap-2 rounded-full border border-border bg-background pr-3 pl-2 text-[0.8125rem] text-muted-foreground [&_svg]:size-[0.875rem]">
          <Badge className="h-auto rounded-full px-[0.4375rem] py-px font-mono text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
            New
          </Badge>
          Auto-regulated load targets <ArrowRight />
        </span>
        <h1 className="mx-auto max-w-[16ch] text-[clamp(2.5rem,6.5vw,4.75rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">
          Train the{" "}
          <span className="relative whitespace-nowrap after:absolute after:-inset-x-[0.05em] after:bottom-[0.08em] after:-z-10 after:h-[0.32em] after:rounded-[2px] after:bg-foreground after:opacity-10 after:content-['']">
            program
          </span>
          ,<br />
          not the guesswork.
        </h1>
        <p className="mx-auto mt-6 max-w-[42ch] text-[clamp(1.0625rem,1.6vw,1.25rem)] leading-[1.55] text-muted-foreground text-pretty">
          Fitlytics turns your spreadsheet into a living training system — track every set, build
          periodized programs, and watch the numbers move. Built for lifters who log.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/today"
            className={landingButton({ variant: "primary", size: "lg", className: "max-[640px]:flex-1" })}
          >
            Start free <ArrowRight />
          </Link>
          <a
            href="#tracking"
            className={landingButton({ variant: "outline", size: "lg", className: "max-[640px]:flex-1" })}
          >
            <Play /> See how it works
          </a>
        </div>
        <div className="mt-6 flex items-center justify-center gap-3 text-[0.8125rem] text-muted-foreground">
          <span className="inline-flex gap-[0.0625rem] text-foreground [&_svg]:size-[0.875rem] [&_svg]:fill-current" aria-label="4.9 out of 5">
            <Star />
            <Star />
            <Star />
            <Star />
            <Star />
          </span>
          <span>
            <b>4.9</b> from 2,400+ lifters
          </span>
          <span className="size-[0.1875rem] rounded-full bg-current opacity-40" />
          <span>No card required</span>
        </div>
      </Wrap>

      {/* Product shot */}
      <Wrap>
        <div
          data-reveal
          className={cn(
            "relative z-[1] mx-auto mt-[clamp(3rem,6vw,4.5rem)] max-w-[64rem]",
            REVEAL
          )}
        >
          <Card className="gap-0 rounded-xl border border-border py-0 shadow-xl ring-0">
            <div className="flex items-center gap-2 border-b border-border bg-background px-3.5 py-2.5">
              <div className="flex gap-1.5">
                <i className="size-2.5 rounded-full bg-border" />
                <i className="size-2.5 rounded-full bg-border" />
                <i className="size-2.5 rounded-full bg-border" />
              </div>
              <div className="mx-auto rounded-full bg-muted px-3 py-[0.1875rem] font-mono text-xs text-muted-foreground">
                app.fitlytics.io/today
              </div>
            </div>
            <div className="bg-background">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[0.8125rem]">
                <span className="inline-flex items-center gap-[0.4375rem] font-semibold">
                  <span className="inline-flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-[4px] bg-primary text-[0.625rem] font-bold text-primary-foreground">
                    F
                  </span>{" "}
                  Fitlytics
                </span>
                <span className="ml-2 flex gap-0.5">
                  <span className={cn(MH_NAV, "bg-secondary font-medium text-foreground")}>Today</span>
                  <span className={MH_NAV}>Programs</span>
                  <span className={MH_NAV}>History</span>
                  <span className={MH_NAV}>Analytics</span>
                </span>
                <span className="flex-1" />
                <Avatar className="size-[1.375rem]">
                  <AvatarFallback className="bg-foreground text-[0.625rem] font-semibold text-background">
                    JH
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
                <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
                  Lower · Heavy <span className="font-normal text-muted-foreground">· Week 1 · Day 1</span>
                </span>
                <span className="flex-1" />
                <span className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border">
                  <i className="w-6 text-center text-sm leading-7 text-muted-foreground not-italic">‹</i>
                  <b className="border-x border-border px-2.5 text-xs font-medium leading-7">Week 1</b>
                  <i className="w-6 text-center text-sm leading-7 text-muted-foreground not-italic">›</i>
                </span>
                <span className="flex gap-[0.1875rem] rounded-md bg-muted p-[0.1875rem]">
                  <span className="min-w-7 rounded-[5px] bg-background py-[0.1875rem] text-center text-[0.6875rem] font-medium text-foreground shadow-2xs">
                    Mon
                  </span>
                  {["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <span
                      key={day}
                      className="min-w-7 rounded-[5px] py-[0.1875rem] text-center text-[0.6875rem] font-medium text-muted-foreground"
                    >
                      {day}
                    </span>
                  ))}
                </span>
              </div>
              <MockTable rows={HERO_ROWS} />
            </div>
          </Card>
        </div>
      </Wrap>
    </section>
  )
}
