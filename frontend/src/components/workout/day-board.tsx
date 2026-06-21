import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Card, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SidePanel } from "@/components/workout/side-panel"
import {
  buildBlockIndex,
  findBlockLogs,
  useCellLogging,
} from "@/components/workout/use-cell-logging"
import { WorkoutTableSkeleton } from "@/components/workout/workout-table-skeleton"
import { RestDayCard, WorkoutTable } from "@/components/workout/workout-table"
import { VideoUploadDialog } from "@/components/workout/video-upload-dialog"
import {
  useCurrentSession,
  useLogSet,
  useLogSetBatch,
  useStartSession,
  useUpdateSessionNotes,
} from "@/hooks/use-session"
import { useSessionVideos } from "@/hooks/use-set-videos"
import { type ProgramDay } from "@/lib/program-data"
import { type SessionResponse, type VideoResponse } from "@/services/generated"

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
  // Session is the source of truth for actuals + completion. We read existing
  // (404 surfaces as null) and lazily POST when the user first edits.
  const sessionQuery = useCurrentSession(programId, programDayId)
  const startSession = useStartSession(programId, programDayId)
  const logSet = useLogSet(programId, programDayId)
  const logSetBatch = useLogSetBatch(programId, programDayId)
  const updateNotes = useUpdateSessionNotes(programId, programDayId)

  const session = sessionQuery.data

  // Pull a (exerciseIdx-blockIdx) → SetLog[] map so the cell renderers can look
  // up a block's set logs by the same row key the workout table already uses.
  const blockLogsByKey = useMemo(() => buildBlockIndex(session), [session])

  // Set videos for this session, indexed by set_log id so each block row can
  // resolve its sets' clips.
  const videosQuery = useSessionVideos(session?.id)
  const videosBySetLogId = useMemo(() => {
    const m = new Map<string, VideoResponse>()
    for (const v of videosQuery.data ?? []) {
      if (v.setLogId) m.set(v.setLogId, v)
    }
    return m
  }, [videosQuery.data])

  // Per-block filmed summary for the table's video cell.
  const videoInfo = useMemo(() => {
    const out: Record<string, { filmedCount: number; firstFilmedSet: number | null }> = {}
    for (const [key, logs] of blockLogsByKey) {
      let filmedCount = 0
      let firstFilmedSet: number | null = null
      logs.forEach((log, i) => {
        if (videosBySetLogId.get(log.id!)?.status === "ready") {
          filmedCount++
          if (firstFilmedSet === null) firstFilmedSet = i
        }
      })
      out[key] = { filmedCount, firstFilmedSet }
    }
    return out
  }, [blockLogsByKey, videosBySetLogId])

  // Which block's video dialog is open (null = closed), and which set to land on.
  const [videoDialog, setVideoDialog] = useState<{ rowKey: string; initialSet: number } | null>(null)

  // ensureSession lazily creates the session if it doesn't exist yet. Returns
  // the session, or null if it couldn't be started. Shared by the cell-logging
  // hook, the note save, and the video-upload set resolver below.
  const ensureSession = async (): Promise<SessionResponse | null> => {
    if (session) return session
    return await startSession.mutateAsync()
  }

  // Per-cell edit state + the optimistic, debounced set-state machine live in a
  // dedicated hook so this component stays focused on layout + wiring.
  const {
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
  } = useCellLogging({ blockLogsByKey, initialCompleted, ensureSession, logSet, logSetBatch })

  // ensureSetLogFor lazily starts the session (so the set_logs exist) and
  // returns the ids needed to upload a video for one physical set of a block.
  const ensureSetLogFor = async (
    rowKey: string,
    setIdx: number
  ): Promise<{ sessionId: string; setLogId: string } | undefined> => {
    const s = await ensureSession()
    if (!s?.id) return undefined
    const log = findBlockLogs(rowKey, s)[setIdx]
    if (!log) return undefined
    return { sessionId: s.id, setLogId: log.id! }
  }

  // saveNotes persists the athlete's "Your notes" text. Adding a note is a
  // first-class edit, so it lazily starts the session (same rule as logging a
  // cell) before patching sessions.notes. Errors are swallowed into a toast;
  // the NotesCard re-reads the unchanged cached value, which reverts the box.
  const saveNotes = async (value: string) => {
    try {
      await ensureSession()
      await updateNotes.mutateAsync({ notes: value })
    } catch {
      toast.error("Couldn't save your note. Check your connection and try again.")
    }
  }

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

      {videoDialog
        ? (() => {
            const [exIdx, blIdx] = videoDialog.rowKey.split("-").map(Number)
            const exercise = day.exercises?.[exIdx]
            const block = exercise?.blocks[blIdx]
            if (!exercise || !block) return null
            return (
              <VideoUploadDialog
                key={`${videoDialog.rowKey}:${videoDialog.initialSet}`}
                open
                onOpenChange={(o) => {
                  if (!o) setVideoDialog(null)
                }}
                sessionId={session?.id}
                exercise={exercise}
                exNum={exIdx + 1}
                block={block}
                blockLogs={blockLogsByKey.get(videoDialog.rowKey) ?? []}
                videosBySetLogId={videosBySetLogId}
                initialSet={videoDialog.initialSet}
                ensureSetLog={(setIdx) => ensureSetLogFor(videoDialog.rowKey, setIdx)}
              />
            )
          })()
        : null}
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
