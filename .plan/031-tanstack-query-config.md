# Plan 031: Rationalize the TanStack Query client configuration (caching, refetch, retry, keys)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **This plan asks you to make a few small decisions.** Section
> "Decisions to finalize" lists each knob with the advisor's recommended
> default and the trade-offs. Unless the operator told you otherwise, apply
> the recommended defaults — they are chosen to preserve today's *effective*
> behavior while removing the duplication. Record the values you chose in the
> PR/commit description so a reviewer can see the intent.
>
> **Drift check (run first)**: `git diff --stat 87e883d..HEAD -- frontend/src/main.tsx frontend/src/hooks/use-workout-program.ts frontend/src/hooks/use-session.ts frontend/src/hooks/use-auth.ts frontend/src/hooks/use-day-completions.ts frontend/src/hooks/use-set-videos.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition (plans 018 and 020 both rewrite these
> files — see STOP conditions).

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED — the change touches the caching/refetch/retry behavior of
  **every** query in the app. A wrong default (e.g. a retry loop, or a
  stale-time that makes the workout board show yesterday's data) is felt
  everywhere. Mitigated by keeping the *effective* behavior unchanged under the
  recommended defaults, and by a new unit test for the one genuinely new
  behavior (the retry predicate).
- **Depends on**: none (hard). **Soft ordering** with plans 018 and 020 — all
  three edit the same hook files; see "Maintenance notes".
- **Category**: tech-debt (with a minor correctness/UX angle: stop retrying
  non-retryable 4xx errors).
- **Planned at**: commit `87e883d`, 2026-07-11

## Why this matters

The React Query configuration has drifted into three small problems, none
urgent on its own but cheap to fix together while the surface is small
(6 query/mutation hooks):

1. **`staleTime` is copy-pasted and inconsistent.** The global default is
   1 minute (`main.tsx`), but four separate hooks re-declare the literal
   `5 * 60 * 1000` (5 minutes), and a fifth re-declares `60 * 1000` — which is
   *exactly the global default*, so it is pure redundancy. Each site carries a
   comment claiming its window "matches" the others; they are kept in sync by
   hand. There is no single source of truth, so the next hook author guesses.

2. **No retry policy → 4xx errors retry pointlessly.** Only `useAuth` sets
   `retry: false`. Every other query uses TanStack's built-in default (3
   retries with exponential backoff) and retries **all** errors, including
   4xx client errors that cannot succeed on retry. A 500 on the workout board
   currently takes three backed-off attempts (seconds) before the error UI
   appears; a non-retryable 4xx wastes the same budget. There is a ready-made
   classifier to fix this: `frontend/src/services/api-error.ts` (from plan 002)
   already distinguishes `ResponseError` and its status.

3. **Refetch posture is implicit.** `refetchOnWindowFocus: false` is set, but
   `refetchOnReconnect` and `refetchOnMount` are left at their defaults
   (`true`) without a decision recorded. For an app used on flaky phone
   connections mid-workout, that interplay should be intentional, not
   inherited.

4. **Query-key hygiene.** Every hook defines its own key factory (good), but
   the "disabled" fallback keys are inlined string literals
   (`["session", "disabled"]`, `["day-completions", "disabled"]`,
   `["session-videos", "disabled"]`) that duplicate the factory's prefix and
   can silently drift from it.

This plan consolidates the settings into one place, gives queries a sensible
retry policy, and makes the refetch posture explicit — **without changing the
data-fetching logic, optimistic cache updates, or invalidation targets.**

## Current state

React Query is `@tanstack/react-query` `^5.100.10`.

- `frontend/src/main.tsx` — the single `QueryClient`, with the only global
  defaults:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60,
    },
  },
})
```

- Per-hook query options (all under `frontend/src/hooks/`):

| Hook (file) | `staleTime` | Other options |
|---|---|---|
| `useWorkoutProgram` (`use-workout-program.ts`) | `5 * 60 * 1000` | — |
| `useCurrentSession` (`use-session.ts`) | `5 * 60 * 1000` | `enabled`, swallows 404 → `null` inside `queryFn` |
| `useAuth` ME query (`use-auth.ts`) | `5 * 60 * 1000` | **`retry: false`** |
| `useDayCompletions` (`use-day-completions.ts`) | `5 * 60 * 1000` | `enabled: !!programId` |
| `useSessionVideos` (`use-set-videos.ts`) | `60 * 1000` | `enabled: !!sessionId` |

  Note `useSessionVideos`'s `60 * 1000` equals the global default (redundant),
  and the four `5 * 60 * 1000` literals are identical copies. `useAuth`'s
  `retry: false` is **load-bearing**: the router guard
  (`router.tsx` `beforeLoad` → `ensureQueryData(ME_KEY)`) awaits this query, so
  a retrying auth query would delay every `/today` navigation.

