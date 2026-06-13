# Plan 003: Characterization tests for the videos repository

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: This plan was written against **uncommitted**
> work on branch `set-video-upload` (HEAD was `eb95537`; the videos code exists
> only in the working tree). Verify the "Current state" excerpts below match
> the live files. If `backend/internal/videos/repository.go` does not exist, STOP.
>
> **Additional Context**: You should not edit any of the generated files. You can review
> information in the repos README.md for information on how to run all the services and
> and database which should give you everything you need to regenerate the code while
> working through the changes in this plan.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (but plan 004 depends on THIS)
- **Category**: tests
- **Planned at**: commit `eb95537` (+ uncommitted `set-video-upload` working tree), 2026-06-12

## Why this matters

`backend/internal/videos/repository.go` contains the most intricate logic in
the set-video feature — a multi-step quota/replace transaction
(`CreateUpload`), a three-table ownership probe (`VerifySetLogOwned`), and a
two-join listing query (`ListBySession`) — and none of it is tested. The
service and handler layers test against fakes, so the actual SQL behavior
(soft-delete scoping of the quota counts, the replace-and-capture-key dance,
rollback on quota breach) is unverified. Plan 004 changes the quota counting
semantics; these tests must exist first so that change is made against a
characterized baseline.

## Current state

- `backend/internal/videos/repository.go` — the unit under test. Key methods:
  - `CreateUpload` (lines 64–115): one transaction that (a) counts the user's
    active videos (soft-deleted excluded by GORM's `DeletedAt` scope) against
    `maxPerUser`, (b) counts videos created in the trailing 24h against
    `maxPerDay`, (c) finds an existing live video on the same `set_log_id`,
    soft-deletes it and captures its `storage_key` into `oldKey`, then
    (d) inserts the new `pending` row. Returns `ErrQuotaExceeded` (defined
    `repository.go:19`) on either quota breach.
  - `VerifySetLogOwned` (lines 46–62): three sequential `First()` probes —
    set_log by id, session_exercise by (id, session_id), session by (id, user_id).
    Any miss returns `gorm.ErrRecordNotFound`.
  - `GetOwned` (117–120), `MarkReady` (122–129), `MarkFailed` (131–135),
    `UpdateNote` (137–155), `SoftDelete` (157–168), `ListBySession` (170–194 —
    session ownership probe, then `set_videos` joined to `set_logs` joined to
    `session_exercises` filtered by `session_id` and `user_id`).
- The exemplar test pattern is `backend/internal/sessions/repository_test.go`.
  It uses `github.com/DATA-DOG/go-sqlmock` (already in `go.mod`) against a GORM
  postgres driver with `PreferSimpleProtocol`. Its helpers (lines 17–40):

```go
func newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("gorm.Open: %v", err)
	}
	return gormDB, mock
}

func uuidArg(id uuid.UUID) driver.Value {
	return id.String()
}
```

These helpers are unexported in package `sessions` — copy them into the new
test file (package `videos`); do not export or import them across packages.

- The `set_videos` model is `backend/internal/models/generated/set_videos.gen.go`
  (GORM soft delete via `DeletedAt gorm.DeletedAt`). Columns: `id`,
  `set_log_id`, `user_id`, `status`, `storage_key`, `content_type`,
  `size_bytes`, `duration_sec`, `original_name`, `note`, `created_at`,
  `updated_at`, `deleted_at`.
- Naming convention for tests in this repo:
  `TestRepository<Method>_<Behavior>` (see sessions test names), table-free
  individual test funcs, `mock.ExpectationsWereMet()` asserted at the end.
- There is already a `videos` package test file (`service_test.go`) — the new
  file joins the same package, so helper names must not collide with anything
  in `service_test.go`/`handler_test.go` (at planning time `newMockDB`/`uuidArg`
  do not exist there).

## Commands you will need

| Purpose   | Command (run in `backend/`)  | Expected on success |
| --------- | ---------------------------- | ------------------- |
| Build     | `go build ./...`             | exit 0              |
| Tests     | `go test ./internal/videos/` | all pass            |
| All tests | `go test ./...`              | all pass            |

## Scope

**In scope** (the only file you should create/modify):

- `backend/internal/videos/repository_test.go` (create)

**Out of scope** (do NOT touch):

- `backend/internal/videos/repository.go` — this plan **characterizes** current
  behavior, including the quirk that quota counts exclude soft-deleted rows
  (plan 004 changes that deliberately, afterwards). If a test reveals what
  looks like a bug, encode the _current_ behavior and note it in your report.
- `backend/internal/sessions/repository_test.go` — copy from it, never edit it.

## Git workflow

- The feature branch `set-video-upload` is uncommitted; add the new file on
  that working tree. Do NOT commit, push, or open a PR unless the operator
  instructed it.

## Steps

### Step 1: Scaffold the file and prove the harness works

Create `backend/internal/videos/repository_test.go`, package `videos`, with
the `newMockDB`/`uuidArg` helpers copied from the excerpt above, and one first
test: `TestRepositoryGetOwned_FiltersByOwner` —

- `mock.ExpectQuery(`SELECT \* FROM "set_videos" WHERE`)` with args
  `uuidArg(videoID), uuidArg(ownerID), 1` returning a row with at least
  `id, set_log_id, user_id, status, storage_key, created_at, updated_at`.
- Call `NewRepository(db).GetOwned(ctx, videoID, ownerID)`; assert no error,
  returned `ID` matches, and `mock.ExpectationsWereMet()` passes.

GORM/sqlmock calibration note: GORM emits soft-delete filters
(`"set_videos"."deleted_at" IS NULL`) and `LIMIT` automatically — keep the
regexes loose (match on table + distinguishing fragment), exactly as the
sessions tests do. If a test fails with "call to Query ... was not expected,
next expectation is ExecQuery", switch `ExpectQuery` ↔ `ExpectExec` for that
statement — GORM uses `Exec` for UPDATEs and `Query` for SELECTs and for
INSERTs with `RETURNING`.

**Verify**: `go test ./internal/videos/ -run TestRepositoryGetOwned` → pass.

### Step 2: CreateUpload — the four transaction outcomes

Add, in order (each follows the transaction script in `repository.go:64-115`;
all expectations wrapped in `mock.ExpectBegin()` … `ExpectCommit()`/`ExpectRollback()`):

1. `TestRepositoryCreateUpload_HappyPathNoExisting`
   - count #1 (user total): `ExpectQuery(`SELECT count\(\*\) FROM "set_videos"`)`
     → 0; count #2 (trailing 24h — distinguished by its extra `created_at >`
     arg) → 0; existing-video lookup
     (`SELECT \* FROM "set_videos" WHERE .*set_log_id`) → empty rows (drives
     `gorm.ErrRecordNotFound`); `INSERT INTO "set_videos"` → success;
     `ExpectCommit`.
   - Assert `oldKey == ""` and `err == nil`.
