import { describe, expect, it } from "vitest"

import { estimateDuration, flattenRows, totalSets, type ProgramDay } from "./program-data"

// Small helper so tests read like the seed data — sets/reps/intensity only.
function block(sets: number, reps = "3", intensity = "100lb") {
  return { id: "pst", sets, reps, intensity, cap: 100 as const, used: 100 as const, rpe: 8 }
}

const REST_DAY: ProgramDay = { id: "rest", name: "Rest", tag: "OFF", off: true }

const TWO_EXERCISE_DAY: ProgramDay = {
  id: "d1",
  name: "Day 1",
  tag: "Day 1",
  exercises: [
    { name: "Squat", rest: 3, blocks: [block(1), block(2)] },
    { name: "Bench", rest: 2, blocks: [block(3)] },
  ],
}

// ─── flattenRows ───────────────────────────────────────────────────────────

describe("flattenRows", () => {
  it("returns an empty array for rest days", () => {
    expect(flattenRows(REST_DAY)).toEqual([])
  })

  it("returns an empty array when exercises is missing", () => {
    expect(flattenRows({ id: "d", name: "Day", tag: "Day" })).toEqual([])
  })

  it("expands each set block into a row and tags the first block per exercise", () => {
    const rows = flattenRows(TWO_EXERCISE_DAY)

    expect(rows).toHaveLength(3)
    // First block of Squat
    expect(rows[0].first).toBe(true)
    expect(rows[0].exercise.name).toBe("Squat")
    expect(rows[0].rowSpan).toBe(2)
    expect(rows[0].exNum).toBe(1)
    // Second block of Squat
    expect(rows[1].first).toBe(false)
    expect(rows[1].exercise.name).toBe("Squat")
    // First block of Bench
    expect(rows[2].first).toBe(true)
    expect(rows[2].exNum).toBe(2)
    expect(rows[2].rowSpan).toBe(1)
  })

  it("uses keys that uniquely identify each (exercise, block) pair", () => {
    const rows = flattenRows(TWO_EXERCISE_DAY)
    const keys = rows.map((r) => r.key)
    expect(keys).toEqual(["0-0", "0-1", "1-0"])
    expect(new Set(keys).size).toBe(keys.length)
  })
})

// ─── totalSets ─────────────────────────────────────────────────────────────

describe("totalSets", () => {
  it("returns 0 for a rest day", () => {
    expect(totalSets(REST_DAY)).toBe(0)
  })

  it("sums sets across every exercise and block", () => {
    // 1 + 2 + 3 = 6
    expect(totalSets(TWO_EXERCISE_DAY)).toBe(6)
  })

  it("returns 0 when the day has no exercises", () => {
    expect(totalSets({ id: "x", name: "x", tag: "x" })).toBe(0)
  })
})

// ─── estimateDuration ─────────────────────────────────────────────────────

describe("estimateDuration", () => {
  it("returns 0 for rest days", () => {
    expect(estimateDuration(REST_DAY)).toBe(0)
  })

  it("accounts for sets × 0.9 plus inter-set rest", () => {
    // Squat: 3 sets, rest 3 → 2 inter-set gaps × 3 = 6 min rest
    // Bench: 3 sets, rest 2 → 2 inter-set gaps × 2 = 4 min rest
    // Total sets = 6 → working time ≈ 6 × 0.9 = 5.4
    // Round(5.4 + 10) = 15
    expect(estimateDuration(TWO_EXERCISE_DAY)).toBe(15)
  })

  it("ignores rest math for single-set exercises (no inter-set gaps)", () => {
    const day: ProgramDay = {
      id: "x",
      name: "x",
      tag: "x",
      exercises: [{ name: "Squat", rest: 5, blocks: [block(1)] }],
    }
    // 1 × 0.9 = 0.9 → round to 1; no rest because only 1 set.
    expect(estimateDuration(day)).toBe(1)
  })
})
