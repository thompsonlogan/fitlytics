import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import { landingButton } from "@/components/landing/landing-button"
import { Wrap } from "@/components/landing/landing-primitives"
import { REVEAL } from "@/components/landing/use-reveal"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Faint grid texture using the theme border colour so it reads in both light
// and dark mode (an inverted primary band would render as a glaring white block
// in dark mode).
const BAND_BG =
  "absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:3rem_3rem] [mask-image:radial-gradient(ellipse_70%_80%_at_50%_0%,black,transparent_75%)]"

export function CtaBand() {
  return (
    <section className="pt-0 pb-[clamp(4.5rem,9vw,7.5rem)]">
      <Wrap>
        <Card
          data-reveal
          className={cn(
            "relative gap-0 overflow-hidden rounded-2xl border border-border p-[clamp(2.5rem,6vw,4.5rem)] text-center ring-0",
            REVEAL
          )}
        >
          <div className={BAND_BG} />
          <div className="relative z-[1]">
            <h2 className="text-[clamp(1.875rem,4vw,3rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">
              Your next block starts today.
            </h2>
            <p className="mx-auto mt-4 max-w-[38ch] text-[1.0625rem] text-muted-foreground">
              Bring your program over in minutes. Track your first session free — keep it forever.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/today"
                className={landingButton({ variant: "primary", size: "lg", className: "max-[640px]:flex-1" })}
              >
                Start free <ArrowRight />
              </Link>
              <a
                href="#pricing"
                className={landingButton({ variant: "outline", size: "lg", className: "max-[640px]:flex-1" })}
              >
                Compare plans
              </a>
            </div>
            <div className="mt-5 text-[0.8125rem] text-muted-foreground">
              Free forever plan · No card required · Cancel anytime
            </div>
          </div>
        </Card>
      </Wrap>
    </section>
  )
}
