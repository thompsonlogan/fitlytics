# Plan 027: Error tracking with Sentry (backend + frontend, env-gated, request-id correlated)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- backend/internal/config/config.go backend/cmd/api/main.go backend/internal/server/router.go backend/internal/logger/ frontend/src/main.tsx frontend/security-headers.conf frontend/.env.example frontend/Dockerfile`
> Several of these WILL have drifted if plans 005/007/009 landed (expected —
> they're prerequisites). Compare the "Current state" excerpts for the parts
> this plan touches; on an unexplained mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — touches the backend's logger and middleware chain and the
  frontend bootstrap. Mitigations: everything is a no-op without a DSN, the
  Sentry fanout is additive to (never replaces) the existing slog output,
  and the full test suites gate both sides.
- **Depends on**: 007 (request-id — this plan tags Sentry events with it and
  both touch `logger/` + `router.go`), 005 (if landed, its CSP needs one
  connect-src addition — same file), 009 (touches `config.go`; serialize)
- **Category**: ops / observability
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

Today a production failure emits one `slog` line into container stdout and
vanishes: no aggregation, no alert, no stack trace with request context, no
"this error started 10 minutes ago and has hit 40 users." Neither product
analytics (plan 026) nor metrics dashboards fill this pillar. Sentry does:
the Go SDK captures backend panics and error-level events, the React SDK
captures uncaught frontend exceptions, and both correlate through the
request id that plan 007 threads through the stack — so an error report
links directly to the exact request line in the container logs.

**Cost: $0.** Sentry's cloud free tier (single user, ~5k errors/month) is
the recommendation; nothing self-hosts on the Coolify box. If the operator
later prefers self-hosting, **GlitchTip** is Sentry-API-compatible (same
DSN mechanism, same SDKs) and runs on Coolify far more lightly than
PostHog would — the code this plan adds works unchanged with either; only
the DSN differs. Like plan 026, everything is gated on env (`SENTRY_DSN` /
`VITE_SENTRY_DSN`): absent → complete no-op, so the executor needs no
Sentry account and dev/CI stay clean.

## Current state

- **Backend has no error aggregation.** Handlers log 5xx via
  `h.log.ErrorContext(...)` (post-007) — e.g.
  `backend/internal/sessions/handler.go` — and panics are converted to 500s
  by `gin.Recovery()` in the chain
  (`backend/internal/server/router.go`, post-007:
  `r.Use(middleware.RequestID(), middleware.RequestLogger(deps.Log), gin.Recovery())`).
- `backend/internal/logger/logger.go` (post-007) — `New(level, env)` builds
  a JSON/text handler wrapped in `ctxHandler` (appends `request_id` from
  the context); `logger.RequestID(ctx)` extracts the id. The Sentry fanout
  wraps at this same seam.
- `backend/internal/config/config.go` — env parsing with
  required/invalid collection; optional vars simply default. Add
  `SentryDSN` as a plain optional string (empty = disabled; no validation).
- `backend/cmd/api/main.go` — sequential init (config → logger → db →
  verifier → …); Sentry init slots right after the logger, with a deferred
  flush before exit.
- **Frontend**: `frontend/src/main.tsx` bootstraps before render (plan 026
  adds `initAnalytics()` there; this plan adds `initErrorTracking()`
  beside it). Router errors fall through to TanStack Router's built-in
  error component (`frontend/src/router.tsx` comment) — uncaught render
  errors still reach `window.onerror`/`unhandledrejection`, which the
  Sentry SDK hooks globally.
- Plan 005's CSP (if landed) is in `frontend/security-headers.conf` with
  `connect-src 'self' https://*.r2.cloudflarestorage.com` — Sentry's
  browser ingest endpoint must be added or every event is CSP-blocked.
- `frontend/src/hooks/use-auth.ts` — post-026, `fetchMe` calls
  `identifyUser(me.id)`; this plan adds the Sentry equivalent at the same
  point (opaque id only — same PII boundary).
- Conventions: backend stdlib tests + fakes; frontend vitest; no
  `useEffect`; Windows note — ignore `gofmt -l` CRLF noise, rely on
  `go vet` + CI.

## Commands you will need

| Purpose        | Command                                             | Expected on success |
|----------------|------------------------------------------------------|---------------------|
| Backend dep    | `cd backend && go get github.com/getsentry/sentry-go@latest && go mod tidy` | exit 0 |
| SDK signatures | `cd backend && go doc github.com/getsentry/sentry-go Init` (and `.../slog` if used) | prints API |
| Backend gates  | `cd backend && go test ./... && go vet ./... && go build ./...` | ok / exit 0 |
| Frontend dep   | `cd frontend && pnpm add @sentry/react` (add `--node-linker=hoisted` on MAX_PATH errors) | exit 0 |
| Frontend gates | `cd frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm build` | all pass |

## Scope

**In scope**:
- Backend: `go.mod`/`go.sum`, `internal/config/config.go` (+ its test),
  `cmd/api/main.go`, `internal/server/router.go` (one middleware line),
  `internal/logger/logger.go` (+ its test — the error-level fanout),
  `internal/errortracking/errortracking.go` (create — init + gin middleware
  wiring in one small package)
- Frontend: `package.json`/lockfile, `src/lib/error-tracking.ts` (create)
  + test, `src/main.tsx` (one init call), `src/hooks/use-auth.ts`
  (setUser/clear at the existing identify points), `.env.example`,
  `Dockerfile` (ARG), `security-headers.conf` (connect-src, only if plan
  005 landed)
- `backend/.env.example` + the `CLAUDE.md` optional-env table
  (`SENTRY_DSN` row)

**Out of scope** (do NOT touch):
- Performance tracing / profiling on either side — error capture only
  (`TracesSampleRate: 0`); tracing burns the free quota and adds noise.
- Session replay, source-map upload pipelines, release tagging — follow-ups
  once errors are flowing.
- A Sentry tunnel through nginx (ad-block circumvention) — deliberately
  skipped; losing some blocked-client reports is acceptable for errors.
- Alert rules — configured in the Sentry UI by the operator.

## Git workflow

- Branch: `advisor/027-error-tracking`
- Commit style: `feat(observability): env-gated Sentry error tracking (backend + frontend)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Backend config + init

1. `config.go`: add `SentryDSN string` to `Config`, populated via
   `env("SENTRY_DSN", "")` — optional, no validation (empty = disabled).
   Add a defaults/override case to `config_test.go`.
2. Create `backend/internal/errortracking/errortracking.go`:

```go
// Package errortracking wires the Sentry SDK. Everything here is a no-op
// when no DSN is configured — dev and CI run with error tracking off.
package errortracking

func Init(dsn, environment string) (enabled bool, err error) {
	if dsn == "" {
		return false, nil
	}
	err = sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      environment,      // "development" | "production"
		TracesSampleRate: 0,                // errors only; tracing burns quota
		SendDefaultPII:   false,            // opaque ids only, ever
	})
	return err == nil, err
}

