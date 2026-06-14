# Plan 007: Consolidate the duplicated `ErrNotFound` / `ErrInvalidInput` sentinels

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb2af4b..HEAD -- backend/internal/apierr/ backend/internal/programs/service.go backend/internal/sessions/service.go backend/internal/videos/service.go`
> If any changed, compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3 (lowest-leverage item in this batch)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

Three service packages each declare their own `ErrNotFound` (and two declare
`ErrInvalidInput`) with `errors.New`. It's mild duplication. Because the HTTP
response **detail strings are hardcoded at the handler call sites** (e.g.
`apierr.NotFound(c, "program not found")`) and never read from the error's message,
the sentinel values are used **only** for `errors.Is` matching — so they can be
sourced from one shared place with zero change to API responses. This plan removes
the duplicate definitions by pointing the existing package-local names at a single
shared sentinel, keeping all call sites untouched. (Honest note for the owner: this
is a small cleanup; the per-package names stay as thin aliases, so it's low-risk and
low-reward — included because it was requested.)

## Current state

- `backend/internal/apierr/problem.go` — the shared error package (RFC 9457 problem
  details). It currently defines **no** sentinel error values, only the
  `ProblemDetails` struct and `Respond`/`Abort` helpers.
- Sentinel definitions today:
  - `backend/internal/programs/service.go:12` → `var ErrNotFound = errors.New("program not found")`
  - `backend/internal/sessions/service.go:12` → `var ErrNotFound = errors.New("session not found")`
  - `backend/internal/sessions/service.go:14` → `var ErrInvalidInput = errors.New("invalid input")`
  - `backend/internal/videos/service.go:18-19` → `ErrNotFound` + `ErrInvalidInput`
- Usage proving the message text is irrelevant to responses — `programs/handler.go:83`:
  ```go
  if errors.Is(err, ErrNotFound) {
  	apierr.NotFound(c, "program not found") // detail is hardcoded here
  	return
  }
  ```
  Services also wrap, e.g. `sessions/service.go:66`:
  `return fmt.Errorf("%w: reps_actual out of range", ErrInvalidInput)`. All of these
  keep working unchanged if `ErrNotFound`/`ErrInvalidInput` remain valid identifiers
  in their package.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build | `cd backend && go build ./...` | exit 0 |
| Vet | `cd backend && go vet ./...` | exit 0 |
| All tests | `cd backend && make test` | all packages `ok` |

## Scope

**In scope**:
- `backend/internal/apierr/errors.go` (create) — the shared sentinels.
- `backend/internal/programs/service.go` — repoint `ErrNotFound`.
- `backend/internal/sessions/service.go` — repoint `ErrNotFound`, `ErrInvalidInput`.
- `backend/internal/videos/service.go` — repoint `ErrNotFound`, `ErrInvalidInput`.

**Out of scope** (do NOT touch):
- Handlers, repositories, tests, mappers — they reference the package-local names,
  which remain valid. Do not rewrite call sites to use `apierr.*` directly.
- `videos`' `ErrQuotaExceeded` and `storage`'s `ErrNotFound` — domain-specific, leave them.

## Git workflow

- Branch: `advisor/007-consolidate-sentinel-errors`
- One commit; message style: conventional commits, e.g.
  `refactor(apierr): single source for ErrNotFound/ErrInvalidInput sentinels`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add shared sentinels to `apierr`

Create `backend/internal/apierr/errors.go`:

```go
package apierr

import "errors"

// Shared sentinel errors for the service layer. Handlers match these with
// errors.Is to map domain failures onto HTTP problem responses; the
// human-readable detail shown to clients is supplied at the call site, so the
// message text here is intentionally generic.
var (
	ErrNotFound     = errors.New("not found")
	ErrInvalidInput = errors.New("invalid input")
)
```

**Verify**: `cd backend && go build ./internal/apierr/...` → exit 0.

### Step 2: Repoint the package-local names (keep them as aliases)

In each service, replace the `errors.New(...)` definition with an alias to the shared
value. The local name stays, so every existing reference keeps compiling.

- `backend/internal/programs/service.go:12` — replace
  `var ErrNotFound = errors.New("program not found")` with
  `var ErrNotFound = apierr.ErrNotFound`.
- `backend/internal/sessions/service.go:12,14` — replace the two `errors.New(...)`
  lines with `var ErrNotFound = apierr.ErrNotFound` and
  `var ErrInvalidInput = apierr.ErrInvalidInput`.
- `backend/internal/videos/service.go:18-19` — same for both.

Add the import `"github.com/thompsonlogan/fitlytics/backend/internal/apierr"` to each
file if not already present. **Important**: if removing `errors.New` makes the
`"errors"` import unused in a file, check the rest of that file — `errors.Is` is used
elsewhere in services, so `"errors"` likely stays. Let the compiler tell you: if
`go build` reports `"errors" imported and not used`, remove that import from the
offending file only.

**Verify**: `cd backend && go build ./... && go vet ./...` → exit 0.

### Step 3: Full suite green

**Verify**: `cd backend && make test` → exit 0, all packages `ok`. (The existing
service/handler tests that assert `errors.Is(err, ErrNotFound)` / `ErrInvalidInput`
must still pass unchanged — that's the regression guard that behavior didn't shift.)

## Test plan

- No new tests. Existing tests across `programs`, `sessions`, `videos` that exercise
  `errors.Is(..., ErrNotFound)` / `ErrInvalidInput` are the regression guard — they
  must remain green, proving the alias preserves matching behavior.

## Done criteria

ALL must hold:

- [ ] `backend/internal/apierr/errors.go` defines `ErrNotFound` and `ErrInvalidInput`.
- [ ] No `service.go` in `programs`/`sessions`/`videos` declares its sentinel with
      `errors.New` anymore (`grep -rn 'errors.New("program not found"\|errors.New("session not found"\|errors.New("video not found"\|errors.New("invalid input")' backend/internal` → no matches).
- [ ] `cd backend && go vet ./... && make test` exits 0.
- [ ] `git status` shows only the four files in scope changed (plus `plans/README.md`).
- [ ] `plans/README.md` status row for 007 updated.

## STOP conditions

Stop and report back if:

- Any test fails after Step 2 (would indicate a call site relied on the exact error
  message text, contradicting the "Current state" analysis).
- Repointing creates an import cycle (a service importing `apierr` that `apierr`
  already imports back) — `apierr` imports only `net/http`/`gin`/`errors`, so this
  shouldn't happen; if it does, report it.

## Maintenance notes

- New services should use `apierr.ErrNotFound` / `apierr.ErrInvalidInput` directly (no
  new local alias needed) — or add an alias if matching the existing style.
- Trade-off a reviewer should weigh: the three `ErrNotFound` values are now the same
  underlying error, so a cross-package `errors.Is` would match where it previously
  wouldn't. No current code does that, but note it.
