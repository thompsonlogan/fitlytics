import {
  Bell,
  CalendarCheck2,
  ChartLine,
  ChevronDown,
  ClipboardList,
  Download,
  History,
  Keyboard,
  LifeBuoy,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  Trophy,
  User,
} from "lucide-react"

import { Link, useLocation } from "@tanstack/react-router"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import type { MeResponse } from "@/services/generated"
import { cn } from "@/lib/utils"

type NavItem = {
  label: string
  to: "/today" | "/program" | "/history" | "/analytics"
  Icon: typeof CalendarCheck2
}

const NAV_ITEMS: NavItem[] = [
  { label: "Today", to: "/today", Icon: CalendarCheck2 },
  { label: "Programs", to: "/program", Icon: ClipboardList },
  { label: "History", to: "/history", Icon: History },
  { label: "Analytics", to: "/analytics", Icon: ChartLine },
]

type AppHeaderProps = {
  onLogout: () => void
  user: MeResponse | null
}

export function AppHeader({ onLogout, user }: AppHeaderProps) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"
  const pathname = useLocation({ select: (l) => l.pathname })

  const displayName = user?.displayName?.trim() || user?.email || "Account"
  const email = user?.email ?? ""
  const initials = getInitials(user)

  return (
    <header className="flex items-center gap-3 border-b bg-background px-5 py-2.5">
      <div className="flex items-center gap-2 pr-3">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-primary text-[0.75rem] font-bold text-primary-foreground">
          F
        </span>
        <span className="text-[0.9375rem] font-semibold tracking-tight">Fitlytics</span>
      </div>
      <Separator orientation="vertical" className="h-6" />

      <nav className="flex items-center gap-0.5">
        {NAV_ITEMS.map(({ label, to, Icon }) => {
          const active = pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
                "h-7 gap-1.5 px-2.5 text-[0.8125rem] font-medium",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className="size-3.5" strokeWidth={1.75} />
              <span>{label}</span>
            </Link>
          )
        })}
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

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background py-0.5 pr-1.5 pl-0.5 text-xs transition-colors hover:bg-muted"
            >
              <span className="inline-flex size-[1.375rem] items-center justify-center rounded-full bg-foreground text-[0.6875rem] font-semibold text-background">
                {initials}
              </span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-56 p-1.5">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5 py-1 pb-2">
              <span className="text-[0.8125rem] font-semibold text-foreground">{displayName}</span>
              {email && <span className="text-xs font-normal text-muted-foreground">{email}</span>}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <User className="size-3.5" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="size-3.5" />
            <span>Settings</span>
            <DropdownMenuShortcut>,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Trophy className="size-3.5" />
            <span>Achievements</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Download className="size-3.5" />
            <span>Export data</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <LifeBuoy className="size-3.5" />
            <span>Help &amp; feedback</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Keyboard className="size-3.5" />
            <span>Keyboard shortcuts</span>
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onLogout}>
            <LogOut className="size-3.5" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

function getInitials(user: MeResponse | null): string {
  const name = user?.displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (user?.email) {
    return user.email[0].toUpperCase()
  }
  return "?"
}
