import { Star } from "lucide-react"

import { SectionHead } from "@/components/landing/section-head"
import { Wrap } from "@/components/landing/wrap"
import { REVEAL } from "@/components/landing/use-reveal"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Testimonial = {
  quote: string
  initials: string
  name: string
  role: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "I ran my whole peak off a Google Sheet for years. Fitlytics replaced it in an afternoon — and the auto-regulated loads caught two sessions where I should've backed off. Hit a 25 lb squat PR at the end of the block.",
    initials: "DM",
    name: "Dani Morales",
    role: "Raw classic, 67.5kg",
  },
  {
    quote:
      "The program builder is the first one that actually thinks in mesocycles. I write a block once and it rolls out the percentages for every week.",
    initials: "RK",
    name: "Ren Kobayashi",
    role: "S&C coach",
  },
  {
    quote:
      "Logging is fast enough that I actually do it mid-set. Tap, tap, next. No more 'I'll fill it in later' and forgetting.",
    initials: "TA",
    name: "Theo Adeyemi",
    role: "Intermediate, 5 yr",
  },
  {
    quote:
      "I coach 18 athletes and the client dashboards saved me hours every week. I can see who's hitting their RPE targets at a glance.",
    initials: "SL",
    name: "Sasha Lindqvist",
    role: "Online coach",
  },
  {
    quote:
      "The analytics finally made my plateaus obvious. Volume was creeping past my MRV — cut it back, started growing again.",
    initials: "MP",
    name: "Marcus Pena",
    role: "Hypertrophy focus",
  },
  {
    quote:
      "Clean, fast, no bloat. It looks like a tool built by someone who actually lifts, not a VC pitch deck.",
    initials: "JW",
    name: "Jun Wei",
    role: "Barbell club owner",
  },
]

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-[clamp(4.5rem,9vw,7.5rem)]">
      <Wrap>
        <SectionHead
          eyebrow="Testimonials"
          heading="Lifters stopped fighting their spreadsheets."
          body="Over 2,400 athletes and coaches run their training on Fitlytics."
        />

        <div className="columns-3 gap-x-5 max-[980px]:columns-2 max-[640px]:columns-1">
          {TESTIMONIALS.map((t) => (
            <Card
              key={t.name}
              data-reveal
              className={cn(
                "mb-5 gap-0 break-inside-avoid rounded-lg border border-border p-6 ring-0",
                REVEAL
              )}
            >
              <span className="mb-[0.875rem] inline-flex gap-[0.0625rem] [&_svg]:size-[0.875rem] [&_svg]:fill-current">
                <Star />
                <Star />
                <Star />
                <Star />
                <Star />
              </span>
              <p className="text-[0.9375rem] leading-[1.55] tracking-[-0.005em]">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-5 flex items-center gap-2.5">
                <Avatar className="size-[2.125rem]">
                  <AvatarFallback className="bg-secondary text-[0.8125rem] font-semibold text-secondary-foreground">
                    {t.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Wrap>
    </section>
  )
}
