# Plan 011: Fix the three pre-existing frontend failures that block CI (lint ×2, test ×1)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat cb2af4b..HEAD -- frontend/src/components/workout/set-state-cell.tsx frontend/src/components/workout/day-board.tsx frontend/src/components/workout/workout-table.tsx frontend/src/routes/today.tsx frontend/vite.config.ts`
> If any of those changed since this plan was written, compare the "Current
> state" excerpts against the live files before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Blocks**: 001 (CI pipeline). 001's frontend job runs `pnpm lint` and `pnpm test`; both are red on `master` today for the three reasons below, so CI would fail on its first run until this plan lands.
- **Category**: bug / tech-debt
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

The repo has no CI yet; plan 001 adds a GitHub Actions workflow whose frontend
job runs `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Three of those
fail today on `master` for reasons unrelated to the workflow:

1. **Lint** — `set-state-cell.tsx` exports a React component *and* non-component
   values (`SetState`, `CYCLE_NEXT`) from the same file, which `eslint-plugin-react-hooks`'s
   `react-refresh/only-export-components` rule forbids (it breaks Fast Refresh).
2. **Lint** — the `useMemo` in `today.tsx` lists narrower manual dependencies than
   the React Compiler infers from the body, tripping `react-hooks/preserve-manual-memoization`.
3. **Test** — `use-set-videos.ts` reads `import.meta.env.VITE_ALLOWED_VIDEO_TYPES.split(",")`
   at module load. In any environment without a `frontend/.env` file (CI, a fresh
   git worktree — `.env` is git-ignored), that env var is `undefined`, so the
   `.split` throws and crashes `use-set-videos.test.tsx` on import.

Until all three are green, CI on a public repo would be permanently red and you
could not enable branch protection. This plan makes them pass on a clean
checkout (no local `.env`), which is exactly the environment Linux CI runs in.

## Current state

### Failure 1 — `set-state-cell.tsx` mixed exports

`frontend/src/components/workout/set-state-cell.tsx` (lines 1–14) exports the type
and the cycle map alongside the `SetStateCell` component defined later in the same file:

```tsx
import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"

// SetState mirrors the backend set_log_state enum. "pending" is the default
// after a session is created; the user cycles into "completed" or "skipped"
// by clicking the cell.
export type SetState = "pending" | "completed" | "skipped"

export const CYCLE_NEXT: Record<SetState, SetState> = {
  pending: "completed",
  completed: "skipped",
  skipped: "pending",
}

type SetStateCellProps = {
  state: SetState
  ariaLabel: string
  onCycle: () => void
}
// ... export function SetStateCell(...) below
```

Two other files import these symbols from `set-state-cell`:

- `frontend/src/components/workout/day-board.tsx:7`
  `import { CYCLE_NEXT, type SetState } from "@/components/workout/set-state-cell"`
- `frontend/src/components/workout/workout-table.tsx:13`
  `import { SetStateCell, type SetState } from "@/components/workout/set-state-cell"`

The repo convention (`CLAUDE.md` → Conventions): "Named UI components get their
own file alongside the parent component." A type + constant map are *not*
components, so they belong in a sibling non-component module — which also
resolves the lint rule, since the rule only fires on files that export a
component.

### Failure 2 — `today.tsx` useMemo dependencies

`frontend/src/routes/today.tsx` (lines 27–33):

```tsx
  const weekCount = program?.weeks.length ?? 0

  const todayPos = useMemo(
    () =>
      program?.startDate ? computeTodayPosition(program.startDate, weekCount) : null,
    [program?.startDate, weekCount]
  )
```

The memo body reads `program` (via `program?.startDate` and `program.startDate`)
and `weekCount`. The React Compiler infers the dependency as `program` (the whole
object), which is broader than the manually written `program?.startDate`, so
`react-hooks/preserve-manual-memoization` reports the memoization can't be
preserved. `computeTodayPosition` is imported from `@/lib/program-data` and only
consumes `startDate` + `weekCount`, so widening the dependency to `program` is
behavior-preserving (it can only cause an extra recompute when an unrelated
`program` field changes, which is harmless and rare).

### Failure 3 — env-dependent module crash under test

`frontend/src/hooks/use-set-videos.ts` (lines 10–19):

```ts
// Pre-upload UX hints, sourced entirely from Vite build-time env (see
// frontend/.env). ...
export const MAX_VIDEO_BYTES = Number(import.meta.env.VITE_MAX_VIDEO_BYTES)

export const ALLOWED_VIDEO_TYPES: readonly string[] = import.meta.env.VITE_ALLOWED_VIDEO_TYPES.split(
  ","
)
  .map((t) => t.trim())
  .filter(Boolean)
