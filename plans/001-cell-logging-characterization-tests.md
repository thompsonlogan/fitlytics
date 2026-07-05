# Plan 001: Characterization tests for the workout cell-logging hook

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/components/workout/use-cell-logging.ts frontend/src/hooks/use-session.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (test-only change; no production code modified)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

`frontend/src/components/workout/use-cell-logging.ts` (389 lines) is the most
complex client-side logic in the repo: a debounced optimistic tri-state machine
for set completion, lb→kg conversion on blur, and per-cell error mapping. It has
**zero tests**, while far simpler hooks (`use-session.ts`, `use-auth.ts`) are
covered. Plan 002 will change how auth errors surface through this hook's error
paths, so its current behavior must be pinned down first. These are
characterization tests: they document what the code does today so regressions
in later plans are caught mechanically.

## Current state

Relevant files:

- `frontend/src/components/workout/use-cell-logging.ts` — the hook under test.
  Exports `buildBlockIndex`, `findBlockLogs`, and `useCellLogging`.
- `frontend/src/hooks/use-session.ts` — provides `useLogSet` / `useLogSetBatch`
  whose return types the hook receives as options (only `mutateAsync` is used).
- `frontend/src/hooks/use-session.test.tsx` — the structural pattern to follow
  (vitest + `renderHook` from `@testing-library/react`, small `makeX` factory
  helpers).
- `frontend/src/services/generated/runtime.ts` — exports `ResponseError`
  (constructor: `new ResponseError(response: Response, msg?: string)`).

Key excerpts from `use-cell-logging.ts` as of `84d129d`:

Debounce constant and error classification (lines 16, 46–48):

```ts
const SET_STATE_DEBOUNCE_MS = 500
// ...
function is4xx(err: unknown): err is ResponseError {
  return err instanceof ResponseError && err.response.status >= 400 && err.response.status < 500
}
```

The hook's options type (lines 115–121):

```ts
type UseCellLoggingOpts = {
  blockLogsByKey: Map<string, SetLogResponse[]>
  initialCompleted: Record<string, boolean>
  ensureSession: () => Promise<SessionResponse | null>
  logSet: ReturnType<typeof useLogSet>
  logSetBatch: ReturnType<typeof useLogSetBatch>
}
```

`blurLoad` fans one lb value out to every set in the block, converting to kg
(lines 244–248):

```ts
      // Fan the load out to every set in the block.
      const actualLoadKg = Number(LB_TO_KG(lb).toFixed(2))
      await logSetBatch.mutateAsync({
        updates: logs.map((log) => ({ setLogId: log.id!, body: { actualLoadKg } })),
      })
```

`blurRpe` writes only to the **last** set of the block (lines 262–287).
On error, both blur handlers do (lines 250–258, blurRpe mirrors it):

```ts
    } catch (err) {
      const apiMsg = await readApiErrorMessage(err)
      if (is4xx(err)) {
        setErr(`${key}:load`, apiMsg ?? "Invalid value")
      } else {
        toast.error("Couldn't save load. Check your connection and try again.")
      }
      clearEdit("load", key)
    }
```

`cycleSet` advances pending → completed → skipped → pending per click, tracks
the intended final state in a ref, and debounces the PATCH 500 ms; if the user
cycles back to the server state, no request fires (lines 305–355).

`buildBlockIndex` groups each exercise's set logs by `groupId`; logs with a
null `groupId` each get a synthetic `__nogroup_N` key so they stand alone
(lines 55–80). Keys are `${exerciseIdx}-${blockIdx}`, 0-based.

Editors validate input before accepting it (lines 204–220): `editLoad` only
accepts `/^\d{1,4}$/` or empty; `editRpe` only accepts integers 1–10 or empty.

Repo conventions that apply:

- Vitest + Testing Library; `describe`/`it`/`expect` are globals (configured in
  `frontend/vite.config.ts` — no per-file imports needed, though existing tests
  import them explicitly from `vitest`; match `use-session.test.tsx` and import
  explicitly).
- Test files live alongside the code: the new file is
  `frontend/src/components/workout/use-cell-logging.test.tsx`.
