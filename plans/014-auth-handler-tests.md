# Plan 014: Make the WorkOS SDK fakeable and test the OAuth HTTP handlers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- backend/internal/handlers/auth.go backend/internal/auth/workos.go backend/cmd/api/main.go backend/internal/server/router.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — this refactors the sign-in path. Mitigations: the refactor
  is mechanical (package function → injected interface with a default
  implementation delegating to the same package functions), and the new tests
  pin the behavior. Manual smoke against real WorkOS is the final gate if an
  environment exists.
- **Depends on**: none
- **Category**: tests / tech-debt
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

`backend/internal/handlers/` contains the OAuth login/callback/refresh/logout
flow — cookie issuance and clearing, state validation, redirect targets — and
has **zero tests**; it's the only untested request path in the backend, and
the one with the worst blast radius when it breaks. The root cause is that
the WorkOS SDK is used via **package-level functions** configured by a global
`SetAPIKey`, so there is no seam to substitute a fake. This plan introduces a
minimal interface over the four SDK calls, injects it through `AuthDeps`, and
then tests every handler branch with hand-written fakes (the repo's standard:
Go stdlib testing + fakes, no mock libraries).

## Current state

- `backend/internal/auth/workos.go:24–27` — the global SDK configuration:

```go
// NewWorkOSClient configures the WorkOS SDK with the given API key.
func NewWorkOSClient(apiKey string) *WorkOSClient {
	usermanagement.SetAPIKey(apiKey)
	return &WorkOSClient{}
}
```

  (`WorkOSClient.GetUser` is instance-shaped but also delegates to the
  package-level `usermanagement.GetUser`. It is consumed by `users.Service`
  and is OUT of scope here — only the handler-side calls move.)

- `backend/internal/handlers/auth.go` — the four package-level SDK calls to
  put behind the seam:
  - line 50: `usermanagement.GetAuthorizationURL(usermanagement.GetAuthorizationURLOpts{...})` (in `AuthLogin`)
  - line 88: `usermanagement.AuthenticateWithCode(ctx, usermanagement.AuthenticateWithCodeOpts{...})` (in `AuthCallback`)
  - line 127: `usermanagement.AuthenticateWithRefreshToken(ctx, usermanagement.AuthenticateWithRefreshTokenOpts{...})` (in `AuthRefresh`)
  - line 162: `usermanagement.RevokeSession(ctx, usermanagement.RevokeSessionOpts{SessionID: sid})` (in `AuthLogout`)

- `AuthDeps` (lines 22–29) is the injection point — it already carries
  ClientID/RedirectURI/AppURL/Cookies/Verifier/Log and is built once in
  `cmd/api/main.go:105–112`.

- Handler behaviors the tests must pin (read `handlers/auth.go` in full —
  the doc comments are accurate):
  - `AuthLogin`: mints a random state, sets the state cookie
    (`fitlytics_oauth_state`, path `/auth`), 302s to the authorize URL that
    echoes the same state.
  - `AuthCallback`: consumes/validates state (cookie always expired after);
    on mismatch → 302 to `AppURL?auth_error=invalid_state`; missing code →
    `auth_error=missing_code`; exchange failure → `auth_error=exchange_failed`;
    success → access cookie (`fitlytics_at`, path `/`, MaxAge 300) +
    refresh cookie (`fitlytics_rt`, path `/auth`) + 302 to `AppURL + "/today"`.
  - `AuthRefresh`: no refresh cookie → 401; SDK rejection → clears both
    session cookies + 401; success → fresh access cookie (+ rotated refresh
    cookie when the SDK returns one) + 204.
  - `AuthLogout`: best-effort revoke (only when the access cookie verifies —
    see `extractSessionID`, lines 177–190), always clears both cookies, 204.

- Cookie primitives are already tested in `backend/internal/auth/session_test.go`
  — the new tests assert handler-level behavior (which cookies appear on the
  response, status codes, redirect Locations), not re-test the primitives.

- Conventions: stdlib testing + `httptest` + `gin.New()`; hand-written fakes;
  tests alongside code (`backend/internal/handlers/auth_test.go`). See
  `backend/internal/programs/handler_test.go` for the handler-test pattern.
  Windows/CRLF: ignore `gofmt -l` noise; rely on `go vet` + CI.

