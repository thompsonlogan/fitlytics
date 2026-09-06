import { describe, expect, it } from "vitest"

import { mapDay, mapExercise, mapGroup, mapProgram, mapWeek } from "./program-mapper"
import type {
  ProgramDayResponse,
  ProgramExerciseResponse,
  ProgramResponse,
  ProgramSetGroupResponse,
  ProgramWeekResponse,
} from "@/services/generated"

// ─── mapGroup ──────────────────────────────────────────────────────────────

describe("mapGroup", () => {
  it("converts cap kg → lb (rounded), counts sets, copies rpe/intensity", () => {
    // 129.27 kg → 285 lb per the seed data convention. Prescription from set[0].
    const input: ProgramSetGroupResponse = {
      sets: [
        { repsMin: 3, repsMax: 5, intensityText: "285lb (0.95)", capLoadKg: 129.27, prescribedRpe: 8 },
        { repsMin: 3, repsMax: 5, intensityText: "285lb (0.95)", capLoadKg: 129.27, prescribedRpe: 8 },
      ],
    }

    const out = mapGroup(input)

    expect(out.sets).toBe(2)
    expect(out.cap).toBe(285)
    expect(out.rpe).toBe(8)
    expect(out.intensity).toBe("285lb (0.95)")
  })

  it("maps reps as a single numeric range when min == max", () => {
    expect(mapGroup({ sets: [{ repsMin: 3, repsMax: 3 }] })).toMatchObject({
      repsMin: 3,
      repsMax: 3,
    })
  })

  it("maps reps as numeric min/max bounds when min < max", () => {
    expect(mapGroup({ sets: [{ repsMin: 6, repsMax: 10 }] })).toMatchObject({
      repsMin: 6,
      repsMax: 10,
    })
  })

  it("emits null rep bounds when neither min nor max is set", () => {
    expect(mapGroup({ sets: [{}] })).toMatchObject({ repsMin: null, repsMax: null })
  })

  it("returns cap='' when capLoadKg is missing (preserves table placeholder)", () => {
    expect(mapGroup({ sets: [{}] }).cap).toBe("")
  })

  it("converts prescribedLoadKg → lb for the side panel's planned stats", () => {
    // 129.27 kg → 285 lb.
    expect(mapGroup({ sets: [{ prescribedLoadKg: 129.27 }] }).prescribedLoad).toBe(285)
  })

  it("leaves prescribedLoad null when no absolute load is prescribed", () => {
    expect(mapGroup({ sets: [{ intensityText: "0-1RIR" }] }).prescribedLoad).toBeNull()
  })

  it("threads through the group id (a stable row key)", () => {
    expect(mapGroup({ id: "psg-123", sets: [{}] }).id).toBe("psg-123")
  })

  it("defaults rpe to null when not prescribed", () => {
    expect(mapGroup({ sets: [{}] }).rpe).toBeNull()
  })

  it("defaults sets count to 0 when the group has no sets", () => {
    expect(mapGroup({ sets: [] }).sets).toBe(0)
    expect(mapGroup({}).sets).toBe(0)
  })
})

// ─── mapExercise ───────────────────────────────────────────────────────────

