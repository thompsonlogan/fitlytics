# Plan 001: Add a CI pipeline (GitHub Actions) that gates every PR

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb2af4b..HEAD -- backend/Makefile frontend/package.json .github/`
> If any of those changed since this plan was written, compare the "Current state"
> excerpts against the live files before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

The repo merges via pull requests (#9–#14 in the git log) but has **no CI** —
`.github/` does not exist. Nothing runs the existing Go and Vitest suites,
`tsc`, or the build on a PR, so a broken test or type error can land on `master`
unnoticed. Adding a CI workflow that runs the existing verification commands on
every PR makes the test suites that already exist actually protective, and is the
safety net for every other plan in this directory.

## Cost

**This workflow is free to run.** `thompsonlogan/fitlytics` is a **public** repo
(verified via `gh repo view --json visibility` → `PUBLIC`) and every job uses the
standard `ubuntu-latest` GitHub-hosted runner. GitHub Actions on standard runners
has **unlimited free minutes for public repositories** — there is no per-PR or
per-push charge. Run it on every PR and push at no cost.

This stops being free only if you:
- flip the repo to **private** — then Actions minutes are metered (Free plan =
  2,000 Linux min/month; Pro = 3,000), or
- switch to **larger** (`*-4-core`) or **macOS/Windows** runners — billed even on
  public repos. This plan uses none of them.

For reference, if the repo *were* private: the two jobs bill separately, each
rounded up to the whole minute (~5 min backend + ~4 min frontend ≈ **9
job-minutes/run** on the 1× Linux multiplier; $0.008/min overage ≈ $0.072/run
beyond the free allowance). The `concurrency:` block added in Step 1 caps the
damage from rapid re-pushes by cancelling superseded runs — on a public repo it
costs nothing but still frees runner slots sooner.

## Current state

- There is **no** `.github/` directory in the repo root (verify with the drift
  check above; `ls .github` returns "No such file or directory").
- **Backend** build/test commands live in `backend/Makefile`. Key facts:
  - `make test` runs `go test ./...` but **depends on `docs/docs.go`**, a
    swag-generated file that is git-ignored. The Makefile regenerates it via
    `swag init` if the `swag` CLI is on `PATH`. So CI must install `swag` first.
  - Go version is pinned in `backend/go.mod`: `go 1.25.2`.
  - Backend tests use `go-sqlmock` + hand-written fakes — **no Postgres or other
    services are required** to run `go test ./...`.
  - Excerpt, `backend/Makefile`:
    ```makefile
    docs/docs.go: cmd/api/main.go $(wildcard internal/programs/*.go) $(wildcard internal/handlers/*.go)
    	swag init --generalInfo cmd/api/main.go --output docs --parseInternal

    test: docs/docs.go
    	go test ./...
    ```
- **Frontend** scripts live in `frontend/package.json`:
  ```json
  "scripts": {
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
  ```
  - Package manager is **pnpm**; `frontend/pnpm-lock.yaml` exists. There is **no**
    `packageManager` field in `package.json` and **no** `.nvmrc`/`.node-version`,
    so pin versions explicitly in the workflow (Node 22 LTS, pnpm 9).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend tests (local check) | `cd backend && make test` | exit 0, all packages `ok` |
| Backend vet | `cd backend && go vet ./...` | exit 0, no output |
| Frontend install | `cd frontend && pnpm install --frozen-lockfile` | exit 0 |
| Frontend typecheck | `cd frontend && pnpm typecheck` | exit 0 |
| Frontend lint | `cd frontend && pnpm lint` | exit 0 |
| Frontend tests | `cd frontend && pnpm test` | exit 0, all pass |
| YAML sanity (optional) | `python -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/workflows/ci.yml` | exit 0 |

> On Windows, if `pnpm test` fails with a path-length (`ENAMETOOLONG`/MAX_PATH)
> error in a temp worktree, that is a known local-only issue (`pnpm install
> --node-linker=hoisted`); it does not affect Linux CI. Do not change the workflow
> to work around it.

## Scope

**In scope** (create these files only):
- `.github/workflows/ci.yml`

**Out of scope** (do NOT touch):
- `backend/Makefile`, `frontend/package.json` — CI consumes them; do not edit them.
- Any deployment/release workflow — this plan is verification-only, no CD.
- Branch-protection settings — those are configured in the GitHub UI, not in-repo;
  mention them in your report but do not attempt to change them.

## Git workflow

- Branch: `advisor/001-ci-pipeline`
- One commit. Message style matches the repo's conventional-commit log
  (`feat: …`, `cleanup …`): e.g. `ci: add GitHub Actions pipeline for backend + frontend`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the workflow file

Create `.github/workflows/ci.yml` with two independent jobs (backend, frontend)
that run on pushes to `master` and on all PRs. Use this content exactly, adjusting
only if the drift check surfaced a changed command:

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:

permissions:
  contents: read

# Cancel an in-progress run when a newer commit is pushed to the same branch/PR,
# so superseded runs don't pile up. Saves billed minutes on private repos and
# frees runner slots faster on public ones.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
          cache-dependency-path: backend/go.sum
      - name: Install swag CLI (needed by `make test` for docs/docs.go)
        run: go install github.com/swaggo/swag/cmd/swag@latest
      - name: Ensure GOBIN is on PATH
        run: echo "$(go env GOPATH)/bin" >> "$GITHUB_PATH"
      - name: gofmt
        run: test -z "$(gofmt -l .)" || (echo "gofmt needed on:"; gofmt -l .; exit 1)
      - name: go vet
        run: go vet ./...
      - name: Test
        run: make test
      - name: Build
        run: make build

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Typecheck
        run: pnpm typecheck
      - name: Lint
        run: pnpm lint
      - name: Test
        run: pnpm test
      - name: Build
        run: pnpm build
```

**Verify**: the file parses as YAML —
`python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` → exit 0.
(If Python is unavailable, skip; Step 2 is the real verification.)

### Step 2: Locally reproduce what each CI job will run

Confirm the commands the workflow invokes actually pass on this checkout, so CI
won't fail on its first run for reasons unrelated to the workflow file.

**Verify (backend)**: `cd backend && go vet ./... && make test` → exit 0, every
package prints `ok` (or `no test files`). If `swag` is not installed locally, first
run `go install github.com/swaggo/swag/cmd/swag@latest` and ensure
`$(go env GOPATH)/bin` is on PATH.

**Verify (frontend)**: `cd frontend && pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test`
→ all exit 0. (On Windows, see the path-length note above.)

If a command fails for a **pre-existing** reason (a test already red on `master`,
a lint error in existing code), see STOP conditions — do not "fix" unrelated code
in this plan.

## Test plan

This plan adds no application code, so it adds no unit tests. Its verification is
that every command the workflow runs passes locally (Step 2). Do not add or modify
any `*_test.go` / `*.test.tsx` file here.

## Done criteria

ALL must hold:

- [ ] `.github/workflows/ci.yml` exists and is valid YAML.
- [ ] `cd backend && go vet ./... && make test && make build` exits 0 locally.
- [ ] `cd frontend && pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build` exits 0 locally.
- [ ] `git status` shows only `.github/workflows/ci.yml` added (plus `plans/README.md`).
- [ ] `plans/README.md` status row for 001 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- A backend or frontend command in Step 2 fails for a reason **already present on
  `master`** (e.g. an existing failing test, an existing lint/type error). Report
  the failure and its output; fixing pre-existing breakage is a separate finding,
  not this plan.
- `gofmt -l .` lists files in `backend/` (formatting drift already on `master`).
  Report which files; do not reformat them here.
- `frontend/pnpm-lock.yaml` is absent or out of sync with `package.json` such that
  `pnpm install --frozen-lockfile` fails — report it; regenerating the lockfile is
  out of scope.
- The repo turns out to use GitLab CI / another provider you discover mid-task.

## Maintenance notes

- When **plan 002** lands (auth tests) and other plans add tests, CI runs them
  automatically — no workflow change needed.
- If a future plan adds a backend test that needs Postgres, this workflow will need
  a `services:` block (Postgres container) for the backend job; the current suite
  is sqlmock-only and does not.
- A reviewer should confirm the Go/Node/pnpm versions match local dev and that the
  `swag install` step still matches how `make test` generates `docs/docs.go`.
- Follow-up deliberately deferred: branch-protection rules (require CI to pass
  before merge) must be enabled in GitHub repo settings — out of scope for an
  in-repo change.
