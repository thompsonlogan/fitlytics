import { ArrowRight, Moon, Sun } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { landingButton } from "@/components/landing/landing-button"
import { Wrap } from "@/components/landing/wrap"
import { Button } from "@/components/ui/button"

const NAV_LINKS = [
  { href: "#tracking", label: "Tracking" },
  { href: "#builder", label: "Builder" },
  { href: "#analytics", label: "Analytics" },
  { href: "#pricing", label: "Pricing" },
  { href: "#testimonials", label: "Reviews" },
]

export function LandingNav() {
  const { theme, setTheme } = useTheme()
  // The app's default theme is "system", so reading `theme === "dark"` alone
  // would mislabel a system-dark visitor and make the first toggle click a
  // no-op. Resolve the effective theme inline (no effect needed) so the toggle
  // always flips what the user actually sees.
  const systemDark =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  const isDark = theme === "dark" || (theme === "system" && systemDark)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-[12px] backdrop-saturate-[180%]">
      <Wrap className="flex h-16 items-center gap-8">
        <a className="inline-flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.01em]" href="#top">
          <span className="inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-sm bg-primary text-sm font-bold text-primary-foreground">
            F
          </span>
          <span>Fitlytics</span>
        </a>
        <nav className="ml-2 flex gap-1 max-[820px]:hidden">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="rounded-md px-3 py-2 text-[0.9375rem] font-[450] text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Toggle dark mode"
            aria-pressed={isDark}
            title="Toggle theme"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="rounded-md text-muted-foreground hover:text-foreground [&_svg]:size-[1.0625rem]"
          >
            {isDark ? <Sun /> : <Moon />}
          </Button>
          {/* Returning users need "Log in" everywhere; on mobile it replaces
              "Get started", which only duplicates the hero's "Start free". */}
          <a href="/auth/login" className={landingButton({ variant: "ghost", size: "sm" })}>
            Log in
          </a>
          <a
            href="/auth/login"
            className={landingButton({ variant: "primary", size: "sm", className: "max-[640px]:hidden" })}
          >
            Get started <ArrowRight />
          </a>
        </div>
      </Wrap>
    </header>
  )
}
