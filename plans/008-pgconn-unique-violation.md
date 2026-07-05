# Plan 008: Detect unique-constraint violations via pgconn error codes, not string matching

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- backend/internal/sessions/repository.go backend/internal/sessions/repository_test.go backend/go.mod`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW-MED — the risk is subtle: this guards a concurrency recovery
  path that only fires under a race, so a wrong implementation won't fail any
  happy-path test. The unit tests below pin it down.
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

`StartSessionForDay` handles the "two devices start the same day
simultaneously" race by catching the unique-index violation on
`sessions_active_day_uq` and returning the winner's row. Detection is
currently a substring match on the error text
(`backend/internal/sessions/repository.go:80–82`), which silently breaks if
the driver's message format changes (driver upgrade, localized server
messages, GORM error-translation being enabled). When it breaks, the user
sees a 500 instead of their session — and no test will notice, because the
path only fires under a race. Matching on the Postgres error code (`23505`)
and constraint name via `pgconn.PgError` is exact and version-stable.

## Current state

- `backend/internal/sessions/repository.go:77–82`:

```go
// isUniqueViolation reports whether err (possibly wrapped) is a Postgres
// unique-constraint violation on the named constraint. Matched by name so it
// stays independent of the SQL driver's concrete error type.
func isUniqueViolation(err error, constraint string) bool {
	return err != nil && strings.Contains(err.Error(), constraint)
}
```

- Its single call site, lines 263–269:

```go
	if err != nil {
		// A concurrent first-start committed the session before us and our insert
		// hit sessions_active_day_uq; load and return the winner's row.
		if isUniqueViolation(err, "sessions_active_day_uq") {
			return r.GetCurrentSessionByDay(ctx, programID, programDayID, ownerUserID)
		}
		return nil, err
	}
```

- The driver stack: `gorm.io/driver/postgres` → `github.com/jackc/pgx/v5`
  (already in `backend/go.sum` as an indirect dependency, v5.6.0). pgx
  surfaces server errors as `*pgconn.PgError` with fields `Code`
  (SQLSTATE, `"23505"` for unique_violation) and `ConstraintName`. GORM
  returns the driver error wrapped, so `errors.As` unwraps it. GORM's
  `TranslateError` option is NOT enabled in this repo
  (`backend/internal/database/database.go` — plain `gorm.Config` with only a
  Logger), so no `gorm.ErrDuplicatedKey` translation occurs.

- There is currently NO test covering `isUniqueViolation` (verified by grep
  at planning time).

- Conventions: stdlib testing, tests alongside code
  (`backend/internal/sessions/repository_test.go` exists — add to it or
  create a focused file). Windows/CRLF note: ignore `gofmt -l` noise on CRLF
  checkouts; rely on `go vet` and CI.

## Commands you will need

| Purpose       | Command                                       | Expected on success |
|---------------|-----------------------------------------------|---------------------|
| Add dep       | `cd backend && go get github.com/jackc/pgx/v5@v5.6.0` | go.mod gains a direct require (same version as go.sum) |
| Tidy          | `cd backend && go mod tidy`                   | exit 0, no version changes |
| Tests         | `cd backend && go test ./internal/sessions/`  | ok                  |
| All tests     | `cd backend && go test ./...`                 | ok                  |
| Vet           | `cd backend && go vet ./...`                  | exit 0              |

## Scope

**In scope**:
- `backend/internal/sessions/repository.go`
- `backend/internal/sessions/repository_test.go` (or a new
  `unique_violation_test.go` beside it)
- `backend/go.mod` / `backend/go.sum` (pgx moves from indirect to direct)

**Out of scope** (do NOT touch):
- Enabling GORM `TranslateError` — that changes error types across the whole
  codebase and every `errors.Is(err, gorm.ErrRecordNotFound)` check would
  need re-auditing.
- `backend/internal/videos/repository.go` and other repositories — no other
  string-matched constraint checks exist today (grep confirms this is the
  only one).
- The transaction logic of `StartSessionForDay`.

## Git workflow

- Branch: `advisor/008-pgconn-unique-violation`
- Commit style: `refactor(backend): detect unique violations via pgconn error codes`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace the implementation

In `backend/internal/sessions/repository.go`, replace the function body and
update its comment:

```go
// isUniqueViolation reports whether err (possibly wrapped) is a Postgres
// unique-constraint violation on the named constraint, matched on SQLSTATE
// 23505 + constraint name via the pgx driver's error type — exact and stable
// across driver versions, unlike matching on the message text.
func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) &&
		pgErr.Code == pgerrcode.UniqueViolation &&
		pgErr.ConstraintName == constraint
}
```

Imports: add `github.com/jackc/pgx/v5/pgconn`. For the code constant, either
import `github.com/jackc/pgerrcode` (check whether it's already in the module
graph: `grep pgerrcode backend/go.sum`) or — simpler and dependency-free —
use the literal with a comment:

```go
		pgErr.Code == "23505" && // unique_violation
