import { cn } from "@/lib/utils"

type ComplianceCellProps = {
  compliancePct: number | null
  sessionsCompleted: number
  sessionsDue: number
}

export function ComplianceCell({
  compliancePct,
  sessionsCompleted,
  sessionsDue,
}: ComplianceCellProps) {
  if (compliancePct == null) {
    return <span className="text-[0.8125rem] text-muted-foreground">—</span>
  }

  const low = compliancePct < 80

  return (
    <div className="leading-tight">
      <span
        className={cn(
          "text-[0.875rem] font-semibold tabular-nums",
          low ? "text-amber-600 dark:text-amber-400" : "text-foreground"
        )}
      >
        {compliancePct}%
      </span>
      <span className="ml-1.5 text-[0.75rem] text-muted-foreground tabular-nums">
        {sessionsCompleted}/{sessionsDue}
      </span>
    </div>
  )
}
