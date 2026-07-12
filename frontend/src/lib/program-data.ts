// Frontend-facing shape of a program. The OpenAPI client returns the backend
// shape (snake_case, kg loads, nullable everywhere); program-mapper.ts
// translates that into this shape — every consumer below (workout-table,
// side-panel, sub-bar) operates on this type only.

export type SetBlock = {
  // id is the backing program_set_groups UUID. Needed so per-cell edits in
  // the workout table can PATCH the right row. Empty string only on rows that
  // weren't loaded from the API (defensive — should never happen in prod).
  id: string
  sets: number
  reps: string
  intensity: string
  cap: number | ""
  rpe: number | null
  // prescribedLoad is the block's planned working load in lb (converted from
  // the backend's prescribed_load_kg). null when the prescription is given by
  // text/RIR only (e.g. accessories with no absolute load). Drives the side
  // panel's planned-volume / top-set stats; the table shows prescription as
  // free-text `intensity` and `cap`, so this never renders in a cell.
  prescribedLoad: number | null
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
  // notes is the day's coach/programming note (program_days.notes). Read-only
  // in the UI — authored with the program, surfaced in the side panel's Notes
  // card. null/undefined when no note was written for this day.
  notes?: string | null
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
  weekCount: number,
  now: Date = new Date()
): { week: number; dayIndex: number } | null {
  const start = new Date(startDate + "T00:00:00")
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
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

const WORK_TIME_PER_SET = 2

function rpeMultiplier(rpe: number | null): number {
  if (rpe == null || rpe < 8) return 1
  if (rpe <= 8) return 1.1
  if (rpe <= 9) return 1.2
  return 1.3
}

export function estimateDuration(day: ProgramDay): number {
  if (day.off || !day.exercises) return 0
  let total = 0
  for (const ex of day.exercises) {
    const rest = ex.rest || 2
    for (const b of ex.blocks) {
      total += b.sets * (rest + WORK_TIME_PER_SET) * rpeMultiplier(b.rpe)
    }
  }
  return Math.round(total)
}

// repsLowerBound pulls the conservative rep count out of a SetBlock's display
// string ("3" → 3, "6–10" → 6). Used for planned-volume math, which multiplies
// load × reps × sets. Returns 0 when the string carries no number.
function repsLowerBound(reps: string): number {
  return parseInt(String(reps).split(/[–-]/)[0], 10) || 0
}

// plannedVolume totals the day's prescribed working volume in lb:
// Σ (prescribed load × lower-bound reps × sets) over every block that carries
// an absolute load. Blocks prescribed by text/RIR only (prescribedLoad == null)
// contribute nothing — this is "planned barbell volume", not a rep-count proxy.
export function plannedVolume(day: ProgramDay): number {
  return flattenRows(day).reduce((sum, r) => {
    const load = r.block.prescribedLoad
    if (load == null) return sum
    return sum + load * repsLowerBound(r.block.reps) * r.block.sets
  }, 0)
}

// topSet returns the heaviest prescribed load on the day (lb) and the exercise
// it belongs to. load is 0 / exercise null when nothing on the day has an
// absolute prescribed load.
export function topSet(day: ProgramDay): { load: number; exercise: string | null } {
  let best: { load: number; exercise: string | null } = { load: 0, exercise: null }
  for (const r of flattenRows(day)) {
    const load = r.block.prescribedLoad
    if (load != null && load > best.load) {
      best = { load, exercise: r.exercise.name }
    }
  }
  return best
}

// avgTargetRpe returns the sets-weighted mean prescribed RPE for the day plus
// the min/max of the prescribed values (for a "5–8 target" sub-line). Returns
// null when no block prescribes an RPE, so callers can render an em dash.
export function avgTargetRpe(day: ProgramDay): { avg: number; min: number; max: number } | null {
  let weighted = 0
  let sets = 0
  let min = Infinity
  let max = -Infinity
  for (const r of flattenRows(day)) {
    const rpe = r.block.rpe
    if (rpe == null) continue
    weighted += rpe * r.block.sets
    sets += r.block.sets
    if (rpe < min) min = rpe
    if (rpe > max) max = rpe
  }
  if (sets === 0) return null
  return { avg: Math.round((weighted / sets) * 10) / 10, min, max }
}

// nextWorkoutDay scans forward from the position AFTER (week, dayIndex) and
// returns the first non-rest day, walking into later weeks as needed. Used by
// the rest-day side panel's "Next session" card. `week` is 1-based, `dayIndex`
// 0-based (matching the today-page position model). null when nothing remains
// (end of program).
export function nextWorkoutDay(
  program: Program,
  week: number,
  dayIndex: number
): ProgramDay | null {
  for (let w = week; w <= program.weeks.length; w++) {
    const weekObj = program.weeks[w - 1]
    if (!weekObj) continue
    const startDay = w === week ? dayIndex + 1 : 0
    for (let d = startDay; d < weekObj.days.length; d++) {
      const day = weekObj.days[d]
      if (day && !day.off) return day
    }
  }
  return null
}
