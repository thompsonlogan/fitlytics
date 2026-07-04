import { Link, useLocation } from "@tanstack/react-router"

import { NAV_ITEMS } from "@/components/workout/nav-items"
import { cn } from "@/lib/utils"

// MobileTabBar is the fixed bottom navigation for the phone layout. It replaces
// the desktop header's inline top nav, exposing the same NAV_ITEMS as icon +
// label tabs. Frosted background + a safe-area inset so it clears the home
// indicator on notched devices.
export function MobileTabBar() {
  const pathname = useLocation({ select: (l) => l.pathname })

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/90 px-2 backdrop-blur-md backdrop-saturate-150"
      style={{ paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom))", paddingTop: "0.375rem" }}
      aria-label="Primary"
    >
      {NAV_ITEMS.map(({ label, to, Icon }) => {
        const active = pathname === to
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-1 text-[0.625rem] font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-5" strokeWidth={1.75} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
