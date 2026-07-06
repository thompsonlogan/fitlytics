import type {
  ProgramDayResponse,
  ProgramExerciseResponse,
  ProgramResponse,
  ProgramSetGroupResponse,
  ProgramWeekResponse,
} from "@/services/generated"

import type { Exercise, Program, ProgramDay, ProgramWeek, SetBlock } from "./program-data"

// 1 kilogram = 2.20462 pounds. The backend stores prescribed loads in kg
// (canonical SI inside the DB); the UI is currently imperial-only, so every
// kg value gets converted here at the boundary. Rounding to the nearest
// integer lb matches how the seed spreadsheet renders ("300lb" / "285lb").
const KG_PER_LB = 2.20462
export const KG_TO_LB = (kg: number) => Math.round(kg * KG_PER_LB)
// Used by callers (e.g. the cell-edit mutation) that need to convert user-
// entered lb input back to kg before sending to the API. Not rounded — the
// backend column is numeric(7,2).
export const LB_TO_KG = (lb: number) => lb / KG_PER_LB

// 60s per minute — `rest_seconds` on the backend, minutes in the UI.
const REST_DEFAULT_MIN = 2

// formatReps composes the human-readable rep string the UI cell shows. Single
// value when min==max (e.g. "3"); en-dash range otherwise ("6–10"). The
// en-dash (not ASCII hyphen) matches the existing fixture convention.
function formatReps(min: number | null | undefined, max: number | null | undefined): string {
  const lo = min ?? undefined
  const hi = max ?? undefined
  if (lo == null && hi == null) return ""
  if (lo != null && hi != null && lo !== hi) return `${lo}–${hi}`
  return String(lo ?? hi)
}

// mapGroup converts one prescribed set group (e.g. "2 sets of 2 reps at 285lb
// RPE 5") into the SetBlock the workout table renders. A group is a run of
// normalized one-per-row sets sharing a prescription; the block count is the
// number of sets and the displayed prescription comes from the first set.
//
// Prescription-only fields land here. Actuals ("Load Used", "Last Set RPE",
// completion) come from session set_logs and are merged in at the table level.
export function mapGroup(g: ProgramSetGroupResponse): SetBlock {
  const sets = g.sets ?? []
  const first = sets[0]
  const capLb = first?.capLoadKg != null ? KG_TO_LB(first.capLoadKg) : ""

  return {
    id: g.id ?? "",
    sets: sets.length,
    reps: formatReps(first?.repsMin, first?.repsMax),
    intensity: first?.intensityText ?? "",
    cap: capLb,
    rpe: first?.prescribedRpe ?? null,
    prescribedLoad: first?.prescribedLoadKg != null ? KG_TO_LB(first.prescribedLoadKg) : null,
  }
}

// mapExercise composes one exercise card (one row group in the table). The
// backend already orders groups (and the sets within them) by sequence so we
// don't re-sort here.
export function mapExercise(e: ProgramExerciseResponse): Exercise {
  const restMin =
    e.restSeconds != null && e.restSeconds > 0 ? Math.round(e.restSeconds / 60) : REST_DEFAULT_MIN

  return {
    name: e.exerciseName ?? "",
    rest: restMin,
    sub: e.subText ?? undefined,
    blocks: (e.groups ?? []).map(mapGroup),
  }
}

// mapDay handles the rest-day fork. The UI's contract is:
//   off=true  → no `exercises` array, RestDayCard renders
//   off=false → `exercises` non-empty, WorkoutTable renders
// Tag falls back to the day name when the backend leaves it null so the
// header sub-bar always has something to display.
export function mapDay(d: ProgramDayResponse): ProgramDay {
  const dayName = d.name ?? "Day"
  const tag = d.tag ?? dayName
  const id = d.id ?? ""

  if (d.isRestDay) {
    return { id, name: "Rest", tag, off: true, notes: d.notes ?? null }
  }

  return {
    id,
    name: dayName,
    tag,
    notes: d.notes ?? null,
    exercises: (d.exercises ?? []).map(mapExercise),
  }
}

const DAYS_PER_WEEK = 7

// mapWeek lifts a backend week into the frontend's per-week shape. Always
// produces exactly 7 days (Mon–Sun) by placing API days at their sequence
// index and filling gaps with rest-day placeholders.
export function mapWeek(w: ProgramWeekResponse): ProgramWeek {
  const bySeq = new Map<number, ProgramDay>()
  for (const d of w.days ?? []) {
    bySeq.set(d.sequence ?? 0, mapDay(d))
  }

  const days: ProgramDay[] = Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
    const seq = i + 1
    return bySeq.get(seq) ?? { id: "", name: "Rest", tag: `Day ${seq}`, off: true }
  })

  return {
    id: w.id ?? "",
    sequence: w.sequence ?? 0,
    days,
  }
}

// mapProgram is the public entry point: full backend tree → full frontend
// tree. The hook calls this once after the API returns; everything below
// (table, sub-bar, side-panel) operates on the frontend shape only.
export function mapProgram(p: ProgramResponse): Program {
  return {
    id: p.id ?? "",
    name: p.name ?? "",
    startDate: p.startDate ?? undefined,
    weeks: (p.weeks ?? []).map(mapWeek),
  }
}
