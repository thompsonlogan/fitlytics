import { useQuery } from "@tanstack/react-query"

import { mapProgram } from "@/lib/program-mapper"
import type { Program } from "@/lib/program-data"
import { useServices } from "@/services/context"
import type { ProgramsApi } from "@/services/generated"
import { queryKeys } from "@/services/query-keys"

export async function fetchActiveProgram(programsApi: ProgramsApi): Promise<Program | null> {
  const summaries = await programsApi.apiProgramsGet()
  const first = summaries[0]
  if (!first?.id) {
    return null
  }

  const full = await programsApi.apiProgramsIdGet({ id: first.id })
  return mapProgram(full)
}

export function useWorkoutProgram() {
  const { programsApi } = useServices()

  return useQuery({
    queryKey: queryKeys.program.active,
    queryFn: () => fetchActiveProgram(programsApi),
  })
}
