import { Outlet } from "@tanstack/react-router"

import { COACH_NAV_ITEMS, COACH_NAV_PLACEHOLDERS } from "@/components/coach/coach-nav-items"
import { AppHeader } from "@/components/workout/app-header"
import { Footer } from "@/components/workout/footer"
import { MobileAppBar } from "@/components/workout/mobile-app-bar"
import { MobileTabBar } from "@/components/workout/mobile-tab-bar"
import { useAuth } from "@/hooks/use-auth"
import { useIsMobile } from "@/hooks/use-is-mobile"

export function CoachLayout() {
  const { user, signOut } = useAuth()
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="flex min-h-svh flex-col bg-background text-foreground">
        <MobileAppBar user={user} onLogout={signOut} badge="Coach" />
        <div
          className="flex flex-1 flex-col"
          style={{ paddingBottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
        >
          <Outlet />
        </div>
        <MobileTabBar navItems={COACH_NAV_ITEMS} navPlaceholders={COACH_NAV_PLACEHOLDERS} />
      </div>
    )
  }

  return (
    <div
      className="grid min-h-svh bg-background text-foreground"
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
    >
      <AppHeader
        user={user}
        onLogout={signOut}
        navItems={COACH_NAV_ITEMS}
        navPlaceholders={COACH_NAV_PLACEHOLDERS}
        badge="Coach"
        homeTo="/coach"
        searchPlaceholder="Search athletes…"
      />
      <Outlet />
      <Footer productName="Fitlytics Coach v0.0.1" context="" coachView />
    </div>
  )
}