// Flush drains buffered events on shutdown; call deferred from main.
func Flush() { sentry.Flush(2 * time.Second) }
```

   (Confirm exact option names with `go doc` — e.g. the PII field's casing —
   and adjust; the intent, not the spelling, is normative.)
3. `cmd/api/main.go`, after the logger is built:

```go
	sentryEnabled, err := errortracking.Init(cfg.SentryDSN, cfg.Env)
	if err != nil {
		log.Warn("sentry init failed; continuing without error tracking", "error", err)
	}
	if sentryEnabled {
		defer errortracking.Flush()
		log.Info("error tracking enabled")
	}
```

   A bad DSN must WARN and continue — error tracking is never allowed to
   take the API down.

**Verify**: `cd backend && go build ./... && go test ./internal/config/` →
ok.

### Step 2: Capture panics via the gin middleware

Use the official `github.com/getsentry/sentry-go/gin` package. In
`router.go`, insert AFTER `RequestID`/`RequestLogger` and BEFORE
`gin.Recovery()`:

```go
	r.Use(middleware.RequestID(), middleware.RequestLogger(deps.Log),
		sentrygin.New(sentrygin.Options{Repanic: true}), gin.Recovery())
```

`Repanic: true` is load-bearing: sentrygin reports the panic, then
re-panics so the existing `gin.Recovery()` still converts it to the 500 the
client expects. Guard: `sentrygin.New` with an uninitialized SDK is a
no-op passthrough — verify that claim with a quick test (Step 4 case 3);
if it is NOT a safe no-op, wrap the middleware registration in an
`if sentryEnabled` passed through `server.Dependencies`.

**Verify**: `go build ./... && go vet ./...` → exit 0.

### Step 3: Fan error-level logs out to Sentry

The repo's convention is that handlers report failures via
`log.ErrorContext(...)` — so the logger is the one choke point that sees
every 5xx. In `internal/logger/logger.go`, extend the (post-007)
`ctxHandler` chain with a fanout handler:

```go
// sentryHandler forwards Error-level records to Sentry (when initialized),
// tagged with the request id, without altering the primary log output.
// capture is injectable so tests can observe forwarding without the SDK.
type sentryHandler struct {
	slog.Handler
	capture func(msg string, attrs map[string]string)
}

