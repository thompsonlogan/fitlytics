import { useMemo, useState } from "react"

import { Link, useParams } from "@tanstack/react-router"

import { buttonVariants } from "@/components/ui/button"
import { SubBar } from "@/components/workout/sub-bar"
import { useCoachAthleteProgram } from "@/hooks/use-coach-athlete-program"
import { useDayCompletions } from "@/hooks/use-day-completions"
import { computeTodayPosition, type ProgramDay } from "@/lib/program-data"
import { cn } from "@/lib/utils"

const PLACEHOLDER_DAY: ProgramDay = { id: "", name: "Loading…", tag: "—" }

export function CoachAthletePage() {
  const { athleteId } = useParams({ from: "/coach/coach/athletes/$athleteId" })
  const { athlete, program, isLoading, isError, notFound } = useCoachAthleteProgram(athleteId)
  const { data: dayCompletions } = useDayCompletions(program?.id)

  const weekCount = program?.weeks.length ?? 0

  const athletePos = useMemo(
    () => (program?.startDate ? computeTodayPosition(program.startDate, weekCount) : null),
    [program, weekCount]
  )

  const [selected, setSelected] = useState<{ week: number; dayIndex: number } | null>(null)
  const week = selected?.week ?? athletePos?.week ?? 1
  const dayIndex = selected?.dayIndex ?? athletePos?.dayIndex ?? 0

  const activeWeek =
    program && weekCount > 0
      ? (program.weeks[Math.min(week, weekCount) - 1] ?? program.weeks[0])
      : undefined

  const days = activeWeek?.days ?? []
  const dayData = days[dayIndex] ?? PLACEHOLDER_DAY

  if (notFound) {
    return (
      <CoachAthleteMessage
        title="Athlete not found"
        body="You don't coach this athlete, or the link has ended."
      />
    )
  }

  if (isError) {
    return (
      <CoachAthleteMessage
        title="Could not load this athlete"
        body="Something went wrong fetching their program. Refresh to try again."
      />
    )
  }

  if (!isLoading && athlete && !athlete.programId) {
    return (
      <CoachAthleteMessage
        title={`${athlete.displayName} has no program`}
        body="There is nothing to review until they are assigned one."
      />
    )
  }

  return (
    <div className="grid min-h-0" style={{ gridTemplateRows: "auto minmax(0,1fr)" }}>
      <SubBar
        breadcrumb={[
          { label: "Athletes", to: "/coach" },
          { label: athlete?.displayName ?? "Loading…" },
          { label: program?.name ?? "…" },
        ]}
        weekCount={Math.max(1, weekCount)}
        days={days}
        week={week}
        dayIndex={dayIndex}
        todayWeek={athletePos?.week ?? null}
        todayDayIndex={athletePos?.dayIndex ?? null}
        dayData={dayData}
        startDate={program?.startDate}
        completedDays={dayCompletions ?? {}}
        onWeekChange={(next) => setSelected({ week: next, dayIndex })}
        onDayChange={(next) => setSelected({ week, dayIndex: next })}
        onResetToToday={() => setSelected(null)}
      />

      <main className="px-5 py-6">
        <p className="text-sm text-muted-foreground">
          {dayData.off
            ? "Rest day — nothing prescribed."
            : "The prescribed-vs-actual table lands in the next step."}
        </p>
      </main>
    </div>
  )
}

function CoachAthleteMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid flex-1 place-items-center px-6 py-16">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
        <Link to="/coach" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to roster
        </Link>
      </div>
    </main>
  )
}