## Commands you will need

| Purpose       | Command                                          | Expected on success |
|---------------|--------------------------------------------------|---------------------|
| SDK signatures| `cd backend && go doc github.com/workos/workos-go/v4/pkg/usermanagement AuthenticateWithCode` (repeat per function) | prints exact signature |
| Build / vet   | `cd backend && go build ./... && go vet ./...`   | exit 0              |
| New tests     | `cd backend && go test ./internal/handlers/`     | ok                  |
| All tests     | `cd backend && go test ./...`                    | ok                  |

## Scope

**In scope**:
- `backend/internal/handlers/auth.go` (calls go through the injected interface)
- `backend/internal/handlers/auth_test.go` (create)
- `backend/internal/auth/workos.go` (add the interface + default impl next to
  the existing client)
- `backend/cmd/api/main.go` (wire the default impl into `AuthDeps`)

**Out of scope** (do NOT touch):
- `auth.WorkOSClient.GetUser` / `users.Service` — the JIT-provisioning path
  has its own tests and a different consumer; unify later if ever.
- The cookie helpers in `internal/auth/session.go` and their tests.
- `middleware/auth.go` (`RequireAuth`) — already tested via the auth package.
- Any behavioral change to the OAuth flow — this is refactor + tests only.

## Git workflow

- Branch: `advisor/014-auth-handler-tests`
- Commit style: `test(backend): fakeable WorkOS seam + OAuth handler tests`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pin the exact SDK signatures

Run `go doc` for each of the four functions (see commands table) and record
the precise parameter/return types — the interface below MUST mirror them
exactly (the return types are likely `usermanagement.AuthenticateResponse`
for both authenticate calls, but verify rather than trust this plan).

### Step 2: Define the seam in the auth package

In `backend/internal/auth/workos.go`, add (adjusting types to Step 1's
findings):

```go
// UserManagement is the seam over the WorkOS user-management SDK calls the
// auth handlers make. The SDK exposes package-level functions configured by a
// global SetAPIKey; this interface exists so handler tests can substitute a
// fake without network access.
type UserManagement interface {
	GetAuthorizationURL(opts usermanagement.GetAuthorizationURLOpts) (*url.URL, error)
	AuthenticateWithCode(ctx context.Context, opts usermanagement.AuthenticateWithCodeOpts) (usermanagement.AuthenticateResponse, error)
	AuthenticateWithRefreshToken(ctx context.Context, opts usermanagement.AuthenticateWithRefreshTokenOpts) (usermanagement.AuthenticateResponse, error)
	RevokeSession(ctx context.Context, opts usermanagement.RevokeSessionOpts) error
}

// SDKUserManagement is the production implementation — thin delegation to the
// package-level SDK functions (configured via NewWorkOSClient/SetAPIKey).
type SDKUserManagement struct{}

func (SDKUserManagement) GetAuthorizationURL(opts usermanagement.GetAuthorizationURLOpts) (*url.URL, error) {
	return usermanagement.GetAuthorizationURL(opts)
}
// ... one-line delegations for the other three ...
```

**Verify**: `cd backend && go build ./...` → exit 0.

### Step 3: Inject and switch the handlers

1. Add `UM auth.UserManagement` to `AuthDeps` in
   `backend/internal/handlers/auth.go`.
2. Replace the four `usermanagement.X(...)` calls with `d.UM.X(...)`. Do not
   change any surrounding logic, log message, cookie call, or redirect.
3. In `cmd/api/main.go`, add `UM: auth.SDKUserManagement{},` to the
   `handlers.AuthDeps{...}` literal (lines 105–112).
4. Defensive default so a missed wiring fails loudly at startup rather than
   nil-panicking per request: in each handler factory (or once in a shared
   check), `if d.UM == nil { panic("handlers.AuthDeps.UM is required") }` at
   construction time (the factories run once at router build).

**Verify**: `go build ./... && go vet ./...` → exit 0. `go test ./...` → ok
(nothing else compiles against these call sites).

### Step 4: Write the handler tests

