import { Bell, Moon, Search, Sun, Users } from "lucide-react"

import { Link, useLocation } from "@tanstack/react-router"

import { useTheme } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { AccountMenu } from "@/components/workout/account-menu"
import { NAV_ITEMS, type NavItem, type NavPlaceholder } from "@/components/workout/nav-items"
import type { MeResponse } from "@/services/generated"
import { isCoach } from "@/lib/is-coach"
import { cn } from "@/lib/utils"

type AppHeaderProps = {
  onLogout: () => void
  user: MeResponse | null
  navItems?: NavItem[]
  navPlaceholders?: NavPlaceholder[]
  badge?: string
  homeTo?: NavItem["to"]
  searchPlaceholder?: string
}

export function AppHeader({
  onLogout,
  user,
  navItems = NAV_ITEMS,
  navPlaceholders = [],
  badge,
  homeTo = "/today",
  searchPlaceholder = "Search exercises…",
}: AppHeaderProps) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"
  const pathname = useLocation({ select: (l) => l.pathname })
  const showCoachLink = !badge && isCoach(user)

  return (
    <header className="flex items-center gap-3 border-b bg-background px-5 py-2.5">
      <Link to={homeTo} className="flex items-center gap-2 pr-3">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-primary text-[0.75rem] font-bold text-primary-foreground">
          F
        </span>
        <span className="text-[0.9375rem] font-semibold tracking-tight">Fitlytics</span>
        {badge && (
          <Badge variant="secondary" className="ml-1">
            {badge}
          </Badge>
        )}
      </Link>
      <Separator orientation="vertical" className="h-6" />

      <nav className="flex items-center gap-0.5">
        {navItems.map(({ label, to, Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`)
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

        {navPlaceholders.map(({ label, Icon }) => (
          <span
            key={label}
            aria-disabled="true"
            title="Not built yet"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-7 cursor-not-allowed gap-1.5 px-2.5 text-[0.8125rem] font-medium text-muted-foreground/50"
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
            <span>{label}</span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {showCoachLink && (
        <Link
          to="/coach"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-7 gap-1.5 px-2.5 text-[0.8125rem] font-medium text-muted-foreground"
          )}
        >
          <Users className="size-3.5" strokeWidth={1.75} />
          <span>Coach</span>
        </Link>
      )}

      <button
        type="button"
        className="hidden items-center gap-2 rounded-lg border bg-background px-2 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-muted md:inline-flex"
        style={{ height: "1.75rem", minWidth: "13rem" }}
      >
        <Search className="size-3.5" />
        <span>{searchPlaceholder}</span>
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

      <AccountMenu user={user} onLogout={onLogout} />
    </header>
  )
}
