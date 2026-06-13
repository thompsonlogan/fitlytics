import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Card, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SidePanel } from "@/components/workout/side-panel"
import { CYCLE_NEXT, type SetState } from "@/components/workout/set-state-cell"
import { WorkoutTableSkeleton } from "@/components/workout/workout-table-skeleton"
import { RestDayCard, WorkoutTable } from "@/components/workout/workout-table"
import { VideoUploadDialog } from "@/components/workout/video-upload-dialog"
import { useCurrentSession, useLogSet, useStartSession } from "@/hooks/use-session"
import { useSessionVideos, useVideoConfig } from "@/hooks/use-set-videos"
import { type ProgramDay } from "@/lib/program-data"
import { LB_TO_KG } from "@/lib/program-mapper"
import {
  ResponseError,
  type SessionResponse,
  type SetLogResponse,
  type VideoResponse,
} from "@/services/generated"

// SET_STATE_DEBOUNCE_MS — how long to wait after the last click before firing
// the PATCH. Lets the user cycle pending → completed → skipped → pending in
// rapid succession without thrashing the API.
const SET_STATE_DEBOUNCE_MS = 500

type DayBoardProps = {
  day: ProgramDay
  programId: string
  programDayId: string
  initialCompleted?: Record<string, boolean>
}

// readState pulls the canonical set state off a SetLog. The backend column is
// not-null with a default of 'pending', so the only way this is undefined is
// if the API client decodes a missing field — treat that as 'pending'.
function readState(log: SetLogResponse | undefined): SetState {
  const raw = log?.state
  if (raw === "completed" || raw === "skipped") return raw
  return "pending"
}

// CellErrors keys are `${rowKey}:${field}` (e.g. "0-1:load"). Presence of a
// key signals "show the cell error UI"; value is the message.
type CellErrors = Record<string, string>

// Pull the API error message out of the typed fetch client's thrown
// ResponseError. The server returns ErrorResponse {error: string} for 4xx;
// anything else falls through to the generic toast copy.
async function readApiErrorMessage(err: unknown): Promise<string | undefined> {
  if (err instanceof ResponseError) {
    try {
      const body = (await err.response.clone().json()) as { error?: string }
      return body.error
    } catch {
      return undefined
    }
  }
  return undefined
}

function is4xx(err: unknown): err is ResponseError {
  return err instanceof ResponseError && err.response.status >= 400 && err.response.status < 500
}

// buildBlockIndex groups each session exercise's per-set logs back under their
// block row, keyed in the same shape as WorkoutRow.key (`${exIdx}-${blIdx}`,
// 0-based). One program block ("2 × 5") expands into multiple set_logs that
// share a `blockSequence`; we group by it, preserving the set order the backend
// already sorted by. Logs without a blockSequence (pre-expansion sessions) each
// form their own block so older data keeps rendering 1:1.
function buildBlockIndex(
  session: SessionResponse | null | undefined
): Map<string, SetLogResponse[]> {
  const out = new Map<string, SetLogResponse[]>()
  if (!session?.exercises) return out
  session.exercises.forEach((exercise, exIdx) => {
    const groups = new Map<number, SetLogResponse[]>()
    const order: number[] = [] // distinct block keys in first-seen (== ascending) order
    let synthetic = -1
    for (const log of exercise.setLogs ?? []) {
      // Null blockSequence → unique negative key so each log stands alone.
      const blockKey = log.blockSequence ?? synthetic--
      let group = groups.get(blockKey)
      if (!group) {
        group = []
        groups.set(blockKey, group)
        order.push(blockKey)
      }
      group.push(log)
    }
    order.forEach((blockKey, blIdx) => {
      out.set(`${exIdx}-${blIdx}`, groups.get(blockKey)!)
    })
  })
  return out
}