2. `TestRepositoryCreateUpload_ReplacesExistingAndReturnsOldKey`
   - Same as above but the existing-video lookup returns one row with
     `storage_key = "users/u/set-videos/old.mp4"`; then expect the soft-delete
     (`ExpectExec(`UPDATE "set_videos" SET "deleted_at"`)` → 1 row affected)
     before the INSERT.
   - Assert `oldKey == "users/u/set-videos/old.mp4"`.
3. `TestRepositoryCreateUpload_PerUserQuotaRollsBack`
   - count #1 → `maxPerUser` (pass e.g. 5 and return 5); `ExpectRollback`.
   - Assert `errors.Is(err, ErrQuotaExceeded)`.
4. `TestRepositoryCreateUpload_PerDayQuotaRollsBack`
   - count #1 → 0, count #2 → `maxPerDay`; `ExpectRollback`.
   - Assert `errors.Is(err, ErrQuotaExceeded)`.

Characterization detail to encode in tests 3–4 (this is the baseline plan 004
changes): both count queries currently include the soft-delete filter — assert
the SQL regex includes `deleted_at` (sqlmock regexp matching makes this
straightforward: put `deleted_at` in the expected-query regex).

**Verify**: `go test ./internal/videos/ -run TestRepositoryCreateUpload` → 4 pass.

