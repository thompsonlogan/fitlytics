# Plan 003: Give users with no programs an empty state instead of an error screen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/hooks/use-workout-program.ts frontend/src/routes/today.tsx frontend/src/hooks/use-workout-program.test.tsx frontend/src/components/workout/mobile-today.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — additive UI branch; the error path for real failures is
  unchanged.
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

Sign-in provisions a local user just-in-time
(`backend/internal/users/service.go:78` `ResolveOrProvision`), but nothing
creates a program — the programs API is read-only (`GET /programs`,
`GET /programs/:id` only; see `backend/internal/programs/handler.go:25–26`),
so programs exist only via dev seed SQL. `fetchActiveProgram` **throws** when
the list is empty, so every brand-new production signup lands on the generic
"We couldn't load your program… Try again" error with a retry button that can
never succeed. This plan turns "zero programs" into a first-class empty state.
(An actual program-creation flow is a separate product decision — see the
Direction notes in `plans/README.md`.)

## Current state

- `frontend/src/hooks/use-workout-program.ts` — the data hook. Today
  (lines 20–29):

```ts
export async function fetchActiveProgram(programsApi: ProgramsApi): Promise<Program> {
  const summaries = await programsApi.apiProgramsGet()
  const first = summaries[0]
  if (!first?.id) {
    throw new Error("no programs available for user")
  }

  const full = await programsApi.apiProgramsIdGet({ id: first.id })
  return mapProgram(full)
}
```

- `frontend/src/routes/today.tsx` — the only consumer. Reads
  `const { data: program, isLoading, isError, refetch } = useWorkoutProgram()`
  (line 28) and has an `isError` branch (lines 73–97) that renders the app
  shell (`AppHeader` + message + `Footer`). The happy path forks on
  `isMobile` (line 99) into `<MobileToday …>` or the desktop
  `SubBar`+`DayBoard` layout. Note `dayCompletions` is already safe for a
  missing program: `useDayCompletions(program?.id)` (line 29).

- `frontend/src/hooks/use-workout-program.test.tsx` — existing tests for the
  hook, including (very likely) one asserting the empty-list throw. Model any
  new test on this file's structure.

- Convention (CLAUDE.md): **named UI components get their own file alongside
  the parent component**; style with Tailwind utilities only. The error branch
  in `today.tsx:77–96` is the visual pattern to match (centered `max-w-sm`
  column, `text-muted-foreground` copy, `Button variant="outline"`).

## Commands you will need

| Purpose   | Command (run in `frontend/`)                | Expected on success |
|-----------|---------------------------------------------|---------------------|
| Install   | `pnpm install` (add `--node-linker=hoisted` on MAX_PATH errors) | exit 0 |
| Typecheck | `pnpm typecheck`                            | exit 0              |
| Tests     | `pnpm test`                                 | all pass            |
| One file  | `pnpm vitest run use-workout-program`       | all pass            |
| Lint      | `pnpm lint`                                 | exit 0              |

## Scope

**In scope**:
- `frontend/src/hooks/use-workout-program.ts`
- `frontend/src/hooks/use-workout-program.test.tsx`
- `frontend/src/routes/today.tsx`
- `frontend/src/components/workout/no-program-card.tsx` (create)

**Out of scope** (do NOT touch):
- Backend — do not add a create-program endpoint here; that's a product
  decision tracked separately.
- `frontend/src/components/workout/mobile-today.tsx` — the empty state renders
  *before* the mobile/desktop fork, so MobileToday never sees a null program.
- `frontend/src/lib/program-mapper.ts` / `program-data.ts`.

## Git workflow

