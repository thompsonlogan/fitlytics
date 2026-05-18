import { useQuery } from "@tanstack/react-query"

import { PROGRAM, type Program } from "@/lib/program-data"

async function fetchProgram(): Promise<Program> {
  return PROGRAM
}

export function useWorkoutProgram() {
  return useQuery({
    queryKey: ["program"],
    queryFn: fetchProgram,
    staleTime: Infinity,
  })
}