```

`frontend/.env` (git-ignored) and `frontend/.env.example` (tracked) both define:

```
VITE_MAX_VIDEO_BYTES=524288000
VITE_ALLOWED_VIDEO_TYPES=video/mp4,video/quicktime,video/webm
```

`.env.example` documents these as **required with no in-code fallback** — that is
an intentional design choice; do **not** add `?? "..."` fallbacks to the source,
as that contradicts the documented contract. The test `use-set-videos.test.tsx`
asserts on these exact values (e.g. `MAX_VIDEO_BYTES === 500 * 1024 * 1024`,
allowed types include `video/mp4`/`video/quicktime`/`video/webm`).

`frontend/.gitignore` ignores `.env` and `.env.*` and only un-ignores
`.env.example`:

```
.env
.env.*
!.env.example
```

So a committed `.env.test` would **also** be git-ignored and absent in CI — it is
not a viable fix. The correct, single-file fix is Vitest's `test.env`, which
populates `import.meta.env` for the test run regardless of any `.env` file.

`frontend/vite.config.ts` already has a `test:` block (lines 32–43); the fix adds
an `env` key to it:

```ts
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/test_setup.ts"],
      exclude: ["node_modules", "dist", "src/services/generated/**"],
      css: false,
    },
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (Windows worktree) | `cd frontend && pnpm install --frozen-lockfile --node-linker=hoisted` | exit 0 |
| Install (Linux/CI) | `cd frontend && pnpm install --frozen-lockfile` | exit 0 |
| Typecheck | `cd frontend && pnpm typecheck` | exit 0, no errors |
| Lint | `cd frontend && pnpm lint` | exit 0, no errors |
| Test | `cd frontend && pnpm test` | exit 0, all suites pass |
| Build | `cd frontend && pnpm build` | exit 0 |

> On Windows, `pnpm install` may fail with a path-length (`ENAMETOOLONG`/MAX_PATH)
> error unless you pass `--node-linker=hoisted`. That flag is a local-only
> workaround; it does not change committed files.

## Scope

**In scope** (modify/create only these):
- `frontend/src/components/workout/set-state.ts` — **create**: holds `SetState` + `CYCLE_NEXT`.
- `frontend/src/components/workout/set-state-cell.tsx` — remove the two exports, import them from `./set-state`.
- `frontend/src/components/workout/day-board.tsx` — repoint the import on line 7.
- `frontend/src/components/workout/workout-table.tsx` — repoint the `SetState` import on line 13.
- `frontend/src/routes/today.tsx` — widen the `useMemo` dependency array.
- `frontend/vite.config.ts` — add `env` to the `test` block.

**Out of scope** (do NOT touch, even though related):
- `.github/workflows/ci.yml` — that is plan 001's artifact; this plan does not create or edit CI config.
- `frontend/src/hooks/use-set-videos.ts` — do **not** add in-code env fallbacks; the
  required-env contract is intentional (see Failure 3). The fix is the Vitest `env`, not the source.
- `frontend/.env`, `frontend/.env.example`, `frontend/.gitignore` — committing a `.env.test`
  won't work (git-ignored); do not modify gitignore to force it.
- Any backend file, any other component, any test file's assertions.

## Git workflow

- Branch: `advisor/011-fix-preexisting-frontend-failures`
- One commit. Message style matches the repo's conventional-commit log
  (`feat: …`, `cleanup …`): e.g.
  `fix(frontend): unblock CI — split set-state exports, fix today memo deps, inject test env`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract `SetState` + `CYCLE_NEXT` into a sibling module

Create `frontend/src/components/workout/set-state.ts` with exactly:

```ts
// SetState mirrors the backend set_log_state enum. "pending" is the default
// after a session is created; the user cycles into "completed" or "skipped"
// by clicking the cell.
export type SetState = "pending" | "completed" | "skipped"

export const CYCLE_NEXT: Record<SetState, SetState> = {
  pending: "completed",
  completed: "skipped",
  skipped: "pending",
}
```

Then edit `frontend/src/components/workout/set-state-cell.tsx`: delete the
`export type SetState …` line and the `export const CYCLE_NEXT …` block (the lines
shown in Failure 1), and add an import for `SetState` near the top (the file still
references `SetState` in `SetStateCellProps`):

```tsx
import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { type SetState } from "@/components/workout/set-state"
```

(The comment that described `SetState` moves with the type into `set-state.ts`, as shown above.)

**Verify**: `cd frontend && pnpm typecheck` → exit 0. (Will still fail until Step 2
repoints importers — that's expected; do not treat a typecheck error naming
`day-board.tsx` or `workout-table.tsx` as a STOP, proceed to Step 2.)

### Step 2: Repoint the two importers

In `frontend/src/components/workout/day-board.tsx`, line 7, change:

```tsx
import { CYCLE_NEXT, type SetState } from "@/components/workout/set-state-cell"
```
to:
```tsx
import { CYCLE_NEXT, type SetState } from "@/components/workout/set-state"
```

In `frontend/src/components/workout/workout-table.tsx`, line 13, change:

```tsx
import { SetStateCell, type SetState } from "@/components/workout/set-state-cell"
```
to two imports (the component stays in `set-state-cell`, the type moves):
```tsx
import { SetStateCell } from "@/components/workout/set-state-cell"
import { type SetState } from "@/components/workout/set-state"
```

