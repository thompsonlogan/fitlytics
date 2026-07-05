# Plan 007: Correlate logs with a per-request ID

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- backend/internal/logger/ backend/internal/middleware/ backend/internal/server/router.go backend/internal/sessions/handler.go backend/internal/programs/handler.go backend/internal/videos/ frontend/nginx.conf`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans 005/006 legitimately touch
> `frontend/nginx.conf` — a diff there is expected if they landed; only their
> hunks should be present.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW — additive logging plumbing; no business logic changes.
- **Depends on**: plans/006-rate-limit-and-body-cap.md (same `nginx.conf`;
  land in order to avoid conflicts). The Go changes are independent.
- **Category**: dx / observability
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The request logger emits one line per request
(`backend/internal/middleware/logging.go`) and handlers emit error lines
(e.g. `backend/internal/sessions/handler.go:69`), but nothing ties them
together — diagnosing a production 500 means matching timestamps by eye.
A request ID that (a) is generated or accepted at the edge, (b) rides the
request `context.Context`, and (c) is automatically appended to every
context-aware log line, turns "which request failed and why" into a single
grep.

## Current state

- `backend/internal/logger/logger.go` — builds the app logger; full current
  body:

```go
func New(level, env string) *slog.Logger {
	opts := &slog.HandlerOptions{Level: parseLevel(level)}

	var handler slog.Handler
	if env == "production" {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}

	log := slog.New(handler)
	slog.SetDefault(log)
	return log
}
```

- `backend/internal/middleware/logging.go` — `RequestLogger` already logs via
  `log.LogAttrs(c.Request.Context(), ...)`, so it will pick up a
  context-aware handler for free.

- `backend/internal/server/router.go:42–43` — middleware chain:

```go
	r := gin.New()
	r.Use(middleware.RequestLogger(deps.Log), gin.Recovery())
```

- Log call sites that are context-blind today (they call `h.log.Error(...)`
  / `s.log.Warn(...)` without a ctx, so a context-aware handler can't see the
  request id): `sessions/handler.go` lines 69, 118, 178, 233, 283, 320;
  `programs/handler.go` lines 46, 87; `videos/service.go` lines 130, 159,
  166, 172, 181, 187, 251, 259. (Others — `middleware/auth.go`,
  `handlers/auth.go` — already use `ErrorContext`/`WarnContext`.)

- `frontend/nginx.conf` — proxied locations set `X-Real-IP` etc. but no
  request-ID header; nginx provides `$request_id` (32-hex random per request).

- Conventions: middleware lives one-file-per-concern in
  `backend/internal/middleware/`; stdlib testing, tests alongside code.
  Windows/CRLF note: ignore `gofmt -l` noise on CRLF checkouts; use
  `go vet` + CI.

## Commands you will need

| Purpose       | Command                              | Expected on success |
|---------------|--------------------------------------|---------------------|
| Backend tests | `cd backend && go test ./...`        | ok                  |
| Vet           | `cd backend && go vet ./...`         | exit 0              |
| Build         | `cd backend && go build ./...`       | exit 0              |

## Scope

**In scope**:
- `backend/internal/logger/logger.go` (context-aware handler)
- `backend/internal/logger/logger_test.go` (create)
- `backend/internal/middleware/requestid.go` (create)
- `backend/internal/middleware/requestid_test.go` (create)
- `backend/internal/server/router.go` (wire middleware)
- `backend/internal/sessions/handler.go`, `backend/internal/programs/handler.go`,
  `backend/internal/videos/service.go`, `backend/internal/videos/handler.go` —
  mechanical switch of ctx-blind log calls to `*Context` variants
- `frontend/nginx.conf` (one `proxy_set_header` line per proxied location)

**Out of scope** (do NOT touch):
- Log message wording, levels, or attributes beyond adding ctx.
- Distributed tracing / OpenTelemetry — a request id is deliberately the
  whole scope.
- `backend/internal/models/generated/`, `backend/internal/query/` (generated).

## Git workflow

- Branch: `advisor/007-request-id`
- Commit style: `feat(backend): request-id correlation across logs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Context plumbing in the logger package

In `backend/internal/logger/logger.go`, add a private context key, public
helpers, and a wrapping handler:

```go
type ctxKey struct{}

// WithRequestID returns a child context carrying the request id, which the
// logger's handler appends to every context-aware log record.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// RequestID extracts the request id, or "" when the context has none.
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

// ctxHandler decorates a slog.Handler, appending request_id from the context.
type ctxHandler struct{ slog.Handler }

func (h ctxHandler) Handle(ctx context.Context, r slog.Record) error {
	if id := RequestID(ctx); id != "" {
		r.AddAttrs(slog.String("request_id", id))
	}
	return h.Handler.Handle(ctx, r)
}

func (h ctxHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return ctxHandler{h.Handler.WithAttrs(attrs)}
}

func (h ctxHandler) WithGroup(name string) slog.Handler {
	return ctxHandler{h.Handler.WithGroup(name)}
}
```

In `New`, wrap: `log := slog.New(ctxHandler{handler})`.

**Verify**: `cd backend && go build ./...` → exit 0.

### Step 2: Request-ID middleware

Create `backend/internal/middleware/requestid.go`:

