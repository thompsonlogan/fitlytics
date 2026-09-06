import { describe, expect, it } from "vitest"

import {
  avgTargetRpe,
  computeTodayPosition,
  estimateDuration,
  flattenRows,
  formatReps,
  nextWorkoutDay,
  plannedVolume,
  topSet,
  totalSets,
  type Program,
  type ProgramDay,
  type SetBlock,
} from "./program-data"

// Small helper so tests read like the seed data — sets/reps/intensity only.
function block(sets: number, repsMin = 3, repsMax = 3, intensity = "100lb") {
  return {
    id: "pst",
    sets,
    repsMin,
    repsMax,
    intensity,
    cap: 100 as const,
    rpe: 8,
    prescribedLoad: 100,
  }
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

describe("formatReps", () => {
  it("formats a single rep target", () => {
    expect(formatReps(3, 3)).toBe("3")
  })

  it("formats a rep range with an en dash", () => {
    expect(formatReps(6, 10)).toBe("6–10")
  })

  it("formats an empty target", () => {
    expect(formatReps(null, null)).toBe("")
  })

  it("formats a max-only target as a single value", () => {
    expect(formatReps(null, 10)).toBe("10")
  })
})

describe("estimateDuration", () => {
  it("returns 0 for rest days", () => {
    expect(estimateDuration(REST_DAY)).toBe(0)
  })

  it("sums sets × (rest + work time) × rpe multiplier across exercises", () => {
    // Squat: 3 sets × (3 + 2) × 1.1 (rpe 8) = 16.5
    // Bench: 3 sets × (2 + 2) × 1.1 (rpe 8) = 13.2
    // Round(29.7) = 30
    expect(estimateDuration(TWO_EXERCISE_DAY)).toBe(30)
  })

  it("applies rpe multiplier to single-set exercises", () => {
    const day: ProgramDay = {
      id: "x",
      name: "x",
      tag: "x",
      exercises: [{ name: "Squat", rest: 5, blocks: [block(1)] }],
    }
    // 1 × (5 + 2) × 1.1 (rpe 8) = 7.7 → 8
    expect(estimateDuration(day)).toBe(8)
  })

  it("scales up for higher RPEs", () => {
    const day: ProgramDay = {
      id: "x",
      name: "x",
      tag: "x",
      exercises: [
        {
          name: "Squat",
          rest: 2,
          blocks: [{ ...block(2), rpe: 10 }],
        },
      ],
    }
    // 2 × (2 + 2) × 1.3 (rpe 10) = 10.4 → 10
    expect(estimateDuration(day)).toBe(10)
  })

  it("uses no multiplier when rpe is below 8", () => {
    const day: ProgramDay = {
      id: "x",
      name: "x",
      tag: "x",
      exercises: [
        {
          name: "Curl",
          rest: 2,
          blocks: [{ ...block(3), rpe: 6 }],
        },
      ],
    }
    // 3 × (2 + 2) × 1.0 = 12
    expect(estimateDuration(day)).toBe(12)
  })
})

// blockWith builds a SetBlock overriding only the fields a stat test cares
// about, so each case reads as the prescription it represents.
function blockWith(overrides: Partial<SetBlock>): SetBlock {
  return {
    id: "pst",
    sets: 1,
    repsMin: 5,
    repsMax: 5,
    intensity: "",
    cap: "",
    rpe: null,
    prescribedLoad: null,
    ...overrides,
  }
}

// ─── plannedVolume ─────────────────────────────────────────────────────────

describe("plannedVolume", () => {
  it("sums prescribed load × lower-bound reps × sets across blocks", () => {
    // 100×3×1 + 100×3×2 + 100×3×3 = 1800
    expect(plannedVolume(TWO_EXERCISE_DAY)).toBe(1800)
  })

  it("uses the lower bound of a rep range", () => {
    const day: ProgramDay = {
      id: "d",
      name: "d",
      tag: "d",
      exercises: [
        {
          name: "Squat",
          rest: 2,
          blocks: [blockWith({ repsMin: 6, repsMax: 10, prescribedLoad: 200, sets: 2 })],
        },
      ],
    }
    // 200 × 6 × 2 = 2400
    expect(plannedVolume(day)).toBe(2400)
  })

  it("uses max reps for volume when min reps are absent", () => {
    const day: ProgramDay = {
      id: "d",
      name: "d",
      tag: "d",
      exercises: [
        {
          name: "Squat",
          rest: 2,
          blocks: [blockWith({ repsMin: null, repsMax: 10, prescribedLoad: 100, sets: 2 })],
        },
      ],
    }
    // 100 x 10 x 2 = 2000
    expect(plannedVolume(day)).toBe(2000)
  })

  it("excludes blocks with no absolute prescribed load (text/RIR work)", () => {
    const day: ProgramDay = {
      id: "d",
      name: "d",
      tag: "d",
      exercises: [
        {
          name: "Squat",
          rest: 2,
          blocks: [blockWith({ repsMin: 3, repsMax: 3, prescribedLoad: 300, sets: 1 })],
        },
        {
          name: "Curl",
          rest: 1,
          blocks: [blockWith({ repsMin: 10, repsMax: 10, prescribedLoad: null, sets: 3 })],
        },
      ],
    }
    // Only the squat counts: 300 × 3 × 1 = 900
    expect(plannedVolume(day)).toBe(900)
  })

  it("returns 0 for a rest day", () => {
    expect(plannedVolume(REST_DAY)).toBe(0)
  })
})

// ─── topSet ────────────────────────────────────────────────────────────────

describe("topSet", () => {
  it("returns the heaviest prescribed load and its exercise", () => {
    const day: ProgramDay = {
      id: "d",
      name: "d",
      tag: "d",
      exercises: [
        { name: "Squat", rest: 2, blocks: [blockWith({ prescribedLoad: 300 })] },
        { name: "Deadlift", rest: 2, blocks: [blockWith({ prescribedLoad: 405 })] },
      ],
    }
    expect(topSet(day)).toEqual({ load: 405, exercise: "Deadlift" })
  })

  it("returns load 0 / null exercise when nothing has an absolute load", () => {
    const day: ProgramDay = {
      id: "d",
      name: "d",
      tag: "d",
      exercises: [{ name: "Curl", rest: 1, blocks: [blockWith({ prescribedLoad: null })] }],
    }
    expect(topSet(day)).toEqual({ load: 0, exercise: null })
  })
})

// ─── avgTargetRpe ──────────────────────────────────────────────────────────

describe("avgTargetRpe", () => {
  it("returns the sets-weighted mean plus the min/max spread", () => {
    const day: ProgramDay = {
      id: "d",
      name: "d",
      tag: "d",
      exercises: [
        { name: "A", rest: 2, blocks: [blockWith({ rpe: 6, sets: 1 })] },
        { name: "B", rest: 2, blocks: [blockWith({ rpe: 9, sets: 3 })] },
      ],
    }
    // (6×1 + 9×3) / 4 = 33/4 = 8.25 → 8.3 (1 dp)
    expect(avgTargetRpe(day)).toEqual({ avg: 8.3, min: 6, max: 9 })
  })

  it("returns null when no block prescribes an RPE", () => {
    const day: ProgramDay = {
      id: "d",
      name: "d",
      tag: "d",
      exercises: [{ name: "A", rest: 2, blocks: [blockWith({ rpe: null })] }],
    }
    expect(avgTargetRpe(day)).toBeNull()
  })
})

// ─── nextWorkoutDay ────────────────────────────────────────────────────────

describe("nextWorkoutDay", () => {
  const workout = (id: string): ProgramDay => ({
    id,
    name: id,
    tag: id,
    exercises: [{ name: "Squat", rest: 2, blocks: [block(1)] }],
  })
  const rest = (id: string): ProgramDay => ({ id, name: "Rest", tag: "OFF", off: true })

  const program: Program = {
    id: "p",
    name: "p",
    weeks: [
      { id: "w1", sequence: 1, days: [workout("w1d1"), rest("w1d2"), workout("w1d3")] },
      { id: "w2", sequence: 2, days: [workout("w2d1"), rest("w2d2")] },
    ],
    blocks: [{ id: "b1", sequence: 1, name: "Block 1", weekStart: 1, weekEnd: 2 }],
  }

  it("finds the next non-rest day later in the same week", () => {
    // After week 1 day 0 (workout), the next non-rest is week 1 day 2.
    expect(nextWorkoutDay(program, 1, 0)?.id).toBe("w1d3")
  })

  it("walks into the following week when the rest of this one is rest days", () => {
    // After week 1 day 2 (the last day), the next non-rest is week 2 day 0.
    expect(nextWorkoutDay(program, 1, 2)?.id).toBe("w2d1")
  })

  it("skips rest days when scanning forward", () => {
    // From week 1 day 1 (a rest day) the next workout is day 2.
    expect(nextWorkoutDay(program, 1, 1)?.id).toBe("w1d3")
  })

  it("returns null at the end of the program", () => {
    expect(nextWorkoutDay(program, 2, 0)).toBeNull()
  })
})

describe("computeTodayPosition", () => {
  it("resolves a whole-day offset to the right (week, dayIndex)", () => {
    const now = new Date(2026, 0, 15, 12, 0, 0)
    expect(computeTodayPosition("2026-01-05", 12, now)).toEqual({ week: 2, dayIndex: 3 })
  })

  it("returns null before the program starts", () => {
    const now = new Date(2026, 0, 4, 12, 0, 0)
    expect(computeTodayPosition("2026-01-05", 12, now)).toBeNull()
  })

  it("returns null past the last week", () => {
    const now = new Date(2026, 0, 15, 12, 0, 0)
    expect(computeTodayPosition("2026-01-05", 1, now)).toBeNull()
  })

  const springHasDst =
    new Date("2026-03-02T00:00:00").getTimezoneOffset() !==
    new Date("2026-03-12T00:00:00").getTimezoneOffset()

  it.skipIf(!springHasDst)("keeps the day index across a spring-forward transition", () => {
    const now = new Date("2026-03-12T00:00:00")
    expect(computeTodayPosition("2026-03-02", 12, now)).toEqual({ week: 2, dayIndex: 3 })
  })

  const fallHasDst =
    new Date("2026-10-26T00:00:00").getTimezoneOffset() !==
    new Date("2026-11-05T00:00:00").getTimezoneOffset()

  it.skipIf(!fallHasDst)("keeps the day index across a fall-back transition", () => {
    const now = new Date("2026-11-05T00:00:00")
    expect(computeTodayPosition("2026-10-26", 12, now)).toEqual({ week: 2, dayIndex: 3 })
  })
})
