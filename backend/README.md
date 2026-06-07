# Fitlytics Backend

Go API server for the Fitlytics workout tracking app. Built with [Gin](https://github.com/gin-gonic/gin) + [GORM](https://gorm.io/), authenticated via [WorkOS](https://workos.com/).

## Prerequisites

- Go 1.25+
- Docker & Docker Compose (for Postgres + Flyway)
- [swag CLI](https://github.com/swaggo/swag) for Swagger generation (`make swagger-install`)

## Getting started

```bash
# 1. Start Postgres + apply migrations
make db-up

# 2. Copy .env.example to .env and fill in your WorkOS keys
cp .env.example .env

# 3. Run the API
make run
```

The API starts on `http://localhost:8080` by default. Swagger UI is available at `/swagger/index.html`.

## Project structure

```
cmd/api/              — HTTP entrypoint
cmd/gen/              — GORM gen code generator (DB-first model scaffolding)
internal/
  models/             — Hand-written types (JSONB, future custom types)
  models/generated/   — GORM gen output (DO NOT EDIT)
  query/              — GORM gen type-safe query API (DO NOT EDIT)
  programs/           — Program aggregate (handler, service, repository, DTOs)
  sessions/           — Session aggregate (same layered pattern)
  users/              — User resolution + just-in-time provisioning from WorkOS
  auth/               — JWT verification, WorkOS client, principal middleware
  config/             — Env var loading
  database/           — GORM connection setup
  server/             — Router wiring + graceful shutdown
  handlers/           — Shared handlers (health, auth callback, /me)
  middleware/         — Request logging
  docs/               — Swagger/OpenAPI (generated, git-ignored)
```

## Code generation (GORM gen)

The backend is **database-first**: the Postgres schema is the source of truth, and Go structs are reverse-engineered from it using [gorm.io/gen](https://gorm.io/gen/).

### When to regenerate

After any Flyway migration that changes the schema:

```bash
make db-reset      # apply migrations (or db-up if not running)
make generate      # regenerate models + query API
```

### When to update `cmd/gen/main.go`

The generator config (`cmd/gen/main.go`) needs manual updates when a migration introduces:

| Schema change | What to update in `main.go` |
|---|---|
| New table | Add `g.GenerateModel("table_name")` + include in `ApplyBasic` |
| New custom Postgres type (enum, array) | Add entry to `WithDataTypeMap` |
| New FK relationship (or new nav field needed) | Add `gen.FieldRelate` call on the parent model |
| FK column that breaks GORM naming convention | Add `GORMTag` override in the `FieldRelate` config |

Standard column types (varchar, int, bool, timestamptz, etc.) are mapped automatically — no config changes needed.

### How it works

`cmd/gen/main.go` connects to the live database, introspects the schema, and generates:

- **`internal/models/generated/*.gen.go`** — GORM model structs with tags (one per table)
- **`internal/query/*.gen.go`** — Type-safe query builders (one per table)

Hand-written types like `JSONB` live in `internal/models/` (the parent package) and are imported by the generated models.

### Example: adding a new enum + table

1. Write the migration:
   ```sql
   CREATE TYPE difficulty AS ENUM ('easy', 'medium', 'hard');
   CREATE TABLE IF NOT EXISTS templates ( ... difficulty difficulty NOT NULL ... );
   ```

2. Update `cmd/gen/main.go`:
   ```go
   // In WithDataTypeMap:
   "difficulty": func(gorm.ColumnType) string { return "string" },

   // Before ApplyBasic:
   template := g.GenerateModel("templates", softDelete)

   // In ApplyBasic:
   g.ApplyBasic(..., template)
   ```

3. Run `make db-reset && make generate`

## Makefile targets

| Target | Description |
|---|---|
| `make run` | Start the API server |
| `make build` | Compile to `bin/api` |
| `make test` | Run all Go tests |
| `make test-cover` | Tests + HTML coverage report |
| `make generate` | Regenerate GORM models from live DB |
| `make swagger` | Regenerate OpenAPI docs |
| `make swagger-install` | Install the swag CLI |
| `make db-up` | Start Postgres + Flyway (clean migrate) |
| `make db-down` | Stop database containers |
| `make db-reset` | Destroy volume + restart (full schema reset) |

## Environment variables

Required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `WORKOS_API_KEY` | WorkOS API key |
| `WORKOS_CLIENT_ID` | WorkOS client ID (JWKS/issuer derived from this) |
| `WORKOS_REDIRECT_URI` | OAuth callback URL |
| `APP_URL` | Frontend URL for post-login redirect |

Optional:

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `development` or `production` |
| `HTTP_PORT` | `8080` | API listen port |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `AUTH_BYPASS_USER_ID` | — | Skip JWT auth in dev (set to a `users.id` UUID) |

## Testing

```bash
make test          # run all tests
make test-cover    # with HTML coverage report
```

Tests use Go stdlib `testing` with hand-written fakes (no mock generation libraries). Test files live alongside the code they test.

## Architecture

Follows a layered pattern per domain aggregate:

```
Handler (HTTP) → Service (business logic) → Repository (data access)
```

- Handlers parse requests, call services, write responses
- Services orchestrate and map between models and DTOs
- Repositories own GORM queries and preload chains
- Navigation fields (e.g. `Program.Weeks`) use GORM `Preload()`, not eager loading