- Branch: `advisor/003-new-user-empty-state`
- Commit style: `fix(frontend): empty state for users with no programs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make "no programs" a value, not an exception

In `frontend/src/hooks/use-workout-program.ts`, change `fetchActiveProgram`
to return `Program | null`:

```ts
// Returns null when the user has no programs at all — a real state for a
// fresh account (nothing creates a program at signup). The Today route
// renders a dedicated empty state for it; only genuine failures throw.
export async function fetchActiveProgram(programsApi: ProgramsApi): Promise<Program | null> {
  const summaries = await programsApi.apiProgramsGet()
  const first = summaries[0]
  if (!first?.id) {
    return null
  }

  const full = await programsApi.apiProgramsIdGet({ id: first.id })
  return mapProgram(full)
}
```

No change needed to `useWorkoutProgram` itself — the query type widens to
`Program | null` via inference.

**Verify**: `pnpm typecheck` → this may now FAIL in `today.tsx` (null not
handled). That's expected; fix in Step 3 before re-running.

### Step 2: Create the empty-state component

Create `frontend/src/components/workout/no-program-card.tsx` — a named,
self-contained component matching the error-branch styling in
`today.tsx:83–93`:

```tsx
// NoProgramCard is the Today page's first-run state: the account exists but
// has no training program yet (programs are read-only via the API today, so
// there is nothing the user can click to create one in-app).
export function NoProgramCard() {
  return (
    <main className="grid place-items-center px-6 py-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="text-base font-semibold">No program yet</h2>
        <p className="text-sm text-muted-foreground">
          Your account is ready, but there's no training program attached to it
          yet. Once a program is added to your account, your workouts will show
          up here.
        </p>
      </div>
    </main>
  )
}
```

(Exact copy may be tuned; keep it honest — there is no self-serve creation
path yet, so do NOT render a dead "Create program" button.)

**Verify**: `pnpm lint` → exit 0 (file compiles standalone).

### Step 3: Render it from TodayPage

In `frontend/src/routes/today.tsx`:

1. Read the query result as before; `program` is now `Program | null | undefined`
   (`undefined` while loading, `null` for no-programs).
2. Insert the empty-state branch **after** the `isError` branch (line 97) and
   **before** the `isMobile` fork (line 99), reusing the same shell layout as
   the error branch:

```tsx
  if (!isLoading && program === null) {
    return (
      <div
        className="grid min-h-svh bg-background text-foreground"
        style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
      >
        <AppHeader onLogout={signOut} user={user} />
        <NoProgramCard />
        <Footer />
      </div>
    )
  }
```

3. Guard the derived values that assumed a program object: the existing code
   already uses `program?.` everywhere (`program?.weeks.length ?? 0`,
   `program?.startDate`, `nextWorkoutDay(program, …)` behind `program ?`), so
   after the early return no further change should be necessary. Confirm by
   typecheck rather than by rewriting.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Update the hook tests

In `frontend/src/hooks/use-workout-program.test.tsx`:

- Find the test asserting the empty-list throw (search for
  `no programs available`). Replace it: an empty summaries array now resolves
  to `null` (query `data === null`, `isError === false`).
- Keep/verify the pass-through failure test: a rejected `apiProgramsGet` still
  surfaces as a query error.

**Verify**: `pnpm vitest run use-workout-program` → all pass.

### Step 5: Full verification

**Verify**: `pnpm test` → exit 0; `pnpm lint` → exit 0; `pnpm typecheck` →
exit 0.

Optional visual check if a dev environment is available: point
`AUTH_BYPASS_USER_ID` at a seeded user that owns no programs (or delete the
seed program rows for one user in the dev DB), load `/today`, and confirm the
empty state renders inside the app shell with header/footer intact.

## Test plan

- Updated: `use-workout-program.test.tsx` — empty list → `null` (not error);
  API failure → error (unchanged).
- New (optional but preferred): a small render test for the `program === null`
  branch is NOT required — the branch is a trivial conditional and `today.tsx`
  currently has no route-level test harness; don't build one for this.
- Verification: `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "throw new Error(\"no programs" frontend/src/hooks/use-workout-program.ts` returns no matches
- [ ] `frontend/src/components/workout/no-program-card.tsx` exists and is rendered from `today.tsx`
- [ ] `pnpm vitest run use-workout-program` → all pass, including the null-on-empty case
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `today.tsx` no longer matches the excerpt layout (error branch at ~73–97,
  mobile fork at ~99) — the page was restructured and the insertion point must
  be re-derived.
- The typecheck in Step 3 reveals more than ~3 call sites that assumed a
  non-null program — the null needs to flow further than this plan mapped,
  report the list instead of chasing it.
- You feel the need to modify `mobile-today.tsx` — the early return should
  make that unnecessary; if it doesn't, the fork moved.

## Maintenance notes

- When a program-creation flow lands (see Direction notes in
  `plans/README.md`), `NoProgramCard` is where its CTA goes.
- The "first program in the list = active" heuristic in `fetchActiveProgram`
  is unchanged and remains the place a real program picker would slot in.
- Reviewers should check the empty state against both themes (the copy uses
  semantic tokens only, so this should be automatic).
