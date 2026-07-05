# Plan 016: Bind the dev Postgres to localhost only

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- database/docker-compose.yml`
> If the file changed since this plan was written, compare the "Current
> state" excerpt against the live file before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — dev-only; any tool connecting via `localhost:5432` keeps
  working. Only connections from OTHER machines stop working (that's the
  point).
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The dev compose publishes Postgres as `"5432:5432"`, which Docker binds to
**0.0.0.0** — every interface. Combined with the well-known dev credentials
(`fitlytics`/`fitlytics`, committed in the same file), any machine on the
same network (café/office Wi-Fi, hotel LAN) can connect to the developer's
database. Prefixing the binding with `127.0.0.1` closes it to the local
machine with zero workflow impact: the Go API connects via
`localhost:5432`, and Flyway runs inside the compose network and never uses
the published port at all.

## Current state

- `database/docker-compose.yml`, the postgres service:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: fitlytics_db
    environment:
      POSTGRES_USER: fitlytics
      POSTGRES_PASSWORD: fitlytics
      POSTGRES_DB: fitlytics
    ports:
      - "5432:5432"
```

- The production path is unaffected: prod uses Coolify's internal Postgres;
  `database/docker-compose.prod.yml` (Flyway runner) takes connection details
  from `FLYWAY_URL` env and publishes nothing.
- `backend/.env.example`'s `DATABASE_URL` points at localhost (verify, don't
  assume — read the file), so the API's connection is unchanged.

## Commands you will need

| Purpose        | Command                                                    | Expected on success |
|----------------|-------------------------------------------------------------|---------------------|
| Restart the DB | `cd backend && make db-up` (or `cd database && docker compose up -d`) | containers healthy, flyway exits 0 |
| Check binding  | `docker port fitlytics_db`                                  | `5432/tcp -> 127.0.0.1:5432` |
| Sanity connect | `docker exec fitlytics_db pg_isready -U fitlytics -d fitlytics` | `accepting connections` |
| Backend up     | `cd backend && go build ./...` (full `make run` only if a `.env` exists) | exit 0 |

## Scope

**In scope**:
- `database/docker-compose.yml` (the `ports` line of the `postgres` service)

**Out of scope** (do NOT touch):
- The dev credentials themselves — committed known dev creds are the
  intentional convention for this compose file; localhost binding is the
  proportionate fix.
- `database/docker-compose.prod.yml`, `database/Dockerfile.flyway`.
- The flyway service (no published ports).

## Git workflow

- Branch: `advisor/016-dev-db-localhost`
- Commit style: `chore(db): bind dev Postgres to localhost only`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Change the binding

```yaml
    ports:
      - "127.0.0.1:5432:5432"
```

Add a one-line comment above it:
`# Localhost-only: dev creds are well-known, so never expose this to the LAN.`

### Step 2: Verify live (requires Docker)

1. `cd database && docker compose up -d` → postgres healthy, flyway runs
   `clean migrate` and exits 0 (`docker compose logs flyway | tail -5`).
2. `docker port fitlytics_db` → `5432/tcp -> 127.0.0.1:5432`.
3. `docker exec fitlytics_db pg_isready -U fitlytics -d fitlytics` →
   `accepting connections`.
4. If a configured `backend/.env` exists: `cd backend && make run` starts and
   logs "http server listening" (proves `DATABASE_URL` still reaches the DB);
   Ctrl-C after. If not, `go build ./...` suffices — note it.

If Docker isn't available, STOP: this one-line change is not worth shipping
unverified against a live compose (the ports syntax has real failure modes).

## Test plan

No unit tests apply; the gate is Step 2's `docker port` output.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "127.0.0.1:5432:5432" database/docker-compose.yml` → match
- [ ] `docker port fitlytics_db` → `127.0.0.1:5432`
- [ ] Flyway migration completed against the restarted container (logs show success)
- [ ] Only `database/docker-compose.yml` is modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Docker is unavailable (see Step 2).
- The developer's workflow demonstrably relies on remote connections to this
  dev DB (e.g. a `DATABASE_URL` in `backend/.env.example` pointing at a
  non-localhost host) — surface that before cutting it off.

## Maintenance notes

- Anyone who needs LAN access to the dev DB (e.g. testing from a phone
  against a local backend) should tunnel (`ssh -L`) or temporarily override
  with a `docker-compose.override.yml` — not revert this line.
- If the dev creds are ever rotated to per-developer values, the localhost
  binding remains correct defense-in-depth.
