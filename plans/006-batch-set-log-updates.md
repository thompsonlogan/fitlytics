# Plan 006: Batch set-log updates — replace the per-set PATCH fan-out

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: Reconciled 2026-06-12 against branch
> `set-video-upload` at commit `311b632` — all "Current state" excerpts
> verified, no drift (`Promise.all` fan-outs live at `day-board.tsx:303` and
> `:393`). Re-verify the excerpts below still match the live files before
> proceeding. If `day-board.tsx` has no `Promise.all(` fan-out, the problem
> may already be fixed — STOP and report.
>
> **Additional Context**: You should not edit any of the generated files. You can review
> information in the repos README.md for information on how to run all the services and
> and database which should give you everything you need to regenerate the code while
> working through the changes in this plan.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the debounced set-state flow and the session cache merge)
- **Depends on**: none (001–005 can land in any order relative to this)
- **Category**: bug / perf
- **Planned at**: commit `eb95537` + working tree, 2026-06-12; reconciled at `311b632` (excerpts verified, no drift)

## Why this matters

The block-expansion feature made one prescribed block ("2 × 5") expand into N
`set_logs`. Block-level edits in the UI now fan out as
`Promise.all(logs.map(...))` — N **concurrent** PATCH requests per click. Two
problems: (1) no partial-failure story — if request 3 of 5 fails, the block is
left half-completed in the database while the user sees one generic error
toast and a UI that may not match either state; (2) each single-set PATCH also
recomputes the session's rollup state inside its own transaction, so N
requests do N recomputes and race each other on the same session row. A batch
endpoint applies all updates in one transaction (all-or-nothing) with one
recompute, and the frontend sends one request per block action.

## Current state

### Backend (sessions package, layered handler → service → repository)

- `backend/internal/sessions/handler.go:27` — existing route:
  `rg.PATCH("/sessions/:sessionId/set-logs/:setLogId", h.UpdateSetLog)`;
  handler body at lines 145–170 (parse ids → bind body → `auth.MustPrincipal`
  → service call → `writeServiceError`-style error mapping).
- `backend/internal/sessions/dto.go:54-59`:

```go
type UpdateSetLogRequest struct {
	RepsActual   *int32   `json:"reps_actual,omitempty" example:"8"`
	ActualLoadKg *float64 `json:"actual_load_kg,omitempty" example:"129.27"`
	ActualRpe    *float64 `json:"actual_rpe,omitempty" example:"8.5"`
	State        *string  `json:"state,omitempty" example:"completed"`
} // @name UpdateSetLogRequest
```

- `backend/internal/sessions/service.go:62-96` — `UpdateSetLog` validates
  ranges (`minReps`/`maxReps`, `minLoadKg`/`maxLoadKg`, `minRpe`/`maxRpe`,
  state ∈ {pending, completed, skipped}) then delegates; returns sentinel
  `ErrInvalidInput`/`ErrNotFound` errors the handler maps.
- `backend/internal/sessions/repository.go:249-340ish` — `UpdateSetLog` runs
  one transaction: three ownership probes (set_log → session_exercise →
  session by user), builds `[]field.AssignExpr` from the non-nil fields,
  `UpdateSimple`s the row, then **recomputes the session state** by loading all
  the session's set_log states and counting pending/completed/skipped (the
  block starting around line 300). This recompute block is what the batch
  variant must run exactly once.
- Test pattern: `backend/internal/sessions/repository_test.go` (sqlmock,
  helpers `newMockDB`/`uuidArg` at lines 17–40).

### Frontend

- `frontend/src/hooks/use-session.ts:107-127` — `useLogSet`: reads the cached
  session id at mutation time, PATCHes one set log via the generated
  `sessionsApi`, and in `onSuccess` (lines 128+) splices the updated log into
  the cached session and refetches the day-completions query only when the
  pending count crosses 0 (helper `countPending` at lines 91–100).
- `frontend/src/components/workout/day-board.tsx` — the two fan-outs:

```ts
// blurLoad (~line 303):
const actualLoadKg = Number(LB_TO_KG(lb).toFixed(2))
await Promise.all(logs.map((log) => logSet.mutateAsync({ setLogId: log.id, body: { actualLoadKg } })))
```

