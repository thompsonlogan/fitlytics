import { useState } from "react"

import { Card, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SidePanel } from "@/components/workout/side-panel"
import { WorkoutTableSkeleton } from "@/components/workout/workout-table-skeleton"
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

// DayBoardSkeleton renders the same outer grid as DayBoard so the page width
// and side-panel column stay fixed while the table loads. The right column is
// hidden below `lg` to mirror DayBoard's responsive behaviour.
export function DayBoardSkeleton() {
  return (
    <div
      className="grid min-h-0 grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_clamp(16rem,22vw,22rem)]"
      data-testid="day-board-skeleton"
    >
      <WorkoutTableSkeleton />
      <div className="hidden min-h-0 lg:block">
        <SidePanelSkeleton />
      </div>
    </div>
  )
}

// SidePanelSkeleton mirrors the layout of SidePanel — two stacked cards, the
// top with a 2×2 stat grid. Same outer shape means no width shift when real
// data swaps in.
function SidePanelSkeleton() {
  return (
    <aside
      className="grid min-h-0 grid-rows-[auto_1fr] gap-3"
      role="status"
      aria-busy="true"
      aria-label="Loading session summary"
    >
      <Card size="sm" className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
          <Skeleton className="h-3.5 w-32" />
        </CardHeader>
        <div className="mx-3.5 mt-3 h-1 overflow-hidden rounded-full bg-muted" />
        <div className="mt-3 grid grid-cols-2 border-t">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`px-3.5 py-2.5 ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b" : ""}`}
            >
              <Skeleton className="mb-2 h-2.5 w-16" />
              <Skeleton className="mb-1 h-5 w-12" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          ))}
        </div>
      </Card>
      <Card size="sm" className="flex min-h-0 flex-col gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
          <Skeleton className="h-3.5 w-24" />
        </CardHeader>
        <div className="flex-1 p-3.5">
          <Skeleton className="mb-2 h-3 w-full" />
          <Skeleton className="mb-2 h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </div>
      </Card>
    </aside>
  )
}
