import type { MeResponse } from "@/services/generated"

const ROLE_COACH = "coach"

export function isCoach(me: MeResponse | null | undefined): boolean {
  return me?.role === ROLE_COACH
}
