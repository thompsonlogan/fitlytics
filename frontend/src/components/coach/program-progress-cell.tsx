type ProgramProgressCellProps = {
  programName?: string
  currentWeek: number
  totalWeeks: number
}

export function ProgramProgressCell({
  programName,
  currentWeek,
  totalWeeks,
}: ProgramProgressCellProps) {
  if (!programName) {
    return <span className="text-[0.8125rem] text-muted-foreground">No program</span>
  }

  const pct = totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / totalWeeks) * 100)) : 0

  return (
    <div className="leading-tight">
      <div className="truncate text-[0.8125rem] font-medium">{programName}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${pct}%` }} />
        </span>
        <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
          W{currentWeek}/{totalWeeks}
        </span>
      </div>
    </div>
  )
}