```ts
// cycleSet debounce flush (~line 390):
// Completing/skipping a block fans the state out to every set in it.
await Promise.all(logs.map((log) => logSet.mutateAsync({ setLogId: log.id, body: { state: desired } })))
```

Single-set writes that must NOT change: `blurRpe` writes only the last set
of the block (one request — leave it on `useLogSet`).

- The generated API client (`frontend/src/services/generated/`) does not know
  the new batch route and must not be hand-edited or regenerated in this plan.
  Use a plain `fetch` (auth is cookie-based: `credentials: "include"`, base url
  `import.meta.env.VITE_API_BASE_URL ?? ""` — see `frontend/src/main.tsx:13-33`).
  Map the snake_case response through the generated model mapper
  `SetLogResponseFromJSON` (exported from
  `frontend/src/services/generated/models/SetLogResponse.ts`) so the rest of
  the app keeps seeing camelCase `SetLogResponse` objects.
- Conventions: no `useEffect`; mutations live in `frontend/src/hooks/`.

## Commands you will need

| Purpose            | Command                         | Expected on success |
| ------------------ | ------------------------------- | ------------------- |
| Backend build      | `cd backend && go build ./...`  | exit 0              |
| Backend tests      | `cd backend && go test ./...`   | all pass            |
| Frontend typecheck | `cd frontend && pnpm typecheck` | exit 0              |
| Frontend tests     | `cd frontend && pnpm test`      | all pass            |
| Frontend lint      | `cd frontend && pnpm lint`      | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `backend/internal/sessions/dto.go`
- `backend/internal/sessions/handler.go`
- `backend/internal/sessions/service.go`
- `backend/internal/sessions/repository.go`
- `backend/internal/sessions/repository_test.go`
- `frontend/src/hooks/use-session.ts`
- `frontend/src/components/workout/day-board.tsx`

**Out of scope** (do NOT touch):

- The single-set PATCH route/flow — `blurRpe` and any other one-set write keep
  using it; clients of the old route must keep working.
- `frontend/src/services/generated/**` — generated.
- The debounce mechanics in `cycleSet` (timer, `desiredStateRef`) — only the
  inner write changes from fan-out to one batch call.
- The videos feature files — unrelated.

## Git workflow

- Work on branch `set-video-upload` (committed through `311b632`); edit in
  the working tree. Do NOT commit, push, or open a PR unless the operator
  instructed it.

## Steps

### Step 1: DTOs

In `backend/internal/sessions/dto.go` add:

```go
// BatchUpdateSetLogItem is one set_log's updates within a batch write.
type BatchUpdateSetLogItem struct {
	SetLogID uuid.UUID `json:"set_log_id" binding:"required"`
	UpdateSetLogRequest
} // @name BatchUpdateSetLogItem

// BatchUpdateSetLogsRequest applies updates to several of one session's
// set_logs atomically — all rows update or none do.
type BatchUpdateSetLogsRequest struct {
	Updates []BatchUpdateSetLogItem `json:"updates" binding:"required,min=1,max=50"`
} // @name BatchUpdateSetLogsRequest
```

**Verify**: `cd backend && go build ./...` → exit 0.

### Step 2: Repository — one transaction, one recompute

In `backend/internal/sessions/repository.go`:

1. Extract the session-state recompute block from `UpdateSetLog` (the code
   from "Recompute session state from the current set_log distribution"
   through the session-row update) into an unexported helper
   `recomputeSessionState(ctx context.Context, q *query.Query, sessionID uuid.UUID) error`,
   and call it from `UpdateSetLog` so behavior is unchanged. This is a pure
   extract-function refactor — the existing
   `TestRepositoryUpdateSetLog*` tests (if present; check with
   `grep -n "UpdateSetLog" backend/internal/sessions/repository_test.go`) must
   still pass unmodified.
2. Add to the `Repository` interface and implement:

```go
UpdateSetLogs(ctx context.Context, sessionID, ownerUserID uuid.UUID, updates []BatchUpdateSetLogItem) ([]*generated.SetLog, error)
```

Inside one `r.db.WithContext(ctx).Transaction`:

- Probe session ownership ONCE (`sessions` by id + user_id → `First()`;
  a miss propagates `gorm.ErrRecordNotFound` like the existing code).
- Load the session's exercise ids once (`session_exercises` by session_id,
  `Select(se.ID)`), build a set for membership checks.
