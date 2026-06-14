# Plan 005: Test the critical frontend hooks (auth retry, day-completions, session boundary)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4b5ccda..HEAD -- frontend/src/hooks/`
> If any hook under `frontend/src/hooks/` changed, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.
>
> **Reconcile note (2026-06-14)**: re-based from `cb2af4b` to `4b5ccda`. Between
> those commits `use-session.ts` changed only inside `useLogSetBatch` (`log.id` →
> `log.id!` non-null assertions, from plan 012's type fixes) — that function is
> **out of scope** here. Everything this plan touches (`countPending`,
> `sessionQueryKey`, `useLogSet`'s boundary logic) is unchanged; the excerpts below
> still match the live code.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (adds tests; one tiny `export` is the only production change)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `cb2af4b`, 2026-06-14 (reconcile-refreshed to `4b5ccda`, 2026-06-14)

## Why this matters

Three hooks carry the app's trickiest, least-obvious logic and have **no tests**:
`fetchMe` (401 → silent refresh → retry, the whole auth-recovery path),
`useDayCompletions` (1-based API → 0-based UI index translation), and `useLogSet`
(the "only invalidate day-completions when the pending count crosses zero" boundary
optimization). A regression in any of these is silent: a broken refresh loops the
user to login, an off-by-one drops a "done" dot, a wrong boundary check leaves the
calendar stale. This plan locks the current behavior.

## Current state

**Test harness conventions** (copy them exactly):
- Vitest + Testing Library, jsdom. Globals (`describe/it/expect`) are on — no imports
  needed for them, but the existing files import them explicitly; match that.
- Hook tests use `renderHook` + `waitFor` from `@testing-library/react`, wrapped in a
  `QueryClientProvider` + `ServiceContext.Provider`. **Reference files**:
  `frontend/src/hooks/use-workout-program.test.tsx` (query hook + pure loader) and
  `frontend/src/hooks/use-set-videos.test.tsx` (mutation hook + `vi.spyOn(queryClient, "invalidateQueries")`).
- `ServiceContext` value shape is `{ apis: ServiceApis }`; `useServices()` returns
  `.apis`. So a provider value is `{ apis: { sessionsApi, authApi, ... } }`. Fakes are
  cast `as unknown as <Api>` since only a couple methods are implemented.
- `QueryClient` in tests is created with `defaultOptions: { queries: { retry: false }, mutations: { retry: false } }`.

**`frontend/src/hooks/use-auth.ts`** — `fetchMe(authApi)` is **already exported**:
```ts
export async function fetchMe(authApi: AuthApi): Promise<MeResponse | null> {
  try {
    return await authApi.apiMeGet()
  } catch (err) {
    if (!(err instanceof ResponseError) || err.response.status !== 401) throw err
    try { await authApi.authRefreshPost() } catch { return null }
    try { return await authApi.apiMeGet() }
    catch (retryErr) {
      if (retryErr instanceof ResponseError && retryErr.response.status === 401) return null
      throw retryErr
    }
  }
}
```
`ResponseError` is imported from `@/services/generated/runtime`. Construct one in a
test as `new ResponseError({ status: 401 } as unknown as Response, "Unauthorized")`.

**`frontend/src/hooks/use-day-completions.ts`** — `useDayCompletions(programId)` calls
`sessionsApi.apiProgramsIdDayCompletionsGet({ id })`, which returns rows of
`{ weekSequence, daySequence }`, and builds a `Record<string, boolean>` keyed
`${weekSequence}-${daySequence - 1}` (1-based API → 0-based UI), skipping rows where
either field is null. `dayCompletionsQueryKey` is exported.

**`frontend/src/hooks/use-session.ts`** — `useLogSet(programId, programDayId)` returns
a mutation. On success it splices the updated set log into the cached session, then —
**only when `vars.body.state` is defined AND the pending count crosses the 0 boundary**
— calls `queryClient.invalidateQueries({ queryKey: dayCompletionsQueryKey(programId) })`.
The pending count comes from a **module-private** `countPending(session)` that counts
set logs whose `state ?? "pending"` is `"pending"`. The mutation reads the session id
from the cache (`sessionQueryKey(programId, programDayId)`) at call time and PATCHes via
`sessionsApi.apiSessionsSessionIdSetLogsSetLogIdPatch`. `sessionQueryKey` is exported.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Run the new hook tests | `cd frontend && pnpm test -- src/hooks` | all pass |
| Typecheck | `cd frontend && pnpm typecheck` | exit 0 |
| Full test run | `cd frontend && pnpm test` | all pass |

> Windows note: if `pnpm test` errors with a path-length/MAX_PATH failure in a
> worktree, reinstall with `pnpm install --node-linker=hoisted` first. This is a
> local-only quirk; do not change test code to work around it.

## Scope

**In scope** (create unless noted):
- `frontend/src/hooks/use-auth.test.tsx` (create)
- `frontend/src/hooks/use-day-completions.test.tsx` (create)
- `frontend/src/hooks/use-session.test.tsx` (create)
- `frontend/src/hooks/use-session.ts` — **only** to add `export` in front of
  `function countPending` so it can be unit-tested directly. No other change.

**Out of scope** (do NOT touch):
- Any other production logic in the hooks. If a test reveals a real bug, STOP and
  report it; do not fix it here.
- `useLogSetBatch`'s hand-rolled fetch — that's plan 009.
- Component tests — separate effort.

## Git workflow

- Branch: `advisor/005-frontend-hook-tests`
- Commit message style: conventional commits, e.g.
  `test(hooks): cover fetchMe retry, day-completion mapping, log-set boundary`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: `use-auth.test.tsx` — the auth recovery path (pure function, do first)

Create `frontend/src/hooks/use-auth.test.tsx`. Import `fetchMe` from `./use-auth` and
`ResponseError` from `@/services/generated/runtime`. Build a fake `AuthApi` with
`vi.fn()` methods, cast `as unknown as AuthApi`. Cover:

1. **Happy path**: `apiMeGet` resolves a `MeResponse` → `fetchMe` returns it;
   `authRefreshPost` is never called.
2. **401 then refresh+retry succeed**: first `apiMeGet` rejects with a 401
   `ResponseError`, `authRefreshPost` resolves, second `apiMeGet` resolves → returns
   the me object.
3. **401 then refresh fails** → returns `null`.
4. **401 → refresh ok → retry still 401** → returns `null`.
5. **Non-401 error** (e.g. a plain `Error` or a 500 `ResponseError`) → `fetchMe` rejects
   (assert with `await expect(fetchMe(api)).rejects`).

Make `apiMeGet` return different values on successive calls with
`vi.fn().mockRejectedValueOnce(...).mockResolvedValueOnce(...)`.

**Verify**: `cd frontend && pnpm test -- use-auth` → all pass.

### Step 2: `use-day-completions.test.tsx` — index translation

Create `frontend/src/hooks/use-day-completions.test.tsx`. Use the `renderHook` +
provider wrapper pattern from `use-workout-program.test.tsx`, supplying a fake
`sessionsApi` whose `apiProgramsIdDayCompletionsGet` resolves a fixed rows array.
Cover:

1. Rows `[{weekSequence:4, daySequence:2}, {weekSequence:1, daySequence:1}]` →
   resulting record has keys `"4-1"` and `"1-0"` set to `true` (daySequence−1).
2. A row with `daySequence == null` (or `weekSequence == null`) is **skipped** (no key).
3. Empty rows → empty record `{}`.
4. (Optional) `dayCompletionsQueryKey("p")` equals `["day-completions", "p"]`.

Wait for the query with `await waitFor(() => expect(result.current.isSuccess).toBe(true))`
then assert on `result.current.data`.

**Verify**: `cd frontend && pnpm test -- use-day-completions` → all pass.

### Step 3: `use-session.test.tsx` — boundary-crossing invalidation

First, in `frontend/src/hooks/use-session.ts`, add `export` before
`function countPending(` (the only production edit in this plan).

Then create `frontend/src/hooks/use-session.test.tsx`:

**3a — `countPending` unit tests** (now exported, pure):
- A session with two `"pending"` and one `"completed"` set log across exercises → `2`.
- `null`/`undefined` session → `0`.
- A set log with `state` undefined counts as pending (the `?? "pending"` default).

**3b — `useLogSet` invalidation boundary** (one representative integration test each
way). Build a `QueryClient`, `vi.spyOn(queryClient, "invalidateQueries")`, seed the
cache with a session via
`queryClient.setQueryData(sessionQueryKey("p", "d"), session)` where `session.id` is
set and it has exactly one `"pending"` set log. Provide a fake `sessionsApi` whose
`apiSessionsSessionIdSetLogsSetLogIdPatch` resolves the updated `SetLogResponse`.
Render `useLogSet("p", "d")` with the wrapper, then:

- **Crossing to zero invalidates**: mutate `{ setLogId, body: { state: "completed" } }`
  where the returned log flips the only pending set to `"completed"` (pending 1 → 0).
  After `await waitFor(() => expect(result.current.isSuccess).toBe(true))`, assert
  `invalidateQueries` was called with `{ queryKey: dayCompletionsQueryKey("p") }`.
- **Non-state edit does not invalidate**: seed the same one-pending session, mutate
  `{ setLogId, body: { actualLoadKg: 100 } }` (no `state`). After success, assert
  `invalidateQueries` was **not** called (the early `if (vars.body.state === undefined) return`).

Use the updated-log return value to drive `countPending` across the boundary: for the
first case the PATCH resolves a `SetLogResponse` with `state: "completed"` and the
same `id` as the seeded pending log.

**Verify**: `cd frontend && pnpm test -- use-session` → all pass.

### Step 4: Full suite + typecheck green

**Verify**: `cd frontend && pnpm typecheck && pnpm test` → both exit 0.

## Test plan

- `use-auth.test.tsx`: 5 cases over `fetchMe` (happy, 401→recover, 401→refresh-fail,
  401→retry-401, non-401-throws).
- `use-day-completions.test.tsx`: translation, null-skip, empty, (optional key).
- `use-session.test.tsx`: `countPending` (3 cases) + `useLogSet` boundary (invalidate
  on zero-crossing; no-invalidate on non-state edit).
- Patterns: `use-workout-program.test.tsx` (query + wrapper) and
  `use-set-videos.test.tsx` (mutation + `vi.spyOn(queryClient, "invalidateQueries")`).

## Done criteria

ALL must hold:

- [ ] The three new `*.test.tsx` files exist with the cases above.
- [ ] `cd frontend && pnpm test -- src/hooks` → all pass.
- [ ] `cd frontend && pnpm typecheck` exits 0.
- [ ] `cd frontend && pnpm test` exits 0 (nothing else broke).
- [ ] The only non-test change is `export` added to `countPending` in `use-session.ts`
      (`git diff` shows exactly that one-line change).
- [ ] `plans/README.md` status row for 005 updated.

## STOP conditions

Stop and report back if:

- Constructing a `ResponseError` with a `{ status }` stand-in doesn't satisfy the
  `err.response.status` access in `fetchMe` (the runtime's `ResponseError` shape
  differs from the excerpt) — report the actual constructor signature from
  `@/services/generated/runtime`.
- A test you write fails because the hook's **behavior is actually wrong** (e.g. the
  boundary check invalidates on a non-crossing edit) — report the discrepancy; fixing
  it is a separate finding.
- The "Current state" excerpts don't match the live hooks (drift).

## Maintenance notes

- These pin current behavior; an intentional change to the auth-retry policy or the
  invalidation boundary should update the matching test in the same PR.
- A reviewer should confirm the boundary test actually exercises a 1→0 crossing (not
  a 2→1), since only crossing zero flips `sessions.state` on the backend.
- Deferred: tests for `useStartSession` and `useLogSetBatch` (the latter is entangled
  with plan 009's client regeneration — sequence after it).
