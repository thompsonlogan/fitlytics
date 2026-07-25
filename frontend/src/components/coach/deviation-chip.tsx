import { computeDeviation, formatDeviation } from "@/lib/deviation"
import { cn } from "@/lib/utils"

type DeviationChipProps = {
  target: number | null | undefined
  actual: number | null | undefined
}

export function DeviationChip({ target, actual }: DeviationChipProps) {
  const dev = computeDeviation(target, actual)
  if (!dev) return null

  return (
    <span
      title={`Prescribed ${target} lb, logged ${actual} lb`}
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium tabular-nums",
        !dev.flagged && "bg-muted text-muted-foreground",
        dev.flagged && dev.fraction > 0 && "bg-sky-500/15 text-sky-700 dark:text-sky-400",
        dev.flagged && dev.fraction < 0 && "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      )}
    >
      {formatDeviation(dev.pct)}
    </span>
  )
}
