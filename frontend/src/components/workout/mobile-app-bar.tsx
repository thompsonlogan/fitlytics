import { Bell, Moon, Sun } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { AccountMenu } from "@/components/workout/account-menu"
import type { MeResponse } from "@/services/generated"

type MobileAppBarProps = {
  user: MeResponse | null
  onLogout: () => void
}

// MobileAppBar is the sticky top bar for the phone layout: brand on the left,
// then notifications, theme toggle and the shared account menu on the right.
// Primary navigation lives in the bottom tab bar, so no nav links here. The top
// padding folds in the safe-area inset so content clears the status bar / notch.
export function MobileAppBar({ user, onLogout }: MobileAppBarProps) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

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
      </div>

      <div className="flex-1" />

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
