# Plan 019: Keep reps numeric in the view model; format at render

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/lib/program-data.ts frontend/src/lib/program-mapper.ts frontend/src/components/workout/workout-table.tsx frontend/src/components/workout/mobile-exercise-card.tsx frontend/src/components/workout/next-session-card.tsx frontend/src/components/workout/video-upload-dialog.tsx`
> `program-mapper.ts` will have drifted if plan 013 landed (expected — it's
> a prerequisite). Compare the "Current state" excerpts for the parts this
> plan touches; on an unexplained mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED — touches the view-model type consumed by five files;
  the subtle part is preserving `plannedVolume` behavior exactly (see
  Step 3's null-min rule). The existing test suites gate it.
- **Depends on**: 013 (same file: `program-mapper.ts`)
- **Category**: tech-debt
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The program mapper renders reps into a **display string** at map time
(`"6–10"`), storing presentation output in the data model — and then the
volume math in `program-data.ts` has to **parse the string back** with
`parseInt(reps.split(/[–-]/)[0])` to recover the number it started from.
That format→parse round-trip inside one layer is fragile (it silently
depends on an en-dash) and backwards: view models should carry data;
rendering should format. This plan stores `repsMin`/`repsMax` numerically in
`SetBlock` and formats at the four render sites via one exported helper.
Rendered output and volume numbers must be **byte-identical** before/after.

## Current state

- `frontend/src/lib/program-data.ts:6–23` — the view-model type:

```ts
export type SetBlock = {
  id: string
  sets: number
  reps: string
  intensity: string
  ...
```

  and the parse-back (lines 139–144, used by `plannedVolume` at 154):

```ts
// repsLowerBound pulls the conservative rep count out of a SetBlock's display
// string ("3" → 3, "6–10" → 6). Used for planned-volume math, which multiplies
// load × reps × sets. Returns 0 when the string carries no number.
function repsLowerBound(reps: string): number {
  return parseInt(String(reps).split(/[–-]/)[0], 10) || 0
}
```

- `frontend/src/lib/program-mapper.ts:28–34, 51` — the formatter and its use:

```ts
function formatReps(min: number | null | undefined, max: number | null | undefined): string {
  const lo = min ?? undefined
  const hi = max ?? undefined
  if (lo == null && hi == null) return ""
  if (lo != null && hi != null && lo !== hi) return `${lo}–${hi}`
  return String(lo ?? hi)
}
// ... in mapGroup:
    reps: formatReps(first?.repsMin, first?.repsMax),
```

- **All four render sites of `block.reps`** (found by grep at planning time —
  re-run `grep -rn "block.reps\|row.block.reps" frontend/src` to confirm):
  - `workout-table.tsx:117` — column accessor `(row) => row.block.reps`
  - `mobile-exercise-card.tsx:104` — `{block.reps}`
  - `next-session-card.tsx:19` — `` `${block.sets}×${block.reps}` ``
  - `video-upload-dialog.tsx:147` — `<ContextCell label="Reps" value={block.reps} />`
  (`landing/mock-table.tsx` has its own hardcoded `row.reps` mock data —
  NOT a consumer of `SetBlock`; leave it alone.)

- Tests pinning current behavior: `program-mapper.test.ts` (asserts
  `.reps === "3"`, `"6–10"`, `""` at lines 33/37/41/265) and
  `program-data.test.ts` (plannedVolume etc.). Mapper test assertions WILL
  change shape (string → numbers); program-data volume assertions must NOT
  change values.

- **Behavior subtlety that must be preserved**: today, a set with
  `repsMin = null, repsMax = 10` formats to `"10"`, and `repsLowerBound`
  then parses `10` — i.e. the volume math uses **max when min is absent**.
  The numeric replacement must be `repsMin ?? repsMax ?? 0`, NOT
  `repsMin ?? 0`.

## Commands you will need

| Purpose   | Command (run in `frontend/`)                     | Expected on success |
|-----------|---------------------------------------------------|---------------------|
| Key tests | `pnpm vitest run program-data program-mapper`     | all pass            |
| All tests | `pnpm test`                                       | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`               | exit 0              |

## Scope

**In scope**:
- `frontend/src/lib/program-data.ts` (type + volume math + move `formatReps` here, exported)
- `frontend/src/lib/program-mapper.ts` (map numbers, stop formatting)
- `frontend/src/components/workout/workout-table.tsx`
- `frontend/src/components/workout/mobile-exercise-card.tsx`
- `frontend/src/components/workout/next-session-card.tsx`
- `frontend/src/components/workout/video-upload-dialog.tsx`
- `frontend/src/lib/program-mapper.test.ts`, `frontend/src/lib/program-data.test.ts`

**Out of scope** (do NOT touch):
- `landing/mock-table.tsx` (self-contained marketing mock).
- Session `SetLogResponse.repsTargetMin/Max` — untouched; this plan is the
  program view model only.
- Any visual change — rendered strings must be identical (same en-dash).

## Git workflow

- Branch: `advisor/019-numeric-reps`
- Commit style: `refactor(frontend): numeric reps in the program view model`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Change the view-model type and move the formatter

In `program-data.ts`:

1. Replace `reps: string` in `SetBlock` with:

```ts
  // Prescribed rep range, numeric. Rendered by formatReps at display time —
  // kept numeric here so volume math never parses a display string.
  repsMin: number | null
  repsMax: number | null
```

2. Move `formatReps` here from the mapper, exported, same logic (returns
   `""` / `"3"` / `"6–10"` with the en-dash).
3. Replace `repsLowerBound` + its use in `plannedVolume`:

```ts
    // Lower-bound reps: min when prescribed, else max (a bare "10" rep
    // target has 10 as its only bound), else 0 — matches the old
    // parse-from-display behavior exactly.
    const reps = r.block.repsMin ?? r.block.repsMax ?? 0
    return sum + load * reps * r.block.sets
```

   Delete `repsLowerBound` entirely.

### Step 2: Map numbers instead of strings

In `program-mapper.ts`'s `mapGroup`: replace
`reps: formatReps(first?.repsMin, first?.repsMax),` with

```ts
    repsMin: first?.repsMin ?? null,
    repsMax: first?.repsMax ?? null,
```

and delete the local `formatReps` (now lives in `program-data.ts`).

**Verify**: `pnpm typecheck` → FAILS listing exactly the render sites and
tests still using `.reps` — that's the worklist for Steps 3–4.

### Step 3: Update the four render sites

Import `formatReps` from `@/lib/program-data` and format at render:

- `workout-table.tsx:117`: accessor becomes
  `(row) => formatReps(row.block.repsMin, row.block.repsMax)` (the column
  continues to receive a string; cell renderer unchanged).
- `mobile-exercise-card.tsx:104`: `{formatReps(block.repsMin, block.repsMax)}`.
- `next-session-card.tsx:19`: `` `${block.sets}×${formatReps(block.repsMin, block.repsMax)}` ``.
- `video-upload-dialog.tsx:147`: `value={formatReps(block.repsMin, block.repsMax)}`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Update the tests

1. `program-mapper.test.ts`: assertions on `.reps` become numeric —
   `expect(mapGroup({ sets: [{ repsMin: 6, repsMax: 10 }] })).toMatchObject({ repsMin: 6, repsMax: 10 })`
   etc. (lines 33/37/41/265 at planning time).
2. `program-data.test.ts`: add `formatReps` unit tests carrying over the
   display cases the mapper tests used to pin: `(3,3) → "3"`,
   `(6,10) → "6–10"` (assert the en-dash specifically), `(null,null) → ""`,
   `(null,10) → "10"`.
3. `program-data.test.ts` volume tests: fixture `SetBlock`s change shape
   (string → numbers) but every asserted **number must stay identical**. Add
   one new case pinning the null-min rule:
   `repsMin: null, repsMax: 10, prescribedLoad: 100, sets: 2` contributes
   `100 × 10 × 2 = 2000`.

**Verify**: `pnpm vitest run program-data program-mapper` → all pass.

### Step 5: Full pass

**Verify**: `pnpm test`, `pnpm lint`, `pnpm typecheck` → all exit 0.

## Test plan

Step 4 covers it: mapper assertions go numeric, `formatReps` display cases
move to `program-data.test.ts`, volume values unchanged plus the null-min
regression case.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "repsLowerBound\|reps: string" frontend/src/lib/program-data.ts` → no matches
- [ ] `grep -rn "formatReps" frontend/src --include="*.ts*" | grep -v test` → one definition (program-data) + four render-site imports/uses
- [ ] `pnpm vitest run program-data program-mapper` → all pass, incl. the en-dash and null-min cases
- [ ] All volume assertions in `program-data.test.ts` numerically unchanged
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 2 typecheck reveals `.reps` consumers beyond the four render
  sites + tests (the grep list drifted) — report the extra sites before
  widening scope.
- Any `plannedVolume`/`topSet` assertion needs a VALUE change to pass — the
  refactor altered the math; report the delta (the null-min rule in Step 1
  is the likely culprit).
- Plan 013 is not DONE (same-file conflict on `program-mapper.ts`).

## Maintenance notes

- If per-set rep prescriptions ever diverge within a group (today the block
  displays the FIRST set's range — pre-existing behavior, preserved), the
  numeric fields make a per-set display straightforward; the old string
  field would have blocked it.
- Plan 018 (required API fields) touches `program-mapper.ts` after this —
  the `first?.repsMin ?? null` pattern survives 018 unchanged since
  `repsMin` stays optional in the contract (it's a pointer field).
- Reviewer scrutiny: the en-dash. `"6–10"` uses U+2013, not a hyphen —
  the moved formatter and its test must keep it, or the UI subtly changes.
