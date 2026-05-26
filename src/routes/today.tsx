import { useState } from "react"

import { AppHeader, type Section } from "@/components/workout/app-header"
import { DayBoard, DayBoardSkeleton } from "@/components/workout/day-board"
import { Footer } from "@/components/workout/footer"
import { SubBar } from "@/components/workout/sub-bar"
import { useAuth } from "@/hooks/use-auth"
import { useWorkoutProgram } from "@/hooks/use-workout-program"
import type { ProgramDay } from "@/lib/program-data"

const TODAY_INDEX = 0

// PLACEHOLDER_DAY keeps the SubBar's "current day" panel populated while the
// program is loading so the header chrome doesn't pop in alongside the table
// body. Strings deliberately match the visual weight of real data so layout
// stays steady.
const PLACEHOLDER_DAY: ProgramDay = { name: "Loading…", tag: "—" }

export function TodayPage() {
  const [section, setSection] = useState<Section>("today")
  const [week, setWeek] = useState(1)
  const [dayIndex, setDayIndex] = useState(TODAY_INDEX)

  const { data: program, isLoading, isError } = useWorkoutProgram()
  const { user, signOut } = useAuth()

  // Resolve the active week. Clamp so a `week` value left over from a
  // previously-loaded program with more weeks doesn't index out of bounds.
  const weekCount = program?.weeks.length ?? 0
  const activeWeek =
    program && weekCount > 0
      ? program.weeks[Math.min(week, weekCount) - 1] ?? program.weeks[0]
      : undefined
  const days = activeWeek?.days ?? []
  const dayData = days[dayIndex] ?? PLACEHOLDER_DAY

  const completedDays: Record<string, boolean> = { "1-3": true }
  const initialCompleted: Record<string, boolean> =
    week === 1 && dayIndex === 0 ? { "0-0": true } : {}

  if (isError) {
    return (
      <div className="grid h-svh place-items-center text-sm text-destructive">
        Failed to load program. Try refreshing.
      </div>
    )
  }

  return (
    <div
      className="grid min-h-svh bg-background text-foreground"
      style={{ gridTemplateRows: "auto auto minmax(0,1fr) auto" }}
    >
      <AppHeader
        section={section}
        onSectionChange={setSection}
        onLogout={signOut}
        user={user}
      />
      <SubBar
        programName={program?.name ?? "Loading…"}
        weekCount={Math.max(1, weekCount)}
        days={days}
        week={week}
        dayIndex={dayIndex}
        todayIndex={TODAY_INDEX}
        dayData={dayData}
        completedDays={completedDays}
        onWeekChange={setWeek}
        onDayChange={setDayIndex}
        onResetToToday={() => {
          setWeek(1)
          setDayIndex(TODAY_INDEX)
        }}
      />
      {isLoading || !program ? (
        <DayBoardSkeleton />
      ) : (
        <DayBoard
          key={`${week}-${dayIndex}`}
          day={dayData}
          initialCompleted={initialCompleted}
        />
      )}
      <Footer />
    </div>
  )
}
