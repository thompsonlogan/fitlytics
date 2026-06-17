import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { NextSessionCard } from "@/components/workout/next-session-card"
import { NotesCard } from "@/components/workout/notes-card"
import { useCurrentSession } from "@/hooks/use-session"
import {
  avgTargetRpe,
  estimateDuration,
  flattenRows,
  plannedVolume,
  topSet,
  totalSets,
  type ProgramDay,
} from "@/lib/program-data"
import { actualVolume } from "@/lib/session-metrics"

type SidePanelProps = {
  day: ProgramDay
  completed: Record<string, boolean>
  // programId + prevDayId let the panel fetch the same day-index session from
  // the previous week to compute the "vs last week" planned-volume delta.
  programId: string
  prevDayId: string | null
  // nextDay drives the rest-day "Next session" card.
  nextDay: ProgramDay | null
  // sessionNotes / onSaveNotes back the editable "Your notes" section.
  sessionNotes: string
  onSaveNotes: (value: string) => void | Promise<void>
}

export function SidePanel({
  day,
  completed,
  programId,
  prevDayId,
  nextDay,
  sessionNotes,
  onSaveNotes,
}: SidePanelProps) {
  // Previous-week session (same day-index) for the volume comparison. The query
  // is disabled when prevDayId is null/empty (week 1 or a rest placeholder), in
  // which case data is undefined and the delta is hidden. Called unconditionally
  // to respect the rules of hooks — harmless on rest days.
  const prevSessionQuery = useCurrentSession(programId, prevDayId ?? undefined)
  const prevActualVolume = actualVolume(prevSessionQuery.data)

  if (day.off) {
    return (
      <aside className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3">
        <NotesCard
          coachNotes={day.notes}
          yourNotes={sessionNotes}
          onSaveYourNotes={onSaveNotes}
          tag={day.tag}
        />
        <NextSessionCard nextDay={nextDay} />
      </aside>
    )
  }

  const rows = flattenRows(day)
  const doneSets = rows.reduce((sum, r) => (completed[r.key] ? sum + r.block.sets : sum), 0)
  const totSets = totalSets(day)
  const pct = totSets ? Math.round((doneSets / totSets) * 100) : 0

  const volume = plannedVolume(day)
  const { load: heaviest, exercise: heaviestExercise } = topSet(day)
  const rpe = avgTargetRpe(day)
  const est = estimateDuration(day)

  // Planned (this week) vs actual (last week). Only shown when last week's
  // session actually logged volume — otherwise there's nothing to compare to.
  const deltaPct =
    prevActualVolume > 0 ? ((volume - prevActualVolume) / prevActualVolume) * 100 : null
  const deltaSub =
    deltaPct == null
      ? undefined
      : `${deltaPct >= 0 ? "+" : "−"}${Math.abs(deltaPct).toFixed(1)}% vs last week`

  return (
    <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <Card size="sm" className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
          <CardTitle className="text-[0.8125rem]">Session summary</CardTitle>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {doneSets}/{totSets} sets
          </span>
        </CardHeader>
        <div className="mx-3.5 mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 border-t">
          <Stat
            label="Est. duration"
            value={est}
            unit="min"
            sub={`~${Math.round(est * 0.4)} min lifting`}
            borderRight
            borderBottom
          />
          <Stat
            label="Planned volume"
            value={(volume / 1000).toFixed(1)}
            unit="k lb"
            sub={deltaSub ?? "No prior week"}
            borderBottom
          />
          <Stat
            label="Top set"
            value={Math.round(heaviest)}
            unit="lb"
            sub={heaviestExercise || "—"}
            borderRight
          />
          <Stat
            label="Avg RPE target"
            value={rpe ? rpe.avg : "—"}
            unit=""
            sub={rpe ? formatRpeRange(rpe) : "Not prescribed"}
          />
        </div>
      </Card>

      <NotesCard
        coachNotes={day.notes}
        yourNotes={sessionNotes}
        onSaveYourNotes={onSaveNotes}
        tag={day.tag}
      />
    </aside>
  )
}

// formatRpeRange renders the prescribed-RPE spread as a sub-line: a single
// value collapses to "RPE 8 target", a spread to "RPE 5–8 target".
function formatRpeRange({ min, max }: { min: number; max: number }): string {
  return min === max ? `RPE ${min} target` : `RPE ${min}–${max} target`
}

type StatProps = {
  label: string
  value: number | string
  unit: string
  sub: string
  borderRight?: boolean
  borderBottom?: boolean
}

function Stat({ label, value, unit, sub, borderRight, borderBottom }: StatProps) {
  return (
    <div
      className={`px-3.5 py-2.5 ${borderRight ? "border-r" : ""} ${borderBottom ? "border-b" : ""}`}
    >
      <div className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[0.6875rem] text-muted-foreground">{sub}</div>
    </div>
  )
}