**Verify**: `cd frontend && pnpm typecheck` → exit 0, no errors.

### Step 3: Widen the `today.tsx` useMemo dependency

In `frontend/src/routes/today.tsx`, change the dependency array on the `todayPos`
`useMemo` (currently `[program?.startDate, weekCount]`) to `[program, weekCount]`:

```tsx
  const todayPos = useMemo(
    () =>
      program?.startDate ? computeTodayPosition(program.startDate, weekCount) : null,
    [program, weekCount]
  )
```

Do not change the memo body. Do not disable the lint rule with an
`eslint-disable` comment — if widening the dependency does not satisfy the rule,
that is a STOP condition (see below).

**Verify**: `cd frontend && pnpm lint` → exit 0, no errors. (This is the gate for
both Failure 1 and Failure 2.)

### Step 4: Provide the video env vars to the test runner

In `frontend/vite.config.ts`, add an `env` key to the existing `test` block so the
required `VITE_*` vars exist under Vitest without depending on a `.env` file:

```ts
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/test_setup.ts"],
      exclude: ["node_modules", "dist", "src/services/generated/**"],
      css: false,
      // use-set-videos.ts reads these at module load and they have no in-code
      // fallback by design (see .env.example). frontend/.env is git-ignored, so
      // provide the public, non-secret values here for CI / fresh-checkout test
      // runs. Keep in sync with .env.example.
      env: {
        VITE_MAX_VIDEO_BYTES: "524288000",
        VITE_ALLOWED_VIDEO_TYPES: "video/mp4,video/quicktime,video/webm",
      },
    },
```

**Verify**: `cd frontend && pnpm test` → exit 0; `use-set-videos.test.tsx` passes
(no `Cannot read properties of undefined (reading 'split')`), and the value
assertions (`MAX_VIDEO_BYTES === 500*1024*1024`, allowed types) pass.

### Step 5: Full local gate

Run the complete sequence the CI frontend job will run:

**Verify**: `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
→ every command exits 0.

## Test plan

This plan changes no behavior and the existing test `use-set-videos.test.tsx`
already covers the env-derived values — making it pass again *is* the test
outcome. Do **not** add new test files or change any existing assertion. The
verification is that the existing suite goes from red to green on a checkout with
no `frontend/.env`.

## Done criteria

ALL must hold (run from `frontend/`):

- [ ] `frontend/src/components/workout/set-state.ts` exists and exports `SetState` + `CYCLE_NEXT`.
- [ ] `set-state-cell.tsx` no longer exports `SetState` or `CYCLE_NEXT` (it imports `SetState` from `./set-state`).
- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm lint` exits 0 (no `react-refresh/only-export-components`, no `preserve-manual-memoization`).
- [ ] `pnpm test` exits 0; `use-set-videos.test.tsx` passes.
- [ ] `pnpm build` exits 0.
- [ ] `git status` shows only the six in-scope files changed/created (no `.env*`, no CI file, no backend file).
- [ ] `plans/README.md` status row for 011 updated (unless a reviewer told you they maintain the index).

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (drift since `cb2af4b`).
- After Step 3, `pnpm lint` still reports `react-hooks/preserve-manual-memoization`
  on `today.tsx` — do **not** add an `eslint-disable`; report the exact message so
  the plan can be revised (the correct dependency may differ from what was assumed).
- `pnpm lint` surfaces a **new** error in a file this plan did not touch — that is a
  separate pre-existing issue; report it, don't fix it here.
- After Step 4, `use-set-videos.test.tsx` still fails — capture whether
  `import.meta.env.VITE_ALLOWED_VIDEO_TYPES` is now defined under Vitest; if `test.env`
  did not populate it, report the Vitest version (`pnpm vitest --version`) so the plan
  can switch to a `vi.stubEnv` setup-file approach.
- Fixing any failure appears to require editing an out-of-scope file.

## Maintenance notes

- **`vite.config.ts` `test.env` must stay in sync with `.env.example`.** If the
  allowed video types or size cap change, update both. A reviewer should confirm
  the values match `.env.example` exactly.
- This plan unblocks **001**. After it lands, re-run 001's frontend gate
  (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`) on a checkout without
  `.env` to confirm green, then 001 can be marked DONE.
- **Deferred (note for 001's owner, not this plan):** `pnpm build` in CI does not
  *fail* without the `VITE_*` vars (Vite inlines `undefined`/`NaN` without executing
  module top-level), so build is not a blocker for the gate. But a *deployable*
  build needs the real values — whoever finalizes 001/CD should inject
  `VITE_MAX_VIDEO_BYTES` and `VITE_ALLOWED_VIDEO_TYPES` (and any other required
  `VITE_*`) into the build environment. Out of scope here.
- The React Compiler is active (`eslint-plugin-react-hooks` with compiler rules).
  Future `useMemo`/`useCallback` additions must list dependencies the compiler can
  verify, or the same `preserve-manual-memoization` rule will fire.
