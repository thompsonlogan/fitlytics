import { describe, expect, it } from "vitest"

import type { SessionResponse } from "@/services/generated"

import { actualVolume } from "./session-metrics"

describe("actualVolume", () => {
  it("returns 0 for a null/undefined session", () => {
    expect(actualVolume(null)).toBe(0)
    expect(actualVolume(undefined)).toBe(0)
  })

  it("sums actual load (kg→lb) × actual reps across all set logs", () => {
    const session: SessionResponse = {
      exercises: [
        {
          id: "e1",
          sequence: 1,
          exerciseId: "x",
          exerciseNameSnapshot: "Squat",
          setLogs: [
            { id: "s1", sequence: 1, setType: "working", actualLoadKg: 100, repsActual: 5, state: "completed" },
            { id: "s2", sequence: 2, setType: "working", actualLoadKg: 100, repsActual: 3, state: "completed" },
          ],
        },
      ],
    }
    // (100×5 + 100×3) kg-reps × 2.20462 lb/kg = 800 × 2.20462 = 1763.696
    expect(actualVolume(session)).toBeCloseTo(1763.696, 2)
  })

  it("ignores set logs missing an actual load or rep count", () => {
    const session: SessionResponse = {
      exercises: [
        {
          id: "e1",
          sequence: 1,
          exerciseId: "x",
          exerciseNameSnapshot: "Squat",
          setLogs: [
            { id: "s1", sequence: 1, setType: "working", actualLoadKg: 100, repsActual: 5, state: "completed" },
            { id: "s2", sequence: 2, setType: "working", repsActual: 3, state: "pending" },
            { id: "s3", sequence: 3, setType: "working", actualLoadKg: 80, state: "pending" },
          ],
        },
      ],
    }
    // Only the first set is fully logged: 100 × 5 × 2.20462 = 1102.31
    expect(actualVolume(session)).toBeCloseTo(1102.31, 2)
  })
})
