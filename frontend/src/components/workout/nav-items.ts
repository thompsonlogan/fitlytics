import { CalendarCheck2, ChartLine, ClipboardList, History } from "lucide-react"

export type NavItem = {
  label: string
  to: "/today" | "/program" | "/history" | "/analytics" | "/coach"
  Icon: typeof CalendarCheck2
}

export type NavPlaceholder = {
  label: string
  Icon: typeof CalendarCheck2
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Today", to: "/today", Icon: CalendarCheck2 },
  { label: "Programs", to: "/program", Icon: ClipboardList },
  { label: "History", to: "/history", Icon: History },
  { label: "Analytics", to: "/analytics", Icon: ChartLine },
]
