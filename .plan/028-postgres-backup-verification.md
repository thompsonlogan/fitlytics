# Plan 028: Verify production Postgres backups exist, run, and restore

> **Executor instructions**: Follow this plan step by step. This plan is
> unusual: its deliverable is a **runbook file plus an operator checklist**,
> because the load-bearing actions happen in the Coolify UI, which only the
> operator can reach. Steps tagged **[OPERATOR]** must be written into the
> runbook and the final report as instructions — do NOT attempt to perform
> them, and do NOT mark this plan DONE on their behalf (see Done criteria).
> When finished, update the status row in `.plan/README.md`.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- database/`
> Only doc-level drift matters here; if a `database/BACKUPS.md` already
> exists, reconcile with it instead of overwriting (STOP and report if it
> contradicts this plan).

## Status

- **Priority**: P1 — an unverified backup is the single largest
  data-loss exposure a production app can carry, and it costs minutes to
  close.
- **Effort**: S (executor side; ~30 min operator side)
- **Risk**: LOW — documentation plus read-only verification commands.
- **Depends on**: none
- **Category**: ops
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

Every workout a user logs lives in exactly one place: the Coolify-managed
Postgres. The repo contains careful *schema* management (Flyway, versioned
migrations, a prod runner that can never `clean` —
`database/docker-compose.prod.yml`) but **nothing about data backups**: no
runbook, no restore procedure, no record that Coolify's scheduled backups
were ever enabled for this database. Coolify supports scheduled Postgres
dumps with S3-compatible targets, and the project already pays for an
S3-compatible store (Cloudflare R2, used for set videos) — so a correct
setup is configuration away. The industry rule this plan enforces: **a
backup that has never been restored is not a backup.** Deliverables: a
committed runbook (`database/BACKUPS.md`), a locally-verified restore
procedure, and a short operator checklist to flip the switches in Coolify.

## Current state

- `database/` contains compose files and Flyway migrations only — no backup
  documentation (`ls database/` at planning time: `docker-compose.yml`,
  `docker-compose.prod.yml`, `Dockerfile.flyway`, `flyway/`).
- Production Postgres runs as a Coolify-managed database resource on the
  same host as the app (per `DEPLOY.md` / compose comments: "The Coolify
  Postgres is internal").
- Coolify (current versions) offers per-database **Scheduled Backups**:
  cron schedule, retention count, local storage and/or an S3-compatible
  endpoint. R2 is S3-compatible and already configured for the app
  (`R2_*` env vars), making it the natural offsite target — in a
  **separate bucket** from the videos bucket (different lifecycle and
  privacy posture; and note R2's S3 API specifics sometimes need
  region/endpoint care in backup tools — hence the mandatory test-backup
  step).
- Restore tooling: the dumps Coolify produces are standard `pg_dump`
  output; restoring needs only a `postgres:16` container and
  `pg_restore`/`psql` — both already familiar in this repo's tooling.
- The dev seed (`R__seed_dev_data.sql`) provides realistic local data to
  rehearse the restore against, so the executor CAN fully verify the
  restore procedure locally without production access.

## Commands you will need

| Purpose            | Command                                                   | Expected on success |
|--------------------|-----------------------------------------------------------|---------------------|
| Local rehearsal DB | `cd backend && make db-up` (or the compose equivalent)     | migrated dev DB with seed |
| Take a dump        | `docker exec fitlytics_db pg_dump -U fitlytics -Fc -d fitlytics -f /tmp/rehearsal.dump && docker cp fitlytics_db:/tmp/rehearsal.dump ./rehearsal.dump` | file exists, non-trivial size |
| Restore container  | `docker run -d --rm --name restoretest -e POSTGRES_PASSWORD=pw postgres:16` | container up |
| Restore            | `docker cp rehearsal.dump restoretest:/tmp/ && docker exec restoretest bash -c "createdb -U postgres restored && pg_restore -U postgres -d restored /tmp/rehearsal.dump"` | exit 0 |
| Sanity query       | `docker exec restoretest psql -U postgres -d restored -c "select count(*) from fitlytics.exercises"` | a plausible row count (> 0 with seed) |
| Cleanup            | `docker stop restoretest && rm rehearsal.dump`             | exit 0              |

(Exact container name `fitlytics_db` from `database/docker-compose.yml`;
adjust flags if the local rehearsal reveals better ones — the runbook must
contain the commands **as actually verified**, not as planned.)

## Scope

**In scope**:
- `database/BACKUPS.md` (create — the runbook)
- One line in `CLAUDE.md`'s Database section pointing at it
  ("Backups: see `database/BACKUPS.md`")

**Out of scope** (do NOT touch):
- Any Coolify configuration (operator-only, via the checklist).
- Application code, compose files, migrations.
- Building custom backup scripts/cron containers — Coolify's built-in
  scheduled backups are the mechanism; only if the operator reports they're
  unavailable does a custom job become a (new, separate) plan.
- The R2 videos bucket — user-uploaded videos are NOT covered by pg_dump;
  the runbook must state this explicitly and record the decision that video
  loss tolerance is higher (they're auxiliary media), or the operator can
  enable R2 versioning later.

## Git workflow

- Branch: `advisor/028-backup-runbook`
- Commit style: `docs(db): backup + restore runbook`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rehearse the restore locally (this validates the runbook's core)

Run the command sequence from the table above against the dev database:
dump → fresh container → restore → sanity query. Fix flags as needed until
the whole sequence is clean (e.g. `--no-owner` is commonly needed when
restoring into a different-owner cluster: verify whether
`pg_restore --no-owner --role=postgres` is required and record what worked).

**Verify**: the sanity query returns seeded data from the restored copy;
record the exact working commands and the observed row count.

### Step 2: Write `database/BACKUPS.md`

Structure (fill the command blocks with the Step-1-verified versions):

```markdown
# Database backups & restore