```

Prefer the literal unless pgerrcode is already present; do not add a new
dependency for one constant. Remove the now-unused `strings` import **only
if** nothing else in the file uses it (check first — `strings` may be used
elsewhere in the file; at planning time it is used only by this function).

**Verify**: `cd backend && go get github.com/jackc/pgx/v5@v5.6.0 && go mod tidy && go build ./...`
→ exit 0, and `git diff go.mod` shows pgx moved to the direct require block
at the same version.

### Step 2: Unit-test the matcher

Add to `backend/internal/sessions/repository_test.go` (or a new sibling
file), stdlib style:

1. **Match**: `&pgconn.PgError{Code: "23505", ConstraintName: "sessions_active_day_uq"}`
   → true.
2. **Wrapped match**: the same error wrapped twice
   (`fmt.Errorf("create session: %w", fmt.Errorf("insert: %w", pgErr))`) →
   true (this mirrors how the repository wraps errors, e.g.
   `repository.go:181` `fmt.Errorf("create session: %w", err)`).
3. **Wrong constraint**: Code 23505 but `ConstraintName: "set_logs_id_user_uq"`
   → false.
4. **Wrong code**: `Code: "23503"` (foreign-key violation) with the right
   constraint name → false.
5. **Non-pg error**: `errors.New("...sessions_active_day_uq...")` — an error
   whose *text* contains the constraint name — → **false**. This is the test
   that proves the string-matching behavior is gone.
6. **nil error** → false.

**Verify**: `cd backend && go test ./internal/sessions/` → ok, including the
6 new cases.

### Step 3: Full pass

**Verify**: `cd backend && go test ./... && go vet ./...` → ok / exit 0.

### Step 4 (optional, only if a dev database is available): live race check

With `make db-up` and a configured `.env` (+ `AUTH_BYPASS_USER_ID`), fire two
concurrent first-start requests at the same day:

```
curl -s -X POST localhost:8080/api/programs/<id>/days/<dayId>/sessions & \
curl -s -X POST localhost:8080/api/programs/<id>/days/<dayId>/sessions & wait
```

Expected: both return 200 with the SAME session id (the loser recovered via
the new matcher). If no dev environment is configured, skip and note it —
the wrapped-error unit test is the primary gate.

## Test plan

- New: 6 table-style cases for `isUniqueViolation` (Step 2), in the sessions
  package (the function is unexported, so the test must live in package
  `sessions`).
- Pattern: match the existing stdlib table tests in
  `backend/internal/sessions/repository_test.go`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "strings.Contains" backend/internal/sessions/repository.go` → no output
- [ ] `grep -n "pgconn.PgError" backend/internal/sessions/repository.go` → match
- [ ] `cd backend && go test ./internal/sessions/` → ok with the 6 new cases
- [ ] `go test ./...` → ok; `go vet ./...` → exit 0
- [ ] `backend/go.mod`: `github.com/jackc/pgx/v5` in the direct require block, version unchanged from go.sum
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `go get` wants to BUMP pgx (or anything else) rather than just promoting it
  to direct — pin to the version already in `go.sum` and report if that's
  impossible.
- You find GORM `TranslateError` enabled in `database.go` (drift) — the
  error type reaching the call site may then be `gorm.ErrDuplicatedKey`
  instead of `*pgconn.PgError`; the design changes, report first.
- The wrapped-error test (case 2) fails — GORM is wrapping in a way
  `errors.As` can't traverse; report the actual error chain
  (`fmt.Printf("%#v")`) rather than reverting to string matching.

## Maintenance notes

- Any future constraint-specific handling (e.g. a friendly 409 on
  `set_videos_setlog_uq`) should reuse this helper — consider promoting it to
  a shared `internal/repoerr` package the second caller appears, not before.
- If the team ever enables GORM's `TranslateError`, this matcher and every
  `errors.Is(err, gorm.ErrRecordNotFound)` in the repo need one coordinated
  review.
- Reviewer scrutiny: confirm test case 5 (text-contains → false) exists —
  it's the regression lock on the old behavior.
