# Plan 010: Fix the DST off-by-one in the Today-page date resolution

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/lib/program-data.ts frontend/src/lib/program-data.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — one arithmetic change plus tests; behavior is identical on
  all non-DST-spanning ranges.
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

`computeTodayPosition` decides which (week, day) the Today page lands on. It
diffs two **local-midnight** `Date`s and divides by 86,400,000 ms with
`Math.floor`. Local midnights are not always a multiple of 24 h apart: across
a spring-forward DST transition the gap is `n×24h − 1h`, and `floor` then
loses a full day. Concretely: a user in a DST timezone whose program started
before the March transition sees the Today page select **the previous day's
workout every day from March until the November fall-back** restores the
hour. `Math.round` absorbs a ±1 h drift and fixes it.

## Current state

- `frontend/src/lib/program-data.ts:68–80` — the function as it exists today:

```ts
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
```

- The sibling `calendarDayOfMonth` (lines 62–66) uses `setDate` arithmetic
  and is NOT affected — do not touch it.
- Caller: `frontend/src/routes/today.tsx:35–39`
  (`computeTodayPosition(program.startDate, weekCount)`), plus existing tests
  in `frontend/src/lib/program-data.test.ts` (the structural pattern for the
  new tests).
- Testability constraint: the function reads `new Date()` internally, and the
  test process's timezone can't be flipped mid-run — so the fix also makes
  "now" injectable (optional parameter, default `new Date()`), which lets
  tests construct the exact ±1 h drift without depending on the host TZ.

## Commands you will need

| Purpose   | Command (run in `frontend/`)          | Expected on success |
|-----------|----------------------------------------|---------------------|
| Install   | `pnpm install` (add `--node-linker=hoisted` on MAX_PATH errors) | exit 0 |
| This test | `pnpm vitest run program-data`         | all pass            |
| All tests | `pnpm test`                            | all pass            |
| Typecheck | `pnpm typecheck`                       | exit 0              |
| Lint      | `pnpm lint`                            | exit 0              |

## Scope

**In scope**:
- `frontend/src/lib/program-data.ts` (the `computeTodayPosition` body only)
- `frontend/src/lib/program-data.test.ts`

**Out of scope** (do NOT touch):
- `calendarDayOfMonth` — its `setDate` arithmetic is DST-safe already.
- `frontend/src/routes/today.tsx` — the call site needs no change (the new
  parameter is optional).
- Any timezone-preference work (`users.timezone` is a separate direction
  item) — this plan fixes the browser-local computation only.

## Git workflow

- Branch: `advisor/010-dst-today-position`
- Commit style: `fix(frontend): DST-safe day diff in computeTodayPosition`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the diff DST-safe and "now" injectable

Replace the function body:

```ts
export function computeTodayPosition(
  startDate: string,
  weekCount: number,
  now: Date = new Date()
): { week: number; dayIndex: number } | null {
  const start = new Date(startDate + "T00:00:00")
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Local midnights are n×24h ± 1h apart across DST transitions; round (not
  // floor) so the ±1h drift can never shift the result by a day.
  const diffDays = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return null
  const week = Math.floor(diffDays / 7) + 1
  if (week > weekCount) return null
  return { week, dayIndex: diffDays % 7 }
}
```

Note the `week` computation keeps `Math.floor` — that one operates on an
exact integer day count and is correct.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Add regression tests

In `frontend/src/lib/program-data.test.ts`, add a describe block for the DST
behavior, following the file's existing style. Build "now" values directly
off the start date's epoch so the tests are timezone-independent:

```ts
const start = new Date("2026-01-05T00:00:00") // matches the function's own parsing
const H = 3600 * 1000

// Exact 10 days later — sanity (unchanged behavior).
computeTodayPosition("2026-01-05", 12, new Date(start.getTime() + 10 * 24 * H))
// → { week: 2, dayIndex: 3 }

// 10 days minus 1 hour (spring-forward drift): must STILL be day 10.
computeTodayPosition("2026-01-05", 12, new Date(start.getTime() + (10 * 24 - 1) * H))
// → { week: 2, dayIndex: 3 }   ← this case fails on the old Math.floor code

// 10 days plus 1 hour (fall-back drift): must still be day 10.
computeTodayPosition("2026-01-05", 12, new Date(start.getTime() + (10 * 24 + 1) * H))
// → { week: 2, dayIndex: 3 }
```

