# Plan 020: One hook module per backend API — merge use-day-completions into use-session

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/hooks/use-day-completions.ts frontend/src/hooks/use-session.ts frontend/src/routes/today.tsx CLAUDE.md`
> `use-session.ts` may have drifted if plans landed (001/002 don't touch it;
> check anyway). Compare the "Current state" excerpts for the parts this
> plan touches; on an unexplained mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — a file merge plus import updates; no logic changes.
- **Depends on**: none (coordinate with 001/002/013 only in the sense of not
  running concurrently on `use-session.ts` — 002 doesn't touch it, but check
  `plans/README.md` statuses first)
- **Category**: tech-debt (conventions)
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The repo's de-facto convention is one hook module per generated API class —
`use-auth.ts` ↔ `AuthApi`, `use-workout-program.ts` ↔ `ProgramsApi`,
`use-set-videos.ts` ↔ `VideosApi` — which makes "where does this server data
come from?" answerable from the filename. `SessionsApi` is the one
violation: it's split across `use-session.ts` AND a 39-line
`use-day-completions.ts` wrapping a single endpoint. This plan folds the
small file into `use-session.ts`, restoring an exact 1:1 mapping, and writes
the convention into `CLAUDE.md` so it holds as the API grows.

## Current state

- `frontend/src/hooks/use-day-completions.ts` — exports two things:
  `dayCompletionsQueryKey(programId)` and `useDayCompletions(programId)`
  (a `useQuery` over `sessionsApi.apiProgramsIdDayCompletionsGet`, mapping
  rows into a `Record<"${week}-${dayIndex-1}", boolean>`, staleTime 5 min).
- Importers (verify with
  `grep -rn "use-day-completions" frontend/src --include="*.ts*"`):
  - `frontend/src/hooks/use-session.ts:3` —
    `import { dayCompletionsQueryKey } from "@/hooks/use-day-completions"`
    (used by the mutation onSuccess invalidations at lines 198 and 275)
  - `frontend/src/routes/today.tsx:12` — `useDayCompletions`
  - `frontend/src/hooks/use-day-completions.test.tsx` — its test file
    (5 tests)
- `frontend/src/hooks/use-session.ts` — the SessionsApi hook module; already
  contains every other SessionsApi call (current session, start, notes,
  set-log patch, batch patch).
- `CLAUDE.md` — has a `## Conventions` section (bullet list) at the end;
  that's where the new rule goes.
- Note: `use-workout-program.ts` covers ProgramsApi's program endpoints while
  `day-completions` is served by SessionsApi (it lives under
  `/api/programs/{id}/day-completions` but is registered by the sessions
  handler — see `backend/internal/sessions/handler.go:30`). The hook file
  follows the API CLASS (SessionsApi), which is what the generated client
  exposes; say exactly that in the convention text.

## Commands you will need

| Purpose   | Command (run in `frontend/`)                       | Expected on success |
|-----------|-----------------------------------------------------|---------------------|
| Key tests | `pnpm vitest run use-session`                       | all pass (existing + moved) |
| All tests | `pnpm test`                                         | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`                 | exit 0              |

## Scope

**In scope**:
- `frontend/src/hooks/use-session.ts` (receives the moved code)
- `frontend/src/hooks/use-session.test.tsx` (receives the moved tests)
- `frontend/src/hooks/use-day-completions.ts` (delete)
- `frontend/src/hooks/use-day-completions.test.tsx` (delete after moving)
- `frontend/src/routes/today.tsx` (import path)
- `CLAUDE.md` (one convention bullet)

**Out of scope** (do NOT touch):
- Any behavior: query keys, staleTime, the week/day-index translation, and
  the invalidation logic must be byte-identical.
- `use-video-upload.ts` — it's dialog orchestration, not a data hook; it does
  not violate the convention and needs no move.
- Backend route or handler organization.

## Git workflow

- Branch: `advisor/020-one-hook-per-api`
- Commit style: `refactor(frontend): fold day-completions into the sessions hook module`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Move the code

1. Copy `dayCompletionsQueryKey` and `useDayCompletions` (with their
   comments, verbatim) into `frontend/src/hooks/use-session.ts`, placed near
   the top with the other exported query key. Remove use-session's import of
   `dayCompletionsQueryKey` (it's now local).
2. Update `frontend/src/routes/today.tsx` to import `useDayCompletions` from
   `@/hooks/use-session`.
3. Delete `frontend/src/hooks/use-day-completions.ts`.

**Verify**: `pnpm typecheck` → exit 0 (this catches any importer the grep
missed).

### Step 2: Move the tests

Move the 5 tests from `use-day-completions.test.tsx` into
`use-session.test.tsx` as their own `describe("useDayCompletions", ...)`
block, adjusting only the import path. Delete the old test file.

**Verify**: `pnpm vitest run use-session` → all pass (previous count + 5).
**Verify**: `pnpm test` → all pass; nothing references the deleted files:
`grep -rn "use-day-completions" frontend/src` → no output.

### Step 3: Write the convention down

In `CLAUDE.md`'s `## Conventions` bullet list, add:

```markdown
- One hook module per generated API class: `use-auth` ↔ AuthApi,
  `use-workout-program` ↔ ProgramsApi, `use-session` ↔ SessionsApi,
  `use-set-videos` ↔ VideosApi. New server data goes in the module matching
  the API class that serves it (the class = the swagger @Tags group), never
  a new one-off hook file.
```

**Verify**: `grep -n "One hook module per generated API class" CLAUDE.md` →
match.

### Step 4: Full pass

**Verify**: `pnpm test`, `pnpm lint`, `pnpm typecheck` → all exit 0.

## Test plan

No new tests — the 5 moved tests must pass unmodified (import path aside),
plus the full suite.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `frontend/src/hooks/use-day-completions.ts` and its test file no longer exist
- [ ] `grep -rn "use-day-completions" frontend/src` → no output
- [ ] `pnpm vitest run use-session` passes with the 5 moved tests included
- [ ] CLAUDE.md contains the convention bullet
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The grep in "Current state" reveals importers beyond the three listed —
  report them (mechanical to fix, but the plan's scope list must be honest).
- Any moved test needs an ASSERTION change to pass — behavior drifted during
  the move; diff the moved code against the original.
- Plans 001/002 are IN PROGRESS (check `plans/README.md`) — `use-session.ts`
  churn should serialize, not merge.

## Maintenance notes

- Plan 018 (required API fields) regenerates the client and cleans up hooks —
  it lists `use-session.ts` in scope; run 020 before or after, not during.
- If SessionsApi ever grows large enough that one module feels crowded, split
  by API class boundary on the BACKEND first (new @Tags group → new generated
  class → new hook module) so the 1:1 rule keeps holding.
- Reviewer scrutiny: the moved code should be a pure cut-and-paste diff; any
  edit inside the moved functions is a red flag.
