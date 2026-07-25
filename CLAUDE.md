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
| `R2_ENDPOINT` | Cloudflare R2 endpoint (`https://<account>.r2.cloudflarestorage.com`) |
| `R2_BUCKET` | R2 bucket name for set videos |
| `R2_ACCESS_KEY_ID` | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |

Optional:

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development` (default) or `production` |
| `HTTP_PORT` | API port (default `8080`) |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` (default `info`) |
| `AUTH_BYPASS_USER_ID` | Skip WorkOS auth in dev — set to a `users.id` UUID |
| `MAX_VIDEO_BYTES` | Per-upload size cap in bytes (default `524288000` = 500 MB) |
| `MAX_VIDEOS_PER_USER` | Max active videos per user (default `200`) |
| `MAX_VIDEOS_PER_DAY` | Max videos a user can upload per rolling 24h (default `50`) |
| `DB_MAX_OPEN_CONNS` | Max open DB connections (default `25`) |
| `DB_MAX_IDLE_CONNS` | Max idle DB connections; must not exceed open (default `5`) |
| `DB_CONN_MAX_LIFETIME_MINUTES` | Recycle a connection after this many minutes (default `60`) |

> Set videos require all four `R2_*` vars; the API fails to start if any is missing. The bucket must be private with a CORS rule allowing PUT/GET from `APP_URL`.

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
- Backups and restore: see `database/BACKUPS.md`

## Responsive design (web + mobile)

The app serves two viewports from one codebase: desktop web and phone
(≤767px — `MOBILE_MAX_WIDTH` in `src/lib/breakpoints.ts`, deliberately one
pixel under Tailwind's `md`). When a page or component must differ between
them, use the **weakest tool that works**, escalating only when the current
rung provably cannot express the difference:

1. **Tailwind responsive classes** — when only spacing, columns, ordering,
   or visibility change. Exemplar: `day-board.tsx` (`lg:` grid, side panel
   `hidden lg:block`). This should cover most cases.
2. **A `layout` prop on one shared component** — when the content is
   identical but its arrangement differs. Exemplar: `side-panel.tsx`
   (`layout="panel" | "stack"`).
3. **Forked presentation components** — only when the DOM structure is
   fundamentally different (a `<table>` vs a card list; top nav vs bottom
   tab bar). Exemplar: `workout-table.tsx` vs `mobile-exercise-card.tsx`.
   Three rules make a fork acceptable:
   - the fork sits at the **lowest** node where structure actually diverges,
     never higher;
   - **all** behavior lives in a shared headless hook (`use-day-board.ts`,
     `use-cell-logging.ts`) — a mobile variant never re-implements logic;
   - interactive leaves (inputs, state cells, video triggers) are shared
     components both variants compose — markup may fork, widgets may not.
4. **Never fork a page.** Route components own data fetching and state
   exactly once and render adaptive sections. `useIsMobile` belongs in
   section-level components choosing between rung-3 variants — never in a
   route file, and never to duplicate state plumbing.

Naming: a rung-3 phone variant is `mobile-<name>.tsx` next to its desktop
counterpart, and both must consume the same hook and the same leaf
components. If you find yourself passing a page's state through a dozen
props to reach a `Mobile*` component, the fork is too high — move it down.

## Conventions

- Backend follows a layered architecture: handler -> service -> repository
- Navigation fields use GORM `Preload()` (not eager-loaded by default)
- Frontend uses no `useEffect` for derived state — derive inline or use nullable overrides
- Named UI components get their own file alongside the parent component
