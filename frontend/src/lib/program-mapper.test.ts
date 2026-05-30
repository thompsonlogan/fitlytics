import { describe, expect, it } from "vitest"

import { mapDay, mapExercise, mapProgram, mapSetTarget, mapWeek } from "./program-mapper"
import type {
  ProgramDayResponse,
  ProgramExerciseResponse,
  ProgramResponse,
  ProgramSetTargetResponse,
  ProgramWeekResponse,
} from "@/services/generated"

// ─── mapSetTarget ──────────────────────────────────────────────────────────

describe("mapSetTarget", () => {
  it("converts cap kg → lb (rounded) and copies sets/rpe", () => {
    // 129.27 kg → 285 lb per the seed data convention.
    const input: ProgramSetTargetResponse = {
      setsCount: 2,
      repsMin: 3,
      repsMax: 5,
      intensityText: "285lb (0.95)",
      capLoadKg: 129.27,
      prescribedRpe: 8,
    }

    const out = mapSetTarget(input)

    expect(out.sets).toBe(2)
    expect(out.cap).toBe(285)
    expect(out.rpe).toBe(8)
    expect(out.intensity).toBe("285lb (0.95)")
  })

  it("formats reps as a single value when min == max", () => {
    const out = mapSetTarget({ setsCount: 1, repsMin: 3, repsMax: 3 })
    expect(out.reps).toBe("3")
  })

  it("formats reps as an en-dash range when min < max", () => {
    const out = mapSetTarget({ setsCount: 1, repsMin: 6, repsMax: 10 })
    expect(out.reps).toBe("6–10")
  })

  it("emits empty reps when neither min nor max is set", () => {
    const out = mapSetTarget({ setsCount: 1 })
    expect(out.reps).toBe("")
  })

  it("returns cap='' when capLoadKg is missing (preserves table placeholder)", () => {
    const out = mapSetTarget({ setsCount: 1 })
    expect(out.cap).toBe("")
  })

  it("always leaves `used` blank — prescription, not actuals", () => {
    // Even with a prescribed load present, `used` is the field the user
    // types into during a session. The program tree carries no actuals.
    const out = mapSetTarget({ setsCount: 1, capLoadKg: 100 })
    expect(out.used).toBe("")
  })

  it("defaults rpe to null when not prescribed", () => {
    const out = mapSetTarget({ setsCount: 1 })
    expect(out.rpe).toBeNull()
  })

  it("defaults setsCount to 0 when missing (avoids NaN math downstream)", () => {
    const out = mapSetTarget({})
    expect(out.sets).toBe(0)
  })
})

// ─── mapExercise ───────────────────────────────────────────────────────────

describe("mapExercise", () => {
  it("converts rest seconds → minutes", () => {
    const e: ProgramExerciseResponse = {
      exerciseName: "Squat",
      restSeconds: 180,
      setTargets: [],
    }
    expect(mapExercise(e).rest).toBe(3)
  })

  it("falls back to default rest (2 min) when restSeconds is missing or zero", () => {
    expect(mapExercise({ exerciseName: "x" }).rest).toBe(2)
    expect(mapExercise({ exerciseName: "x", restSeconds: 0 }).rest).toBe(2)
  })

  it("rounds non-multiple-of-60 restSeconds (90 → 2 min)", () => {
    expect(mapExercise({ exerciseName: "x", restSeconds: 90 }).rest).toBe(2)
    expect(mapExercise({ exerciseName: "x", restSeconds: 100 }).rest).toBe(2)
    expect(mapExercise({ exerciseName: "x", restSeconds: 150 }).rest).toBe(3)
  })

  it("passes subText through as `sub` when present, undefined otherwise", () => {
    expect(mapExercise({ exerciseName: "x", subText: "Belt" }).sub).toBe("Belt")
    expect(mapExercise({ exerciseName: "x" }).sub).toBeUndefined()
  })

  it("maps every set target into the blocks array", () => {
    const out = mapExercise({
      exerciseName: "Squat",
      setTargets: [
        { setsCount: 1, repsMin: 3, repsMax: 3 },
        { setsCount: 2, repsMin: 5, repsMax: 5 },
      ],
    })
    expect(out.blocks.map((b) => b.sets)).toEqual([1, 2])
  })

  it("returns name='' when the backend lookup didn't resolve a canonical name", () => {
    // Boundary: mapper must not crash on an empty exerciseName.
    expect(mapExercise({ exerciseName: undefined }).name).toBe("")
  })
})

