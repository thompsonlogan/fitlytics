# Plan 009: Make the database connection pool configurable via env vars

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- backend/internal/config/config.go backend/internal/config/config_test.go backend/internal/database/database.go backend/cmd/api/main.go CLAUDE.md backend/.env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — defaults exactly preserve today's behavior.
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

Pool sizing is hardcoded in `backend/internal/database/database.go:29–31`
(25 open / 5 idle / 1 h lifetime). Those are fine defaults, but they're the
first thing an operator needs to turn when the app meets a managed Postgres
with a connection cap (or a pgbouncer) — and today that requires a code
change and redeploy. Every other operational knob in this app is already an
env var with a validated default (`backend/internal/config/config.go`), so
this brings the pool in line with the existing pattern.

## Current state

- `backend/internal/database/database.go:16–31`:

```go
func Connect(ctx context.Context, dsn string, _ *slog.Logger) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		// The schema is migration-owned; keep GORM from issuing DDL.
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	})
	// ...
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(time.Hour)
```

- `backend/internal/config/config.go` — the pattern to extend. It already has
  `envInt` / `envInt64` helpers that return an error for non-integer values,
  collects problems into `invalid`/`missing` slices, and validates positivity
  (see the `MaxVideoBytes` handling at lines 42–53 and 108–116).

- Call site: `backend/cmd/api/main.go:52`:

```go
	db, err := database.Connect(ctx, cfg.DatabaseURL, log)
```

- `backend/internal/config/config_test.go` — existing config tests to model
  new cases on.

- `backend/.env.example` and the env-var table in `CLAUDE.md` document every
  optional variable; both must gain the new entries (stale docs are worse
  than missing).

- Windows/CRLF note: ignore `gofmt -l` noise on CRLF checkouts; rely on
  `go vet` and CI.

## Commands you will need

| Purpose       | Command                                     | Expected on success |
|---------------|---------------------------------------------|---------------------|
| Tests         | `cd backend && go test ./internal/config/ ./internal/database/` | ok |
| All tests     | `cd backend && go test ./...`               | ok                  |
| Vet / build   | `cd backend && go vet ./... && go build ./...` | exit 0           |

## Scope

**In scope**:
- `backend/internal/config/config.go`
- `backend/internal/config/config_test.go`
- `backend/internal/database/database.go`
- `backend/cmd/api/main.go`
- `backend/.env.example`
- `CLAUDE.md` (optional-env-vars table only)

**Out of scope** (do NOT touch):
- GORM logger configuration, ping-timeout behavior, or anything else in
  `Connect` beyond the three pool setters.
- `database/docker-compose*.yml`.

## Git workflow

- Branch: `advisor/009-configurable-db-pool`
- Commit style: `feat(backend): configurable DB connection pool`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Config fields

In `backend/internal/config/config.go`:

1. Add to `Config`:

```go
	DBMaxOpenConns     int
	DBMaxIdleConns     int
	DBConnMaxLifetime  time.Duration
```

2. In `Load()`, parse alongside the existing `envInt` calls (same
   error-collection style):

```go
	dbMaxOpen, err := envInt("DB_MAX_OPEN_CONNS", 25)
	if err != nil {
		invalid = append(invalid, err.Error())
	}
	dbMaxIdle, err := envInt("DB_MAX_IDLE_CONNS", 5)
	if err != nil {
		invalid = append(invalid, err.Error())
	}
	dbLifetimeMin, err := envInt("DB_CONN_MAX_LIFETIME_MINUTES", 60)
	if err != nil {
		invalid = append(invalid, err.Error())
	}
```

3. Populate the struct (`DBConnMaxLifetime: time.Duration(dbLifetimeMin) * time.Minute`)
   and validate with the other checks:

```go
	if c.DBMaxOpenConns <= 0 {
		invalid = append(invalid, "DB_MAX_OPEN_CONNS must be positive")
	}
	if c.DBMaxIdleConns <= 0 {
		invalid = append(invalid, "DB_MAX_IDLE_CONNS must be positive")
	}
	if c.DBMaxIdleConns > c.DBMaxOpenConns {
		invalid = append(invalid, "DB_MAX_IDLE_CONNS must not exceed DB_MAX_OPEN_CONNS")
	}
	if c.DBConnMaxLifetime <= 0 {
		invalid = append(invalid, "DB_CONN_MAX_LIFETIME_MINUTES must be positive")
	}
```