```go
package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/thompsonlogan/fitlytics/backend/internal/logger"
)

// RequestIDHeader is accepted from the edge proxy (nginx sets it from
// $request_id) and echoed on the response so clients can report it.
const RequestIDHeader = "X-Request-ID"

// maxRequestIDLen guards against abusive header values when the API is hit
// without the proxy in front.
const maxRequestIDLen = 64

// RequestID ensures every request has an id: reuse the inbound header when
// present (trusted edge), otherwise mint a UUID. The id is stored on the
// request context for the logger and echoed in the response headers.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(RequestIDHeader)
		if id == "" || len(id) > maxRequestIDLen {
			id = uuid.NewString()
		}
		c.Request = c.Request.WithContext(logger.WithRequestID(c.Request.Context(), id))
		c.Writer.Header().Set(RequestIDHeader, id)
		c.Next()
	}
}
```

Wire it in `backend/internal/server/router.go` — it must run BEFORE
`RequestLogger` so the access line carries the id:

```go
	r.Use(middleware.RequestID(), middleware.RequestLogger(deps.Log), gin.Recovery())
```

**Verify**: `cd backend && go build ./... && go vet ./...` → exit 0.

### Step 3: Switch ctx-blind log calls to *Context variants

Mechanical sweep — for each listed site, change `h.log.Error(` →
`h.log.ErrorContext(c.Request.Context(), ` and `s.log.Warn(` →
`s.log.WarnContext(ctx, ` (the videos service methods all already take
`ctx context.Context` as their first parameter):

- `backend/internal/sessions/handler.go`: 6 sites (lines 69, 118, 178, 233,
  283, 320 at planning time).
- `backend/internal/programs/handler.go`: 2 sites (lines 46, 87).
- `backend/internal/videos/service.go`: 8 sites (lines 130, 159, 166, 172,
  181, 187, 251, 259).
- Sweep for stragglers:
  `grep -rn "\.log\.\(Error\|Warn\|Info\)(" backend/internal --include="*.go" | grep -v _test | grep -v Context`
  → convert any remaining hit inside a request path (skip `cmd/api/main.go`
  startup logging — there is no request context at startup, leave it).

**Verify**: the grep above returns no request-path hits.
**Verify**: `cd backend && go test ./...` → ok (handler tests pass fakes for
the service; the logger calls compile against the same *slog.Logger*).

### Step 4: Tests

`backend/internal/logger/logger_test.go`:

1. Build a logger over a `bytes.Buffer` with the `ctxHandler` (construct
   directly: `slog.New(ctxHandler{slog.NewJSONHandler(&buf, nil)})`), log with
   `InfoContext(WithRequestID(context.Background(), "abc123"), "hi")` →
   buffer JSON contains `"request_id":"abc123"`.
2. Same without a request id in ctx → no `request_id` key.

`backend/internal/middleware/requestid_test.go` (httptest + `gin.New()`):

1. No inbound header → response has a non-empty `X-Request-ID`, and a handler
   reading `logger.RequestID(c.Request.Context())` sees the same value.
2. Inbound `X-Request-ID: edge-123` → reused in both places.
3. Inbound header longer than 64 chars → replaced by a fresh UUID.

**Verify**: `cd backend && go test ./internal/logger/ ./internal/middleware/`
→ ok.

### Step 5: nginx passes its edge id

In `frontend/nginx.conf`, add to BOTH `location /api/` and `location /auth/`
proxy blocks (alongside the existing `proxy_set_header` lines):

```nginx
        proxy_set_header X-Request-ID      $request_id;
```

**Verify** (Docker available): rebuild/run the frontend image as in plan 005
Step 3 and `curl -sI http://localhost:8089/api/me` → response includes an
`X-Request-ID` header (a 502 response is fine — the header check is what
matters; note the header will come from the Go app only when a backend is
attached, so alternatively verify via the backend directly:
`curl -sI http://localhost:8080/healthz` with the API running locally).
If neither is available, the unit tests in Step 4 are the gate; say so in the
report.

## Test plan

- New: `logger_test.go` (2 cases), `requestid_test.go` (3 cases) — patterns:
  stdlib testing, `httptest`, hand-built assertions (match
  `backend/internal/auth/principal_test.go` style).
- Regression: full `go test ./...`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd backend && go test ./...` → ok; `go vet ./...` → exit 0
- [ ] `grep -rn "\.log\.\(Error\|Warn\|Info\)(" backend/internal --include="*.go" | grep -v _test | grep -v Context | grep -v "cmd/"` → no output
- [ ] `grep -c "X-Request-ID" frontend/nginx.conf` → `2`
- [ ] `grep -n "middleware.RequestID()" backend/internal/server/router.go` → present, before `RequestLogger`
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The listed log-call line numbers are off by more than a few lines AND the
  surrounding code doesn't match — the handlers were restructured; re-derive
  the sweep from the grep, and if that finds sites in files not in scope,
  report before touching them.
- Converting a call requires threading a `ctx` parameter through a function
  that doesn't have one (signature change) — report instead; this plan is
  logging-only.
- `go test ./...` failures unrelated to logging appear — pre-existing
  breakage; report, don't fix here.

## Maintenance notes

- New log calls in request paths should use the `*Context` slog variants —
  that's now the difference between a correlatable line and an orphan. Worth
  a line in `CLAUDE.md`'s conventions section in a future docs pass.
- If tracing (OTel) ever lands, `logger.WithRequestID` / `RequestID` is the
  seam to swap for a trace-id.
- Reviewer scrutiny: middleware ordering in `router.go` (RequestID first),
  and that no log message text changed in the Step 3 sweep (diff should be
  method name + ctx arg only).