- Query-key factories and their inlined "disabled" fallbacks:

```ts
// use-workout-program.ts
export const PROGRAM_QUERY_KEY = ["program", "active"] as const
// use-auth.ts
export const ME_KEY = ["me"] as const
// use-session.ts
export const sessionQueryKey = (programId, programDayId) =>
  ["session", programId, programDayId] as const
//   fallback when disabled: ["session", "disabled"]
// use-day-completions.ts
export const dayCompletionsQueryKey = (programId) =>
  ["day-completions", programId] as const
//   fallback when disabled: ["day-completions", "disabled"]
// use-set-videos.ts
export const sessionVideosQueryKey = (sessionId) =>
  ["session-videos", sessionId] as const
//   fallback when disabled: ["session-videos", "disabled"]
```

- Mutations (`use-session.ts`, `use-set-videos.ts`) set **no** retry/options and
  rely on TanStack's mutation default (0 retries). That is correct for writes
  and **must not change** — see Scope.

- The existing helper this plan builds on
  (`frontend/src/services/api-error.ts`, from plan 002):

```ts
export function isResponseError(err: unknown): err is ResponseError { … }
export function isResponseErrorWithStatus(err: unknown, status: number): err is ResponseError { … }
```

Repo conventions:

- Named modules get their own file; shared constants live in a small module,
  not inlined (see `frontend/src/services/api-error.ts` for the pattern of a
  focused `services/` helper module).
- Tests are Vitest, hand-built fakes, alongside the code. `use-auth.test.tsx`
  and `use-workout-program.test.tsx` each build their **own** `QueryClient`
  with `retry: false` — so they do **not** exercise the app's global defaults
  (important: your new global retry policy will not be covered by those tests;
  cover the retry predicate directly instead — see Test plan).

## Commands you will need

| Purpose   | Command (run in `frontend/`)                | Expected on success |
|-----------|---------------------------------------------|---------------------|
| Install   | `pnpm install` (add `--node-linker=hoisted` on MAX_PATH errors) | exit 0 |
| Typecheck | `pnpm typecheck`                            | exit 0              |
| One file  | `pnpm vitest run query-config`              | all pass            |
| All tests | `pnpm test`                                 | all pass            |
| Lint      | `pnpm lint`                                 | exit 0              |
| Build     | `pnpm build`                                | exit 0              |

## Decisions to finalize

Fill these in (recommended default in **bold**); record your choices in the
commit/PR description. The done criteria check *structure*, not the exact
numbers, so any reasonable choice passes — but do not skip recording them.

- **A. Canonical default `staleTime`.** Options: (a) keep 1 min global + 5 min
  per-hook (status quo, scattered); (b) **make the global default the value
  most hooks already want (5 min) via a named constant, and delete the four
  redundant overrides**, leaving only genuine deviations. Trade-off: (b)
  removes duplication and is the recommended path; it makes `useSessionVideos`
  the one explicit deviation (see B-adjacent note).
- **B. Named stale-time tiers.** Recommended: a tiny module exporting
  something like `STALE.standard = 5 * 60 * 1000` and `STALE.short = 60 * 1000`
  (names/values are yours). `useSessionVideos` either keeps `STALE.short` (if
  1 min is a deliberate freshness choice for video lists) **or** drops the
  override entirely and inherits the default — decide based on whether videos
  genuinely need to be fresher than the rest. Recommended: **keep it explicit
  as `STALE.short` with a one-line comment** so the deviation is intentional.
- **C. Retry policy (the one behavior change worth making).** Recommended:
  **a global `retry` predicate that does NOT retry 4xx responses and retries
  network/5xx errors a small number of times (e.g. 2) with backoff.** Build it
  on `isResponseError` from `services/api-error.ts` (do not re-implement the
  status check). Keep `useAuth`'s `retry: false`. Trade-off: retrying 4xx never
  helps and delays the error UI; not retrying network blips hurts on mobile.
  The predicate splits the difference. Leave the retry *count* to your judgment.
