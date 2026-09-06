import type {
  ProgramDayResponse,
  ProgramExerciseResponse,
  ProgramResponse,
  ProgramSetGroupResponse,
  ProgramWeekResponse,
} from "@/services/generated"

import type {
  Exercise,
  Program,
  ProgramBlock,
  ProgramDay,
  ProgramWeek,
  SetBlock,
} from "./program-data"
import { kgToLbRounded, lbToKg } from "./units"

// Back-compat aliases; new code imports from "./units".
export const KG_TO_LB = kgToLbRounded
export const LB_TO_KG = lbToKg

// 60s per minute — `rest_seconds` on the backend, minutes in the UI.
const REST_DEFAULT_MIN = 2

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
  const capLb = first?.capLoadKg != null ? kgToLbRounded(first.capLoadKg) : ""

  return {
    id: g.id ?? "",
    sets: sets.length,
    repsMin: first?.repsMin ?? null,
    repsMax: first?.repsMax ?? null,
    intensity: first?.intensityText ?? "",
    cap: capLb,
    rpe: first?.prescribedRpe ?? null,
    prescribedLoad:
      first?.prescribedLoadKg != null ? kgToLbRounded(first.prescribedLoadKg) : null,
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
// tree. The backend nests weeks under blocks; the frontend keeps a flat,
// global-order `weeks` list (what every table/sub-bar/side-panel consumer
// uses) plus a `blocks` grouping (block start/end as global week sequences)
// that the block selector navigates by.
export function mapProgram(p: ProgramResponse): Program {
  const weeks: ProgramWeek[] = []
  const blocks: ProgramBlock[] = []

  for (const b of p.blocks ?? []) {
    const blockWeeks = (b.weeks ?? []).map(mapWeek).sort((a, z) => a.sequence - z.sequence)
    weeks.push(...blockWeeks)
    const seqs = blockWeeks.map((w) => w.sequence)
    blocks.push({
      id: b.id ?? "",
      sequence: b.sequence ?? 0,
      name: b.name ?? null,
      weekStart: seqs.length ? Math.min(...seqs) : 0,
      weekEnd: seqs.length ? Math.max(...seqs) : 0,
    })
  }

  weeks.sort((a, z) => a.sequence - z.sequence)
  blocks.sort((a, z) => a.sequence - z.sequence)

  return {
    id: p.id ?? "",
    name: p.name ?? "",
    startDate: p.startDate ?? undefined,
    weeks,
    blocks,
  }
}
