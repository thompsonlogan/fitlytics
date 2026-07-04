import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  buildBlockIndex,
  findBlockLogs,
  useCellLogging,
} from "@/components/workout/use-cell-logging"
import {
  useCurrentSession,
  useLogSet,
  useLogSetBatch,
  useStartSession,
  useUpdateSessionNotes,
} from "@/hooks/use-session"
import { useSessionVideos } from "@/hooks/use-set-videos"
import { type SessionResponse, type VideoResponse } from "@/services/generated"

type UseDayBoardOpts = {
  programId: string
  programDayId: string
  initialCompleted: Record<string, boolean>
}

// useDayBoard owns everything the day view needs to read + mutate a session:
// the session query, lazy start-on-first-edit, per-cell logging state, set
// videos, and the note save. It's presentation-agnostic — extracted from
// DayBoard verbatim so the desktop table (DayBoard) and the mobile card list
// (MobileDayBoard) drive identical behaviour off one wiring.
export function useDayBoard({ programId, programDayId, initialCompleted }: UseDayBoardOpts) {
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

  // Per-block filmed summary for the table's / card's video cell.
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
  const [videoDialog, setVideoDialog] = useState<{ rowKey: string; initialSet: number } | null>(
    null
  )

  // ensureSession lazily creates the session if it doesn't exist yet. Returns
  // the session, or null if it couldn't be started. Shared by the cell-logging
  // hook, the note save, and the video-upload set resolver below.
  const ensureSession = async (): Promise<SessionResponse | null> => {
    if (session) return session
    return await startSession.mutateAsync()
  }

  // Per-cell edit state + the optimistic, debounced set-state machine live in a
  // dedicated hook so this one stays focused on wiring.
  const cellLogging = useCellLogging({
    blockLogsByKey,
    initialCompleted,
    ensureSession,
    logSet,
    logSetBatch,
  })

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

  return {
    session,
    blockLogsByKey,
    videosBySetLogId,
    videoInfo,
    videoDialog,
    setVideoDialog,
    ensureSetLogFor,
    saveNotes,
    ...cellLogging,
  }
}
