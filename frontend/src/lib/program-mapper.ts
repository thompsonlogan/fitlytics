import type {
  ProgramDayResponse,
  ProgramExerciseResponse,
  ProgramResponse,
  ProgramSetTargetResponse,
  ProgramWeekResponse,
} from "@/services/generated"

import type { Exercise, Program, ProgramDay, ProgramWeek, SetBlock } from "./program-data"

// 1 kilogram = 2.20462 pounds. The backend stores prescribed loads in kg
// (canonical SI inside the DB); the UI is currently imperial-only, so every
// kg value gets converted here at the boundary. Rounding to the nearest
// integer lb matches how the seed spreadsheet renders ("300lb" / "285lb").
const KG_PER_LB = 2.20462
const KG_TO_LB = (kg: number) => Math.round(kg * KG_PER_LB)

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

// mapSetTarget converts one prescribed set-block (e.g. "2 sets of 2 reps at
// 285lb RPE 5") into the SetBlock the workout table renders.
//
// `used` is intentionally always blank — set targets are the prescription;
// what the user actually lifts comes from session set_logs, which this
// program endpoint doesn't return. The existing table treats `""` as the
// "log your load here" placeholder.
export function mapSetTarget(t: ProgramSetTargetResponse): SetBlock {
  const capLb = t.capLoadKg != null ? KG_TO_LB(t.capLoadKg) : ""

  return {
    sets: t.setsCount ?? 0,
    reps: formatReps(t.repsMin, t.repsMax),
    intensity: t.intensityText ?? "",
    cap: capLb,
    used: "",
    rpe: t.prescribedRpe ?? null,
  }
}

// mapExercise composes one exercise card (one row group in the table). The
// backend already orders set_targets by sequence so we don't re-sort here.
export function mapExercise(e: ProgramExerciseResponse): Exercise {
  const restMin =
    e.restSeconds != null && e.restSeconds > 0 ? Math.round(e.restSeconds / 60) : REST_DEFAULT_MIN

  return {
    name: e.exerciseName ?? "",
    rest: restMin,
    sub: e.subText ?? undefined,
    blocks: (e.setTargets ?? []).map(mapSetTarget),
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

  if (d.isRestDay) {
    return { name: "Rest", tag, off: true }
  }

  return {
    name: dayName,
    tag,
    exercises: (d.exercises ?? []).map(mapExercise),
  }
}

// mapWeek lifts a backend week into the frontend's per-week shape. Sequence
// is 1-based on both sides so it copies straight across.
export function mapWeek(w: ProgramWeekResponse): ProgramWeek {
  return {
    id: w.id ?? "",
    sequence: w.sequence ?? 0,
    days: (w.days ?? []).map(mapDay),
  }
}

// mapProgram is the public entry point: full backend tree → full frontend
// tree. The hook calls this once after the API returns; everything below
// (table, sub-bar, side-panel) operates on the frontend shape only.
export function mapProgram(p: ProgramResponse): Program {
  return {
    id: p.id ?? "",
    name: p.name ?? "",
    weeks: (p.weeks ?? []).map(mapWeek),
  }
}