describe("mapExercise", () => {
  it("converts rest seconds → minutes", () => {
    const e: ProgramExerciseResponse = {
      exerciseName: "Squat",
      restSeconds: 180,
      groups: [],
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

  it("maps every group into the blocks array (block.sets = set count)", () => {
    const out = mapExercise({
      exerciseName: "Squat",
      groups: [
        { sets: [{ repsMin: 3, repsMax: 3 }] },
        {
          sets: [
            { repsMin: 5, repsMax: 5 },
            { repsMin: 5, repsMax: 5 },
          ],
        },
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
      exercises: [{ exerciseName: "Squat", groups: [{ sets: [{}] }] }],
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

  it("threads the coach note through on training days", () => {
    const out = mapDay({
      name: "Day 1",
      isRestDay: false,
      notes: "Belt from set 2.",
      exercises: [],
    })
    expect(out.notes).toBe("Belt from set 2.")
  })

  it("threads the coach note through on rest days", () => {
    const out = mapDay({ name: "Rest", isRestDay: true, notes: "Easy walk.", exercises: [] })
    expect(out.notes).toBe("Easy walk.")
  })

  it("maps a missing coach note to null", () => {
    const out = mapDay({ name: "Day 1", isRestDay: false, exercises: [] })
    expect(out.notes).toBeNull()
  })
})

// ─── mapWeek / mapProgram (integration) ────────────────────────────────────

describe("mapWeek", () => {
  it("pads to 7 days and places each day at its sequence index", () => {
    const w: ProgramWeekResponse = {
      id: "week-1",
      sequence: 3,
      days: [
        { sequence: 1, name: "Day 1", isRestDay: false, exercises: [] },
        { sequence: 2, name: "Rest", isRestDay: true, exercises: [] },
      ],
    }
    const out = mapWeek(w)
    expect(out.sequence).toBe(3)
    expect(out.days).toHaveLength(7)
    expect(out.days[0].name).toBe("Day 1")
    expect(out.days[1].off).toBe(true)
    expect(out.days[2].off).toBe(true)
    expect(out.days[6].off).toBe(true)
  })

  it("fills all 7 days as rest when backend sends no days", () => {
    const out = mapWeek({ id: "w", sequence: 1, days: [] })
    expect(out.days).toHaveLength(7)
    expect(out.days.every((d) => d.off)).toBe(true)
  })
})

describe("mapProgram", () => {
  it("hydrates the full tree end-to-end", () => {
    const p: ProgramResponse = {
      id: "prog-1",
      name: "Logan PL",
      startDate: "2026-05-04",
      blocks: [
        {
          id: "b1",
          sequence: 1,
          name: "Block 1",
          weeks: [
            {
              id: "w1",
              sequence: 1,
              days: [
            {
              sequence: 1,
              name: "Day 1",
              tag: "Day 1",
              isRestDay: false,
              exercises: [
                {
                  exerciseName: "Comp Squat",
                  subText: "Belt + sleeves",
                  restSeconds: 180,
                  groups: [
                    {
                      sets: [
                        {
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
        },
          ],
        },
      ],
    }

    const out = mapProgram(p)

    expect(out.name).toBe("Logan PL")
    expect(out.startDate).toBe("2026-05-04")
    expect(out.weeks).toHaveLength(1)
    expect(out.weeks[0].days).toHaveLength(7)
    const day = out.weeks[0].days[0]
    expect(day.name).toBe("Day 1")
    expect(day.exercises).toHaveLength(1)
    const ex = day.exercises![0]
    expect(ex.name).toBe("Comp Squat")
    expect(ex.sub).toBe("Belt + sleeves")
    expect(ex.rest).toBe(3)
    expect(ex.blocks[0].cap).toBe(300)
    expect(ex.blocks[0]).toMatchObject({ repsMin: 3, repsMax: 3 })
  })

  it("flattens weeks across blocks and records each block's week range", () => {
    const out = mapProgram({
      id: "p",
      name: "PL",
      blocks: [
        {
          id: "b2",
          sequence: 2,
          name: "Block 2",
          weeks: [
            { id: "w6", sequence: 6, days: [] },
            { id: "w5", sequence: 5, days: [] },
          ],
        },
        {
          id: "b1",
          sequence: 1,
          name: "Block 1",
          weeks: [{ id: "w1", sequence: 1, days: [] }],
        },
      ],
    })

    // Flat weeks are globally sorted regardless of block/week input order.
    expect(out.weeks.map((w) => w.sequence)).toEqual([1, 5, 6])
    // Blocks sorted by sequence, with correct global week ranges.
    expect(out.blocks).toEqual([
      { id: "b1", sequence: 1, name: "Block 1", weekStart: 1, weekEnd: 1 },
      { id: "b2", sequence: 2, name: "Block 2", weekStart: 5, weekEnd: 6 },
    ])
  })

  it("returns an empty weeks array when backend sends none", () => {
    expect(mapProgram({ id: "p", name: "" }).weeks).toEqual([])
    expect(mapProgram({ id: "p", name: "" }).blocks).toEqual([])
  })

  it("survives a totally-empty response (defensive defaults)", () => {
    const out = mapProgram({})
    expect(out.id).toBe("")
    expect(out.name).toBe("")
    expect(out.weeks).toEqual([])
  })

  it("maps startDate as undefined when not provided", () => {
    const out = mapProgram({ id: "p", name: "Test" })
    expect(out.startDate).toBeUndefined()
  })
})
