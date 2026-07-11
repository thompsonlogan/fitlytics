# Plan 029: Upgrade the Go toolchain to 1.26.x

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- backend/go.mod backend/go.sum backend/Dockerfile .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — Go's compatibility promise (Go 1) means source stays
  buildable across minor versions; the exposure is a dependency that hasn't
  adopted 1.26 or a CI toolchain-availability gap, both caught by the build.
- **Depends on**: none
- **Category**: maintenance / dependencies
- **Planned at**: authored 2026-07-11 against HEAD of `docs/improvement-plans`
  (round 6 — toolchain currency)

## Why this matters

The backend is pinned to **Go 1.25** in three places (`go.mod`, `Dockerfile`,
CI). The latest stable line is **Go 1.26** (1.26.5 shipped 2026-07-07 with
crypto/tls and os security fixes). Staying current keeps the runtime on
security-patched releases and lets the code use 1.26 stdlib/runtime
improvements. Go's backward-compatibility guarantee makes a minor-version bump
routine; this plan does the bump and proves it green end-to-end.

## Current state

Three pins, all on 1.25:

- `backend/go.mod:3`

```
go 1.25.2
```

  (No `toolchain` directive today — the `go` line is the sole floor.)

- `backend/Dockerfile:4`

```dockerfile
FROM golang:1.25-alpine AS build
```

- `.github/workflows/ci.yml:26–29`

```yaml
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
          cache-dependency-path: backend/go.sum
```

Context (do NOT change as part of this plan):
- `swag` is pinned to `v1.16.6` in the Dockerfile and installed `@latest` in
  CI — orthogonal to the Go version; leave both as-is.
- `cmd/gen` (GORM model generation) and `cmd/api` both compile under the same
  toolchain; the build step exercises them.

Repo gotcha (from prior rounds): on a CRLF checkout `gofmt -l .` false-
positives on line endings, not formatting. If `gofmt` flags files, confirm the
diff is real formatting before acting — normalize to LF to check.

## Commands you will need

| Purpose        | Command (run in `backend/`)   | Expected on success |
|----------------|-------------------------------|---------------------|
| Local Go ver   | `go version`                  | reports the toolchain in use |
| Tidy modules   | `go mod tidy`                 | exit 0; go.mod/go.sum settle |
| Vet            | `go vet ./...`                | exit 0 |
| Test           | `make test`                   | all pass |
| Build          | `make build`                  | compiles `bin/api` |

If the local machine has an older Go than 1.26, a `go 1.26.x` directive makes
the `go` command auto-download the matching toolchain (Go ≥ 1.21 behavior);
that is expected, not an error.

## Scope

**In scope**:
- `backend/go.mod` (bump the `go` directive)
- `backend/go.sum` (only if `go mod tidy` changes it)
- `backend/Dockerfile` (base image tag)
- `.github/workflows/ci.yml` (`go-version`)

**Out of scope** (do NOT touch):
- Dependency version bumps in `require (...)` — this plan changes the
  toolchain, not the libraries. If a dep genuinely fails to build under 1.26,
  that is a STOP condition, not a place to start upgrading modules.
- Any Go source under `backend/**` — a toolchain bump must not require code
  edits. If it does, STOP and report the exact compile error.
- `frontend/**`, `database/**`.

## Git workflow

- Branch: `advisor/029-upgrade-go-toolchain`
- Commit style: `chore(backend): upgrade Go toolchain to 1.26`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Bump the `go` directive

In `backend/go.mod`, change the `go` line to the current 1.26 patch:

```
go 1.26.5
```

(Match the existing full `minor.patch` style. Do not add a `toolchain`
directive unless CI later proves it necessary.)

**Verify**: `go mod tidy` → exit 0. Inspect the `go.mod`/`go.sum` diff; it
should be limited to the `go` line (and possibly checksum reordering). If
`tidy` wants to add/remove *dependencies*, STOP — that is unexpected for a
toolchain bump.

### Step 2: Bump the Docker build image

In `backend/Dockerfile`, update the build stage base:

```dockerfile
FROM golang:1.26-alpine AS build
```

(The `-alpine` variant and the distroless runtime stage are unchanged.)

### Step 3: Bump the CI toolchain

In `.github/workflows/ci.yml`, set the backend job's Go version:

```yaml
          go-version: "1.26"
```

`actions/setup-go@v5` resolves `"1.26"` to the latest 1.26.x patch.

### Step 4: Prove it green locally

Run the repo-wide backend gate:

```bash
cd backend && go vet ./... && make test && make build
```

**Verify**: all exit 0. `go version` should report a 1.26.x toolchain.

Then confirm formatting is clean (mind the CRLF gotcha above):

```bash
gofmt -l .
```

**Verify**: no *real* formatting diffs attributable to this change.

### Step 5 (optional): Docker build smoke

If Docker is available:

```bash
docker build -t fitlytics-api:go126 backend
```

**Verify**: the image builds on `golang:1.26-alpine`. Skip if Docker is
unavailable — the CI change in Step 3 covers this path on the next run.

## Test plan

No new tests. The existing suite (`make test`) plus `go vet` and `make build`
are the gate; the change is a toolchain bump with no source edits.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "^go " backend/go.mod` shows `go 1.26.<patch>`
- [ ] `backend/Dockerfile` build stage uses `golang:1.26-alpine`
- [ ] `.github/workflows/ci.yml` backend job sets `go-version: "1.26"`
- [ ] `go vet ./...`, `make test`, `make build` all exit 0 (run in `backend/`)
- [ ] No Go source files under `backend/**` were modified
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `.plan/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The build or `go vet` fails with an error that would require editing Go
  source or bumping a dependency to fix — report the exact package and error.
- `go mod tidy` wants to add or remove entries in `require (...)`.
- CI cannot resolve a 1.26 toolchain (report the `setup-go` log line).
- `swag`/docs generation breaks — that is a separate concern; report rather
  than chasing it here.

## Maintenance notes

- Keep the three pins (go.mod, Dockerfile, CI) in lockstep on every future
  bump; a drift between them is how "works locally, breaks in prod" starts.
- If a future bump *does* require a `toolchain` directive (e.g. to pin a
  specific patch in CI independent of the language floor), add it then — not
  preemptively.
- This plan is independent of the frontend TypeScript upgrade
  ([[030-adopt-typescript-native-compiler]]); they can land in either order.
