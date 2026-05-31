import { useQuery } from "@tanstack/react-query"

import { useServices } from "@/services/context"

// DAY_COMPLETIONS_QUERY_KEY scopes the cached completions list by program id
// so two programs in the same user session don't collide. Exported for any
// future invalidation logic (e.g. after marking a session complete from a
// different page).
export const dayCompletionsQueryKey = (programId: string) =>
  ["day-completions", programId] as const

// useDayCompletions loads the (week, day) sequence pairs where the user's
// session has rolled to state='completed'. The day selector renders a "done"
// dot for each pair. Returns a Record keyed `${week}-${dayIndex}` so the
// SubBar/DaySelector can do an O(1) lookup per cell — note dayIndex is
// 0-based on the FE but the API returns 1-based sequence numbers, so we
// translate here once.
export function useDayCompletions(programId: string | undefined) {
  const { sessionsApi } = useServices()

  return useQuery({
    queryKey: programId ? dayCompletionsQueryKey(programId) : ["day-completions", "disabled"],
    enabled: !!programId,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const rows = await sessionsApi.apiProgramsIdDayCompletionsGet({ id: programId! })
      const out: Record<string, boolean> = {}
      for (const row of rows) {
        if (row.weekSequence == null || row.daySequence == null) continue
        // API sequence is 1-based, dayIndex in the UI is 0-based.
        out[`${row.weekSequence}-${row.daySequence - 1}`] = true
      }
      return out
    },
    // Completions only flip when the user finishes a workout; the page-level
    // SubBar doesn't need this to be live-tickling. 5-minute stale matches
    // the program + session windows.
    staleTime: 5 * 60 * 1000,
  })
}
