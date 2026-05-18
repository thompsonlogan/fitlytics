export type SetBlock = {
  sets: number
  reps: string
  intensity: string
  cap: number | ""
  used: number | ""
  rpe: number | null
}

export type Exercise = {
  name: string
  rest: number
  sub?: string
  blocks: SetBlock[]
}

export type ProgramDay = {
  name: string
  tag: string
  off?: boolean
  exercises?: Exercise[]
}

export type Program = {
  name: string
  weeks: number
  days: ProgramDay[]
}

export const PROGRAM: Program = {
  name: "Hypertrophy Block · v3",
  weeks: 4,
  days: [
    {
      name: "Lower · Heavy",
      tag: "Day 1",
      exercises: [
        {
          name: "Comp Squat",
          rest: 3,
          sub: "Belt + sleeves",
          blocks: [
            { sets: 1, reps: "3", intensity: "300lb", cap: 300, used: 300, rpe: 8 },
            { sets: 2, reps: "5", intensity: "285lb (0.95)", cap: 285, used: 285, rpe: 8 },
          ],
        },
        {
          name: "Comp Deadlift",
          rest: 4,
          sub: "Conventional",
          blocks: [
            { sets: 1, reps: "3", intensity: "305lb", cap: 305, used: 305, rpe: 8 },
            { sets: 2, reps: "7", intensity: "290lb (0.95)", cap: 290, used: 290, rpe: 8 },
          ],
        },
        {
          name: "Alternating SL Quad Ext",
          rest: 2,
          blocks: [{ sets: 2, reps: "6–10", intensity: "0–1 RIR", cap: "", used: 70, rpe: null }],
        },
        {
          name: "Alternating SL Hamstring Curl",
          rest: 2,
          blocks: [{ sets: 2, reps: "6–10", intensity: "0–1 RIR", cap: "", used: 80, rpe: null }],
        },
      ],
    },
    {
      name: "Upper · Push/Pull",
      tag: "Day 2",
      exercises: [
        {
          name: "Comp Squat",
          rest: 3,
          sub: "Top single",
          blocks: [
            { sets: 1, reps: "3", intensity: "290lb (–5%)", cap: 290, used: 280, rpe: 7 },
            { sets: 1, reps: "3", intensity: "–10%", cap: 261, used: 265, rpe: 7 },
          ],
        },
        {
          name: "Comp Bench",
          rest: 3,
          blocks: [
            { sets: 1, reps: "1", intensity: "215lb", cap: 215, used: 215, rpe: 8 },
            { sets: 1, reps: "2", intensity: "205lb", cap: 205, used: 205, rpe: 8 },
            { sets: 2, reps: "2", intensity: "–7.50%", cap: 199, used: 199, rpe: 8 },
          ],
        },
        {
          name: "Comp Deadlift",
          rest: 3,
          sub: "Backoff",
          blocks: [{ sets: 2, reps: "4", intensity: "290lb", cap: 290, used: 290, rpe: 7 }],
        },
        {
          name: "RDL",
          rest: 2,
          blocks: [{ sets: 1, reps: "4–8", intensity: "1–2 RIR", cap: "", used: 185, rpe: null }],
        },
        {
          name: "Alternating SL Quad Ext",
          rest: 2,
          blocks: [{ sets: 2, reps: "6–10", intensity: "0–1 RIR", cap: "", used: 70, rpe: null }],
        },
        {
          name: "Pec Dec",
          rest: 2,
          blocks: [{ sets: 2, reps: "8", intensity: "MMR0–1", cap: "", used: 140, rpe: null }],
        },
        {
          name: "V Bar Pulldown",
          rest: 2,
          blocks: [{ sets: 1, reps: "8", intensity: "MMR0–1", cap: "", used: 130, rpe: null }],
        },
      ],
    },
    {
      name: "Upper · Bench Focus",
      tag: "Day 3",
      exercises: [
        {
          name: "2ct Paused Bench",
          rest: 3,
          blocks: [
            { sets: 1, reps: "1", intensity: "210lb", cap: 210, used: 210, rpe: 8 },
            { sets: 1, reps: "2", intensity: "200lb", cap: 200, used: 200, rpe: 8 },
            { sets: 3, reps: "2", intensity: "–7.50%", cap: 185, used: 185, rpe: 8 },
          ],
        },
        {
          name: "Machine Press",
          rest: 2,
          blocks: [{ sets: 2, reps: "6–8", intensity: "0–1 RIR", cap: "", used: 140, rpe: null }],
        },
        {
          name: "Kelso Shrug",
          rest: 2,
          blocks: [{ sets: 2, reps: "6–8", intensity: "1 RIR", cap: "", used: 30, rpe: null }],
        },
      ],
    },
    {
      name: "Lower · Volume",
      tag: "Day 4",
      exercises: [
        {
          name: "2ct Paused Bench",
          rest: 3,
          blocks: [
            { sets: 1, reps: "3", intensity: "185lb (0.88)", cap: 185, used: 185, rpe: 8 },
            { sets: 2, reps: "3", intensity: "–5%", cap: 175, used: 175, rpe: 8 },
          ],
        },
        {
          name: "HB Squat",
          rest: 3,
          blocks: [{ sets: 2, reps: "6", intensity: "240lb (0.8)", cap: 240, used: 240, rpe: 8 }],
        },
        {
          name: "DB RDL",
          rest: 2,
          blocks: [{ sets: 1, reps: "4–8", intensity: "1–2 RIR", cap: "", used: 80, rpe: null }],
        },
        {
          name: "Pec Dec",
          rest: 2,
          blocks: [{ sets: 1, reps: "6–8", intensity: "0–1 RIR", cap: "", used: 140, rpe: null }],
        },
        {
          name: "Cable Curl",
          rest: 2,
          blocks: [{ sets: 2, reps: "6–8", intensity: "0–1 RIR", cap: "", used: 65, rpe: null }],
        },
        {
          name: "Incep of choice",
          rest: 2,
          blocks: [{ sets: 2, reps: "6–8", intensity: "0–1 RIR", cap: "", used: 27.5, rpe: null }],
        },
      ],
    },
    { name: "Rest", tag: "OFF", off: true },
    { name: "Rest", tag: "OFF", off: true },
    { name: "Rest", tag: "OFF", off: true },
  ],
}