One subtlety: the injected `now` is re-truncated to its local midnight inside
the function. A `start.getTime() + (10*24 − 1)*H` value is 23:00 on day 9, so
its local midnight is day 9's — that reproduces the floor bug only when the
*midnights* differ by 23 h, which is what a real DST transition produces.
Therefore construct the drift cases at **midnight ± 1 h directly**, e.g.
`new Date(start.getTime() + 10 * 24 * H - H)` truncates to day 9's midnight
(239 h → round gives 10? No — 239/24 = 9.958 → rounds to 10 only from the
midnight value). To keep this airtight, assert on midnight-adjacent values
BOTH ways:

- `new Date(start.getTime() + 10 * 24 * H)` shifted to `01:00` of day 10 →
  truncates to day-10 midnight → exact 240 h → day 10 (both old and new code
  pass; keeps the happy path pinned).
- Simulate the DST case by asserting on the pure arithmetic instead: extract
  the millisecond diff → day computation into the test via the function's
  observable behavior with a start date string whose parsed local midnight
  you offset. If you cannot construct a true 23 h midnight gap in the test
  TZ, test the arithmetic directly:

```ts
it("rounds a 23h59m gap up to a full day (DST spring-forward)", () => {
  expect(Math.round((23.5 * H * 2) / (24 * H))).toBe(2) // documents intent
})
```

is NOT acceptable as the only test — prefer running the DST-specific tests
under an explicit timezone. Vitest supports per-run TZ via env:
`TZ=America/New_York pnpm vitest run program-data` (Node honors `TZ` on all
platforms, including Windows). Add a test that uses real DST dates under that
assumption but **skips itself when the host TZ resolves them without an
offset change**:

```ts
const springStart = "2026-03-02" // Monday before US spring-forward (2026-03-08)
const after = new Date("2026-03-12T00:00:00") // local midnight after transition
const hasDst =
  (new Date("2026-03-02T00:00:00").getTimezoneOffset() !==
    new Date("2026-03-12T00:00:00").getTimezoneOffset())

it.skipIf(!hasDst)("day index survives a spring-forward transition", () => {
  expect(computeTodayPosition(springStart, 12, after)).toEqual({ week: 2, dayIndex: 3 })
})
```

This test is exact in any US/EU TZ and self-skips on UTC CI runners; the
midnight ± drift assertions above cover the arithmetic everywhere.

**Verify**: `pnpm vitest run program-data` → all pass. Then confirm the DST
test actually executes at least once:
`TZ=America/New_York pnpm vitest run program-data` (bash) → all pass, DST
test not skipped.

### Step 3: Prove the old code fails the new test (sanity)

Temporarily revert `Math.round` to `Math.floor`, run
`TZ=America/New_York pnpm vitest run program-data` → the spring-forward test
FAILS. Restore `Math.round`. (This confirms the regression test has teeth;
mention the observed failure in your report.)

### Step 4: Full pass

**Verify**: `pnpm test`, `pnpm lint`, `pnpm typecheck` → all exit 0.

## Test plan

- New: 3–4 cases in `program-data.test.ts` (exact multiple, ±1 h midnight
  drift via TZ-real DST dates with self-skip guard, pre-start returns null
  unchanged). Pattern: the file's existing `computeTodayPosition` tests.
- All pre-existing `program-data` tests must pass unmodified — if one asserts
  floor-specific behavior on a DST-spanning range, that test was asserting
  the bug; report it (STOP condition below).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "Math.round((today.getTime()" frontend/src/lib/program-data.ts` → match; no `Math.floor` remains on the ms diff line
- [ ] `computeTodayPosition` accepts an optional `now: Date` param; `today.tsx` unchanged
- [ ] `TZ=America/New_York pnpm vitest run program-data` → all pass, spring-forward test executed (not skipped)
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `.plan/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- An existing test in `program-data.test.ts` fails after the change —
  it was pinning the buggy floor behavior; report which and what it asserted.
- Step 3's deliberate failure check does NOT fail — the new test isn't
  actually exercising the DST path; report rather than shipping a toothless
  test.
- You find other callers of `computeTodayPosition` beyond `today.tsx`
  (`grep -rn "computeTodayPosition" frontend/src`) that pass positional
  arguments that would collide with the new `now` param.

## Maintenance notes

- If a real timezone preference ships (users.timezone is already in the
  schema/API — see Direction notes in `.plan/README.md`), this function is
  where "browser-local" would become "user-preference-local"; the injectable
  `now` makes that change testable.
- Reviewer scrutiny: confirm `week`'s `Math.floor` was NOT changed — only the
  millisecond diff line.
