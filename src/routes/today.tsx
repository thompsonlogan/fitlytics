import { useState } from "react"

import { AppHeader, type Section } from "@/components/workout/app-header"
import { DayBoard } from "@/components/workout/day-board"
import { Footer } from "@/components/workout/footer"
import { SubBar } from "@/components/workout/sub-bar"
import { useAuth } from "@/hooks/use-auth"
import { useWorkoutProgram } from "@/hooks/use-workout-program"

const TODAY_INDEX = 0

export function TodayPage() {
  const [section, setSection] = useState<Section>("today")
  const [week, setWeek] = useState(1)
  const [dayIndex, setDayIndex] = useState(TODAY_INDEX)

  const { data: program, isLoading } = useWorkoutProgram()
  const { user, signOut } = useAuth()

  if (isLoading || !program) {
    return (
      <div className="grid h-svh place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  const dayData = program.days[dayIndex]
  const completedDays: Record<string, boolean> = { "1-3": true }
  const initialCompleted: Record<string, boolean> =
    week === 1 && dayIndex === 0 ? { "0-0": true } : {}

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
        program={program}
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
      <DayBoard key={`${week}-${dayIndex}`} day={dayData} initialCompleted={initialCompleted} />
      <Footer />
    </div>
  )
}
