import type { SessionResponse } from "@/services/generated"

// 1 kilogram = 2.20462 pounds. Session actuals are stored in kg on the backend;
// the side panel compares them against planned volume (already lb), so we
// convert here at the read boundary.
const KG_TO_LB = 2.20462

// actualVolume totals the logged working volume of a session in lb:
// Σ (actual load × actual reps) over every set log that has both recorded.
// Set logs missing an actual load or rep count contribute nothing. Returns 0
// for a null session (no work logged yet), which the caller treats as "no
// comparison available".
export function actualVolume(session: SessionResponse | null | undefined): number {
  if (!session?.exercises) return 0
  let total = 0
  for (const ex of session.exercises) {
    for (const log of ex.setLogs ?? []) {
      const kg = log.actualLoadKg
      const reps = log.repsActual
      if (kg != null && reps != null) {
        total += kg * KG_TO_LB * reps
      }
    }
  }
  return total
}
