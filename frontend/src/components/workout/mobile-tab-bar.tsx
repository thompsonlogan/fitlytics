import { Link, useLocation } from "@tanstack/react-router"

import { NAV_ITEMS, type NavItem, type NavPlaceholder } from "@/components/workout/nav-items"
import { cn } from "@/lib/utils"

type MobileTabBarProps = {
  navItems?: NavItem[]
  navPlaceholders?: NavPlaceholder[]
}

export function MobileTabBar({
  navItems = NAV_ITEMS,
  navPlaceholders = [],
}: MobileTabBarProps = {}) {
  const pathname = useLocation({ select: (l) => l.pathname })

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/90 px-2 backdrop-blur-md backdrop-saturate-150"
      style={{
        paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom))",
        paddingTop: "0.375rem",
      }}
      aria-label="Primary"
    >
      {navItems.map(({ label, to, Icon }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`)
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

      {navPlaceholders.map(({ label, Icon }) => (
        <span
          key={label}
          aria-disabled="true"
          title="Not built yet"
          className="flex flex-1 cursor-not-allowed flex-col items-center gap-0.5 py-1 text-[0.625rem] font-medium text-muted-foreground/50"
        >
          <Icon className="size-5" strokeWidth={1.75} />
          <span>{label}</span>
        </span>
      ))}
    </nav>
  )
}
