import { Link } from "@tanstack/react-router"
import {
  Bell,
  CalendarCheck2,
  ChartLine,
  ChevronDown,
  ClipboardList,
  History,
  Moon,
  Search,
  Sun,
} from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// A static, presentational recreation of the real AppHeader. The 404 view can
// render for a route that never resolved, so this chrome deliberately depends
// on nothing but the theme context — no auth, no program data — to guarantee
// it always paints.
const NAV_ITEMS = [
  { label: "Today", Icon: CalendarCheck2 },
  { label: "Programs", Icon: ClipboardList },
  { label: "History", Icon: History },
  { label: "Analytics", Icon: ChartLine },
]

export function NotFoundHeader() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <header className="flex items-center gap-3 border-b bg-background px-5 py-2.5">
      <Link to="/today" className="flex items-center gap-2 pr-3">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-primary text-[0.75rem] font-bold text-primary-foreground">
          F
        </span>
        <span className="text-[0.9375rem] font-semibold tracking-tight">Fitlytics</span>
      </Link>
      <Separator orientation="vertical" className="h-6" />

      <nav className="hidden items-center gap-0.5 md:flex">
        {NAV_ITEMS.map(({ label, Icon }) => (
          <Link
            key={label}
            to="/today"
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium text-muted-foreground",
              "transition-colors hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        className="hidden items-center gap-2 rounded-lg border bg-background px-2 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-muted md:inline-flex"
        style={{ height: "1.75rem", minWidth: "13rem" }}
      >
        <Search className="size-3.5" />
        <span>Search exercises…</span>
        <span className="flex-1" />
        <kbd className="rounded-sm border bg-muted px-1 font-mono text-[0.625rem] text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <Button variant="ghost" size="icon-sm" aria-label="Notifications" className="relative">
        <Bell className="size-4" strokeWidth={1.75} />
        <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-foreground ring-2 ring-background" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Toggle theme"
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      <Link
        to="/today"
        className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background py-0.5 pr-1.5 pl-0.5 text-xs transition-colors hover:bg-muted"
      >
        <Avatar className="size-[1.375rem]">
          <AvatarFallback className="bg-foreground text-[0.6875rem] font-semibold text-background">
            JH
          </AvatarFallback>
        </Avatar>
        <ChevronDown className="size-3 text-muted-foreground" />
      </Link>
    </header>
  )
}
