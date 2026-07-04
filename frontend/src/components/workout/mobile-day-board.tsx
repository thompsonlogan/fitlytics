import { MoreHorizontal, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BlockVideoDialog } from "@/components/workout/block-video-dialog"
import { MobileExerciseCard } from "@/components/workout/mobile-exercise-card"
import { SidePanel } from "@/components/workout/side-panel"
import { useDayBoard } from "@/components/workout/use-day-board"
import { RestDayCard } from "@/components/workout/workout-table"
import { type ProgramDay, totalSets } from "@/lib/program-data"

type MobileDayBoardProps = {
  day: ProgramDay
  programId: string
  programDayId: string
  prevDayId?: string | null
  nextDay?: ProgramDay | null
  initialCompleted?: Record<string, boolean>
}

const EMPTY_INITIAL_COMPLETED: Record<string, boolean> = {}

// MobileDayBoard is the phone counterpart to DayBoard. It shares the exact same
// session/logging wiring via useDayBoard, but renders the plan as a stacked
// exercise-card list (not a table) and lays the summary/notes side panel out
// below it in the same scrolling column.
export function MobileDayBoard({
  day,
  programId,
  programDayId,
  prevDayId = null,
  nextDay = null,
  initialCompleted = EMPTY_INITIAL_COMPLETED,
}: MobileDayBoardProps) {
  const {
    session,
    blockLogsByKey,
    videosBySetLogId,
    videoInfo,
    videoDialog,
    setVideoDialog,
    ensureSetLogFor,
    saveNotes,
    cellState,
    completed,
    loadEdits,
    rpeEdits,
    cellErrors,
    persistedLoad,
    persistedRpe,
    editLoad,
    editRpe,
    blurLoad,
    blurRpe,
    cycleSet,
  } = useDayBoard({ programId, programDayId, initialCompleted })

  const exercises = day.exercises ?? []

  return (
    <div className="flex flex-col gap-3">
      {day.off ? (
        <RestDayCard name={day.name} />
      ) : (
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-3.5 py-2.5">
            <CardTitle className="text-[0.8125rem]">Session plan</CardTitle>
            <span className="text-xs text-muted-foreground">
              {exercises.length} exercises · {totalSets(day)} working sets
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="xs">
              <Plus className="size-3" />
              Add
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="More">
              <MoreHorizontal className="size-3" />
            </Button>
          </CardHeader>
          <div className="flex flex-col gap-2.5 p-3">
            {exercises.map((exercise, exIdx) => (
              <MobileExerciseCard
                key={`${exIdx}-${exercise.name}`}
                exercise={exercise}
                exIdx={exIdx}
                exNum={exIdx + 1}
                cellState={cellState}
                loadEdits={loadEdits}
                rpeEdits={rpeEdits}
                persistedLoad={persistedLoad}
                persistedRpe={persistedRpe}
                cellErrors={cellErrors}
                videoInfo={videoInfo}
                onCycleSet={cycleSet}
                onEditLoad={editLoad}
                onEditRpe={editRpe}
                onBlurLoad={blurLoad}
                onBlurRpe={blurRpe}
                onOpenVideo={(rowKey, initialSet) => setVideoDialog({ rowKey, initialSet })}
              />
            ))}
          </div>
        </Card>
      )}

      <SidePanel
        day={day}
        completed={completed}
        programId={programId}
        prevDayId={prevDayId}
        nextDay={nextDay}
        sessionNotes={session?.notes ?? ""}
        onSaveNotes={saveNotes}
        layout="stack"
      />

      <BlockVideoDialog
        dialog={videoDialog}
        onClose={() => setVideoDialog(null)}
        day={day}
        session={session}
        blockLogsByKey={blockLogsByKey}
        videosBySetLogId={videosBySetLogId}
        ensureSetLog={ensureSetLogFor}
      />
    </div>
  )
}

// MobileDayBoardSkeleton mirrors the plan card + stacked summary while the
// program loads, so the mobile body doesn't jump when real data arrives.
export function MobileDayBoardSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="mobile-day-board-skeleton">
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
          <Skeleton className="h-3.5 w-28" />
        </CardHeader>
        <div className="flex flex-col gap-2.5 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-md border p-3">
              <Skeleton className="mb-2 h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
              <div className="mt-3 flex items-center gap-2">
                <Skeleton className="size-[1.375rem] rounded-md" />
                <Skeleton className="h-8 w-16" />
                <div className="flex-1" />
                <Skeleton className="h-8 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card size="sm" className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b px-3.5 py-2.5">
          <Skeleton className="h-3.5 w-32" />
        </CardHeader>
        <div className="mt-3 grid grid-cols-2 border-t">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`px-3.5 py-2.5 ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b" : ""}`}
            >
              <Skeleton className="mb-2 h-2.5 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
