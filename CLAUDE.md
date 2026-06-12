# Fitlytics

Workout tracking and training analytics app. Monorepo with three top-level directories:

- `backend/` — Go API (Gin + GORM, WorkOS auth)
- `frontend/` — React SPA (Vite, TanStack Router/Query, shadcn/ui, Tailwind v4)
- `database/` — Postgres 16 + Flyway migrations (Docker Compose)

## Quick start

```bash
# 1. Start Postgres + run Flyway migrations (destructive clean-migrate for dev)
cd backend && make db-up

# 2. Start the Go API (needs .env with DATABASE_URL, WorkOS keys, etc.)
make run          # or: go run ./cmd/api

# 3. Start the frontend dev server
cd frontend && pnpm dev
```

## Backend

### Project layout

```
backend/
  cmd/api/          — HTTP entrypoint (Gin router, WorkOS auth, graceful shutdown)
  cmd/gen/          — GORM gen code generator (DB-first model scaffolding)
  internal/
    models/         — Hand-written types (JSONB helper, future custom types)
    models/generated/ — GORM gen output (DO NOT EDIT)
    query/          — GORM gen type-safe query API (DO NOT EDIT)
    programs/       — Program aggregate (handler, service, repository, DTOs)
    sessions/       — Session aggregate (same layered pattern)
    users/          — User resolution + just-in-time provisioning from WorkOS
    auth/           — JWT verification, WorkOS client, principal middleware
    config/         — Env var loading
    database/       — GORM connection setup
    server/         — Router wiring + graceful shutdown
    handlers/       — Shared handlers (health, auth callback, /me)
    middleware/     — Request logging
  docs/             — Swagger/OpenAPI (generated, git-ignored)
```

### Code generation workflow

The backend is **database-first**: the schema is the source of truth, and Go models are reverse-engineered from it.

**When you change the database schema:**

1. Write a new Flyway migration in `database/flyway/sql_versioned/`
2. Run `make db-reset` (or `make db-up` if the container is down) to apply it
3. Run `make generate` (or `go run ./cmd/gen`) to regenerate models + query API
4. If the migration introduced any of these, update `cmd/gen/main.go`:
   - **New table** — add a `g.GenerateModel()` call + include it in `ApplyBasic`
   - **New custom Postgres type** (enum, array) — add an entry to `WithDataTypeMap`
   - **New or changed foreign key relationship** — add/update a `gen.FieldRelate` call
   - **FK column that doesn't follow GORM convention** — add a `GORMTag` override

Standard column types (varchar, int, bool, timestamptz, etc.) are handled automatically by gen — only custom types and relationships need manual wiring.

Generated files in `models/generated/` and `query/` should never be hand-edited.

### Swagger / OpenAPI

```bash
make swagger       # regenerate docs/ from handler doc comments
```

The frontend's typed API client is generated from the backend's swagger spec:

```bash
cd frontend && pnpm api_generate   # backend API must be running
```

### Testing

```bash
make test          # go test ./...
make test-cover    # with coverage report
```

Backend tests use Go stdlib testing + hand-written fakes (no mock libraries). Test files live alongside the code they test.

### Makefile targets

| Target | Description |
|---|---|
| `make run` | Start the API server |
| `make build` | Compile to `bin/api` |
| `make test` | Run all Go tests |
| `make test-cover` | Tests + HTML coverage report |
| `make generate` | Regenerate GORM models from live DB |
| `make swagger` | Regenerate OpenAPI docs |
| `make db-up` | Start Postgres + Flyway (clean migrate) |
| `make db-down` | Stop database containers |
| `make db-reset` | Destroy volume + restart (full schema reset) |

### Environment variables

Required in `.env` (or set externally):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `WORKOS_API_KEY` | WorkOS API key |
| `WORKOS_CLIENT_ID` | WorkOS client ID (JWKS/issuer derived from this) |
| `WORKOS_REDIRECT_URI` | OAuth callback URL (e.g. `http://localhost:8080/auth/callback`) |
| `APP_URL` | Frontend URL (e.g. `http://localhost:5173`) |

Optional:

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development` (default) or `production` |
| `HTTP_PORT` | API port (default `8080`) |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` (default `info`) |
| `AUTH_BYPASS_USER_ID` | Skip WorkOS auth in dev — set to a `users.id` UUID |
| `R2_ENDPOINT` | Cloudflare R2 endpoint (`https://<account>.r2.cloudflarestorage.com`) — enables set video uploads |
| `R2_BUCKET` | R2 bucket name for set videos |
| `R2_ACCESS_KEY_ID` | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `MAX_VIDEO_BYTES` | Per-upload size cap in bytes (default `524288000` = 500 MB) |
| `MAX_VIDEOS_PER_USER` | Max active videos per user (default `200`) |
| `MAX_VIDEOS_PER_DAY` | Max videos a user can upload per rolling 24h (default `50`) |

> Set videos require all four `R2_*` vars. When any is missing the feature self-disables and the `/api/.../videos` routes return 503; the rest of the API is unaffected.

## Frontend

React 19 SPA with Vite, TanStack Router + Query, shadcn/ui components, Tailwind v4.

```bash
pnpm dev           # dev server
pnpm build         # production build
pnpm test          # Vitest
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm api_generate  # regenerate typed API client from backend swagger
```

Frontend tests use Vitest + Testing Library.

## Database

Postgres 16 via Docker Compose in `database/`. Flyway manages schema migrations.

- Versioned migrations: `database/flyway/sql_versioned/`
- Repeatable migrations (views, seed data): `database/flyway/sql_repeatable/`
- All DDL must use `IF (NOT) EXISTS` guards for idempotent re-runs

## Conventions

- Backend follows a layered architecture: handler -> service -> repository
- Navigation fields use GORM `Preload()` (not eager-loaded by default)
- Frontend uses no `useEffect` for derived state — derive inline or use nullable overrides
- Named UI components get their own file alongside the parent component
