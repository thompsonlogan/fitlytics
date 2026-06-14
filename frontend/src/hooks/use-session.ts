import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { dayCompletionsQueryKey } from "@/hooks/use-day-completions"
import { useServices } from "@/services/context"
import {
  ResponseError,
  SetLogResponseFromJSON,
  type SessionResponse,
  type SetLogResponse,
  type UpdateSetLogRequest,
} from "@/services/generated"

// SESSION_QUERY_KEY scopes the cached session by (programId, programDayId) so
// the same hook reused for two different days doesn't collide. Exported so
// the mutation in use-log-set.ts can target the same cache entry.
export const sessionQueryKey = (programId: string, programDayId: string) =>
  ["session", programId, programDayId] as const

// useCurrentSession reads the active session for a (programId, programDayId)
// pair. It does NOT create a session — the rule from the product spec is "no
// rows in the DB until the user actually modifies something." A 404 surface
// here simply means there's no session yet; the workout table renders blank
// actuals in that case.
//
// We swallow the 404 into `data === null` rather than `isError === true` so
// consumers don't have to special-case ErrorBoundary behavior; only network
// and 5xx errors propagate as errors.
export function useCurrentSession(programId: string | undefined, programDayId: string | undefined) {
  const { sessionsApi } = useServices()

  return useQuery({
    queryKey: programId && programDayId ? sessionQueryKey(programId, programDayId) : ["session", "disabled"],
    enabled: !!programId && !!programDayId,
    queryFn: async (): Promise<SessionResponse | null> => {
      try {
        return await sessionsApi.apiProgramsIdDaysDayIdSessionsCurrentGet({
          id: programId!,
          dayId: programDayId!,
        })
      } catch (err) {
        if (err instanceof ResponseError && err.response.status === 404) {
          return null
        }
        throw err
      }
    },
    // Session shape is mostly stable for the lifetime of a workout — match the
    // 5-minute stale window of useWorkoutProgram so the two don't fight.
    staleTime: 5 * 60 * 1000,
  })
}

// useStartSession is the lazy "start or return current" mutation. Called the
// FIRST time the user modifies a cell on a day. On success we write the
// returned session into the same cache slot as useCurrentSession so the table
// immediately has the set_log ids it needs to PATCH actuals.
export function useStartSession(programId: string | undefined, programDayId: string | undefined) {
  const { sessionsApi } = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<SessionResponse> => {
      if (!programId || !programDayId) {
        throw new Error("missing program or day id")
      }
      return sessionsApi.apiProgramsIdDaysDayIdSessionsPost({
        id: programId,
        dayId: programDayId,
      })
    },
    onSuccess: (session) => {
      if (!programId || !programDayId) return
      queryClient.setQueryData(sessionQueryKey(programId, programDayId), session)
    },
  })
}

// UseLogSetVars carry both the set_log id and the partial body. The session
// id comes from the hook closure so callers don't have to pass it on every
// invocation.
export type UseLogSetVars = {
  setLogId: string
  body: UpdateSetLogRequest
}

// countPending sums the set_logs across the session that are still in the
// "pending" state. Used by useLogSet to detect when an update causes the
// session-level rollup (sessions.state) to flip — i.e. when the pending
// count crosses the 0 boundary in either direction. Counts only the
// active (non-deleted) logs the cache holds; missing fields default to
// "pending" to match the backend's not-null default.
function countPending(session: SessionResponse | null | undefined): number {
  if (!session?.exercises) return 0
  let n = 0
  for (const ex of session.exercises) {
    for (const log of ex.setLogs ?? []) {
      if ((log.state ?? "pending") === "pending") n++
    }
  }
  return n
}

