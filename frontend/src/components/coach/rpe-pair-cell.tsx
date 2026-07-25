import { cn } from "@/lib/utils"

const RPE_OVERSHOOT = 1

type RpePairCellProps = {
  target: number | null
  actual: number | null
}

export function RpePairCell({ target, actual }: RpePairCellProps) {
  if (target == null && actual == null) {
    return <span className="text-muted-foreground">—</span>
  }

  const hard = target != null && actual != null && actual >= target + RPE_OVERSHOOT

  return (
    <span className="inline-flex items-center gap-1 text-[0.75rem] tabular-nums">
      <span className="text-muted-foreground">{target ?? "—"}</span>
      <span className="text-muted-foreground/50">→</span>
      <span
        title={hard ? `Logged ${actual} against a target of ${target}` : undefined}
        className={cn(
          "font-medium",
          actual == null && "text-muted-foreground",
          hard && "text-amber-600 dark:text-amber-400"
        )}
      >
        {actual ?? "—"}
      </span>
    </span>
  )
}
