import { useState } from "react"

import { SidePanel } from "@/components/workout/side-panel"
import { RestDayCard, WorkoutTable } from "@/components/workout/workout-table"
import { type ProgramDay } from "@/lib/program-data"

type DayBoardProps = {
  day: ProgramDay
  initialCompleted?: Record<string, boolean>
}

export function DayBoard({ day, initialCompleted = {} }: DayBoardProps) {
  const [completed, setCompleted] = useState<Record<string, boolean>>(initialCompleted)
  const [loadEdits, setLoadEdits] = useState<Record<string, string>>({})
  const [rpeEdits, setRpeEdits] = useState<Record<string, string>>({})

  const toggleSet = (key: string) => {
    setCompleted((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  const editLoad = (key: string, value: string) => {
    if (value !== "" && !/^\d{1,4}$/.test(value)) return
    setLoadEdits((prev) => ({ ...prev, [key]: value }))
  }
  const editRpe = (key: string, value: string) => {
    if (value === "") {
      setRpeEdits((prev) => ({ ...prev, [key]: "" }))
      return
    }
    if (!/^\d{1,2}$/.test(value)) return
    const n = parseInt(value, 10)
    if (n < 1 || n > 10) return
    setRpeEdits((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="grid min-h-0 grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_clamp(16rem,22vw,22rem)]">
      {day.off ? (
        <RestDayCard name={day.name} />
      ) : (
        <WorkoutTable
          day={day}
          completed={completed}
          loadEdits={loadEdits}
          rpeEdits={rpeEdits}
          onToggleSet={toggleSet}
          onEditLoad={editLoad}
          onEditRpe={editRpe}
        />
      )}
      <div className="hidden min-h-0 lg:block">
        <SidePanel day={day} completed={completed} />
      </div>
    </div>
  )
}
