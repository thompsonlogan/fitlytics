# Plan 025: CI checks that validate database migrations before merge

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- .github/workflows/ database/flyway/ backend/cmd/gen/main.go database/docker-compose.prod.yml`
> If the workflow file layout, the Flyway compose invocations, or
> `cmd/gen`'s connection handling changed since this plan was written,
> compare the "Current state" excerpts before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW — additive CI only; no application or schema code changes.
  The one failure mode is a flaky/incorrectly-strict job blocking PRs, and
  every check below fails only on conditions that genuinely break
  production or the dev workflow.
- **Depends on**: none (parallel-safe; touches only `.github/workflows/`)
- **Category**: dx / ops
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

Production migrations run against an **existing** schema with Flyway
`clean` disabled (`database/docker-compose.prod.yml`, versioned files
only), while every local/dev run is a destructive `clean migrate` from
scratch (`database/docker-compose.yml`). That gap means the two failure
modes most likely to break production are exactly the ones no current
check exercises: (1) a versioned migration that was **edited after being
applied** (Flyway checksum mismatch — prod migration aborts), and (2) a
migration that only works on a **fresh** database (passes every dev run,
fails on prod's populated schema). A third, repo-specific failure: the
schema changes but `make generate` wasn't run, silently desyncing the Go
models from the database. This plan adds one path-filtered GitHub Actions
job that simulates the production upgrade path, enforces migration
immutability, re-runs the repeatables to prove their `IF EXISTS` guards,
and diffs regenerated models — all before merge.

**Cost: $0.** Everything runs on GitHub-hosted `ubuntu-latest` with a
`postgres:16` service container and the OSS `flyway:11-alpine` image — the
same free CI infrastructure `ci.yml` already uses. On a public repo,
Actions minutes are unlimited; on a private repo this ~3-minute job fits
comfortably in the free 2,000 min/month tier, and the `paths` filter means
it only runs at all when migration-related files change.

## Current state

- `.github/workflows/ci.yml` — the only workflow: backend (gofmt/vet/
  test/build) + frontend jobs. **No database job.** It sets
  `permissions: contents: read` and a concurrency group — mirror both.
- `database/flyway/sql_versioned/` — `V1__001_init.sql` only (so the
  upgrade-path check starts trivial and becomes load-bearing with V2).
  `database/flyway/sql_repeatable/R__seed_dev_data.sql` — dev seed,
  explicitly excluded from prod.
- Production Flyway invocation to mirror (from
  `database/docker-compose.prod.yml`): image `flyway/flyway:11-alpine`,
  `FLYWAY_SCHEMAS: fitlytics`, `FLYWAY_DEFAULT_SCHEMA: fitlytics`,
  versioned locations only, clean disabled, command `migrate`.
- Dev credentials convention (from `database/docker-compose.yml`):
  user/password/db all `fitlytics` — reuse for the CI service container
  (throwaway, job-local; not a secret).
- `backend/cmd/gen/main.go` — reads `DATABASE_URL` from the environment
  (lines 35–39: `godotenv.Load()` then `os.Getenv("DATABASE_URL")`, errors
  if unset) and writes to `internal/models/generated` + `internal/query`.
- CLAUDE.md convention this enforces mechanically: "All DDL must use
  `IF (NOT) EXISTS` guards for idempotent re-runs" (materially, this
  applies to the repeatables — versioned files run once).
- `ubuntu-latest` runners ship `psql`/`createdb` preinstalled and support
  `docker run --network host` against service-container ports.

## Commands you will need

| Purpose            | Command                                              | Expected on success |
|--------------------|------------------------------------------------------|---------------------|
| Workflow lint      | `docker run --rm -v "$(pwd)":/repo -w /repo rhysd/actionlint:latest` | exit 0, no findings on the new file |
| Local dry-run (per step) | the docker/psql commands from Step 1, run against a local `postgres:16` container | each exits 0 |
| Real gate          | open the PR — the new workflow triggers on itself (its own path is in the filter) | job green |

## Scope

**In scope**:
- `.github/workflows/migrations.yml` (create)

**Out of scope** (do NOT touch):
- `.github/workflows/ci.yml` — the new job is a separate workflow so its
  `paths` filter can skip it (and its minutes) on non-database PRs.
- `database/**` — no migration or compose changes.
- `backend/**` — the model-drift step *runs* `cmd/gen`, never edits it.
- Branch-protection settings (see maintenance notes).

## Git workflow

- Branch: `advisor/025-migration-ci`
- Commit style: `ci(db): validate migrations (upgrade path, immutability, guards, model drift)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the workflow

`.github/workflows/migrations.yml`:

```yaml
name: Migrations

# Path-filtered: this job costs minutes only when migration-related files
# change. The workflow's own path is included so the PR introducing it
# exercises it end-to-end.
on:
  pull_request:
    paths:
      - "database/flyway/**"
      - "backend/cmd/gen/**"
      - ".github/workflows/migrations.yml"
  push:
    branches: [master]
    paths:
      - "database/flyway/**"
      - "backend/cmd/gen/**"

permissions:
  contents: read

concurrency:
  group: migrations-${{ github.ref }}
  cancel-in-progress: true

jobs:
  migrations:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: fitlytics
          POSTGRES_PASSWORD: fitlytics
          POSTGRES_DB: fitlytics
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U fitlytics -d fitlytics"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      # Mirrors database/docker-compose.prod.yml: pinned image, fitlytics
      # schema, migrate only (never clean).
      FLYWAY_IMAGE: flyway/flyway:11-alpine
      PGPASSWORD: fitlytics

    steps:
      - uses: actions/checkout@v4
        with:
          # The immutability diff and base-branch extraction need history.
          fetch-depth: 0

      # ── 1. Versioned migrations are append-only ──────────────────────────
      # Editing/deleting/renaming an applied migration breaks production
      # (Flyway checksum validation aborts the deploy). Only additions merge.
      - name: Versioned migrations are append-only
        if: github.event_name == 'pull_request'
        run: |
          changed=$(git diff --name-only --diff-filter=MDR \
            "origin/${{ github.base_ref }}...HEAD" -- database/flyway/sql_versioned/)
          if [ -n "$changed" ]; then
            echo "::error::Versioned migrations are immutable once merged. Modified/deleted:"
            echo "$changed"
            echo "Add a new V<next>__*.sql instead of editing an applied one."
            exit 1
          fi

      # ── 2. Production upgrade-path simulation ────────────────────────────
      # Apply the BASE branch's migrations first (that's prod's current
      # schema), then the PR's on top — exactly the sequence prod will run.
      # Flyway's validate-on-migrate also re-checks the applied checksums,
      # backstopping check 1.
      - name: Extract base-branch migrations
        if: github.event_name == 'pull_request'
        run: |
          mkdir -p /tmp/base-migrations
          git archive "origin/${{ github.base_ref }}" database/flyway/sql_versioned \
            | tar -x --strip-components=2 -C /tmp/base-migrations
      - name: Migrate to base (production state)
        if: github.event_name == 'pull_request'
        run: |
          docker run --rm --network host \
            -v /tmp/base-migrations:/flyway/sql:ro \
            "$FLYWAY_IMAGE" \
            -url=jdbc:postgresql://localhost:5432/fitlytics \
            -user=fitlytics -password=fitlytics \
            -schemas=fitlytics -defaultSchema=fitlytics \
            migrate
      - name: Apply PR migrations on top (the upgrade path)
        if: github.event_name == 'pull_request'
        run: |
          docker run --rm --network host \
            -v "$PWD/database/flyway/sql_versioned:/flyway/sql:ro" \
            "$FLYWAY_IMAGE" \
            -url=jdbc:postgresql://localhost:5432/fitlytics \
            -user=fitlytics -password=fitlytics \
            -schemas=fitlytics -defaultSchema=fitlytics \
            migrate

      # ── 3. Fresh database, dev-parity flow ───────────────────────────────
      # Full migrate (versioned + repeatable seed) on an empty database —
      # what `make db-up` does. Catches migrations that only work on top of
      # existing state, and validates the seed still applies.
      - name: Create fresh database
        run: createdb -h localhost -U fitlytics fitlytics_fresh
      - name: Fresh migrate (versioned + repeatable)
        run: |
          docker run --rm --network host \
            -v "$PWD/database/flyway/sql_versioned:/flyway/versioned:ro" \
            -v "$PWD/database/flyway/sql_repeatable:/flyway/repeatable:ro" \
            "$FLYWAY_IMAGE" \
            -url=jdbc:postgresql://localhost:5432/fitlytics_fresh \
            -user=fitlytics -password=fitlytics \
            -schemas=fitlytics -defaultSchema=fitlytics \
            -locations=filesystem:/flyway/versioned,filesystem:/flyway/repeatable \
            migrate

      # ── 4. Repeatables re-run cleanly (the IF EXISTS convention) ─────────
      # Flyway skips unchanged repeatables on re-migrate (checksum-based),
      # so re-execute them directly via psql: this is the machine check for
      # CLAUDE.md's "all DDL must use IF (NOT) EXISTS guards" rule.
      - name: Repeatable migrations are re-runnable
        run: |
          shopt -s nullglob
          for f in database/flyway/sql_repeatable/*.sql; do
            echo "re-running $f"
            PGOPTIONS="-c search_path=fitlytics" \
              psql -h localhost -U fitlytics -d fitlytics_fresh \
              -v ON_ERROR_STOP=1 -q -f "$f"
          done

      # ── 5. Generated models match the schema ─────────────────────────────
      # The backend is database-first: schema changes REQUIRE `make generate`.
      # Regenerate against the freshly-migrated DB and fail on any diff.
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
          cache-dependency-path: backend/go.sum
      - name: Generated models are in sync with the schema
        working-directory: backend
        env:
          DATABASE_URL: postgres://fitlytics:fitlytics@localhost:5432/fitlytics_fresh?sslmode=disable&search_path=fitlytics
        run: |
          go run ./cmd/gen
          if ! git diff --exit-code -- internal/models/generated internal/query; then
            echo "::error::Schema and generated models are out of sync. Run 'make generate' and commit the result."
            exit 1
          fi
```

### Step 2: Lint the workflow

**Verify**:
`docker run --rm -v "$(pwd)":/repo -w /repo rhysd/actionlint:latest`
→ exit 0 with no findings for `migrations.yml` (pre-existing findings in
`ci.yml`, if any, are out of scope — report but don't fix).

### Step 3: Dry-run the commands locally

The workflow's shell steps must be proven before pushing. Locally (Git
Bash, Docker running):

1. `docker run -d --rm --name migci -p 127.0.0.1:5433:5432 -e POSTGRES_USER=fitlytics -e POSTGRES_PASSWORD=fitlytics -e POSTGRES_DB=fitlytics postgres:16`
2. Run the Step-2/3/4 flyway + psql commands against port **5433**
   (substitute the port in `-url`/`-h`; on Windows Git Bash use
   `MSYS_NO_PATHCONV=1` before `docker run` and note `--network host`
   doesn't work on Docker Desktop — use `host.docker.internal:5433` in the
   JDBC URL for the LOCAL dry-run only; the committed workflow keeps
   `--network host`, which is correct on the Linux runners).
3. Run the model-drift step: `cd backend && DATABASE_URL="postgres://fitlytics:fitlytics@localhost:5433/fitlytics_fresh?sslmode=disable&search_path=fitlytics" go run ./cmd/gen && git status --porcelain internal/models/generated internal/query`

**Verify**: every command exits 0, and the final `git status` is **empty**
(models currently in sync). Then `docker stop migci` and
`git checkout -- backend/internal` if gen touched timestamps.

**If the gen diff is NOT empty on the unchanged schema**: STOP — either the
models are already out of sync with V1 (a real pre-existing finding: report
it; the fix is committing `make generate` output, not weakening the check)
or gen output is nondeterministic on this setup (report the diff shape —
line endings vs content).

### Step 4: Ship and observe the self-test

Commit `migrations.yml`. When the operator opens the PR, the workflow
triggers on itself (its own path is in the filter). Expected on the intro
PR: append-only check passes trivially, base and PR migrations are
identical (upgrade path is a no-op second migrate), fresh flow + guard
re-run + model diff all green.

## Test plan

The workflow is its own test (Step 4). The local dry-run (Step 3) is the
pre-push gate. No application tests are affected.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `.github/workflows/migrations.yml` exists and `actionlint` passes on it
- [ ] All Step 3 local dry-run commands exited 0, including an empty gen diff
- [ ] The workflow contains all five checks (append-only, upgrade path, fresh migrate, repeatable re-run, model drift) — `grep -c "name:" .github/workflows/migrations.yml` ≥ 8
- [ ] `ci.yml` is untouched (`git status`)
- [ ] Only the one new file is added (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Docker is unavailable locally — the dry-run is mandatory; an unverified
  CI workflow that blocks merges is worse than none.
- Step 3's gen diff is non-empty (see the branching guidance there).
- The seed repeatable fails its psql re-run — that's the `IF EXISTS`
  convention being violated in the CURRENT repo (a real finding); report
  the failing statement, don't patch the seed in this plan.
- `git archive origin/<base>` fails in the dry-run context — the extraction
  approach needs rework; report rather than switching to a mutate-the-
  checkout approach.

## Maintenance notes

- **Branch protection caveat**: if `migrations` is ever added to required
  status checks, the `paths` filter becomes a problem (non-triggered
  required checks block merges as "expected"). The fix at that point:
  remove the `paths` filter and add an in-job change detector, or use
  GitHub's newer "required checks that pass when skipped" behavior if
  available. Until branch protection requires it, path-filtering is pure
  savings.
- When V2 lands, the upgrade-path check starts doing real work: it will
  apply master's V1 then the PR's V2 on top. If a future migration
  legitimately needs data present to be meaningful (backfills), consider
  seeding the *upgrade* database with the dev seed before applying PR
  migrations — deferred until such a migration exists.
- The service-container credentials are job-local throwaways, not secrets;
  don't move them to repo secrets (that would just obscure them).
- Keep `FLYWAY_IMAGE` pinned in lockstep with
  `database/docker-compose.prod.yml` — the whole point of check 2 is prod
  parity.
- Cost watch: the job is ~3 minutes and path-filtered; if the repo is
  private and minutes ever matter, this job's spend is visible under
  Settings → Billing → Actions.
