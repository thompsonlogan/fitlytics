import { AnalyticsMock } from "@/components/landing/analytics-mock"
import { BuilderMock } from "@/components/landing/builder-mock"
import { CtaBand } from "@/components/landing/cta-band"
import { FeatureSection } from "@/components/landing/feature-section"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingHero } from "@/components/landing/landing-hero"
import { LandingNav } from "@/components/landing/landing-nav"
import { LogosStrip } from "@/components/landing/logos-strip"
import { MockTable, type MockRow } from "@/components/landing/mock-table"
import { PricingSection } from "@/components/landing/pricing-section"
import { TestimonialsSection } from "@/components/landing/testimonials-section"
import { useReveal } from "@/components/landing/use-reveal"

const TRACKING_ROWS: MockRow[] = [
  { id: "bench-1", done: true, exercise: "Comp Bench", sets: "1", reps: "1", intensity: "215 lb", load: "215", rpe: "8" },
  { id: "bench-2", done: true, exercise: "Comp Bench", sets: "1", reps: "2", intensity: "205 lb", load: "205", rpe: "8" },
  { id: "bench-3", exercise: "Comp Bench", sets: "2", reps: "2", intensity: "−7.5%", load: "199", rpe: "8" },
  { id: "rdl", exercise: "RDL", sets: "1", reps: "4–8", intensity: "1–2 RIR", load: "185", rpe: "—" },
  { id: "pec-dec", exercise: "Pec Dec", sets: "2", reps: "8", intensity: "MMR 0–1", load: "140", rpe: "—" },
  { id: "vbar-pulldown", exercise: "V-Bar Pulldown", sets: "1", reps: "8", intensity: "MMR 0–1", load: "130", rpe: "—" },
]

// Hoisted to module scope so each <FeatureSection> receives the same element
// reference across renders, rather than a freshly-built one every time
// (react-doctor/jsx-no-jsx-as-prop). These visuals take no per-render props.
const TRACKING_VISUAL = <MockTable rows={TRACKING_ROWS} />
const BUILDER_VISUAL = <BuilderMock />
const ANALYTICS_VISUAL = <AnalyticsMock />

// LandingPage is the public marketing page served at "/". App CTAs route to
// /today (whose guard sends unauthenticated visitors to the WorkOS login) and
// the nav "Log in" hands off directly to WorkOS via /auth/login.
export function LandingPage() {
  const revealRef = useReveal<HTMLDivElement>()

  return (
    <div ref={revealRef} className="bg-background text-foreground antialiased">
      <LandingNav />
      <LandingHero />
      <LogosStrip />

      <FeatureSection
        id="tracking"
        eyebrow="Program tracking"
        heading="Every set, rep, and RPE — in one tap."
        body="Open today's session and it's already laid out: prescribed loads, rep targets, and rest. Check off sets as you go, log what you actually lifted, and Fitlytics keeps the running tally so you never lose your place mid-workout."
        items={[
          { lead: "Auto-regulated targets.", body: "Loads recalculate from your last logged RPE and top set." },
          { lead: "Inline editing.", body: "Tap any cell to log real weight — no modals, no friction." },
          { lead: "Rest timers & supersets.", body: "Grouped exercises and per-set rest, built in." },
        ]}
        ctaLabel="Open the tracker"
        ctaTo="/today"
        visual={TRACKING_VISUAL}
      />

      <FeatureSection
        id="builder"
        alt
        flip
        eyebrow="Program building"
        heading="Build a mesocycle in minutes, not spreadsheets."
        body="Drag exercises into a session, set your rep schemes and intensity rules once, and let Fitlytics roll them across weeks. Define progression as percentages, RIR, or fixed jumps — the calendar fills itself in."
        items={[
          { lead: "Drag-and-drop sessions.", body: "Reorder exercises and supersets instantly." },
          { lead: "Progression rules.", body: "Percent-based, RIR, or wave loading across the block." },
          { lead: "Reusable templates.", body: "Clone a block, swap accessories, ship to clients." },
        ]}
        ctaLabel="Start a program"
        ctaTo="/today"
        visual={BUILDER_VISUAL}
      />

      <FeatureSection
        id="analytics"
        eyebrow="Analytics & history"
        heading="See the line go up — with proof."
        body="Every logged session feeds a complete training history. Track estimated 1RMs, weekly tonnage, and per-muscle volume, then scrub back through any workout you've ever done. Plateaus get obvious before they cost you a block."
        items={[
          { lead: "Strength trends.", body: "e1RM curves per lift with PR markers." },
          { lead: "Volume landmarks.", body: "Weekly sets per muscle vs. your MEV / MRV." },
          { lead: "Full session history.", body: "Replay any past workout, exactly as logged." },
        ]}
        ctaLabel="View analytics"
        ctaTo="/today"
        visual={ANALYTICS_VISUAL}
      />

      <PricingSection />
      <TestimonialsSection />
      <CtaBand />
      <LandingFooter />
    </div>
  )
}