- Factory helpers at the top of the file (`makeSetLog`, `makeSession`, …) —
  copy the shapes from `use-session.test.tsx:14–24`.
- `sonner`'s `toast` must be mocked when asserting toast calls:
  `vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))`.

## Commands you will need

| Purpose   | Command (run in `frontend/`)             | Expected on success |
|-----------|------------------------------------------|---------------------|
| Install   | `pnpm install`                           | exit 0              |
| Typecheck | `pnpm typecheck`                         | exit 0              |
| This test | `pnpm vitest run use-cell-logging`       | all pass            |
| All tests | `pnpm test`                              | all pass            |
| Lint      | `pnpm lint`                              | exit 0              |

Note (Windows / agent worktrees): if `pnpm install` fails with MAX_PATH
errors in a fresh worktree, re-run as
`pnpm install --node-linker=hoisted`.

## Scope

**In scope** (the only files you should create/modify):
- `frontend/src/components/workout/use-cell-logging.test.tsx` (create)

**Out of scope** (do NOT touch):
- `frontend/src/components/workout/use-cell-logging.ts` — this plan pins
  behavior; it must not change it. If a test can only pass by editing the hook,
  the test is wrong or you found a real bug — STOP and report.
- `frontend/src/hooks/use-session.ts` and its test file.
- Anything under `frontend/src/services/generated/` (generated code).

## Git workflow

- Branch: `advisor/001-cell-logging-tests`
- Commit style (from `git log`): `test(frontend): characterization tests for use-cell-logging`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the test scaffolding

Create `frontend/src/components/workout/use-cell-logging.test.tsx` with:

- `vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))` at the top
  (before imports are hoisted — vitest hoists `vi.mock` automatically).
- Factory helpers modeled on `use-session.test.tsx:14–24`:
  `makeSetLog(id, opts?: { state?: string; groupId?: string; actualLoadKg?: number; actualRpe?: number })`,
  `makeExercise(setLogs)`, `makeSession(id, exercises)`.
- A `makeHook` helper that calls `renderHook(() => useCellLogging({...}))`
  with: a `blockLogsByKey` map built via `buildBlockIndex(session)`,
  `initialCompleted: {}`, an `ensureSession` stub resolving to the session, and
  fake mutations:

```ts
const logSetBatch = { mutateAsync: vi.fn().mockResolvedValue([]) } as unknown as
  ReturnType<typeof useLogSetBatch>
const logSet = { mutateAsync: vi.fn().mockResolvedValue({}) } as unknown as
  ReturnType<typeof useLogSet>
```

- A helper to build a `ResponseError` with a real body, for the error-path
  tests:

