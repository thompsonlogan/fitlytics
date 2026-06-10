import { Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  CalendarCheck2,
  ChartLine,
  ClipboardList,
  History,
  Home,
} from "lucide-react"

import { NotFoundHeader } from "@/components/not-found/not-found-header"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Footer } from "@/components/workout/footer"
import { cn } from "@/lib/utils"

// The faint masked grid behind the card, mirroring the marketing hero texture.
// Kept as an inline style because the radial mask + token-driven gridlines
// don't reduce cleanly to Tailwind utilities.
const GRID_TEXTURE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
  backgroundSize: "3.5rem 3.5rem",
  WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 42%, black 10%, transparent 72%)",
  maskImage: "radial-gradient(ellipse 70% 60% at 50% 42%, black 10%, transparent 72%)",
  opacity: 0.6,
}

const JUMP_LINKS = [
  { label: "Today", to: "/today", Icon: CalendarCheck2 },
  { label: "Programs", to: "/today", Icon: ClipboardList },
  { label: "History", to: "/today", Icon: History },
  { label: "Analytics", to: "/today", Icon: ChartLine },
  { label: "Home", to: "/", Icon: Home },
] as const

// Rendered by the router's defaultNotFoundComponent when the user navigates to
// a route that doesn't exist. Keeps the real app chrome (header + footer) and
// drops a centered, editorial 404 into the body.
export function NotFoundPage() {
  // Surface the route the user actually tried to reach, the way a request log
  // would. Falls back to "/" if there's no DOM (tests).
  const path = typeof window !== "undefined" ? window.location.pathname : "/"

  return (
    <div
      className="grid min-h-svh bg-background text-foreground"
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
    >
      <NotFoundHeader />

      <main className="relative grid min-h-0 place-items-center overflow-auto px-6 py-8">
        <div className="pointer-events-none absolute inset-0 z-0" style={GRID_TEXTURE} aria-hidden />

        <div className="relative z-[1] flex w-full max-w-[33rem] flex-col items-center text-center">
          <div
            className="mb-5 font-mono text-[clamp(4.5rem,17vw,8.5rem)] leading-[0.86] font-semibold tracking-[-0.05em] tabular-nums text-foreground"
            aria-hidden
          >
            4<span className="text-muted-foreground">0</span>4
          </div>

          <span className="mb-3.5 inline-flex items-center gap-2 font-mono text-[0.6875rem] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            <span className="size-[0.4375rem] rounded-full bg-muted-foreground" />
            Route not found
          </span>
          <h1 className="m-0 text-[clamp(1.5rem,3.6vw,2rem)] leading-[1.12] font-semibold tracking-[-0.02em] text-balance text-foreground">
            We can't find that page.
          </h1>
          <p className="mt-3 max-w-[28rem] text-[0.9375rem] leading-[1.6] text-pretty text-muted-foreground">
            This route may have been moved, renamed, or never existed. Your programs and logged
            sessions are safe — let's get you back to the bar.
          </p>

          <div className="mt-6 inline-flex max-w-full min-w-0 items-center gap-2.5 rounded-md border bg-muted py-2 pr-2.5 pl-3 font-mono text-xs text-muted-foreground">
            <span className="size-[0.4375rem] shrink-0 rounded-full bg-muted-foreground" />
            <span className="shrink-0 font-medium text-foreground">GET</span>
            <span className="min-w-0 truncate text-foreground">{path}</span>
            <Badge
              variant="destructive"
              className="shrink-0 rounded-full border border-destructive/30 px-1.5"
            >
              404
            </Badge>
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            <Link to="/today" className={cn(buttonVariants({ variant: "default" }))}>
              <CalendarCheck2 />
              Back to Today
            </Link>
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft />
              Go back
            </Button>
          </div>

          <div className="mt-8 w-full max-w-[30rem] border-t pt-6">
            <div className="mb-3 font-mono text-[0.625rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Jump to
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {JUMP_LINKS.map(({ label, to, Icon }) => (
                <Link
                  key={label}
                  to={to}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-background px-3 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-ring hover:bg-muted"
                >
                  <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
