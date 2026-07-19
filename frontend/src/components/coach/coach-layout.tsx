import { Outlet } from "@tanstack/react-router"

import { COACH_NAV_ITEMS, COACH_NAV_PLACEHOLDERS } from "@/components/coach/coach-nav-items"
import { AppHeader } from "@/components/workout/app-header"
import { Footer } from "@/components/workout/footer"
import { useAuth } from "@/hooks/use-auth"

export function CoachLayout() {
  const { user, signOut } = useAuth()

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