- **D. Refetch posture.** Recommended: **set `refetchOnReconnect` and
  `refetchOnMount` explicitly in the global defaults** (recommended values:
  `refetchOnReconnect: true`, `refetchOnMount: true` — today's inherited
  behavior, now written down) alongside the existing
  `refetchOnWindowFocus: false`. This is documentation-as-config; change a
  value only if you have a reason.
- **E. `gcTime`.** Recommended: **leave at the default (5 min)** unless you have
  a concrete reason to persist a specific query longer. Do not add it just to
  add it.
- **F. Query-key "disabled" fallbacks.** Recommended: **replace the inlined
  `["<prefix>", "disabled"]` literals with a helper derived from the same
  factory** (e.g. `dayCompletionsQueryKey.disabled` or a shared
  `disabledKey(prefix)`), so the prefix has one source of truth. Centralizing
  *all* keys into a single `query-keys.ts` registry is optional and larger —
  only do it if it stays small and clearly better; otherwise the per-hook
  factories are fine as-is and you just fix the fallback duplication.

## Scope

**In scope**:
- `frontend/src/main.tsx` — global `defaultOptions` (extracting the client
  construction into a `frontend/src/services/query-client.ts` module is
  encouraged but optional).
- A new module for the shared settings, e.g.
  `frontend/src/services/query-config.ts` (stale-time tiers + the retry
  predicate). Name/exact split is yours; keep it focused.
- `frontend/src/hooks/use-workout-program.ts`, `use-session.ts`,
  `use-auth.ts`, `use-day-completions.ts`, `use-set-videos.ts` — remove
  redundant `staleTime` overrides, adopt the shared constants, fix the disabled
  key fallbacks. **Options only — do not touch `queryFn`, `enabled`, mutation
  bodies, `onSuccess`/`onSettled`, `setQueryData`, or `invalidateQueries`.**
- A new test file for the retry predicate (and key-fallback helper if you add
  one).

**Out of scope** (do NOT touch):
- Any `queryFn` / fetch logic, the generated client under
  `frontend/src/services/generated/**`, or `services/api-error.ts` (reuse it,
  don't edit it).
- **Mutation semantics** — the optimistic `setQueryData` merges and the
  `invalidateQueries` targets in `use-session.ts` / `use-set-videos.ts` are
  behavior, not config. Do not add mutation retries or change invalidation.
- `use-cell-logging.ts`, components, routing, backend.
- The auth query's `retry: false` — keep it.

## Git workflow

- Branch: `advisor/031-tanstack-query-config`
- Commit style: `refactor(frontend): consolidate TanStack Query defaults + retry policy`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared query-config module

Create `frontend/src/services/query-config.ts` (name is yours) exporting:
- the stale-time tier constants from decision B (e.g. `STALE.standard`,
  `STALE.short`);
- a `retry` predicate implementing decision C, built on `isResponseError` from
  `./api-error` — e.g. "return false for a `ResponseError` whose status is
  4xx; otherwise allow up to N attempts". Export it so both the global default
  and the test import the same function.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Apply the global defaults

In `frontend/src/main.tsx` (or a new `services/query-client.ts` that `main.tsx`
imports), set the global `defaultOptions.queries` to:
- `staleTime`: the decision-A default (recommended: `STALE.standard`);
- `retry`: the decision-C predicate;
- `refetchOnWindowFocus: false` (unchanged), plus the decision-D
  `refetchOnReconnect` / `refetchOnMount` values, written explicitly.

Leave `mutations` defaults untouched (none today; keep it that way).

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: De-duplicate the per-hook overrides

In each of the five hooks, remove any `staleTime` that now equals the global
default. Keep only genuine deviations (per decision B, likely just
`useSessionVideos`), and give each remaining override a one-line comment
justifying why it differs. **Keep `useAuth`'s `retry: false`.** Do not change
anything else in these `useQuery` calls.

**Verify**: `pnpm typecheck` → exit 0. `grep -rn "5 \* 60 \* 1000" frontend/src/hooks`
returns **no** matches (the literal now lives only in the shared module).

### Step 4: Fix the disabled-key fallbacks (decision F)

Replace the inlined `["<prefix>", "disabled"]` literals in `use-session.ts`,
`use-day-completions.ts`, and `use-set-videos.ts` with a helper derived from
the same factory, so the prefix isn't duplicated. Keep the runtime behavior
identical (the `enabled` flag already prevents these disabled queries from
fetching; the key only needs to be a stable, unique, non-colliding slot).

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Test the new behavior

Create `frontend/src/services/query-config.test.ts` (Vitest, no MSW; build fake
errors with `new ResponseError(new Response(null, { status }))` as
`use-cell-logging.test.tsx` does). Cover the retry predicate:
- a 4xx `ResponseError` → not retried (predicate returns false / stops);
- a 5xx `ResponseError` and a non-`ResponseError` network error → retried up to
  the chosen count, then stops;
- the boundary (whatever your predicate's max attempt count is).

If you added a disabled-key helper, add a small assertion on its shape (mirror
the existing `PROGRAM_QUERY_KEY` shape test in `use-workout-program.test.tsx`).

**Verify**: `pnpm vitest run query-config` → all pass.

### Step 6: Full verification

**Verify**: `pnpm test` → all pass (existing hook tests unchanged);
`pnpm lint` → exit 0; `pnpm typecheck` → exit 0; `pnpm build` → exit 0.

### Step 7 (optional): manual smoke if a dev environment is available

If a runnable `/today` exists (dev backend or `AUTH_BYPASS_USER_ID` pointing at
a seeded user), load it and confirm: the board still renders, navigating
between days doesn't refetch on window focus, and (DevTools → Network, throttle
offline→online) a reconnect triggers a refetch. If no environment exists, skip
— the unit test in Step 5 plus the unchanged existing suite are the gate.

## Test plan

- New: `query-config.test.ts` — the retry predicate (4xx not retried; 5xx /
  network retried to the cap), and the disabled-key helper shape if added.
- Unchanged: all existing hook tests must still pass **without edits**. If one
  needs editing to pass, that's a signal you changed behavior, not just config
  — STOP and re-read Scope.
- Pattern: hand-built fakes as in `use-auth.test.tsx` /
  `use-workout-program.test.tsx`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] A single shared module (e.g. `frontend/src/services/query-config.ts`)
      exports the stale-time constant(s) and the `retry` predicate.
