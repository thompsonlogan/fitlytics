import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  estimateDuration,
  flattenRows,
  totalSets,
  type ProgramDay,
} from "@/lib/program-data"

type SidePanelProps = {
  day: ProgramDay
  completed: Record<string, boolean>
}

export function SidePanel({ day, completed }: SidePanelProps) {
  if (day.off) {
    return <RestSidePanel />
  }

  const rows = flattenRows(day)
  const doneSets = rows.reduce(
    (sum, r) => (completed[r.key] ? sum + r.block.sets : sum),
    0,
  )
  const totSets = totalSets(day)
  const pct = totSets ? Math.round((doneSets / totSets) * 100) : 0

  const volume = rows.reduce((sum, r) => {
    const lb = parseFloat(String(r.block.used).replace(/[^0-9.]/g, "")) || 0
    const reps = parseInt(String(r.block.reps).split(/[–-]/)[0], 10) || 0
    return sum + lb * reps * r.block.sets
  }, 0)

  const heaviest = rows.reduce((max, r) => {
    const lb = parseFloat(String(r.block.used).replace(/[^0-9.]/g, "")) || 0
    return lb > max ? lb : max
  }, 0)

  const heaviestExercise = rows.find(
    (r) => String(r.block.used) === String(heaviest),
  )?.exercise.name

  const est = estimateDuration(day)

  return (
    <aside className="grid min-h-0 grid-rows-[auto_1fr_auto] gap-3">
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
            sub="+8.4% vs last week"
            borderBottom
          />
          <Stat
            label="Top set"
            value={Math.round(heaviest)}
            unit="lb"
            sub={heaviestExercise || "—"}
            borderRight
          />
          <Stat label="Avg RPE target" value="7.8" unit="" sub="Within block range" />
        </div>
      </Card>

      <Card size="sm" className="flex min-h-0 flex-col gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
          <CardTitle className="text-[0.8125rem]">Coach notes</CardTitle>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">{day.tag}</span>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto px-3.5 py-2.5 text-[0.8125rem] leading-relaxed">
          <span className="mb-1 inline-block text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            Programming
          </span>
          <ul className="m-0 list-disc pl-4 [&_li]:mb-1 [&_li::marker]:text-muted-foreground">
            <li>Squat openers: belt + sleeves from set 2 onward.</li>
            <li>RIR work: stop 1 rep shy on the heaviest set.</li>
            <li>
              Log RPE on the last set of each block — that drives next week&apos;s load cap.
            </li>
            <li>Bar speed is the limiter; if you grind, cut the back-offs at 0.95.</li>
          </ul>
        </CardContent>
        <div className="flex items-center gap-2 border-t px-3.5 py-1.5 text-xs">
          <span className="text-muted-foreground">Last completed</span>
          <span className="flex-1" />
          <span className="font-medium tabular-nums">May 14 · {day.tag}</span>
        </div>
      </Card>
    </aside>
  )
}

function RestSidePanel() {
  return (
    <aside className="grid min-h-0 grid-rows-[auto_1fr_auto] gap-3">
      <Card size="sm" className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
          <CardTitle className="text-[0.8125rem]">Recovery</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 border-t">
          <Stat
            label="Sleep last night"
            value="7.4"
            unit="h"
            sub="+12 min vs avg"
            borderRight
            borderBottom
          />
          <Stat label="HRV" value="62" unit="ms" sub="Above baseline" borderBottom />
          <Stat
            label="Resting HR"
            value="58"
            unit="bpm"
            sub="−3 vs week avg"
            borderRight
          />
          <Stat label="Readiness" value="86" unit="/100" sub="High" />
        </div>
      </Card>
      <Card size="sm" className="flex min-h-0 flex-col gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
          <CardTitle className="text-[0.8125rem]">Coach notes</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto px-3.5 py-2.5 text-[0.8125rem] leading-relaxed">
          <span className="mb-1 inline-block text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            Programming
          </span>
          <ul className="m-0 list-disc pl-4 [&_li]:mb-1 [&_li::marker]:text-muted-foreground">
            <li>Stay non-sedentary. 20–40 min easy walk.</li>
            <li>Hydration target: 0.7 oz per lb bodyweight.</li>
            <li>Mobility: hips + t-spine, 10 min.</li>
          </ul>
        </CardContent>
      </Card>
      <Card size="sm" className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
          <CardTitle className="text-[0.8125rem]">Next session</CardTitle>
        </CardHeader>
        <CardContent className="px-3.5 py-2 text-xs">
          <NextLine name="Comp Squat" scheme="1×3 @ 300" />
          <NextLine name="Comp Deadlift" scheme="1×3 @ 305" />
          <NextLine name="+ 2 accessories" scheme="" />
        </CardContent>
      </Card>
    </aside>
  )
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
        {unit && (
          <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>
        )}
      </div>
      <div className="mt-0.5 text-[0.6875rem] text-muted-foreground">{sub}</div>
    </div>
  )
}

function NextLine({ name, scheme }: { name: string; scheme: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-muted-foreground">
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{name}</span>
      <span className="tabular-nums">{scheme}</span>
    </div>
  )
}