## What is backed up
- The Coolify-managed production Postgres (`fitlytics` DB) via Coolify
  Scheduled Backups (pg_dump).
- NOT covered: set videos in R2 (media, uploaded copies exist with users;
  accepted risk — revisit with R2 versioning if that changes) and the
  Flyway schema history (recreated by migrations).

## Configuration (Coolify UI — the source of truth)
- Where: Coolify → the Postgres resource → Scheduled Backups.
- Schedule: daily, off-peak (e.g. 04:00 server time).
- Retention: ≥ 7 backups.
- Destination: local + S3-compatible offsite — R2, in a DEDICATED bucket
  (never the videos bucket). Endpoint/keys: a separate R2 API token scoped
  to that bucket.
- After any change: trigger a manual "Backup now" and confirm the object
  appears at the destination.

## Restore procedure (verified YYYY-MM-DD against a dev dump)
<the exact command sequence from Step 1: fetch dump → postgres:16
container → createdb → pg_restore → sanity queries>

## Restore drill
- Cadence: quarterly, or after any Postgres major-version change.
- Drill = download the LATEST production backup, restore it locally with
  the procedure above, run the sanity queries, record the date + result
  in the log below.

## Drill log
| Date | Backup restored | Result | Notes |
|------|-----------------|--------|-------|
| (operator fills after first drill) |
```

Sanity queries to include (verified in Step 1): row counts on
`fitlytics.users`, `fitlytics.programs`, `fitlytics.set_logs`, and
`select max(created_at) from fitlytics.sessions` (freshness check — the
restored max timestamp should be close to the backup time).

### Step 3: Link it from CLAUDE.md

Add one line to the `## Database` section: backups and restore are
documented in `database/BACKUPS.md`.

**Verify**: `grep -n "BACKUPS.md" CLAUDE.md` → match.

### Step 4: [OPERATOR] The Coolify checklist (write into the report verbatim)

1. Coolify → Postgres resource → **Scheduled Backups**: confirm whether a
   schedule already exists. If yes: record schedule/retention/destination
   in `BACKUPS.md` and jump to item 4.
2. Create the schedule per the runbook (daily, retention ≥ 7).
3. Offsite: create a dedicated R2 bucket (e.g. `fitlytics-db-backups`) +
   a bucket-scoped API token; configure it as the S3 destination. If
   Coolify's S3 client and R2 disagree (region/endpoint quirks), local-only
   retention is acceptable TEMPORARILY — record it as an open risk in the
   runbook rather than silently accepting it.
4. Press **Backup now**; confirm the artifact lands (size > 0) at every
   configured destination.
5. Download that artifact and run the runbook's restore procedure against
   it locally; run the sanity queries; fill the first Drill log row.
6. Only after 5 succeeds is this plan genuinely done.

## Test plan

The Step 1 local restore rehearsal IS the test — the runbook may only
contain commands that were actually executed successfully. No application
tests are affected.

## Done criteria

Machine-checkable (executor side). ALL must hold:

- [ ] `database/BACKUPS.md` exists with all five sections and Step-1-verified commands (including a real "verified YYYY-MM-DD" date)
- [ ] The Step 1 rehearsal completed: dump → restore → sanity query, output included in the report
- [ ] CLAUDE.md links the runbook
- [ ] Only the two in-scope files modified (`git status`)
- [ ] `.plan/README.md` status row updated to **BLOCKED (operator checklist pending)** — NOT "DONE"; only the operator flips it to DONE after Step 4 item 5 (the production-backup restore drill) succeeds

## STOP conditions

Stop and report back (do not improvise) if:

- Docker or the dev database flow (`make db-up`) is unavailable — the
  runbook must not ship with unrehearsed commands.
- `pg_restore` of the local dump fails after two flag adjustments — report
  the exact error; a dump format issue discovered NOW is the whole point.
- A `database/BACKUPS.md` already exists with different claims (drift) —
  reconcile, don't overwrite.

## Maintenance notes

- The Drill log is the mechanism that keeps this real: a runbook with an
  empty log older than a quarter is a finding for the next audit.
- If the database moves off Coolify-managed Postgres (e.g. to a managed
  provider), the provider's PITR/backup story supersedes this and the
  runbook must be rewritten — the restore-drill discipline carries over.
- When Postgres is upgraded (16 → 17), re-run the drill immediately: dump
  compatibility across majors is where restores rot.
- Related deferred idea (not planned): R2 object versioning on the videos
  bucket if video-loss tolerance ever tightens.