// useLogSet is the per-cell actuals mutation. It reads the session id from
// the cache at mutation time rather than via closure, so a logSet call made
// right after a startSession call doesn't see a stale undefined id. We
// splice the response into the cached session (instead of invalidating) so
// the next render is one tick away — no refetch, no flicker.
export function useLogSet(programId: string | undefined, programDayId: string | undefined) {
  const { sessionsApi } = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: UseLogSetVars): Promise<SetLogResponse> => {
      if (!programId || !programDayId) {
        throw new Error("missing program or day id")
      }
      const cached = queryClient.getQueryData<SessionResponse | null>(
        sessionQueryKey(programId, programDayId)
      )
      if (!cached?.id) {
        throw new Error("no session — call startSession first")
      }
      return sessionsApi.apiSessionsSessionIdSetLogsSetLogIdPatch({
        sessionId: cached.id,
        setLogId: vars.setLogId,
        body: vars.body,
      })
    },
    onSuccess: (updated, vars) => {
      if (!programId || !programDayId) return

      // Snapshot the cached session BEFORE applying the update so we can
      // compare pending counts and detect a session-state flip. The day-
      // completions query only needs to be refetched when the session
      // crosses the "all sets done-or-skipped" boundary in either
      // direction — toggling between completed and skipped (both terminal)
      // can never change the session's state.
      const cacheKey = sessionQueryKey(programId, programDayId)
      const prevSession = queryClient.getQueryData<SessionResponse | null>(cacheKey)
      const prevPending = countPending(prevSession)

      queryClient.setQueryData<SessionResponse | null>(cacheKey, (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          exercises: prev.exercises?.map((e) => ({
            ...e,
            setLogs: e.setLogs?.map((l) => (l.id === updated.id ? updated : l)),
          })),
        }
      })

      // Only re-fetch day-completions on the 0-boundary crossing. The
      // backend rollup writes sessions.state='completed' iff pending == 0,
      // so the dot's visibility only toggles when prevPending and
      // nextPending sit on opposite sides of zero. State-less edits (load,
      // RPE) can't move the count so we don't even need to compute.
      if (vars.body.state === undefined) return
      const nextSession = queryClient.getQueryData<SessionResponse | null>(cacheKey)
      const nextPending = countPending(nextSession)
      if ((prevPending === 0) !== (nextPending === 0)) {
        queryClient.invalidateQueries({ queryKey: dayCompletionsQueryKey(programId) })
      }
    },
  })
}

// UseLogSetBatchVars carries the batch of (setLogId, body) pairs for a single
// block action. The session id is read from the cache at mutation time.
export type UseLogSetBatchVars = {
  updates: { setLogId: string; body: UpdateSetLogRequest }[]
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""

// useLogSetBatch is the block-level actuals mutation. It sends all set_log
// updates for a block in a single PATCH request — all-or-nothing semantics,
// one recompute on the backend. The cache merge is the same as useLogSet but
// applies all returned logs at once.
//
// NOTE: This hand-rolls a fetch rather than using the generated client because
// the batch route was added after the last api_generate run. Swap to the
// generated method after the next `make swagger && pnpm api_generate`.
export function useLogSetBatch(
  programId: string | undefined,
  programDayId: string | undefined
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: UseLogSetBatchVars): Promise<SetLogResponse[]> => {
      if (!programId || !programDayId) {
        throw new Error("missing program or day id")
      }
      const cached = queryClient.getQueryData<SessionResponse | null>(
        sessionQueryKey(programId, programDayId)
      )
      if (!cached?.id) {
        throw new Error("no session — call startSession first")
      }
      const res = await fetch(`${API_BASE_URL}/api/sessions/${cached.id}/set-logs`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: vars.updates.map((u) => ({
            set_log_id: u.setLogId,
            reps_actual: u.body.repsActual,
            actual_load_kg: u.body.actualLoadKg,
            actual_rpe: u.body.actualRpe,
            state: u.body.state,
          })),
        }),
      })
      if (!res.ok) throw new Error(`batch set-log update failed: ${res.status}`)
      const raw: unknown[] = await res.json()
      return raw.map(SetLogResponseFromJSON)
    },
    onSuccess: (updatedLogs, vars) => {
      if (!programId || !programDayId) return

      const cacheKey = sessionQueryKey(programId, programDayId)
      const prevSession = queryClient.getQueryData<SessionResponse | null>(cacheKey)
      const prevPending = countPending(prevSession)

      // Build a Map of updated logs for O(1) lookup during cache splice.
      const updatesById = new Map<string, SetLogResponse>()
      for (const log of updatedLogs) {
        updatesById.set(log.id, log)
      }

      queryClient.setQueryData<SessionResponse | null>(cacheKey, (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          exercises: prev.exercises?.map((e) => ({
            ...e,
            setLogs: e.setLogs?.map((l) => updatesById.get(l.id) ?? l),
          })),
        }
      })

      // Mirror useLogSet: only re-fetch day-completions on 0-boundary crossing.
      const hasStateUpdate = vars.updates.some((u) => u.body.state !== undefined)
      if (!hasStateUpdate) return
      const nextSession = queryClient.getQueryData<SessionResponse | null>(cacheKey)
      const nextPending = countPending(nextSession)
      if ((prevPending === 0) !== (nextPending === 0)) {
        queryClient.invalidateQueries({ queryKey: dayCompletionsQueryKey(programId) })
      }
    },
  })
}
