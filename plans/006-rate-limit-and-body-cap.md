# Plan 006: Rate-limit the public auth endpoints and cap API request bodies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/nginx.conf backend/internal/server/router.go backend/internal/middleware/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — a too-tight rate limit can lock out legitimate users
  (especially plan 002's refresh bursts); limits below are sized for that.
  The body cap is LOW risk (largest legitimate JSON body is a 4000-char note).
- **Depends on**: plans/005-nginx-security-headers.md (touches the same
  `frontend/nginx.conf`; execute 005 first to avoid merge conflicts)
- **Category**: security
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The unauthenticated endpoints `/auth/login`, `/auth/callback`, and
`/auth/refresh` each trigger a server-side call to the WorkOS API
(`backend/internal/handlers/auth.go` — `GetAuthorizationURL`,
`AuthenticateWithCode`, `AuthenticateWithRefreshToken`). Nothing anywhere in
the stack throttles them: no `limit_req` in nginx, no limiter in Gin. An
abuser (or a bug in the SPA's refresh loop) can burn WorkOS quota and generate
cost at line rate. Separately, the Go server reads request bodies with no size
cap of its own — nginx caps proxied bodies at 20 MB
(`frontend/nginx.conf:14`), all of which Gin will happily buffer and parse as
JSON, though the largest legitimate API body is a ~4 KB note. Defense in
depth: nginx rate zones for `/auth/`, plus a 1 MiB `MaxBytesReader` on the
API group in Go (which also protects any deployment where the API is exposed
without the nginx front).

## Current state

- `frontend/nginx.conf` — one `server` block; conf.d files are included at
  `http` context, so `limit_req_zone` directives may be declared at the top of
  this file, above `server {`. The `/auth/` location today:

```nginx
    location /auth/ {
        set $backend "http://${BACKEND_UPSTREAM}";
        proxy_pass $backend$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
```

  Only `${BACKEND_*}` is envsubst-substituted (Dockerfile sets
  `NGINX_ENVSUBST_FILTER="BACKEND_"`), so `$binary_remote_addr` etc. pass
  through verbatim.

- `backend/internal/server/router.go` — route wiring. The API group
  (lines 78–91):

```go
	api := r.Group("/api")
	if deps.AuthBypassUserID != uuid.Nil {
		// ...
		api.Use(middleware.DevAuthBypass(deps.Users, deps.AuthBypassUserID, deps.Log))
	} else {
		api.Use(middleware.RequireAuth(deps.Verifier, deps.Users, deps.Log))
	}
```

- `backend/internal/middleware/` — existing middleware package
  (`auth.go`, `logging.go`); new middleware goes here as its own file,
  matching the package's doc-comment style.

- Error responses use `backend/internal/apierr` helpers
  (`apierr.Abort(c, status, detail)` pattern — see
  `backend/internal/middleware/auth.go:45` for an in-package example).

- Backend test conventions: Go stdlib testing + hand-written fakes, tests
  alongside code (`*_test.go`). `httptest` + a bare `gin.New()` router is the
  pattern for middleware tests (see `backend/internal/programs/handler_test.go`
  for handler-level examples).

- Windows/CRLF note: `gofmt -l .` may list every file on a checkout with
  `core.autocrlf=true` — that's line endings, not formatting. Rely on
  `go vet ./...` + CI's gofmt (LF checkout) instead of "fixing" CRLF noise.

## Commands you will need

| Purpose        | Command                                              | Expected on success |
|----------------|------------------------------------------------------|---------------------|
| Backend tests  | `cd backend && go test ./...`                        | ok, all packages    |
| Vet            | `cd backend && go vet ./...`                         | exit 0              |
| Build          | `cd backend && go build ./...`                       | exit 0              |
| nginx check    | `docker build -t fitlytics-frontend-rltest frontend/` then run + curl (see Step 4) | see Step 4 |

(`make test` also works but requires the `swag` CLI on PATH; plain `go test`
does not and is sufficient here.)

## Scope

**In scope**:
- `frontend/nginx.conf` (rate zones + limit_req in `/auth/` and `/api/`)
- `backend/internal/middleware/bodylimit.go` (create)
- `backend/internal/middleware/bodylimit_test.go` (create)
- `backend/internal/server/router.go` (wire the body limit)

**Out of scope** (do NOT touch):
- Application-level per-user rate limiting in Go — the IP-based nginx layer is
  the deliberate scope; per-user limiting needs product decisions about
  limits and storage.
- The video upload path — uploads go browser→R2 via presigned PUT and never
  transit either nginx or the API; nothing here may interfere with
  `/api/sessions/*/set-logs/*/videos` JSON metadata calls (they're small and
  covered by the same 1 MiB cap).
- WorkOS SDK calls, cookie handling, `backend/internal/handlers/auth.go`.

## Git workflow

- Branch: `advisor/006-rate-limit-body-cap`
- Commit style: `feat(backend): request body cap` / `chore(deploy): rate-limit auth endpoints`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: nginx rate zones

At the top of `frontend/nginx.conf` (above `server {`), add:

```nginx
# Rate zones. conf.d files are included at http context, so zone declarations
# are valid here. Keyed by client IP; this container is the TLS-terminated
# edge behind the platform proxy, so $binary_remote_addr is the proxy's view
# of the client — good enough for abuse damping.
# /auth/ endpoints each cost a WorkOS API call — keep them scarce.
limit_req_zone $binary_remote_addr zone=auth_rl:10m rate=30r/m;
# /api/ is authenticated traffic; generous ceiling that only trips floods.
limit_req_zone $binary_remote_addr zone=api_rl:10m rate=20r/s;
limit_req_status 429;
```

Inside `location /auth/ { ... }` add (first line of the block):

```nginx
        limit_req zone=auth_rl burst=15 nodelay;
```

Inside `location /api/ { ... }` add:

```nginx
        limit_req zone=api_rl burst=40 nodelay;
```

Sizing rationale (for the reviewer): a legitimate login round-trip is ~3
`/auth/` hits; plan 002's middleware fires at most one `/auth/refresh` per
5-minute token expiry. 30 r/m with burst 15 never touches real users. The
workout table's batch endpoints keep `/api/` chatter low; 20 r/s + burst 40
is flood protection, not throttling.

### Step 2: Go body-limit middleware

Create `backend/internal/middleware/bodylimit.go`:

```go
package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxBodyBytes caps how much request body a handler can read. Every API
// endpoint consumes small JSON (largest legitimate payload: a 4000-char
// session note); video bytes go browser→R2 via presigned PUT and never
// transit this server. Reads past the cap make the JSON bind fail, which
// handlers already surface as 400s.
func MaxBodyBytes(limit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		}
		c.Next()
	}
}
```

### Step 3: Wire it in the router

In `backend/internal/server/router.go`, add a package-level constant and
apply the middleware to the `/api` group *before* the auth middleware:

```go
// maxAPIBodyBytes caps JSON request bodies on /api. Largest legitimate body
// is a session note (~4 KB); 1 MiB leaves generous headroom.
const maxAPIBodyBytes = 1 << 20
```

and change the group creation (currently `api := r.Group("/api")`, line 78):

```go
	api := r.Group("/api")
	api.Use(middleware.MaxBodyBytes(maxAPIBodyBytes))
```

(The existing `if deps.AuthBypassUserID != uuid.Nil { ... }` block stays
directly below, unchanged.) Do NOT apply it to the `/auth/*` routes — they
read no bodies — or to `/healthz`.

**Verify**: `cd backend && go build ./... && go vet ./...` → exit 0.

### Step 4: Tests

Create `backend/internal/middleware/bodylimit_test.go` (stdlib testing +
httptest, matching the package style):

1. **Under the cap**: POST 1 KB body through a `gin.New()` router with
   `MaxBodyBytes(2048)` and a handler that does `io.ReadAll(c.Request.Body)`
   → handler reads it fully, responds 200.
2. **Over the cap**: POST 4 KB with the same limiter → the handler's read
   fails; assert the handler receives an error from `io.ReadAll` and that
   responding 400 works. Also assert (via a second sub-test using
   `c.ShouldBindJSON`) that an oversized JSON body yields a bind error rather
   than a hang.
3. **Nil body**: GET with no body → passes through, 200.

**Verify**: `cd backend && go test ./internal/middleware/` → ok.
**Verify**: `cd backend && go test ./...` → ok (nothing else regressed).

### Step 5: Verify the nginx side (only if Docker is available)

```
docker build -t fitlytics-frontend-rltest frontend/
docker run -d --rm --name rltest -p 8090:80 -e BACKEND_UPSTREAM=localhost:9 fitlytics-frontend-rltest
```

Fire 20 rapid requests:
`for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/auth/refresh -X POST; done`

Expected: the first ~15 return `502` (no backend attached — that's fine, the
request *passed* the limiter) and the tail returns `429` (limiter tripped).
Then `docker stop rltest`. If Docker is unavailable, state so in the report;
the zone syntax was validated by the successful container start in plan 005's
flow — but at minimum ensure the image build (which doesn't validate config)
plus a config render check if possible.

## Test plan

- New: `bodylimit_test.go` (3 cases above), pattern: stdlib + httptest +
  `gin.New()`.
- nginx: the live-container 429 check in Step 5.
- Verification: `go test ./...` → ok.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "limit_req_zone" frontend/nginx.conf` → `2`; `grep -c "limit_req zone=" frontend/nginx.conf` → `2`
- [ ] `backend/internal/middleware/bodylimit.go` exists; `grep -n "MaxBodyBytes" backend/internal/server/router.go` shows it applied to the `/api` group
- [ ] `cd backend && go test ./...` → ok
- [ ] `go vet ./...` → exit 0
- [ ] If Docker was available: the 429 check in Step 5 passed
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 005 has not landed and `frontend/nginx.conf` conflicts — coordinate
  order rather than merging by hand.
- `limit_req_zone` at the top of the conf file fails nginx's config check
  ("directive is not allowed here") — the include context differs from the
  planning assumption; report the actual include chain
  (`docker exec <c> nginx -T | head -40`).
- Any existing backend test fails after Step 3 — a test may POST a >1 MiB
  body somewhere unexpected; report which test, don't raise the cap silently.

## Maintenance notes

- If plan 002's refresh middleware ever retries more aggressively (e.g. per
  query instead of single-flight), the 30 r/m auth zone is the first thing
  that will bite — revisit both together.
- The `MAX_VIDEO_BYTES` env var governs R2 uploads and is unrelated to
  `maxAPIBodyBytes`; don't conflate them in future changes.
- If the API is ever exposed directly (no nginx), the Go body cap holds but
  rate limiting disappears — that's the trigger to add a Go-side limiter.
- Reviewer scrutiny: confirm `MaxBodyBytes` sits BEFORE `RequireAuth` in the
  chain (cheap rejection first) and that 429 responses from nginx are
  acceptable to the SPA (React Query will surface them as generic errors —
  acceptable for flood conditions).