// readBlockState collapses a block's per-set states into the single tri-state
// the row's check renders: completed only when every set is, skipped only when
// every set is, otherwise pending (covers fresh and mixed blocks).
function readBlockState(logs: SetLogResponse[] | undefined): SetState {
  if (!logs || logs.length === 0) return "pending"
  if (logs.every((l) => readState(l) === "completed")) return "completed"
  if (logs.every((l) => readState(l) === "skipped")) return "skipped"
  return "pending"
}

// KG_PER_LB inverse for display; kept here so we don't pull the program-mapper
// internal into the component file.
const KG_TO_LB_ROUND = (kg: number) => Math.round(kg * 2.20462)

// readActualLoadLb returns the display-ready Load Used value (lb integer) or
// empty string when no actual has been logged yet.
function readActualLoadLb(log: SetLogResponse | undefined): number | "" {
  if (!log || log.actualLoadKg == null) return ""
  return KG_TO_LB_ROUND(log.actualLoadKg)
}

function readActualRpe(log: SetLogResponse | undefined): number | null {
  if (!log || log.actualRpe == null) return null
  return log.actualRpe
}

export function DayBoard({ day, programId, programDayId, initialCompleted = {} }: DayBoardProps) {
  // Session is the source of truth for actuals + completion. We read existing
  // (404 surfaces as null) and lazily POST when the user first edits.
  const sessionQuery = useCurrentSession(programId, programDayId)
  const startSession = useStartSession(programId, programDayId)
  const logSet = useLogSet(programId, programDayId)

  const session = sessionQuery.data

  // Pull a (exerciseIdx-blockIdx) → SetLog[] map so the cell renderers can look
  // up a block's set logs by the same row key the workout table already uses.
  const blockLogsByKey = useMemo(() => buildBlockIndex(session), [session])

  const videoConfig = useVideoConfig()
  // Optimistic while loading/error — hide only on explicit enabled:false from server.
  const videosEnabled = videoConfig.data?.enabled !== false

  // Set videos for this session, indexed by set_log id so each block row can
  // resolve its sets' clips.
  const videosQuery = useSessionVideos(videosEnabled ? session?.id : undefined)
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
        if (videosBySetLogId.get(log.id)?.status === "ready") {
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

  // Local edit state holds in-flight cell input. We clear after a successful
  // mutation so the cell reads from the cached session again.
  const [loadEdits, setLoadEdits] = useState<Record<string, string>>({})
  const [rpeEdits, setRpeEdits] = useState<Record<string, string>>({})
  const [cellErrors, setCellErrors] = useState<CellErrors>({})
  // Optimistic per-set tri-state. The cell flips instantly on click; the
  // debounced effect below pushes the final state to the API and the cache
  // becomes the source of truth on success.
  const [stateLocal, setStateLocal] = useState<Record<string, SetState>>(() => {
    const seed: Record<string, SetState> = {}
    for (const [key, val] of Object.entries(initialCompleted)) {
      if (val) seed[key] = "completed"
    }
    return seed
  })

  // Per-key debounce timers so multiple rapid clicks on the same cell coalesce
  // into a single PATCH with the final state. Refs (not state) — we don't
  // want a re-render every time a timer reschedules.
  const timersRef = useRef<Map<string, number>>(new Map())
  const desiredStateRef = useRef<Record<string, SetState>>({})

  // Merge: session.state is the source of truth; local override wins only
  // while a click sequence is in flight (until the debounced PATCH lands and
  // we drop the override).
  const cellState = useMemo(() => {
    const out: Record<string, SetState> = {}
    for (const [key, logs] of blockLogsByKey) {
      out[key] = readBlockState(logs)
    }
    for (const [key, val] of Object.entries(stateLocal)) {
      out[key] = val
    }
    return out
  }, [blockLogsByKey, stateLocal])

  // SidePanel still uses a boolean "completed" map. Derive it from cellState
  // so the side-panel API doesn't need to change for tri-state — a skipped
  // set doesn't count as completed.
  const completed = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const [key, s] of Object.entries(cellState)) {
      out[key] = s === "completed"
    }
    return out
  }, [cellState])

  // ensureSession lazily creates the session if it doesn't exist yet. Returns
  // the matching set_log for this row, or undefined if the day has no
  // exercises mapped (shouldn't happen on a non-rest day).
  const ensureSession = async (): Promise<SessionResponse | null> => {
    if (session) return session
    return await startSession.mutateAsync()
  }

  // findBlockLogs re-derives the block grouping from a freshly returned session
  // (e.g. right after ensureSession) so writes target the correct set log ids.
  const findBlockLogs = (rowKey: string, s: SessionResponse | null): SetLogResponse[] => {
    return buildBlockIndex(s).get(rowKey) ?? []
  }

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
    return { sessionId: s.id, setLogId: log.id }
  }

  const clearEdit = (which: "load" | "rpe", key: string) => {
    const setter = which === "load" ? setLoadEdits : setRpeEdits
    setter((prev) => {
      const { [key]: _, ...rest } = prev
      return rest
    })
  }

  const setErr = (errKey: string, msg: string) =>
    setCellErrors((prev) => ({ ...prev, [errKey]: msg }))
  const clearErr = (errKey: string) =>
    setCellErrors((prev) => {
      const { [errKey]: _, ...rest } = prev
      return rest
    })

  // ─ Editors ─ on-change update local state, on-blur fires the mutation.

  const editLoad = (key: string, value: string) => {
    if (value !== "" && !/^\d{1,4}$/.test(value)) return
    setLoadEdits((prev) => ({ ...prev, [key]: value }))
    if (cellErrors[`${key}:load`]) clearErr(`${key}:load`)
  }
  const editRpe = (key: string, value: string) => {
    if (value === "") {
      setRpeEdits((prev) => ({ ...prev, [key]: "" }))
      if (cellErrors[`${key}:rpe`]) clearErr(`${key}:rpe`)
      return
    }
    if (!/^\d{1,2}$/.test(value)) return
    const n = parseInt(value, 10)
    if (n < 1 || n > 10) return
    setRpeEdits((prev) => ({ ...prev, [key]: value }))
    if (cellErrors[`${key}:rpe`]) clearErr(`${key}:rpe`)
  }

  const blurLoad = async (key: string, value: string) => {
    // Load Used is a block-level value; display reads from the first set.
    const existing = blockLogsByKey.get(key)
    const previousLb = readActualLoadLb(existing?.[0])
    const previousStr = previousLb === "" ? "" : String(previousLb)
    if (value === previousStr || value === "") {
      clearEdit("load", key)
      return
    }
    const lb = parseInt(value, 10)
    if (Number.isNaN(lb)) {
      clearEdit("load", key)
      return
    }

    try {
      const s = await ensureSession()
      const logs = findBlockLogs(key, s)
      if (logs.length === 0) {
        clearEdit("load", key)
        return
      }
      // Fan the load out to every set in the block.
      const actualLoadKg = Number(LB_TO_KG(lb).toFixed(2))
      await Promise.all(
        logs.map((log) => logSet.mutateAsync({ setLogId: log.id, body: { actualLoadKg } }))
      )
      clearEdit("load", key)
    } catch (err) {
      const apiMsg = await readApiErrorMessage(err)
      if (is4xx(err)) {
        setErr(`${key}:load`, apiMsg ?? "Invalid value")
      } else {
        toast.error("Couldn't save load. Check your connection and try again.")
      }
      clearEdit("load", key)
    }
  }

  const blurRpe = async (key: string, value: string) => {
    // "Last Set RPE" reads from / writes to the final set of the block.
    const existing = blockLogsByKey.get(key)
    const previousRpe = readActualRpe(existing?.[existing.length - 1])
    const previousStr = previousRpe == null ? "" : String(previousRpe)
    if (value === previousStr || value === "") {
      clearEdit("rpe", key)
      return
    }
    const rpe = parseInt(value, 10)
    if (Number.isNaN(rpe)) {
      clearEdit("rpe", key)
      return
    }

    try {
      const s = await ensureSession()
      const logs = findBlockLogs(key, s)
      const last = logs[logs.length - 1]
      if (!last) {
        clearEdit("rpe", key)
        return
      }
      await logSet.mutateAsync({
        setLogId: last.id,
        body: { actualRpe: rpe },
      })
      clearEdit("rpe", key)
    } catch (err) {
      const apiMsg = await readApiErrorMessage(err)
      if (is4xx(err)) {
        setErr(`${key}:rpe`, apiMsg ?? "Invalid value")
      } else {
        toast.error("Couldn't save RPE. Check your connection and try again.")
      }
      clearEdit("rpe", key)
    }
  }

  // cycleSet advances the per-set tri-state on every click and debounces the
  // PATCH so a 1-2-3-click cycle only fires one network call. We track the
  // user's intended final state in a ref so two clicks fired in the same
  // microtask both register — reading the latest from cellState would miss
  // the second click because React hasn't re-rendered yet.
  const cycleSet = (key: string) => {
    const serverState = readBlockState(blockLogsByKey.get(key))
    const current = desiredStateRef.current[key] ?? serverState
    const next = CYCLE_NEXT[current]

    desiredStateRef.current[key] = next
    setStateLocal((prev) => ({ ...prev, [key]: next }))

    const existingTimer = timersRef.current.get(key)
    if (existingTimer !== undefined) window.clearTimeout(existingTimer)

    const timerId = window.setTimeout(async () => {
      timersRef.current.delete(key)
      const desired = desiredStateRef.current[key]
      delete desiredStateRef.current[key]
      const serverState = readBlockState(blockLogsByKey.get(key))

      // No-op: user cycled all the way back to the server's state.
      if (desired === serverState) {
        setStateLocal((prev) => {
          const { [key]: _, ...rest } = prev
          return rest
        })
        return
      }

      try {
        const s = await ensureSession()
        const logs = findBlockLogs(key, s)
        if (logs.length === 0) return
        // Completing/skipping a block fans the state out to every set in it.
        await Promise.all(
          logs.map((log) => logSet.mutateAsync({ setLogId: log.id, body: { state: desired } }))
        )
        // onSuccess merged the updated logs into the cache — drop the local
        // override so the merged map pulls from the session again.
        setStateLocal((prev) => {
          const { [key]: _, ...rest } = prev
          return rest
        })
      } catch {
        setStateLocal((prev) => {
          const { [key]: _, ...rest } = prev
          return rest
        })
        toast.error("Couldn't save set state. Check your connection and try again.")
      }
    }, SET_STATE_DEBOUNCE_MS)

    timersRef.current.set(key, timerId)
  }

  // Persisted actuals get merged with local edits at render time: a local
  // edit takes precedence (user is mid-typing), otherwise display the
  // session-backed value. We do that inside WorkoutTable via the meta.
  const persistedLoad = useMemo(() => {
    const out: Record<string, number | ""> = {}
    for (const [key, logs] of blockLogsByKey) {
      out[key] = readActualLoadLb(logs[0])
    }
    return out
  }, [blockLogsByKey])
  const persistedRpe = useMemo(() => {
    const out: Record<string, number | null> = {}
    for (const [key, logs] of blockLogsByKey) {
      out[key] = readActualRpe(logs[logs.length - 1])
    }
    return out
  }, [blockLogsByKey])

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
          videosEnabled={videosEnabled}
          onCycleSet={cycleSet}
          onEditLoad={editLoad}
          onEditRpe={editRpe}
          onBlurLoad={blurLoad}
          onBlurRpe={blurRpe}
          onOpenVideo={(rowKey, initialSet) => setVideoDialog({ rowKey, initialSet })}
        />
      )}
      <div className="hidden min-h-0 lg:block">
        <SidePanel day={day} completed={completed} />
      </div>

      {videosEnabled && videoDialog
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
