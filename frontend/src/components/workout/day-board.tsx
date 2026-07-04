import { Card, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BlockVideoDialog } from "@/components/workout/block-video-dialog"
import { SidePanel } from "@/components/workout/side-panel"
import { useDayBoard } from "@/components/workout/use-day-board"
import { WorkoutTableSkeleton } from "@/components/workout/workout-table-skeleton"
import { RestDayCard, WorkoutTable } from "@/components/workout/workout-table"
import { type ProgramDay } from "@/lib/program-data"

type DayBoardProps = {
  day: ProgramDay
  programId: string
  programDayId: string
  // prevDayId is the program_day id of the same day-index in the previous week,
  // or null in week 1. The side panel fetches that day's session to compute the
  // "vs last week" planned-volume delta. nextDay is the next non-rest day after
  // this one, used by the rest-day "Next session" card. Both are resolved by
  // the today page, which holds the full program + position.
  prevDayId?: string | null
  nextDay?: ProgramDay | null
  initialCompleted?: Record<string, boolean>
}

// Stable empty default for initialCompleted so a caller that omits the prop
// doesn't pass a fresh {} each render (react-doctor/rerender-memo-with-default-value).
const EMPTY_INITIAL_COMPLETED: Record<string, boolean> = {}

export function DayBoard({
  day,
  programId,
  programDayId,
  prevDayId = null,
  nextDay = null,
  initialCompleted = EMPTY_INITIAL_COMPLETED,
}: DayBoardProps) {
  // All session reads/writes + per-cell edit state live in a shared hook so the
  // desktop table here and the mobile card list drive identical behaviour.
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

  return (
    <div className="grid min-h-0 grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_clamp(16rem,22vw,22rem)]">
      {day.off ? (
        <RestDayCard name={day.name} />
      ) : (
        <WorkoutTable
          day={day}
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
      )}
      <div className="hidden min-h-0 lg:block">
        <SidePanel
          day={day}
          completed={completed}
          programId={programId}
          prevDayId={prevDayId}
          nextDay={nextDay}
          sessionNotes={session?.notes ?? ""}
          onSaveNotes={saveNotes}
        />
      </div>

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
