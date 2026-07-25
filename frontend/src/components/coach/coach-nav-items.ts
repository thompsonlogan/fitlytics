import { ClipboardList, MessageSquare, Users, Video } from "lucide-react"

import type { NavItem, NavPlaceholder } from "@/components/workout/nav-items"

export const COACH_NAV_ITEMS: NavItem[] = [{ label: "Athletes", to: "/coach", Icon: Users }]

export const COACH_NAV_PLACEHOLDERS: NavPlaceholder[] = [
  { label: "Programs", Icon: ClipboardList },
  { label: "Review queue", Icon: Video },
  { label: "Messages", Icon: MessageSquare },
]