export const DAY_LETTERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

export type WorkoutRow = {
  key: string
  exIdx: number
  blIdx: number
  first: boolean
  rowSpan: number
  exercise: Exercise
  block: SetBlock
  exNum: number
}

export function flattenRows(day: ProgramDay): WorkoutRow[] {
  if (day.off || !day.exercises) return []
  const rows: WorkoutRow[] = []
  day.exercises.forEach((ex, exIdx) => {
    ex.blocks.forEach((bl, blIdx) => {
      rows.push({
        key: `${exIdx}-${blIdx}`,
        exIdx,
        blIdx,
        first: blIdx === 0,
        rowSpan: ex.blocks.length,
        exercise: ex,
        block: bl,
        exNum: exIdx + 1,
      })
    })
  })
  return rows
}

export function totalSets(day: ProgramDay): number {
  if (day.off || !day.exercises) return 0
  return day.exercises.reduce(
    (sum, ex) => sum + ex.blocks.reduce((s, b) => s + b.sets, 0),
    0,
  )
}

export function estimateDuration(day: ProgramDay): number {
  if (day.off || !day.exercises) return 0
  let setCount = 0
  let restMin = 0
  day.exercises.forEach((ex) => {
    ex.blocks.forEach((b) => {
      setCount += b.sets
    })
    const exSets = ex.blocks.reduce((s, b) => s + b.sets, 0)
    restMin += (ex.rest || 2) * Math.max(0, exSets - 1)
  })
  return Math.round(setCount * 0.9 + restMin)
}