- For each item: `First()` the set_log by id; if its
  `SessionExerciseID` is not in the membership set, return
  `gorm.ErrRecordNotFound` (aborts and rolls back everything); build the
  same `[]field.AssignExpr` as `UpdateSetLog` does (reuse by extracting that
  assign-building too if convenient, or duplicate the four `if` blocks —
  prefer extraction only if it stays in this file); `UpdateSimple`; reload
  the row into the result slice (the existing single-row code reloads via
  `First()` after update — match it).
- After the loop, call `recomputeSessionState` once.

**Verify**: `cd backend && go build ./... && go test ./internal/sessions/` → pass.

### Step 3: Service + handler

1. `backend/internal/sessions/service.go`: extract the four validation blocks
   of `UpdateSetLog` (lines 63–84) into
   `validateSetLogUpdate(input UpdateSetLogRequest) error` returning the same
   wrapped `ErrInvalidInput` errors; use it from `UpdateSetLog`. Add:

```go
func (s *service) UpdateSetLogs(ctx context.Context, sessionID, ownerUserID uuid.UUID, input BatchUpdateSetLogsRequest) ([]SetLogResponse, error)
```

— validate every item first (fail fast before any DB work), then call the
repo, map each row with `mapSetLog`, propagate `ErrNotFound` on
`gorm.ErrRecordNotFound` exactly as `UpdateSetLog` does. Add the method to
the `Service` interface (`service.go:19` area). 2. `backend/internal/sessions/handler.go`: register
`rg.PATCH("/sessions/:sessionId/set-logs", h.UpdateSetLogs)` next to the
existing single-set route, and implement the handler following
`UpdateSetLog` (lines 145–170): parse `sessionId`, bind
`BatchUpdateSetLogsRequest` (gin's `binding:"min=1,max=50"` rejects empty
and oversized batches as 400), call the service, return
`200` with the `[]SetLogResponse`. Copy the swagger block style from
`UpdateSetLog` (`@Router /api/sessions/{sessionId}/set-logs [patch]`).

**Verify**: `cd backend && go build ./... && go test ./...` → pass.

### Step 4: Backend repository tests

In `backend/internal/sessions/repository_test.go`, following the existing
Begin/queries/Exec/Commit script style (e.g.
`TestRepositoryStartSessionForDay_ExpandsSetsCountIntoPerSetLogs`, line ~280):

1. `TestRepositoryUpdateSetLogs_AppliesAllInOneTransaction` — two updates:
   expect ONE `ExpectBegin`, the session probe, the exercise-ids query, two
   (set_log `First` + `ExpectExec` UPDATE + reload) triples, ONE recompute
   sequence (exercises query + set_logs states query + possible session
   UPDATE), ONE `ExpectCommit`. Assert two rows returned.
2. `TestRepositoryUpdateSetLogs_ForeignSetLogRollsBackAll` — second item's
   set_log belongs to a different session (membership check fails): expect
   `ExpectRollback`, assert `gorm.ErrRecordNotFound`, and that no second
   UPDATE was expected.

(Use the existing `newMockDB`/`uuidArg` helpers — same file.)

**Verify**: `cd backend && go test ./internal/sessions/` → all pass.

### Step 5: Frontend — batch mutation hook

In `frontend/src/hooks/use-session.ts` add `useLogSetBatch(programId,
programDayId)` mirroring `useLogSet` (lines 107+):

- Mutation vars: `{ updates: { setLogId: string; body: UpdateSetLogRequest }[] }`.
- `mutationFn`: read the cached session id exactly like `useLogSet` does
  (`queryClient.getQueryData(sessionQueryKey(...))`, throw if absent), then:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""
