import { useQuery } from "@tanstack/react-query"

import { useCoachRoster, type RosterAthlete } from "@/hooks/use-coach-roster"
import { mapProgram } from "@/lib/program-mapper"
import type { Program } from "@/lib/program-data"
import { useServices } from "@/services/context"
import { queryKeys } from "@/services/query-keys"

type CoachAthleteProgram = {
  athlete: RosterAthlete | null
  program: Program | null
  isLoading: boolean
  isError: boolean
  notFound: boolean
}

export function useCoachAthleteProgram(athleteId: string): CoachAthleteProgram {
  const { programsApi } = useServices()
  const roster = useCoachRoster()

  const athlete = roster.data?.find((a) => a.athleteUserId === athleteId) ?? null
  const programId = athlete?.programId

  const program = useQuery({
    queryKey: queryKeys.program.byId(programId ?? "none"),
    enabled: !!programId,
    queryFn: async (): Promise<Program> =>
      mapProgram(await programsApi.apiProgramsIdGet({ id: programId! })),
  })

  return {
    athlete,
    program: program.data ?? null,
    isLoading: roster.isLoading || (!!programId && program.isLoading),
    isError: roster.isError || program.isError,
    notFound: !roster.isLoading && !roster.isError && athlete === null,
  }
}