- [ ] `grep -rn "5 \* 60 \* 1000" frontend/src/hooks` returns no matches (the
      duplicated literal is gone from the hooks).
- [ ] `frontend/src/main.tsx`'s query defaults set an explicit `retry` and the
      `refetchOnReconnect` / `refetchOnMount` posture (decisions C + D).
- [ ] `frontend/src/hooks/use-auth.ts` still sets `retry: false` on the ME
      query.
- [ ] No inlined `"disabled"` key literal remains that duplicates a factory
      prefix (`grep -rn '"disabled"' frontend/src/hooks` shows only helper-
      derived usages, or none).
- [ ] `pnpm vitest run query-config` → the retry-predicate tests pass.
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all exit 0, with
      the existing test count unchanged (aside from the new file).
- [ ] `git status` shows no modified files outside the in-scope list.
- [ ] `.plan/README.md` status row updated, and the chosen decision values
      recorded in the commit/PR description.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows **plan 018** or **plan 020** already landed: 018
  regenerates the typed client and rewrites `use-session.ts`; 020 merges
  `use-day-completions.ts` into `use-session.ts`. Either invalidates this
  plan's file list and excerpts — re-derive the scope against the new code
  before touching anything, and if the hooks moved, report rather than guess.
- Making the global `retry` a predicate causes any existing test to hang or
  flake — that means a test constructs the real `QueryClient` (today none do;
  both hook tests pass `retry: false`). Report which test.
- Removing a per-hook `staleTime` changes an existing test's expectation — that
  test was asserting on cache timing; do not "fix" the test to match. STOP.
- You find yourself editing a `queryFn`, a mutation body, an `invalidateQueries`
  target, or `services/api-error.ts` — all out of scope.

## Maintenance notes

- **Overlap with plans 018 and 020.** All three edit these hook files. This
  plan is small and mechanical; prefer to land it **before** 018/020 (so they
  rebase onto the consolidated config), or, if 018/020 land first, re-derive
  the file list — the settings still consolidate the same way, just in fewer/
  renamed files.
- The retry predicate should remain the **only** place that classifies
  retryable vs non-retryable errors, and it should keep delegating status
  checks to `services/api-error.ts` (plan 002) rather than re-implementing
  `ResponseError` inspection.
- `useAuth`'s `retry: false` is load-bearing for router-guard latency
  (`router.tsx` `beforeLoad`). If a future change makes the ME query retry,
  every `/today` navigation slows on a cold/expired session. Keep it, or
  ensure the global predicate returns "don't retry" for the auth path.
- Reviewers should confirm the diff is **options-only**: no `queryFn`, cache-
  write, or invalidation changes slipped in under the "config cleanup" banner.
