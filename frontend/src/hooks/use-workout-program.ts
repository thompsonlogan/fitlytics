import { useQuery } from "@tanstack/react-query"

import { mapProgram } from "@/lib/program-mapper"
import type { Program } from "@/lib/program-data"
import { useServices } from "@/services/context"
import type { ProgramsApi } from "@/services/generated"

// PROGRAM_QUERY_KEY is exported so tests and any future invalidation logic
// (e.g. after creating a program) reference the same key.
export const PROGRAM_QUERY_KEY = ["program", "active"] as const

// fetchActiveProgram is the data-loader used by useWorkoutProgram. It does
// two round-trips on purpose: the list endpoint gives us only summaries
// (id + name), and we pick the first program as "active" until a real
// picker UI exists. The detail endpoint then loads the full tree.
//
// Throws if the user has no programs at all — the route is guarded by auth,
// so reaching this code without a seeded program is a real misconfiguration,
// not an empty-state.
export async function fetchActiveProgram(programsApi: ProgramsApi): Promise<Program> {
  const summaries = await programsApi.apiProgramsGet()
  const first = summaries[0]
  if (!first?.id) {
    throw new Error("no programs available for user")
  }

  const full = await programsApi.apiProgramsIdGet({ id: first.id })
  return mapProgram(full)
}

export function useWorkoutProgram() {
  const { programsApi } = useServices()

  return useQuery({
    queryKey: PROGRAM_QUERY_KEY,
    queryFn: () => fetchActiveProgram(programsApi),
    // Program structure is static for the duration of a session — no need to
    // refetch on focus. Stale-after-5min matches the global default.
    staleTime: 5 * 60 * 1000,
  })
}
