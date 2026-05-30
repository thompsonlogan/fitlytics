// Frontend-facing shape of a program. The OpenAPI client returns the backend
// shape (snake_case, kg loads, nullable everywhere); program-mapper.ts
// translates that into this shape — every consumer below (workout-table,
// side-panel, sub-bar) operates on this type only.

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

export type ProgramWeek = {
  id: string
  sequence: number
  days: ProgramDay[]
}

export type Program = {
  id: string
  name: string
  weeks: ProgramWeek[]
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
  return day.exercises.reduce((sum, ex) => sum + ex.blocks.reduce((s, b) => s + b.sets, 0), 0)
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