(`time` needs importing if not already imported in config.go — it is not, at
planning time.)

**Verify**: `cd backend && go build ./...` → exit 0.

### Step 2: Thread it into Connect

In `backend/internal/database/database.go`, add a small options struct and
change the signature (keep the unused logger param out — it's already
ignored; removing it entirely is fine and tidier):

```go
// Pool controls the sql.DB connection pool.
type Pool struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

func Connect(ctx context.Context, dsn string, pool Pool) (*gorm.DB, error) {
	// ... gorm.Open unchanged ...
	sqlDB.SetMaxOpenConns(pool.MaxOpenConns)
	sqlDB.SetMaxIdleConns(pool.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(pool.ConnMaxLifetime)
```

Update the call in `backend/cmd/api/main.go:52`:

```go
	db, err := database.Connect(ctx, cfg.DatabaseURL, database.Pool{
		MaxOpenConns:    cfg.DBMaxOpenConns,
		MaxIdleConns:    cfg.DBMaxIdleConns,
		ConnMaxLifetime: cfg.DBConnMaxLifetime,
	})
```

If removing the `*slog.Logger` parameter breaks other callers, check with
`grep -rn "database.Connect" backend/` — at planning time `cmd/api/main.go`
is the only caller.

**Verify**: `cd backend && go build ./... && go vet ./...` → exit 0.

### Step 3: Tests

In `backend/internal/config/config_test.go`, following the file's existing
style (env setup via `t.Setenv`):

1. Defaults: with none of the three vars set (and the required vars
   populated), `Load()` yields 25 / 5 / 60 min.
2. Overrides: `DB_MAX_OPEN_CONNS=10`, `DB_MAX_IDLE_CONNS=2`,
   `DB_CONN_MAX_LIFETIME_MINUTES=5` → struct reflects them
   (`5 * time.Minute`).
3. Non-integer value → `Load()` errors mentioning the var name.
4. `DB_MAX_IDLE_CONNS=30` with `DB_MAX_OPEN_CONNS=10` → error mentioning
   "must not exceed".

**Verify**: `cd backend && go test ./internal/config/` → ok.

### Step 4: Documentation

1. `backend/.env.example`: add the three vars, commented, with their defaults
   (match the file's existing comment style — read it first).
2. `CLAUDE.md`: add three rows to the **Optional** env-var table
   (`DB_MAX_OPEN_CONNS` — "Max open DB connections (default 25)", etc.).

**Verify**: `grep -c "DB_MAX_OPEN_CONNS" backend/.env.example CLAUDE.md` →
`1` in each.

### Step 5: Full pass

**Verify**: `cd backend && go test ./...` → ok.

## Test plan

- New: 4 config cases (Step 3), in `config_test.go`, matching its existing
  table/`t.Setenv` style. `database.Connect` itself needs no new test — it
  has none today and requires a live DB; the compile-time signature change is
  covered by the build.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "SetMaxOpenConns(25)" backend/internal/database/database.go` → no output (no hardcoded values remain)
- [ ] `cd backend && go test ./...` → ok; `go vet ./...` → exit 0
- [ ] Config tests cover defaults, overrides, non-integer, and idle>open
- [ ] `backend/.env.example` and `CLAUDE.md` document all three vars
- [ ] Only in-scope files modified (`git status`)
- [ ] `.plan/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `database.Connect` has grown callers beyond `cmd/api/main.go` (grep in
  Step 2) — list them instead of guessing their pool needs.
- `config.go`'s error-collection structure no longer matches the excerpt
  (drift) — re-derive placement, and if `Load()` was redesigned, report.

## Maintenance notes

- If a pgbouncer/pooler is put in front of Postgres later,
  `DB_CONN_MAX_LIFETIME_MINUTES` should typically be shortened below the
  pooler's server-idle timeout — that's the knob this plan exists for.
- Deferred deliberately: `SetConnMaxIdleTime` (a fourth knob nobody needs
  yet) — add it only alongside a concrete pooler requirement.