// inside mutationFn:
const res = await fetch(`${API_BASE_URL}/api/sessions/${cached.id}/set-logs`, {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    updates: vars.updates.map((u) => ({
      set_log_id: u.setLogId,
      reps_actual: u.body.repsActual,
      actual_load_kg: u.body.actualLoadKg,
      actual_rpe: u.body.actualRpe,
      state: u.body.state,
    })),
  }),
})
if (!res.ok) throw new Error(`batch set-log update failed: ${res.status}`)
const raw: unknown[] = await res.json()
return raw.map(SetLogResponseFromJSON)
```

(import `SetLogResponseFromJSON` from `@/services/generated`; comment that
this hand-rolled call replaces the generated client until the client is
regenerated against the new swagger — same situation as `useVideoConfig` if
plan 005 landed.)

- `onSuccess`: same structure as `useLogSet`'s (snapshot pending count, splice
  EVERY returned log into the cached session's `setLogs` by id, then the same
  crossed-zero check to invalidate day completions). Factor the splice so one
  `setQueryData` call applies all logs (build a `Map<string, SetLogResponse>`
  of updates and map over the cached logs once).

**Verify**: `cd frontend && pnpm typecheck` → exit 0.

### Step 6: Frontend — replace the fan-outs

In `frontend/src/components/workout/day-board.tsx`:

1. Instantiate `const logSetBatch = useLogSetBatch(programId, programDayId)`
   next to the existing `logSet`.
2. `blurLoad`: replace the `Promise.all(logs.map(...))` with

```ts
await logSetBatch.mutateAsync({
  updates: logs.map((log) => ({ setLogId: log.id, body: { actualLoadKg } })),
})
```

3. `cycleSet` flush: replace its `Promise.all(logs.map(...))` with the batch
   equivalent (`body: { state: desired }` per log). Everything around it —
   debounce timer, `desiredStateRef`, the local-override cleanup in the
   `try`/`catch` — stays byte-identical.
4. `blurRpe` stays on `logSet` (single set).

**Verify**: `cd frontend && pnpm typecheck && pnpm lint && pnpm test` → all pass.

## Test plan

- Backend: the two repository tests in step 4; service-level validation is
  already covered through the shared `validateSetLogUpdate` (existing
  `UpdateSetLog` tests keep covering it — confirm they exist with
  `grep -rn "UpdateSetLog" backend/internal/sessions/*_test.go`; if there are
  none, add one service test for an out-of-range batch item returning
  `ErrInvalidInput` before any repo call, using a fake repo if a fake exists
  in the package, else via the repository test harness).
- Frontend: existing suite must stay green. (A renderHook test for
  `useLogSetBatch`'s cache splice is valuable but requires substantial session
  fixture setup — defer unless plan 001's wrapper pattern makes it cheap.)
- Manual (optional, dev stack): mark a 3-set block complete → exactly one
  PATCH in the network tab; kill the backend mid-edit → the block shows one
  error and no set is half-updated after reload.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd backend && go build ./...` and `go test ./...` exit 0
- [ ] `grep -n "set-logs\"" backend/internal/sessions/handler.go` shows the new
      batch route alongside the single-set one
- [ ] `grep -c "recomputeSessionState" backend/internal/sessions/repository.go` ≥ 3
      (helper definition + two callers)
- [ ] `grep -n "Promise.all" frontend/src/components/workout/day-board.tsx`
      returns no matches
- [ ] `cd frontend && pnpm typecheck && pnpm lint && pnpm test` all exit 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The recompute block in `UpdateSetLog` does not match the description (e.g.
  it was already extracted, or the session-state write differs) — re-read and
  report before refactoring.
- Extracting `recomputeSessionState` breaks any existing sessions test —
  that's a signal the extraction changed transaction semantics; report the
  failing test output.
- The cached-session splice in `useLogSet.onSuccess` has changed shape since
  planning (it currently maps `exercises → setLogs` replacing by id).
- You need to touch the generated client to make types line up — use the
  `FromJSON` mappers instead; if those don't exist, STOP.

## Maintenance notes

- Follow-up (deferred): regenerate the typed client (`make swagger` +
  `pnpm api_generate` with the backend running) and swap the hand-written
  fetch in `useLogSetBatch` for the generated method.
- The batch endpoint caps at 50 updates via binding tags; if blocks ever
  exceed that (they won't — `sets_count` is single digits), the cap is the
  place to look.
- Reviewer should scrutinize: (1) the recompute now runs once per batch — the
  per-row recompute inside the loop would reintroduce the N× cost; (2) the
  `cycleSet` debounce flush still deletes `desiredStateRef.current[key]`
  before awaiting, exactly as before; (3) rollback-on-any-failure is the
  intended semantic (all-or-nothing), which differs from the old fan-out where
  some sets could land — that's the point of the change.