```ts
function makeResponseError(status: number, body?: unknown): ResponseError {
  return new ResponseError(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  )
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Test `buildBlockIndex`

Pure-function tests (no `renderHook` needed):

1. Logs sharing a `groupId` land under one `${exIdx}-${blIdx}` key, in input
   order.
2. Two distinct groupIds on one exercise produce keys `0-0` and `0-1` in
   first-seen order.
3. Logs with null/undefined `groupId` each get their own block (three
   groupless logs → keys `0-0`, `0-1`, `0-2`, one log each).
4. `buildBlockIndex(null)` and `buildBlockIndex(undefined)` → empty Map.
5. Second exercise's blocks are keyed `1-0`, `1-1`, …

**Verify**: `pnpm vitest run use-cell-logging` → these tests pass.

### Step 3: Test the derived `cellState` / `completed` maps

Through `renderHook`:

1. A block whose logs are all `state: "completed"` → `cellState["0-0"] === "completed"` and `completed["0-0"] === true`.
2. All `"skipped"` → `"skipped"`, `completed` false.
3. Mixed states → `"pending"`.
4. A log with `state: undefined` → treated as pending (block state `"pending"`).

### Step 4: Test `cycleSet` debounce + fan-out

Use `vi.useFakeTimers()` (restore with `vi.useRealTimers()` in `afterEach`).
Wrap state-changing calls in `act(...)`.

1. **Single click on a pending block**: `cycleSet("0-0")` → immediately
   `cellState["0-0"] === "completed"` (optimistic); after
   `await vi.advanceTimersByTimeAsync(500)`, `logSetBatch.mutateAsync` was
   called once with one update per log in the block, each
   `body: { state: "completed" }`.
2. **Three rapid clicks** (pending → completed → skipped → pending): after
   advancing 500 ms, `logSetBatch.mutateAsync` was **not** called (desired
   state equals server state) and the local override is dropped
   (`cellState["0-0"] === "pending"`).
3. **Two clicks** (→ completed → skipped): exactly one `mutateAsync` call with
   `state: "skipped"`.
4. **Failure path**: `logSetBatch.mutateAsync` rejects → after the timer, the
   optimistic override is dropped and `toast.error` was called once.

Note: the 500 ms constant is `SET_STATE_DEBOUNCE_MS` in the hook — if you need
it in assertions, hardcode 500 with a comment, don't export it.

### Step 5: Test `blurLoad`

1. **Happy path**: block of 2 logs, `blurLoad("0-0", "225")` →
   `logSetBatch.mutateAsync` called with 2 updates, each
   `actualLoadKg === Number((225 / 2.20462).toFixed(2))` (= `102.06`).
2. **No-op**: value equals the currently persisted display value → no call.
   (Persisted display value is `Math.round(actualLoadKg * 2.20462)` of the
   block's **first** log.)
3. **Empty value** → no call.
4. **4xx error**: `mutateAsync` rejects with
   `makeResponseError(400, { error: "actual_load_kg out of range" })` →
   `cellErrors["0-0:load"] === "actual_load_kg out of range"`, no toast.
5. **Network error**: rejects with `new TypeError("fetch failed")` →
   `toast.error` called, `cellErrors` stays empty.
6. **Characterize current 401 behavior**: rejects with
   `makeResponseError(401)` → lands in `cellErrors["0-0:load"]` as
   `"Invalid value"`. Mark this test with a comment:
   `// NOTE: plan 002 changes 401 handling — update this test when it lands.`

### Step 6: Test `blurRpe`

1. **Happy path**: block of 3 logs → `logSet.mutateAsync` called once with the
   **last** log's id and `body: { actualRpe: 8 }`.
2. **No-op** when the value matches the last log's persisted `actualRpe`.
3. Error paths: one 4xx → `cellErrors["0-0:rpe"]`; one non-4xx → toast.

### Step 7: Test the input editors

1. `editLoad` rejects `"12345"` (5 digits) and `"1a"` — `loadEdits` unchanged.
2. `editRpe` rejects `"11"` and `"0"`; accepts `"10"`, `"7"`, and `""`.

### Step 8: Full-suite pass

**Verify**: `pnpm test` → all pass (13 pre-existing test files + the new one).
**Verify**: `pnpm lint` → exit 0.
**Verify**: `pnpm typecheck` → exit 0.

## Test plan

This plan IS the test plan. Expected shape: ~20 new `it` blocks in
`use-cell-logging.test.tsx`, modeled structurally on
`frontend/src/hooks/use-session.test.tsx`. All async interactions through
`act`/`waitFor`; fake timers only in the `cycleSet` describe block.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `frontend/src/components/workout/use-cell-logging.test.tsx` exists with ≥ 18 passing tests
- [ ] `pnpm test` (in `frontend/`) exits 0
- [ ] `pnpm typecheck` exits 0; `pnpm lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] The 401 characterization test contains the plan-002 note comment
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above don't match `use-cell-logging.ts` (drift).
- A test can only be made to pass by modifying `use-cell-logging.ts` — that's
  either a wrong test or a discovered bug; report which behavior diverged.
- Fake-timer tests are flaky across two consecutive full runs.
- `pnpm install` fails even with `--node-linker=hoisted`.

## Maintenance notes

- Plan 002 (session-refresh middleware) changes 401 classification; the marked
  test in Step 5 must be updated there, not deleted.
- If the debounce window or the CYCLE_NEXT order changes, Step 4's tests fail
  by design — that's the characterization working.
- Deferred: tests for `useDayBoard` (wiring hook). It's mostly composition;
  cover it if/when its logic grows.
