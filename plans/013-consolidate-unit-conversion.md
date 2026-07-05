# Plan 013: Consolidate the kg↔lb conversion into one units module

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/lib/program-mapper.ts frontend/src/lib/session-metrics.ts frontend/src/components/workout/use-cell-logging.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Note: plans 001/002 legitimately
> touch `use-cell-logging.ts`(+ its test file); if they landed, only their
> hunks should be present.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — pure refactor; every conversion must stay **numerically
  identical**, which the existing tests (and plan 001's, if landed) enforce.
- **Depends on**: none strictly; if plan 001's test file exists, it is an
  extra safety net — run it.
- **Category**: tech-debt
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The kg↔lb boundary is implemented three separate times, and one copy's name
is inverted: `program-mapper.ts` defines `KG_PER_LB = 2.20462` — but 2.20462
is *pounds per kilogram*, not kilograms per pound — and builds `KG_TO_LB` /
`LB_TO_KG` from it; `session-metrics.ts` re-declares `KG_TO_LB = 2.20462`;
`use-cell-logging.ts` inlines `kg * 2.20462` a third time. The math is
currently consistent, but three independent copies of a unit boundary (one
misnamed) is exactly how a future edit corrupts volume math in one place and
not the others. One `lib/units.ts` module ends that — and becomes the seam
where a metric/imperial user preference (already in the schema and `/api/me`;
see Direction notes in `plans/README.md`) would plug in later.

## Current state

- `frontend/src/lib/program-mapper.ts:15–20`:

```ts
const KG_PER_LB = 2.20462
const KG_TO_LB = (kg: number) => Math.round(kg * KG_PER_LB)
// Used by callers (e.g. the cell-edit mutation) that need to convert user-
// entered lb input back to kg before sending to the API. Not rounded — the
// backend column is numeric(7,2).
export const LB_TO_KG = (lb: number) => lb / KG_PER_LB
```

  (`KG_TO_LB` is module-private here, used at lines 46 and 56.)

- `frontend/src/lib/session-metrics.ts:6` and its use at line 21:

```ts
const KG_TO_LB = 2.20462
// ...
        total += kg * KG_TO_LB * reps
```

- `frontend/src/components/workout/use-cell-logging.ts:99–101`:

```ts
// KG_PER_LB inverse for display; kept here so we don't pull the program-mapper
// internal into the component file.
const KG_TO_LB_ROUND = (kg: number) => Math.round(kg * 2.20462)
```

  used at line 107; the same file imports `LB_TO_KG` from
  `@/lib/program-mapper` (line 6) and uses it at line 245:
  `Number(LB_TO_KG(lb).toFixed(2))`.

- Existing tests that pin conversion values: `program-mapper.test.ts` (29
  tests), `session-metrics.test.ts` (3), and — if plan 001 landed —
  `use-cell-logging.test.tsx` (asserts `225 lb → 102.06 kg` round-trips).

- Conventions: pure helpers live in `frontend/src/lib/`; tests alongside.

## Commands you will need

| Purpose   | Command (run in `frontend/`)                       | Expected on success |
|-----------|-----------------------------------------------------|---------------------|
| Tests     | `pnpm vitest run program-mapper session-metrics units` | all pass         |
| Cell tests| `pnpm vitest run use-cell-logging` (if plan 001 landed) | all pass        |
| All tests | `pnpm test`                                         | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`                 | exit 0              |

## Scope

**In scope**:
- `frontend/src/lib/units.ts` (create) + `frontend/src/lib/units.test.ts` (create)
- `frontend/src/lib/program-mapper.ts` (consume units.ts; keep re-export)
- `frontend/src/lib/session-metrics.ts` (consume units.ts)
- `frontend/src/components/workout/use-cell-logging.ts` (consume units.ts)

**Out of scope** (do NOT touch):
- Changing any conversion VALUE, rounding rule, or `toFixed` precision — this
  is a move, not a re-derivation.
- Backend units (canonical kg storage is correct and stays).
- Building the metric/imperial preference — that's the deferred direction
  item this refactor merely enables.

## Git workflow

- Branch: `advisor/013-units-module`
- Commit style: `refactor(frontend): single source of truth for kg↔lb conversion`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the units module

`frontend/src/lib/units.ts`:

```ts
// The single kg↔lb boundary. The backend stores loads in kg (numeric(7,2));
// the UI is currently imperial-only, so every kg value converts here at the
// edge. If a per-user unit preference ever ships (users.unit_preference is
// already in the schema and /api/me), this module is where it plugs in.
export const LB_PER_KG = 2.20462

// Display direction: kg → whole pounds (matches how prescriptions render,
// e.g. "300lb").
export const kgToLbRounded = (kg: number) => Math.round(kg * LB_PER_KG)

// Write direction: user-entered lb → kg for the API. Not rounded — callers
// apply their own precision (the backend column is numeric(7,2)).
export const lbToKg = (lb: number) => lb / LB_PER_KG

// Volume math direction: exact (unrounded) kg → lb, for summing tonnage.
export const kgToLbExact = (kg: number) => kg * LB_PER_KG
```

`frontend/src/lib/units.test.ts` — pin the exact current behavior:

- `kgToLbRounded(102.06)` → `225`
- `lbToKg(225)` → `102.05913...`; `Number(lbToKg(225).toFixed(2))` → `102.06`
- `kgToLbExact(100)` → `220.462`
- Round-trip: `kgToLbRounded(Number(lbToKg(315).toFixed(2)))` → `315`

### Step 2: Switch the three consumers

1. `program-mapper.ts`: delete `KG_PER_LB` and the local `KG_TO_LB`/`LB_TO_KG`
   definitions; `import { kgToLbRounded, lbToKg } from "./units"`; replace the
   two `KG_TO_LB(...)` call sites (lines 46, 56) with `kgToLbRounded(...)`.
   **Keep the existing export name alive** so importers don't all churn in
   this plan: `export const LB_TO_KG = lbToKg` with a comment
   `// Back-compat alias; new code imports lbToKg from "./units".`
2. `session-metrics.ts`: delete the local constant; use
   `kgToLbExact(kg) * reps` (import from `./units`).
3. `use-cell-logging.ts`: delete `KG_TO_LB_ROUND` (lines 99–101) and its
   comment; `import { kgToLbRounded } from "@/lib/units"`; replace the use at
   line 107. Leave the `LB_TO_KG` import from program-mapper as-is (the alias
   keeps it working) OR switch it to `lbToKg` from units — prefer the switch,
   it's one line.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0 (no unused
imports left behind).

