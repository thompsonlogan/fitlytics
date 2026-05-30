import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useServices } from "@/services/context"
import {
  ResponseError,
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
    onSuccess: (updated) => {
      if (!programId || !programDayId) return
      queryClient.setQueryData<SessionResponse | null>(
        sessionQueryKey(programId, programDayId),
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            exercises: prev.exercises?.map((e) => ({
              ...e,
              setLogs: e.setLogs?.map((l) => (l.id === updated.id ? updated : l)),
            })),
          }
        }
      )
    },
  })
}