func (h sentryHandler) Handle(ctx context.Context, r slog.Record) error {
	if r.Level >= slog.LevelError && h.capture != nil {
		attrs := map[string]string{}
		if id := RequestID(ctx); id != "" {
			attrs["request_id"] = id
		}
		r.Attrs(func(a slog.Attr) bool { attrs[a.Key] = a.Value.String(); return true })
		h.capture(r.Message, attrs)
	}
	return h.Handler.Handle(ctx, r)
}
```

with the production `capture` implemented against the SDK (CaptureEvent /
CaptureMessage with tags — check `go doc sentry CaptureEvent` for shape;
set the `request_id` as a **tag**, not just context, so it's searchable),
wired only when `errortracking.Init` reported enabled. Prefer this ~30-line
hand fanout over `sentry-go`'s slog integration module unless `go doc`
shows the official `sentryslog` handler composes cleanly with the existing
`ctxHandler` — if it does, using it is fine; keep the injectable-capture
seam either way for the tests.

This requires `logger.New` to grow an optional way to receive the capture
func — follow the existing options pattern from `users.NewService`
(`WithCacheSize`) if one is needed: `logger.New(level, env, logger.WithErrorCapture(fn))`.

**Verify**: `go build ./... && go test ./internal/logger/` → ok.

### Step 4: Backend tests

In `internal/logger/logger_test.go` (extending plan 007's file):

1. Error-level record with a request id in ctx → injected `capture` called
   once with `attrs["request_id"]` set and the message intact; the primary
   buffer STILL contains the log line (fanout, not diversion).
2. Warn-level record → `capture` not called.
3. No capture configured (nil) → error record logs normally, no panic.

In `internal/config/config_test.go`: `SENTRY_DSN` default empty / override
respected (from Step 1).

**Verify**: `cd backend && go test ./...` → ok.

### Step 5: Frontend init + user context

1. Create `frontend/src/lib/error-tracking.ts`, mirroring plan 026's
   gating pattern exactly:

```ts
import * as Sentry from "@sentry/react"

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

export const errorTrackingEnabled = Boolean(DSN)

export function initErrorTracking() {
  if (!DSN) return
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0, // errors only
  })
}

// Opaque local users.id only — same PII boundary as lib/analytics.ts.
export function setErrorUser(id: string) {
  if (!DSN) return
  Sentry.setUser({ id })
}

