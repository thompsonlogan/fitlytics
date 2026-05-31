// Frontend-facing shape of a program. The OpenAPI client returns the backend
// shape (snake_case, kg loads, nullable everywhere); program-mapper.ts
// translates that into this shape — every consumer below (workout-table,
// side-panel, sub-bar) operates on this type only.

export type SetBlock = {
  // id is the backing program_set_targets UUID. Needed so per-cell edits in
  // the workout table can PATCH the right row. Empty string only on rows that
  // weren't loaded from the API (defensive — should never happen in prod).
  id: string
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
  // id is the backing program_days UUID. Needed so the workout table can
  // start / fetch the session for "this day". Empty string only on the
  // placeholder day rendered while the program is loading.
  id: string
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
  startDate?: string
  weeks: ProgramWeek[]
}

export const DAY_LETTERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

export function calendarDayOfMonth(startDate: string, week: number, dayIndex: number): number {
  const d = new Date(startDate + "T00:00:00")
  d.setDate(d.getDate() + (week - 1) * 7 + dayIndex)
  return d.getDate()
}

export function computeTodayPosition(
  startDate: string,
  weekCount: number
): { week: number; dayIndex: number } | null {
  const start = new Date(startDate + "T00:00:00")
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return null
  const week = Math.floor(diffDays / 7) + 1
  if (week > weekCount) return null
  return { week, dayIndex: diffDays % 7 }
}

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
