import { Check, CircleDashed, Minus, X } from "lucide-react"

import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CoachVideoCell } from "@/components/coach/coach-video-cell"
import { DeviationChip } from "@/components/coach/deviation-chip"
import { RpePairCell } from "@/components/coach/rpe-pair-cell"
import type { BlockActuals } from "@/hooks/use-coach-session"
import { flattenRows, totalSets, type ProgramDay } from "@/lib/program-data"
import { cn } from "@/lib/utils"

type CoachWorkoutTableProps = {
  day: ProgramDay
  actualsFor: (key: string) => BlockActuals
  onOpenVideo: (key: string) => void
}

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

export function CoachWorkoutTable({ day, actualsFor, onOpenVideo }: CoachWorkoutTableProps) {
  const rows = flattenRows(day)
  const exerciseCount = day.exercises?.length ?? 0

  return (
    <Card className="flex min-h-0 flex-col gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
        <CardTitle className="text-[0.8125rem]">Prescribed vs actual</CardTitle>
        <span className="text-xs text-muted-foreground">
          {exerciseCount} exercises · {totalSets(day)} working sets
        </span>
      </CardHeader>

      <Table containerClassName="min-h-0 flex-1 overflow-auto" className="text-[0.8125rem]">
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            {[
              "",
              "Exercise",
              "Sets",
              "Reps",
              "Prescription",
              "Target",
              "Actual",
              "RPE",
              "Video",
            ].map((label, i) => (
              <TableHead
                key={label || `col-${i}`}
                className={cn(
                  "sticky top-0 z-10 h-auto border-b bg-background px-2.5 py-1.5 text-[0.6875rem] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase",
                  ["Sets", "Reps", "Target", "Actual"].includes(label) && "text-right",
                  ["RPE", "Video"].includes(label) && "text-center"
                )}
              >
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((r, rowIdx) => {
            const actual = actualsFor(r.key)
            const { Icon, className, label } = STATE_ICON[actual.state] ?? UNKNOWN_STATE

            return (
              <TableRow
                key={r.key}
                className={cn("hover:bg-muted/40", r.first && rowIdx > 0 && "border-t")}
              >
                <TableCell className="w-7 px-2.5 py-1.5">
                  <Icon className={cn("size-3.5", className)} aria-label={label} />
                </TableCell>

                {r.first ? (
                  <TableCell
                    rowSpan={r.rowSpan}
                    className="border-r px-2.5 py-1.5 align-top whitespace-normal"
                  >
                    <div className="flex items-start gap-2 font-medium">
                      <span className="mt-0.5 inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-medium text-muted-foreground tabular-nums">
                        {r.exNum}
                      </span>
                      <span>{r.exercise.name}</span>
                    </div>
                    <div className="mt-0.5 ml-6.5 text-[0.6875rem] text-muted-foreground">
                      {r.exercise.sub ? `${r.exercise.sub} · ` : ""}rest {r.exercise.rest} min
                    </div>
                  </TableCell>
                ) : null}

                <TableCell className="px-2.5 py-1.5 text-right tabular-nums">
                  {r.block.sets}
                </TableCell>

                <TableCell className="px-2.5 py-1.5 text-right tabular-nums">
                  {r.block.reps}
                  {actual.repsActual != null && actual.repsActual !== 0 && (
                    <span className="ml-1 text-[0.6875rem] text-muted-foreground">
                      ({actual.repsActual})
                    </span>
                  )}
                </TableCell>

                <TableCell className="px-2.5 py-1.5 whitespace-nowrap">
                  {r.block.intensity || <span className="text-muted-foreground">—</span>}
                </TableCell>

                <TableCell className="px-2.5 py-1.5 text-right tabular-nums">
                  {r.block.prescribedLoad ?? <span className="text-muted-foreground">—</span>}
                </TableCell>

                <TableCell className="px-2.5 py-1.5 text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    {actual.loadLb == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="font-medium">{actual.loadLb}</span>
                    )}
                    <DeviationChip target={r.block.prescribedLoad} actual={actual.loadLb} />
                  </span>
                </TableCell>

                <TableCell className="px-2.5 py-1.5 text-center">
                  <RpePairCell target={r.block.rpe} actual={actual.rpe} />
                </TableCell>

                <TableCell className="px-2.5 py-1.5 text-center">
                  <CoachVideoCell
                    total={actual.videosTotal}
                    unreviewed={actual.videosUnreviewed}
                    exerciseName={r.exercise.name}
                    onOpen={() => onOpenVideo(r.key)}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}