export function clearErrorUser() {
  if (!DSN) return
  Sentry.setUser(null)
}
```

2. `main.tsx`: call `initErrorTracking()` next to `initAnalytics()`.
3. `use-auth.ts`: `setErrorUser(me.id)` beside the plan-026
   `identifyUser(me.id)` call sites (same `if (me?.id)` guard);
   `clearErrorUser()` beside `resetAnalytics()` in `signOut`.
4. `.env.example`: `VITE_SENTRY_DSN=` (comment: unset = disabled).
   `Dockerfile`: `ARG VITE_SENTRY_DSN=""` + ENV, same pattern as the other
   `VITE_*` args. Backend `.env.example`: `SENTRY_DSN=` with the same
   comment; add the row to CLAUDE.md's optional env table.
5. Test (`error-tracking.test.ts`, module-reimport pattern from plan 026's
   analytics test): no DSN → all exports no-op with zero SDK calls; DSN set
   → `init` called with `sendDefaultPii: false` and `tracesSampleRate: 0`;
   `setErrorUser("u1")` passes `{ id: "u1" }` and nothing else.

**Verify**: `pnpm vitest run error-tracking` → pass; full
`pnpm test && pnpm lint && pnpm typecheck && pnpm build` → pass.

### Step 6: CSP allowance (only if plan 005 landed)

In `frontend/security-headers.conf`, extend `connect-src` with
` https://*.ingest.sentry.io` (and note in the comment: self-hosting
GlitchTip later means replacing this host). Rebuild the frontend image and
re-run plan 005's header curl to confirm the directive renders.

**Verify**: `grep -n "ingest.sentry.io" frontend/security-headers.conf` →
match (skip this step entirely, with a note, if 005 hasn't landed).

### Step 7 (operator handoff — document, don't perform)

Report checklist: create a free Sentry org + two projects (Go, React), set
`SENTRY_DSN` on the backend app and `VITE_SENTRY_DSN` as a frontend build
arg in Coolify, redeploy, then throw a test error on each side (e.g.
temporarily hit a bogus API route from the browser console / trigger a
panic in a dev deploy) and confirm both events arrive, the backend event
carries a `request_id` tag, and user context shows only an opaque UUID.
Configure an email/Discord alert rule in Sentry. GlitchTip swap: same DSNs
mechanism, plus the Step 6 CSP host change.

## Test plan

Steps 4 and 5.5 — logger fanout (3 cases), config (2), frontend gating +
PII (3). All existing suites must pass unmodified.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Backend and frontend build and pass all tests with NO DSN set anywhere
- [ ] `sentrygin.New(...Repanic: true...)` sits before `gin.Recovery()` in `router.go`
- [ ] Logger fanout test proves: error→captured with `request_id`, warn→not, primary log line always written
- [ ] Frontend PII test proves `setErrorUser` sends only `{ id }`; both inits set `sendDefaultPii: false` / `tracesSampleRate: 0`
- [ ] `.env.example` (both), Dockerfile, and CLAUDE.md document the new vars
- [ ] `go test ./...`, `go vet ./...`, `pnpm test/lint/typecheck/build` all pass
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated (operator checklist in the report)

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 007 is not DONE — the request-id seam this plan tags with doesn't
  exist yet.
- `go doc` reveals the sentry-go / sentrygin APIs differ materially from
  the sketches (option names aside) — report the actual API before
  reshaping the design.
- The uninitialized-SDK middleware turns out NOT to be a safe no-op and the
  `sentryEnabled` plumb-through would touch files beyond `router.go` /
  `server.Dependencies` — report the blast radius first.
- Adding the SDKs bumps shared dependencies in `go.sum`/lockfile beyond
  additive entries — report the version changes rather than accepting them
  silently.

## Maintenance notes

- The injectable `capture` seam in the logger is the contract: future
  error-routing changes (sampling, scrubbing) happen there, not in
  handlers.
- If error volume ever threatens the free 5k/month, add `BeforeSend`
  filtering (e.g. drop context-canceled errors) in
  `errortracking.Init` — one place.
- GlitchTip migration is a DSN + CSP-host swap by design; nothing else may
  grow Sentry-cloud-specific.
- Reviewer scrutiny: no handler or service file should change in this plan
  — if the diff touches one, the fanout leaked out of the logger seam.
