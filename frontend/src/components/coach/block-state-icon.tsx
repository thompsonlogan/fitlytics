import { Check, CircleDashed, Minus, X } from "lucide-react"

import type { BlockActuals } from "@/hooks/use-coach-session"
import { cn } from "@/lib/utils"

const STATE_ICON: Record<
  string,
  { Icon: typeof Check; className: string; label: string } | undefined
> = {
  completed: {
    Icon: Check,
    className: "text-emerald-600 dark:text-emerald-400",
    label: "Completed",
  },
  partial: {
    Icon: CircleDashed,
    className: "text-amber-600 dark:text-amber-400",
    label: "Partly completed",
  },
  skipped: { Icon: X, className: "text-muted-foreground", label: "Skipped" },
  pending: { Icon: Minus, className: "text-muted-foreground/40", label: "Not logged" },
}

const UNKNOWN_STATE = {
  Icon: Minus,
  className: "text-muted-foreground/40",
  label: "Unknown",
} as const

export function BlockStateIcon({
  state,
  className,
}: {
  state: BlockActuals["state"]
  className?: string
}) {
  const { Icon, className: tone, label } = STATE_ICON[state] ?? UNKNOWN_STATE
  return <Icon className={cn("size-3.5", tone, className)} aria-label={label} />
}
