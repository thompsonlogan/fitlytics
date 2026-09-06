import { useMemo, useState } from "react"

import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DayBoard, DayBoardSkeleton } from "@/components/workout/day-board"
import { MobileToday } from "@/components/workout/mobile-today"
import { NoProgramCard } from "@/components/workout/no-program-card"
import { SubBar } from "@/components/workout/sub-bar"
import { useDayCompletions } from "@/hooks/use-day-completions"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useWorkoutProgram } from "@/hooks/use-workout-program"
import { computeTodayPosition, nextWorkoutDay, type ProgramDay } from "@/lib/program-data"

const PLACEHOLDER_DAY: ProgramDay = { id: "", name: "Loading…", tag: "—" }
const EMPTY_COMPLETED: Record<string, boolean> = {}

export function TodayPage() {
  const { data: program, isLoading, isError, refetch } = useWorkoutProgram()
  const { data: dayCompletions } = useDayCompletions(program?.id)
  const isMobile = useIsMobile()

  const weekCount = program?.weeks.length ?? 0

  const todayPos = useMemo(
    () => (program?.startDate ? computeTodayPosition(program.startDate, weekCount) : null),
    [program, weekCount]
  )

  const [selected, setSelected] = useState<{ week: number; dayIndex: number } | null>(null)
  const week = selected?.week ?? todayPos?.week ?? 1
  const dayIndex = selected?.dayIndex ?? todayPos?.dayIndex ?? 0

  const activeWeek =
    program && weekCount > 0
      ? (program.weeks[Math.min(week, weekCount) - 1] ?? program.weeks[0])
      : undefined

  const days = activeWeek?.days ?? []
  const dayData = days[dayIndex] ?? PLACEHOLDER_DAY
  const prevDayId = week > 1 ? (program?.weeks[week - 2]?.days[dayIndex]?.id ?? null) : null
  const nextDay = program ? nextWorkoutDay(program, week, dayIndex) : null
  const completedDays: Record<string, boolean> = dayCompletions ?? {}

  if (isError) {
    return (
      <main className="grid flex-1 place-items-center px-6 py-8">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            We couldn't load your program. This is usually temporary — give it another try.
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCw />
            Try again
          </Button>
        </div>
      </main>
    )
  }

  if (program === null) {
    return <NoProgramCard />
  }

  if (isMobile) {
    return (
      <MobileToday
        program={program}
        isLoading={isLoading}
        programName={program?.name ?? "Loading…"}
        weekCount={Math.max(1, weekCount)}
        blocks={program?.blocks ?? []}
        days={days}
        week={week}
        dayIndex={dayIndex}
        todayWeek={todayPos?.week ?? null}
        todayDayIndex={todayPos?.dayIndex ?? null}
        dayData={dayData}
        startDate={program?.startDate}
        completedDays={completedDays}
        prevDayId={prevDayId}
        nextDay={nextDay}
        onWeekChange={(next) => setSelected({ week: next, dayIndex })}
        onDayChange={(next) => setSelected({ week, dayIndex: next })}
      />
    )
  }

  return (
    <div className="grid min-h-0" style={{ gridTemplateRows: "auto minmax(0,1fr)" }}>
      <SubBar
        breadcrumb={[{ label: "Programs" }, { label: program?.name ?? "Loading…" }]}
        weekCount={Math.max(1, weekCount)}
        blocks={program?.blocks ?? []}
        days={days}
        week={week}
        dayIndex={dayIndex}
        todayWeek={todayPos?.week ?? null}
        todayDayIndex={todayPos?.dayIndex ?? null}
        dayData={dayData}
        startDate={program?.startDate}
        completedDays={completedDays}
        onWeekChange={(next) => setSelected({ week: next, dayIndex })}
        onDayChange={(next) => setSelected({ week, dayIndex: next })}
        onResetToToday={() => setSelected(null)}
      />
      {isLoading || !program ? (
        <DayBoardSkeleton />
      ) : (
        <DayBoard
          key={`${week}-${dayIndex}`}
          day={dayData}
          programId={program.id}
          programDayId={dayData.id}
          prevDayId={prevDayId}
          nextDay={nextDay}
          initialCompleted={EMPTY_COMPLETED}
        />
      )}
    </div>
  )
}
