# Plan 004: Make the daily upload quota count replaced (soft-deleted) videos

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

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-videos-repository-tests.md (characterization baseline)
- **Category**: security
- **Planned at**: commit `eb95537` (+ uncommitted `set-video-upload` working tree), 2026-06-12

## Why this matters

`MAX_VIDEOS_PER_DAY` (default 50) exists to bound upload bandwidth abuse —
CLAUDE.md documents it as "Max videos a user can upload per rolling 24h".
But the rolling-24h count uses GORM's default soft-delete scope, and every
re-upload to the same set **soft-deletes the previous row** before inserting
the new one. So a user who repeatedly replaces the video on a single set keeps
the visible count at ~1 and can upload an unbounded number of 500 MB files per
day. Counting *all* rows created in the window — deleted or not — makes the
quota mean what the docs say. (The per-user total quota is intentionally
different: it bounds *accumulated active* videos, so it correctly excludes
soft-deleted rows and must not change.)

## Current state

- `backend/internal/videos/repository.go:64-115` — `CreateUpload` transaction.
  The two quota counts:

```go
// repository.go:71-89
		// Quota: total active videos for the user (soft-deleted excluded).
		total, err := sv.WithContext(ctx).Where(sv.UserID.Eq(ownerID)).Count()
		if err != nil {
			return fmt.Errorf("count user videos: %w", err)
		}
		if int(total) >= maxPerUser {
			return ErrQuotaExceeded
		}

		// Quota: videos created in the trailing 24h.
		since := time.Now().Add(-24 * time.Hour)
		recent, err := sv.WithContext(ctx).
			Where(sv.UserID.Eq(ownerID), sv.CreatedAt.Gt(since)).Count()
		if err != nil {
			return fmt.Errorf("count recent videos: %w", err)
		}
		if int(recent) >= maxPerDay {
			return ErrQuotaExceeded
		}
```

- The replace-on-reupload soft delete is just below (lines 91–104): the
  existing live row for the `set_log_id` is soft-deleted in the same
  transaction.
- The generated query API supports unscoped queries: `setVideoDo.Unscoped()`
  at `backend/internal/query/set_videos.gen.go:235` returns `*setVideoDo`, and
  `WithContext`/`Where` also return `*setVideoDo`, so the call chains:
  `sv.WithContext(ctx).Unscoped().Where(...).Count()`.
- Plan 003 added `backend/internal/videos/repository_test.go`. Its
  `TestRepositoryCreateUpload_PerDayQuotaRollsBack` asserts the per-day count
  query **includes** a `deleted_at` filter — this plan inverts that assertion.
- The CLAUDE.md env-var table (`CLAUDE.md`, "Environment variables" section)
  already describes the intended semantics; no doc change needed.

## Commands you will need

| Purpose   | Command (run in `backend/`)  | Expected on success |
|-----------|------------------------------|---------------------|
| Build     | `go build ./...`             | exit 0              |
| Tests     | `go test ./internal/videos/` | all pass            |
| All tests | `go test ./...`              | all pass            |

## Scope

**In scope** (the only files you should modify):
- `backend/internal/videos/repository.go`
- `backend/internal/videos/repository_test.go`

**Out of scope** (do NOT touch, even though they look related):
- The per-user total count (`repository.go:72`) — excluding soft-deleted rows
  there is correct and documented ("active videos").
- Row locking / `FOR UPDATE` on the quota counts — the check-then-insert race
  exists but is bounded by the unique index `set_videos_setlog_uq` and is
  accepted for now (see Maintenance notes).
- `backend/internal/videos/service.go`, `handler.go` — quota propagation
  already works end to end.
- `CLAUDE.md` — already states the intended behavior.

## Git workflow

- The feature branch `set-video-upload` is uncommitted; edit in place on that
  working tree. Do NOT commit, push, or open a PR unless the operator
  instructed it.

## Steps

### Step 1: Switch the per-day count to an unscoped query

In `backend/internal/videos/repository.go`, change the per-day count (and only
it) to bypass the soft-delete scope, and update the comment to say why:

```go
		// Quota: videos created in the trailing 24h. Unscoped on purpose —
		// re-uploading soft-deletes the replaced row, and the daily cap bounds
		// upload bandwidth, so replaced uploads must still count.
		since := time.Now().Add(-24 * time.Hour)
		recent, err := sv.WithContext(ctx).Unscoped().
			Where(sv.UserID.Eq(ownerID), sv.CreatedAt.Gt(since)).Count()
```

**Verify**: `go build ./...` → exit 0.

### Step 2: Update the characterization tests

In `backend/internal/videos/repository_test.go`:

1. `TestRepositoryCreateUpload_PerDayQuotaRollsBack`: the per-day count query
   no longer carries the `deleted_at IS NULL` filter. Update the expected-query
   regex so it matches the unscoped statement and **asserts the absence** of
   the soft-delete filter — with sqlmock's regexp matcher, match the full
   statement shape, e.g. a regex for the second count that requires
   `user_id = .* AND created_at >` and uses a negative pattern or simply an
   exact-enough regex that would not match if `deleted_at` were present
   (e.g. anchor the WHERE clause: `WHERE "set_videos"\."user_id" = \$1 AND
   "set_videos"\."created_at" > \$2$` adjusted to the actual emitted SQL — run
   the test once to see the emitted statement in the mismatch error, then pin it).
2. The happy-path tests from plan 003 expect two count queries; only the
   *second* one changes shape. Adjust their regexes the same way.
3. Confirm the per-user count regex still requires `deleted_at` (unchanged —
   this is the guard that step 1 didn't over-reach).

**Verify**: `go test ./internal/videos/` → all pass.

## Test plan

- Updated tests in `repository_test.go` per step 2 — the per-day quota test
  now pins the unscoped statement, the per-user test still pins the scoped one.
- No new test files. Verification: `cd backend && go test ./...` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "Unscoped()" backend/internal/videos/repository.go` shows exactly
      one match, inside `CreateUpload`'s per-day count
- [ ] `cd backend && go test ./internal/videos/` exits 0
- [ ] `cd backend && go test ./...` exits 0
- [ ] The per-user count line (`repository.go`) is byte-identical to before
      (`git diff backend/internal/videos/repository.go` touches only the
      per-day count block and its comment)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 003's tests do not exist yet (`backend/internal/videos/repository_test.go`
  missing) — this plan depends on that baseline; execute 003 first.
- `Unscoped()` is not available on the chain (generated code regenerated with
  different shape) — report, don't drop to raw SQL.
- Any test outside `CreateUpload`'s scope starts failing.

## Maintenance notes

- Known accepted gap: the quota check is check-then-insert without a row lock,
  so two concurrent uploads can both pass a nearly-full quota. Severity is low
  (single-user app, caps are soft limits) and the per-set unique index
  `set_videos_setlog_uq` bounds same-set races — revisit with `SELECT ...
  FOR UPDATE` or an advisory lock if this ever serves multiple users at scale.
  Related: a concurrent same-set duplicate insert currently surfaces as a 500
  (unique violation) rather than 409; `apierr.Conflict` exists unused in
  `backend/internal/apierr/problem.go:65` if someone wants to map it.
- If a "failed/pending row janitor" is ever added, make sure it hard-deletes or
  the unscoped daily count will keep counting janitor-deleted rows (correct for
  bandwidth accounting, but worth a comment then).
