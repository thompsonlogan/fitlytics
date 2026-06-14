# Plan 004: Remove the N+1 round-trips in `UpdateSetLogs`

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb2af4b..HEAD -- backend/internal/sessions/repository.go backend/internal/sessions/repository_test.go`
> If either changed, compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (single repository function + its two unit tests; full transaction semantics preserved)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

`UpdateSetLogs` (the block-level "save all sets" endpoint) issues **three queries
per item** inside its transaction — a `First` to load the row, an `UPDATE`, then a
`First` to reload it — so a block of N sets does ~2N read round-trips plus N writes.
The reads can be collapsed into **two** queries total (one prefetch, one reload)
regardless of N, with identical behavior and the same all-or-nothing transaction.
This also makes validation cleaner: validate every item *before* writing, instead of
writing some rows and rolling back when a later item fails.

## Current state

`backend/internal/sessions/repository.go:373-446`, `UpdateSetLogs`:

```go
func (r *repository) UpdateSetLogs(ctx context.Context, sessionID, ownerUserID uuid.UUID, updates []BatchUpdateSetLogItem) ([]*generated.SetLog, error) {
	var out []*generated.SetLog

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := query.Use(tx)
		sl := q.SetLog
		se := q.SessionExercise
		ss := q.Session

		// Probe session ownership once.
		_, err := ss.WithContext(ctx).
			Where(ss.ID.Eq(sessionID), ss.UserID.Eq(ownerUserID)).
			First()
		if err != nil {
			return err
		}

		// Load all session exercise ids for membership checks.
		exercises, err := se.WithContext(ctx).
			Select(se.ID).
			Where(se.SessionID.Eq(sessionID)).
			Find()
		if err != nil {
			return fmt.Errorf("find session exercises: %w", err)
		}
		seSet := make(map[uuid.UUID]struct{}, len(exercises))
		for _, ex := range exercises {
			seSet[ex.ID] = struct{}{}
		}

		out = make([]*generated.SetLog, 0, len(updates))
		for _, item := range updates {
			setLog, err := sl.WithContext(ctx).Where(sl.ID.Eq(item.SetLogID)).First()
			if err != nil {
				return err
			}
			if _, ok := seSet[setLog.SessionExerciseID]; !ok {
				return gorm.ErrRecordNotFound
			}

			var assigns []field.AssignExpr
			if item.RepsActual != nil {
				assigns = append(assigns, sl.RepsActual.Value(*item.RepsActual))
			}
			if item.ActualLoadKg != nil {
				assigns = append(assigns, sl.ActualLoadKg.Value(*item.ActualLoadKg))
			}
			if item.ActualRpe != nil {
				assigns = append(assigns, sl.ActualRpe.Value(*item.ActualRpe))
			}
			if item.State != nil {
				assigns = append(assigns, sl.State.Value(*item.State))
			}
			if len(assigns) > 0 {
				if _, err := sl.WithContext(ctx).Where(sl.ID.Eq(item.SetLogID)).UpdateSimple(assigns...); err != nil {
					return fmt.Errorf("update set log: %w", err)
				}
			}

			reloaded, err := sl.WithContext(ctx).Where(sl.ID.Eq(item.SetLogID)).First()
			if err != nil {
				return err
			}
			out = append(out, reloaded)
		}

		// Recompute session state exactly once after all updates.
		return recomputeSessionState(ctx, q, sessionID)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
```

Relevant facts:
- `BatchUpdateSetLogItem` (`sessions/dto.go:58`) embeds `UpdateSetLogRequest`, so an
  item has `SetLogID uuid.UUID` plus optional `*RepsActual/*ActualLoadKg/*ActualRpe/*State`.
- `recomputeSessionState(ctx, q, sessionID)` is unchanged by this plan and must
  still be called once at the end, inside the transaction.
- **The `In(...)` idiom in this file**: `recomputeSessionState` (lines 325-333) builds
  a `[]driver.Valuer` and passes it to `.In(...)`. Mirror this — gorm/gen's `In`
  takes `...driver.Valuer`, and `uuid.UUID` satisfies `driver.Valuer`:
  ```go
  seIDs := make([]driver.Valuer, len(exercises))
  for i, ex := range exercises {
  	seIDs[i] = ex.ID
  }
  logs, err := sl.WithContext(ctx).Select(sl.State).Where(sl.SessionExerciseID.In(seIDs...)).Find()
  ```
- Imports already present in `repository.go`: `database/sql/driver`, `gorm.io/gen/field`,
  `github.com/google/uuid`, `gorm.io/gorm`. **No new imports are needed.**
- The two tests that pin the current query sequence and **must be rewritten**:
  `TestRepositoryUpdateSetLogs_AppliesAllInOneTransaction` and
  `TestRepositoryUpdateSetLogs_ForeignSetLogRollsBackAll` (in `repository_test.go`,
  lines 501-653). The test harness uses `go-sqlmock` with the **regexp** query
  matcher and asserts every expectation is met in order.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Run sessions tests | `cd backend && go test ./internal/sessions/...` | `ok ... sessions` |
| Run just the batch tests | `cd backend && go test ./internal/sessions/ -run UpdateSetLogs -v` | both pass |
| All tests | `cd backend && make test` | all packages `ok` |
| Vet | `cd backend && go vet ./internal/sessions/...` | exit 0 |

## Scope

**In scope**:
- `backend/internal/sessions/repository.go` — rewrite the body of `UpdateSetLogs` only.
- `backend/internal/sessions/repository_test.go` — rewrite the two batch tests' mock
  expectations to match the new query sequence.

**Out of scope** (do NOT touch):
- `recomputeSessionState` — leave it exactly as-is.
- `UpdateSetLog` (singular) and its test — different code path, not in this plan.
- The handler, service, dto, mapper — the function signature and return value
  (ordered `[]*generated.SetLog`) are unchanged, so callers are unaffected.
- Do **not** attempt to collapse the N `UPDATE`s into one CASE/WHEN statement —
  the per-item assignments differ and gorm/gen makes that fragile. Keep N updates;
  only the **reads** are being batched. (Noted as deferred below.)

## Git workflow

- Branch: `advisor/004-batch-setlog-n-plus-1`
- One commit; message style: conventional commits, e.g.
  `perf(sessions): batch reads in UpdateSetLogs (prefetch + reload once)`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Rewrite `UpdateSetLogs` to prefetch, validate-all, update, reload-once

Replace the body of `UpdateSetLogs` with the following. The shape: probe ownership →
load session-exercise ids → **prefetch all target set logs in one query** → validate
every item before any write → apply N updates → **reload all in one query** and
assemble in input order → recompute.

```go
func (r *repository) UpdateSetLogs(ctx context.Context, sessionID, ownerUserID uuid.UUID, updates []BatchUpdateSetLogItem) ([]*generated.SetLog, error) {
	var out []*generated.SetLog

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := query.Use(tx)
		sl := q.SetLog
		se := q.SessionExercise
		ss := q.Session

		// Probe session ownership once.
		if _, err := ss.WithContext(ctx).
			Where(ss.ID.Eq(sessionID), ss.UserID.Eq(ownerUserID)).
			First(); err != nil {
			return err
		}

		// Load all session exercise ids for membership checks.
		exercises, err := se.WithContext(ctx).
			Select(se.ID).
			Where(se.SessionID.Eq(sessionID)).
			Find()
		if err != nil {
			return fmt.Errorf("find session exercises: %w", err)
		}
		seSet := make(map[uuid.UUID]struct{}, len(exercises))
		for _, ex := range exercises {
			seSet[ex.ID] = struct{}{}
		}

		// Prefetch every targeted set log in one query.
		idVals := make([]driver.Valuer, len(updates))
		for i, item := range updates {
			idVals[i] = item.SetLogID
		}
		existing, err := sl.WithContext(ctx).Where(sl.ID.In(idVals...)).Find()
		if err != nil {
			return fmt.Errorf("load set logs: %w", err)
		}
		byID := make(map[uuid.UUID]*generated.SetLog, len(existing))
		for _, row := range existing {
			byID[row.ID] = row
		}

		// Validate every item BEFORE writing anything: each id must exist and
		// belong to a session_exercise in this session.
		for _, item := range updates {
			row, ok := byID[item.SetLogID]
			if !ok {
				return gorm.ErrRecordNotFound
			}
			if _, ok := seSet[row.SessionExerciseID]; !ok {
				return gorm.ErrRecordNotFound
			}
		}

		// Apply each item's field updates (one UPDATE per item; assignments differ).
		for _, item := range updates {
			var assigns []field.AssignExpr
			if item.RepsActual != nil {
				assigns = append(assigns, sl.RepsActual.Value(*item.RepsActual))
			}
			if item.ActualLoadKg != nil {
				assigns = append(assigns, sl.ActualLoadKg.Value(*item.ActualLoadKg))
			}
			if item.ActualRpe != nil {
				assigns = append(assigns, sl.ActualRpe.Value(*item.ActualRpe))
			}
			if item.State != nil {
				assigns = append(assigns, sl.State.Value(*item.State))
			}
			if len(assigns) > 0 {
				if _, err := sl.WithContext(ctx).Where(sl.ID.Eq(item.SetLogID)).UpdateSimple(assigns...); err != nil {
					return fmt.Errorf("update set log: %w", err)
				}
			}
		}

		// Reload all updated rows in one query; assemble in input order.
		reloaded, err := sl.WithContext(ctx).Where(sl.ID.In(idVals...)).Find()
		if err != nil {
			return fmt.Errorf("reload set logs: %w", err)
		}
		byID = make(map[uuid.UUID]*generated.SetLog, len(reloaded))
		for _, row := range reloaded {
			byID[row.ID] = row
		}
		out = make([]*generated.SetLog, 0, len(updates))
		for _, item := range updates {
			out = append(out, byID[item.SetLogID])
		}

		// Recompute session state exactly once after all updates.
		return recomputeSessionState(ctx, q, sessionID)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
```

**Verify**: `cd backend && go build ./internal/sessions/...` → exit 0. (Tests will be
red until Step 2 — that's expected.)

### Step 2: Rewrite the two batch tests' mock expectations

The query sequence changed, so `go-sqlmock`'s ordered expectations must be updated.
Open `backend/internal/sessions/repository_test.go`.

**2a — `TestRepositoryUpdateSetLogs_AppliesAllInOneTransaction`** (currently lines
501-590). Replace its expectation block so the sequence is:

1. `mock.ExpectBegin()`
2. session ownership probe — unchanged:
   `mock.ExpectQuery(\`SELECT \* FROM "sessions" WHERE .* LIMIT\`).WithArgs(uuidArg(sessionID), uuidArg(ownerID), 1)...` returning the session row.
3. session-exercise ids — unchanged:
   `mock.ExpectQuery(\`SELECT "session_exercises"\."id" FROM "session_exercises"\`).WithArgs(uuidArg(sessionID))...` returning `seID`.
4. **NEW — prefetch both set logs in one query** (no per-item `First`):
   ```go
   mock.ExpectQuery(`SELECT \* FROM "set_logs" WHERE .*"set_logs"\."id" IN`).
       WithArgs(uuidArg(logID1), uuidArg(logID2)).
       WillReturnRows(sqlmock.NewRows([]string{"id", "session_exercise_id", "sequence", "set_type", "state"}).
           AddRow(logID1, seID, 1, "working", "pending").
           AddRow(logID2, seID, 2, "working", "pending"))
   ```
5. two `UPDATE`s, one per item:
   ```go
   mock.ExpectExec(`UPDATE "set_logs" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
   mock.ExpectExec(`UPDATE "set_logs" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
   ```
6. **NEW — reload both in one query**:
   ```go
   mock.ExpectQuery(`SELECT \* FROM "set_logs" WHERE .*"set_logs"\."id" IN`).
       WithArgs(uuidArg(logID1), uuidArg(logID2)).
       WillReturnRows(sqlmock.NewRows([]string{"id", "session_exercise_id", "sequence", "set_type", "state"}).
           AddRow(logID1, seID, 1, "working", "completed").
           AddRow(logID2, seID, 2, "working", "completed"))
   ```
7. recompute (unchanged from current test, lines 558-569): session-exercise ids query,
   then `SELECT "set_logs"\."state" FROM "set_logs"` returning two `"completed"` rows,
   then `mock.ExpectExec(\`UPDATE "sessions" SET\`)`.
8. `mock.ExpectCommit()`

Keep the assertions at the bottom (`len(out)==2`, `out[0].ID==logID1`, `out[1].ID==logID2`,
`ExpectationsWereMet`). The `updates` slice construction stays the same.

**2b — `TestRepositoryUpdateSetLogs_ForeignSetLogRollsBackAll`** (currently lines
592-653). Because validation now happens *before* any write, the foreign-membership
failure short-circuits with **no UPDATEs**. New sequence:

1. `mock.ExpectBegin()`
2. session ownership probe — unchanged.
3. session-exercise ids — returns only `seID` (unchanged).
4. **NEW — prefetch both in one query**, where `logID2` belongs to a foreign exercise:
   ```go
   mock.ExpectQuery(`SELECT \* FROM "set_logs" WHERE .*"set_logs"\."id" IN`).
       WithArgs(uuidArg(logID1), uuidArg(logID2)).
       WillReturnRows(sqlmock.NewRows([]string{"id", "session_exercise_id", "sequence", "set_type", "state"}).
           AddRow(logID1, seID, 1, "working", "pending").
           AddRow(logID2, foreignSeID, 1, "working", "pending"))
   ```
5. `mock.ExpectRollback()` — no UPDATE, no reload (validation rejects `logID2`).

Keep the assertion that the call returns `gorm.ErrRecordNotFound` and
`ExpectationsWereMet`. Remove the old per-item `First`/`UPDATE`/reload expectations.

> Note on `IN` argument order: gorm builds `IN ($1,$2)` in the slice order, which is
> the `updates` order (`logID1` then `logID2`), so `WithArgs(uuidArg(logID1), uuidArg(logID2))`
> is correct. If sqlmock reports an args mismatch, print the actual query with
> `mock.ExpectationsWereMet()`'s error and re-check the order — do not loosen to a
> bare `.ExpectQuery` without args unless STOP-condition territory.

**Verify**: `cd backend && go test ./internal/sessions/ -run UpdateSetLogs -v` → both
tests pass.

### Step 3: Full suite green

**Verify**: `cd backend && go vet ./internal/sessions/... && make test` → exit 0.

## Test plan

- No new test files. The two existing batch tests are rewritten to assert the new
  query sequence (one prefetch + N updates + one reload, instead of N×(First+Update+First)).
- Behavior asserted is unchanged: all updates applied in one transaction; results
  returned in input order; a set log not belonging to the session rolls everything
  back with `gorm.ErrRecordNotFound`.
- Pattern reference: the surrounding tests in the same file (the `newMockDB` helper,
  `uuidArg`, ordered `Expect*` calls, `ExpectationsWereMet`).

## Done criteria

ALL must hold:

- [ ] `UpdateSetLogs` issues at most one `SELECT ... IN (...)` to prefetch and one to
      reload — no per-item `First` calls. (Confirm by reading the rewritten function.)
- [ ] `cd backend && go test ./internal/sessions/ -run UpdateSetLogs -v` → both tests pass.
- [ ] `cd backend && make test` exits 0.
- [ ] `git status` shows only `repository.go` and `repository_test.go` under
      `internal/sessions/` changed (plus `plans/README.md`).
- [ ] `plans/README.md` status row for 004 updated.

## STOP conditions

Stop and report back if:

- gorm/gen's `sl.ID.In(idVals...)` doesn't compile with `[]driver.Valuer` (the field
  API differs from `recomputeSessionState`'s usage) — report the actual signature.
- After two honest attempts the rewritten sqlmock expectations still don't match the
  emitted SQL (e.g. an unexpected extra query like a soft-delete clause you can't
  regex) — capture the `ExpectationsWereMet` error text and report it.
- The "Current state" excerpt of `UpdateSetLogs` doesn't match the live function (drift).

## Maintenance notes

- The N `UPDATE` statements remain per-item by design (heterogeneous assignments).
  If a future change makes all items share the same fields (e.g. a "mark block
  complete" that only sets `state`), a single `UPDATE ... WHERE id IN (...)` becomes
  viable — that's the deferred follow-up.
- A reviewer should confirm validation runs fully *before* the first `UPDATE`, so a
  bad item can never leave a partial write even momentarily, and that
  `recomputeSessionState` is still the last statement inside the transaction.
- If pagination or chunking is ever added for very large blocks, the single
  `IN (...)` prefetch/reload may need batching — but `dto.go` caps a batch at 50
  (`binding:"required,min=1,max=50"`), so this is not a concern today.
