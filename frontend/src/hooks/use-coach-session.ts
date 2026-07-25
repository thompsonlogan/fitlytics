import { useMemo } from "react"

import { buildBlockIndex } from "@/components/workout/use-cell-logging"
import { useCurrentSession } from "@/hooks/use-session"
import { useSessionVideos } from "@/hooks/use-set-videos"
import { kgToLbRounded } from "@/lib/units"
import type { SetLogResponse, VideoResponse } from "@/services/generated"

export type BlockActuals = {
  state: "pending" | "partial" | "completed" | "skipped"
  loadLb: number | null
  rpe: number | null
  repsActual: number | null
  videosTotal: number
  videosUnreviewed: number
}

const EMPTY: BlockActuals = {
  state: "pending",
  loadLb: null,
  rpe: null,
  repsActual: null,
  videosTotal: 0,
  videosUnreviewed: 0,
}

function readState(logs: SetLogResponse[]): BlockActuals["state"] {
  if (logs.length === 0) return "pending"
  if (logs.every((l) => l.state === "completed")) return "completed"
  if (logs.every((l) => l.state === "skipped")) return "skipped"
  if (logs.every((l) => l.state === "pending")) return "pending"
  return "partial"
}

function lastReportedRpe(logs: SetLogResponse[]): number | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const rpe = logs[i]?.actualRpe
    if (rpe != null) return rpe
  }
  return null
}

export function useCoachSession(programId: string | undefined, programDayId: string | undefined) {
  const sessionQuery = useCurrentSession(programId, programDayId)
  const session = sessionQuery.data
  const videosQuery = useSessionVideos(session?.id)

  const blockLogsByKey = useMemo(() => buildBlockIndex(session), [session])

  const videosBySetLogId = useMemo(() => {
    const m = new Map<string, VideoResponse>()
    for (const v of videosQuery.data ?? []) {
      if (v.setLogId) m.set(v.setLogId, v)
    }
    return m
  }, [videosQuery.data])

  const actuals = useMemo(() => {
    const videosBySetLog = new Map<string, { reviewed: boolean }>()
    for (const v of videosQuery.data ?? []) {
      if (v.setLogId && v.status === "ready") {
        videosBySetLog.set(v.setLogId, { reviewed: v.reviewedAt != null })
      }
    }

    const out = new Map<string, BlockActuals>()
    for (const [key, logs] of blockLogsByKey) {
      let videosTotal = 0
      let videosUnreviewed = 0
      for (const log of logs) {
        const video = log.id ? videosBySetLog.get(log.id) : undefined
        if (!video) continue
        videosTotal++
        if (!video.reviewed) videosUnreviewed++
      }

      const first = logs[0]

      out.set(key, {
        state: readState(logs),
        loadLb: first?.actualLoadKg != null ? kgToLbRounded(first.actualLoadKg) : null,
        rpe: lastReportedRpe(logs),
        repsActual: first?.repsActual ?? null,
        videosTotal,
        videosUnreviewed,
      })
    }
    return out
  }, [blockLogsByKey, videosQuery.data])

  return {
    session: session ?? null,
    actuals,
    blockLogsByKey,
    videosBySetLogId,
    actualsFor: (key: string): BlockActuals => actuals.get(key) ?? EMPTY,
    isLoading: sessionQuery.isLoading,
    notStarted: !sessionQuery.isLoading && session == null,
    // Surfaced rather than swallowed: when the video list fails to load, the
    // per-block counts read zero, which is indistinguishable from "no footage".
    // The page shows an error so a coach isn't misled into skipping reviews.
    videosError: !!session && videosQuery.isError,
    refetchVideos: () => void videosQuery.refetch(),
  }
}
