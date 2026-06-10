import { useMemo, useState } from "react"

import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AppHeader, type Section } from "@/components/workout/app-header"
import { DayBoard, DayBoardSkeleton } from "@/components/workout/day-board"
import { Footer } from "@/components/workout/footer"
import { SubBar } from "@/components/workout/sub-bar"
import { useAuth } from "@/hooks/use-auth"
import { useDayCompletions } from "@/hooks/use-day-completions"
import { useWorkoutProgram } from "@/hooks/use-workout-program"
import { computeTodayPosition, type ProgramDay } from "@/lib/program-data"

// PLACEHOLDER_DAY keeps the SubBar's "current day" panel populated while the
// program is loading so the header chrome doesn't pop in alongside the table
// body. Strings deliberately match the visual weight of real data so layout
// stays steady. The empty id is fine — DayBoard never renders this placeholder.
const PLACEHOLDER_DAY: ProgramDay = { id: "", name: "Loading…", tag: "—" }

export function TodayPage() {
  const [section, setSection] = useState<Section>("today")
  const { data: program, isLoading, isError, refetch } = useWorkoutProgram()
  const { data: dayCompletions } = useDayCompletions(program?.id)
  const { user, signOut } = useAuth()

  const weekCount = program?.weeks.length ?? 0

  const todayPos = useMemo(
    () =>
      program?.startDate ? computeTodayPosition(program.startDate, weekCount) : null,
    [program?.startDate, weekCount]
  )

  // User selection is stored as an override. null = "follow today", which
  // means the displayed week/day tracks `todayPos` once the program loads.
  // Clicking "Today" clears the override; navigating clicks set it.
  const [selected, setSelected] = useState<{ week: number; dayIndex: number } | null>(null)
  const week = selected?.week ?? todayPos?.week ?? 1
  const dayIndex = selected?.dayIndex ?? todayPos?.dayIndex ?? 0

  // Resolve the active week. Clamp so a `week` value left over from a
  // previously-loaded program with more weeks doesn't index out of bounds.
  const activeWeek =
    program && weekCount > 0
      ? (program.weeks[Math.min(week, weekCount) - 1] ?? program.weeks[0])
      : undefined
  const days = activeWeek?.days ?? []
  const dayData = days[dayIndex] ?? PLACEHOLDER_DAY

  // completedDays drives the "done" dot on the day-selector tabs. Populated
  // from the dedicated day-completions endpoint, which reports sessions whose
  // state has rolled to 'completed' (every set is either completed or
  // skipped). Keyed `${week}-${dayIndex}` (0-based dayIndex) to match the
  // SubBar's lookup.
  const completedDays: Record<string, boolean> = dayCompletions ?? {}
  // initialCompleted seeds the per-set state inside DayBoard for already-done
  // sets when the day mounts. The session detail itself overrides this on
  // load; this just avoids a flicker for a freshly-mounted DayBoard.
  const initialCompleted: Record<string, boolean> = {}

  if (isError) {
    // The program failed to load. Keep the user in the app shell (header/nav
    // stay live) and surface a contextual, retryable message in the body
    // rather than swapping to a separate full-screen error page.
    return (
      <div
        className="grid min-h-svh bg-background text-foreground"
        style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
      >
        <AppHeader section={section} onSectionChange={setSection} onLogout={signOut} user={user} />
        <main className="grid place-items-center px-6 py-8">
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
        <Footer />
      </div>
    )
  }

  return (
    <div
      className="grid min-h-svh bg-background text-foreground"
      style={{ gridTemplateRows: "auto auto minmax(0,1fr) auto" }}
    >
      <AppHeader section={section} onSectionChange={setSection} onLogout={signOut} user={user} />
      <SubBar
        programName={program?.name ?? "Loading…"}
        weekCount={Math.max(1, weekCount)}
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
          initialCompleted={initialCompleted}
        />
      )}
      <Footer />
    </div>
  )
}
