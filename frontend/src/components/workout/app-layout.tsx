import { Outlet } from "@tanstack/react-router"

import { AppHeader } from "@/components/workout/app-header"
import { Footer } from "@/components/workout/footer"
import { MobileAppBar } from "@/components/workout/mobile-app-bar"
import { MobileTabBar } from "@/components/workout/mobile-tab-bar"
import { useAuth } from "@/hooks/use-auth"
import { useIsMobile } from "@/hooks/use-is-mobile"

export function AppLayout() {
  const { user, signOut } = useAuth()
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="flex min-h-svh flex-col bg-background text-foreground">
        <MobileAppBar user={user} onLogout={signOut} />
        <Outlet />
        <MobileTabBar />
      </div>
    )
  }

  return (
    <div
      className="grid min-h-svh bg-background text-foreground"
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
    >
      <AppHeader onLogout={signOut} user={user} />
      <Outlet />
      <Footer />
    </div>
  )
}
