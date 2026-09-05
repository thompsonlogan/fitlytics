import { ArrowLeft, Bell, Moon, Sun, Users } from "lucide-react"

import { Link } from "@tanstack/react-router"

import { useTheme } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { AccountMenu } from "@/components/workout/account-menu"
import type { MeResponse } from "@/services/generated"
import { isCoach } from "@/lib/is-coach"
import { cn } from "@/lib/utils"

type MobileAppBarProps = {
  user: MeResponse | null
  onLogout: () => void
  badge?: string
}

export function MobileAppBar({ user, onLogout, badge }: MobileAppBarProps) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"
  const isCoachView = badge === "Coach"
  const showCoachLink = !isCoachView && isCoach(user)

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-1.5 border-b bg-background/90 px-3.5 pb-2.5 backdrop-blur-md backdrop-saturate-150"
      style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex size-[1.375rem] items-center justify-center rounded-sm bg-primary text-[0.8125rem] font-bold text-primary-foreground">
          F
        </span>
        <span className="text-[0.9375rem] font-semibold tracking-tight">Fitlytics</span>
        {badge && <Badge variant="secondary">{badge}</Badge>}
      </div>

      <div className="flex-1" />

      {showCoachLink && (
        <Link
          to="/coach"
          aria-label="Coach view"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-7 gap-1.5 px-2.5 text-[0.8125rem] font-medium text-muted-foreground"
          )}
        >
          <Users className="size-3.5" strokeWidth={1.75} />
          <span>Coach</span>
        </Link>
      )}

      {isCoachView && (
        <Link
          to="/today"
          aria-label="Exit coach view"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-7 gap-1.5 px-2.5 text-[0.8125rem] font-medium text-muted-foreground"
          )}
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} />
          <span>Exit</span>
        </Link>
      )}

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
