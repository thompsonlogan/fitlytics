import { useQuery } from "@tanstack/react-query"

import { useServices } from "@/services/context"
import type { CoachAthleteSummaryResponse } from "@/services/generated"

export const COACH_ROSTER_QUERY_KEY = ["coach", "roster"] as const

export type RosterAthlete = {
  linkId: string
  athleteUserId: string
  displayName: string
  email?: string
  programId?: string
  programName?: string
  currentWeek: number
  totalWeeks: number
  compliancePct: number | null
  sessionsCompleted: number
  sessionsDue: number
  avgRpe: number | null
  lastSessionAt: Date | null
  videosWaiting: number
  status: string
}

function toRosterAthlete(row: CoachAthleteSummaryResponse): RosterAthlete {
  return {
    linkId: row.linkId ?? "",
    athleteUserId: row.athleteUserId ?? "",
    displayName: row.displayName ?? "Unknown athlete",
    email: row.email,
    programId: row.programId,
    programName: row.programName,
    currentWeek: row.currentWeek ?? 0,
    totalWeeks: row.totalWeeks ?? 0,
    compliancePct: row.compliancePct ?? null,
    sessionsCompleted: row.sessionsCompleted ?? 0,
    sessionsDue: row.sessionsDue ?? 0,
    avgRpe: row.avgRpe ?? null,
    lastSessionAt: row.lastSessionAt ? new Date(row.lastSessionAt) : null,
    videosWaiting: row.videosWaiting ?? 0,
    status: row.status ?? "new",
  }
}

export function useCoachRoster() {
  const { coachApi } = useServices()

  return useQuery({
    queryKey: COACH_ROSTER_QUERY_KEY,
    queryFn: async (): Promise<RosterAthlete[]> => {
      const rows = await coachApi.apiCoachAthletesGet()
      return rows.map(toRosterAthlete)
    },
    staleTime: 5 * 60 * 1000,
  })
}
