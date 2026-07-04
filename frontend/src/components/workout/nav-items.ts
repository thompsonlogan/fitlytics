import { CalendarCheck2, ChartLine, ClipboardList, History } from "lucide-react"

export type NavItem = {
  label: string
  to: "/today" | "/program" | "/history" | "/analytics"
  Icon: typeof CalendarCheck2
}

// NAV_ITEMS is the app's primary navigation, shared by the desktop header's
// top nav and the mobile bottom tab bar so the two never drift out of sync.
export const NAV_ITEMS: NavItem[] = [
  { label: "Today", to: "/today", Icon: CalendarCheck2 },
  { label: "Programs", to: "/program", Icon: ClipboardList },
  { label: "History", to: "/history", Icon: History },
  { label: "Analytics", to: "/analytics", Icon: ChartLine },
]