// ─── mapDay ────────────────────────────────────────────────────────────────

describe("mapDay", () => {
  it("emits off=true and no exercises for rest days", () => {
    const d: ProgramDayResponse = {
      name: "Rest",
      tag: "OFF",
      isRestDay: true,
      exercises: [],
    }
    const out = mapDay(d)
    expect(out.off).toBe(true)
    expect(out.exercises).toBeUndefined()
    expect(out.name).toBe("Rest")
    expect(out.tag).toBe("OFF")
  })

  it("emits off=false and maps exercises for training days", () => {
    const d: ProgramDayResponse = {
      name: "Day 1",
      tag: "Day 1",
      isRestDay: false,
      exercises: [{ exerciseName: "Squat", setTargets: [{ setsCount: 1 }] }],
    }
    const out = mapDay(d)
    expect(out.off).toBeFalsy()
    expect(out.exercises).toHaveLength(1)
    expect(out.exercises?.[0].name).toBe("Squat")
  })

  it("falls back tag → name when the backend leaves tag null", () => {
    const out = mapDay({ name: "Day 2", isRestDay: false, exercises: [] })
    expect(out.tag).toBe("Day 2")
  })
})

// ─── mapWeek / mapProgram (integration) ────────────────────────────────────

describe("mapWeek", () => {
  it("preserves sequence and maps days in order", () => {
    const w: ProgramWeekResponse = {
      id: "week-1",
      sequence: 3,
      days: [
        { name: "Day 1", isRestDay: false, exercises: [] },
        { name: "Rest", isRestDay: true, exercises: [] },
      ],
    }
    const out = mapWeek(w)
    expect(out.sequence).toBe(3)
    expect(out.days).toHaveLength(2)
    expect(out.days[0].name).toBe("Day 1")
    expect(out.days[1].off).toBe(true)
  })
})

describe("mapProgram", () => {
  it("hydrates the full tree end-to-end", () => {
    const p: ProgramResponse = {
      id: "prog-1",
      name: "Logan PL",
      weeks: [
        {
          id: "w1",
          sequence: 1,
          days: [
            {
              name: "Day 1",
              tag: "Day 1",
              isRestDay: false,
              exercises: [
                {
                  exerciseName: "Comp Squat",
                  subText: "Belt + sleeves",
                  restSeconds: 180,
                  setTargets: [
                    {
                      setsCount: 1,
                      repsMin: 3,
                      repsMax: 3,
                      intensityText: "300lb",
                      capLoadKg: 136.08,
                      prescribedRpe: 8,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const out = mapProgram(p)

    expect(out.name).toBe("Logan PL")
    expect(out.weeks).toHaveLength(1)
    const day = out.weeks[0].days[0]
    expect(day.name).toBe("Day 1")
    expect(day.exercises).toHaveLength(1)
    const ex = day.exercises![0]
    expect(ex.name).toBe("Comp Squat")
    expect(ex.sub).toBe("Belt + sleeves")
    expect(ex.rest).toBe(3)
    expect(ex.blocks[0].cap).toBe(300)
    expect(ex.blocks[0].reps).toBe("3")
  })

  it("returns an empty weeks array when backend sends none", () => {
    expect(mapProgram({ id: "p", name: "" }).weeks).toEqual([])
  })

  it("survives a totally-empty response (defensive defaults)", () => {
    // Boundary: every field on ProgramResponse is optional in the OpenAPI
    // schema. Mapper must not throw on a {} input.
    const out = mapProgram({})
    expect(out.id).toBe("")
    expect(out.name).toBe("")
    expect(out.weeks).toEqual([])
  })
})