### Step 3: Ownership probes and listing

1. `TestRepositoryVerifySetLogOwned_HappyPath` — three `ExpectQuery`s
   (set_logs by id; session_exercises by id+session_id; sessions by
   id+user_id), each returning one row; assert nil error. The set_logs row
   must include `session_exercise_id` since the second probe uses it.
2. `TestRepositoryVerifySetLogOwned_ForeignSessionIsNotFound` — first two
   probes succeed, sessions probe returns empty rows; assert
   `errors.Is(err, gorm.ErrRecordNotFound)`.
3. `TestRepositoryListBySession_ProbesOwnershipThenJoins` — sessions probe
   returns a row; then one `ExpectQuery(`SELECT ._"set_videos"._ JOIN`)`
   returning two rows; assert 2 results in order and expectations met.
4. `TestRepositoryListBySession_UnownedSessionShortCircuits` — sessions probe
   returns empty rows; assert `gorm.ErrRecordNotFound` and that NO join query
   was expected (expectations met proves it never ran).

**Verify**: `go test ./internal/videos/ -run "TestRepositoryVerify|TestRepositoryList"` → 4 pass.

### Step 4: SoftDelete

`TestRepositorySoftDelete_ReturnsKeyAndSoftDeletes` — ownership `SELECT`
returns a row with a known `storage_key`; `ExpectExec(`UPDATE "set_videos" SET
"deleted_at"`)` → 1 row; assert returned key matches.
`TestRepositorySoftDelete_ForeignVideoIsNotFound` — SELECT returns empty rows;
assert `gorm.ErrRecordNotFound` and no UPDATE expected.

**Verify**: `go test ./internal/videos/` → all repository + existing service/handler tests pass.

## Test plan

This plan IS the test plan: 11 new test functions listed in steps 1–4, all in
`backend/internal/videos/repository_test.go`, modeled structurally on
`backend/internal/sessions/repository_test.go` (e.g.
`TestRepositoryStartSessionForDay_ExpandsSetsCountIntoPerSetLogs` at line 280
shows a full Begin/queries/Exec/Commit script).

- Verification: `cd backend && go test ./...` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `backend/internal/videos/repository_test.go` exists with ≥11 `func Test` entries
      (`grep -c "func Test" backend/internal/videos/repository_test.go` ≥ 11)
- [ ] `cd backend && go test ./internal/videos/` exits 0
- [ ] `cd backend && go test ./...` exits 0
- [ ] Every new test calls `mock.ExpectationsWereMet()`
      (`grep -c "ExpectationsWereMet" backend/internal/videos/repository_test.go` ≥ 11)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `repository.go` no longer matches the method list/line ranges above.
- You cannot get the `CreateUpload` happy path green after calibrating
  ExpectQuery/ExpectExec and loosening regexes twice — report the exact sqlmock
  mismatch output rather than restructuring the repository to be more testable.
- You find yourself wanting to modify `repository.go` to make a test pass —
  that is out of scope by definition here.

## Maintenance notes

- Plan 004 will flip the per-day count to `Unscoped()` (including soft-deleted
  rows). The assertion in `TestRepositoryCreateUpload_PerDayQuotaRollsBack`
  that the query filters on `deleted_at` is **expected to be inverted by plan
  004** — that's deliberate; the failing test is the proof the semantic change
  happened.
- These tests pin GORM's generated SQL shape; a GORM/gen major upgrade may
  require loosening regexes — that's churn, not breakage.