### Step 3: Prove numeric identity

**Verify**: `pnpm vitest run program-mapper session-metrics units` → all
pass with zero modifications to the existing assertions in
`program-mapper.test.ts` / `session-metrics.test.ts`. If any existing
assertion needs changing, you changed behavior — STOP.

**Verify** (if `use-cell-logging.test.tsx` exists from plan 001):
`pnpm vitest run use-cell-logging` → all pass unmodified.

### Step 4: Full pass + duplication sweep

```
grep -rn "2\.20462" frontend/src --include="*.ts*" | grep -v "lib/units" | grep -v test
```

→ no output (the constant now lives in exactly one non-test source file).

**Verify**: `pnpm test` → all pass.

## Test plan

- New: `units.test.ts` (4 cases above) — pattern: `session-metrics.test.ts`.
- Regression: `program-mapper.test.ts`, `session-metrics.test.ts`, and (if
  present) `use-cell-logging.test.tsx` pass **without edits**.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `frontend/src/lib/units.ts` exists; the Step 4 grep returns no output
- [ ] `grep -n "KG_PER_LB\|KG_TO_LB_ROUND" frontend/src -r --include="*.ts*"` → no matches outside tests
- [ ] All existing conversion tests pass unmodified; `units.test.ts` passes
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any pre-existing test assertion needs to change to pass — the refactor
  altered a value; report the delta instead of updating the test.
- `LB_TO_KG` turns out to have importers beyond `use-cell-logging.ts`
  (`grep -rn "LB_TO_KG" frontend/src`) that the alias doesn't cover cleanly.
- Plans 001/002 are IN PROGRESS on `use-cell-logging.ts` concurrently —
  coordinate order instead of merging by hand.

## Maintenance notes

- The metric/imperial preference feature (Direction notes, `plans/README.md`)
  should extend `units.ts` (e.g. `formatLoad(kg, pref)`) rather than adding
  call-site branches.
- The `LB_TO_KG` back-compat alias in program-mapper can be dropped in any
  later cleanup once nothing imports it.
- Reviewer scrutiny: the diff should contain no numeric literal changes —
  only moves and renames.