Create `backend/internal/handlers/auth_test.go` with a `fakeUM` struct whose
four methods are settable func fields (the repo's fake pattern), a helper
that builds a `gin.New()` router with the routes registered exactly as
`server.NewRouter` does (lines 53–56 of `router.go`), and an `AuthDeps` with
`AppURL: "http://app.test"`, `Cookies: auth.CookieOpts{}`.

Cases (assert status, `Location` header, and `Set-Cookie` headers by name/
path/MaxAge):

1. **Login happy path**: 302; Location is the fake's URL and contains the
   same `state` value that the `fitlytics_oauth_state` Set-Cookie carries;
   cookie is HttpOnly, path `/auth`.
2. **Login when GetAuthorizationURL errors**: 500 problem response.
3. **Callback happy path**: request carries the state cookie + matching
   `state` query + `code`; fake returns tokens → Set-Cookie for
   `fitlytics_at` (path `/`) and `fitlytics_rt` (path `/auth`), state cookie
   expired (MaxAge<0), 302 to `http://app.test/today`.
4. **Callback state mismatch** (cookie present, query differs): 302 to
   `http://app.test/?auth_error=invalid_state` (compare parsed query, not
   raw string), no session cookies set, exchange fake NOT called.
5. **Callback missing code**: `auth_error=missing_code`, exchange not called.
6. **Callback exchange failure**: fake errors → `auth_error=exchange_failed`.
7. **Callback with empty RefreshToken in the response**: access cookie set,
   NO `fitlytics_rt` cookie (pins the `if resp.RefreshToken != ""` branch).
8. **Refresh without cookie**: 401, refresh fake not called.
9. **Refresh rejected by SDK**: 401 AND both session cookies cleared
   (Set-Cookie with MaxAge<0 for `fitlytics_at` and `fitlytics_rt`).
10. **Refresh happy path**: 204, fresh `fitlytics_at`; rotated `fitlytics_rt`
    when the fake returns one.
11. **Logout with no access cookie**: 204, both cookies cleared, revoke fake
    NOT called (pins `extractSessionID`'s empty-return path; the
    valid-token revoke path needs a real JWKS-backed Verifier and is
    deliberately not covered — note it in a test comment).
12. **Logout is idempotent**: second call also 204.

**Verify**: `cd backend && go test ./internal/handlers/` → ok, ≥ 12 tests.

### Step 5: Full pass + optional smoke

**Verify**: `go test ./... && go vet ./...` → ok / exit 0.

If a configured `.env` with real WorkOS keys exists: `make run`, complete one
real sign-in → /today, then logout. If not, say so — the tests are the gate.

## Test plan

Covered by Step 4 (12 cases). Pattern: `programs/handler_test.go` for router
setup; fakes as settable func fields.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "usermanagement\." backend/internal/handlers/auth.go` counts only Opts/type references — zero package-level **calls** remain (manual diff check: every former call site now reads `d.UM.`)
- [ ] `backend/internal/handlers/auth_test.go` exists with ≥ 12 passing tests
- [ ] `cd backend && go test ./...` → ok; `go vet ./...` → exit 0
- [ ] `cmd/api/main.go` wires `UM: auth.SDKUserManagement{}`
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's `go doc` shows signatures that can't form a clean interface (e.g.
  the two authenticate calls return different response types) — adjust the
  interface to match REALITY and note the deviation; if the types are
  unexported or otherwise unusable, report instead of wrapping them.
- Any redirect URL, cookie attribute, or status code in the tests doesn't
  match the handler's actual behavior — that's either drift or a discovered
  bug; report which branch diverged, don't "fix" the handler to match the
  plan.
- The Verifier dependency blocks more than the one logout-revoke case —
  don't refactor `extractSessionID`; report.

## Maintenance notes

- New WorkOS calls in handlers must go through `auth.UserManagement` — adding
  a package-level call reintroduces the untestable seam (worth a reviewer
  checklist item).
- The `users.Service`/`WorkOSClient.GetUser` path still uses the global SDK
  config; unifying it onto this interface is a sensible later cleanup, noted
  here so it isn't re-discovered.
- The uncovered logout-revoke-happy-path is a known, commented gap; an
  integration test with a signed JWT fixture could close it later.
