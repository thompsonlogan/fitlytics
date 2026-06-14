# Plan 002: Add test coverage for the backend auth boundary

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb2af4b..HEAD -- backend/internal/auth/`
> If any file under `backend/internal/auth/` changed since this plan was written,
> compare the "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (adds tests only; touches no production code)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

`backend/internal/auth/` is the security boundary of the API — JWT verification,
session-cookie attributes, and the single-use OAuth `state` (CSRF) check all live
here — and it has **zero test coverage** (no `*_test.go` files). A regression in
cookie flags (`HttpOnly`/`Secure`/`SameSite`), in the constant-time state compare,
or in token validation would be silent. This plan locks the current, correct
behavior in characterization tests so future refactors can't quietly weaken it.

The aggregate packages (`programs`, `sessions`, `videos`, `users`) are already
well-tested; this plan brings `auth` up to the same standard using the **exact same
patterns** already in the repo.

## Current state

Three source files, no tests:

- `backend/internal/auth/session.go` — cookie writers + OAuth-state logic. Pure
  functions over `http.ResponseWriter`/`*http.Request`; trivially testable with
  `net/http/httptest`. **Highest value, easiest.** Key behavior to lock:
  - `SetAccessCookie` → cookie `fitlytics_at`, `Path:"/"`, `HttpOnly:true`,
    `SameSite:Lax`, `MaxAge` = ttl seconds, `Secure` from opts.
  - `SetRefreshCookie` → `fitlytics_rt`, `Path:"/auth"`, `HttpOnly:true`, 30-day MaxAge.
  - `NewOAuthState()` → URL-safe random string, non-empty, distinct across calls.
  - `ConsumeOAuthState(w, r, echoed, opts)` returns `ErrStateMismatch` when:
    `echoed` is empty; the `fitlytics_oauth_state` cookie is missing/empty; the
    cookie value ≠ `echoed`. Returns `nil` when they match. In **all** cases it
    writes an expiring `fitlytics_oauth_state` cookie (`MaxAge:-1`) — state is
    single-use. Excerpt:
    ```go
    func ConsumeOAuthState(w http.ResponseWriter, r *http.Request, echoed string, o CookieOpts) error {
    	clearOAuthStateCookie(w, o)
    	if echoed == "" { return ErrStateMismatch }
    	c, err := r.Cookie(OAuthStateCookie)
    	if err != nil || c.Value == "" { return ErrStateMismatch }
    	if subtle.ConstantTimeCompare([]byte(c.Value), []byte(echoed)) != 1 { return ErrStateMismatch }
    	return nil
    }
    ```
  - `ClearSessionCookies(w, opts)` → expires both `fitlytics_at` (Path `/`) and
    `fitlytics_rt` (Path `/auth`) with `MaxAge:-1`.
- `backend/internal/auth/principal.go` — `SetPrincipal`/`PrincipalFrom`/`MustPrincipal`
  over a `*gin.Context`. `MustPrincipal` panics when no principal is set. Trivial.
- `backend/internal/auth/verifier.go` — `Verifier.Verify(raw string)` parses a WorkOS
  JWT against a JWKS, requiring RS256 + expiry, optionally the issuer, and a non-empty
  `Subject`; returns `ErrInvalidToken` on any failure. The `Verifier` struct has
  **unexported** fields (`jwks keyfunc.Keyfunc`, `issuer string`), so a white-box test
  (same `package auth`) can construct one with a fake JWKS. See Step 3 — this is the
  only part with setup friction and has an escape hatch.

**Test conventions in this repo** (match them exactly):
- Tests live alongside code, `package auth` (white-box — needed to reach unexported
  `Verifier` fields). Plain Go stdlib `testing`, table-style or one-func-per-case.
- No assertion/mock libraries except `go-sqlmock` (not needed here).
- Look at `backend/internal/users/service_test.go` for the house style (helper
  funcs, `t.Fatalf`/`t.Errorf` messages). `go-sqlmock` is irrelevant to this plan —
  auth has no DB — but the assertion style is the pattern to copy.
- `go.mod` already includes everything you need: `github.com/golang-jwt/jwt/v5`,
  `github.com/MicahParks/keyfunc/v3`, `github.com/gin-gonic/gin`, `github.com/google/uuid`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Run auth tests | `cd backend && go test ./internal/auth/...` | `ok ... auth` |
| Run all tests | `cd backend && make test` | all packages `ok` |
| Vet | `cd backend && go vet ./internal/auth/...` | exit 0 |
| Coverage (optional) | `cd backend && go test ./internal/auth/... -cover` | prints coverage % |

## Scope

**In scope** (create these files):
- `backend/internal/auth/session_test.go`
- `backend/internal/auth/principal_test.go`
- `backend/internal/auth/verifier_test.go`

**Out of scope** (do NOT touch):
- Any non-test file under `backend/internal/auth/` — this plan adds tests only and
  changes **no** production behavior. If a test reveals a real bug, STOP and report
  it; do not fix it here.
- `backend/internal/handlers/auth.go` and `backend/internal/middleware/auth.go` —
  they call the external WorkOS client / construct a real `Verifier`; testing them
  needs interface seams that are a separate, larger change. Out of scope here.
- `backend/internal/storage/r2.go` — separate finding, needs an S3 mock.

## Git workflow

- Branch: `advisor/002-backend-auth-tests`
- Commit per file or as one logical unit; message style: conventional commits, e.g.
  `test(auth): cover session cookies, oauth state, principal, and jwt verify`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Test `session.go` (cookies + OAuth state) — do this first

Create `backend/internal/auth/session_test.go`, `package auth`. Use
`httptest.NewRecorder()` as the `http.ResponseWriter` and read back cookies via
`http.Response{Header: rec.Header()}.Cookies()`. For request cookies, build
`httptest.NewRequest("GET", "/", nil)` and `req.AddCookie(&http.Cookie{...})`.

Cover at minimum:
1. `SetAccessCookie` with `CookieOpts{Secure:true}` → returned cookie has
   `Name=="fitlytics_at"`, `Path=="/"`, `HttpOnly==true`, `Secure==true`,
   `SameSite==http.SameSiteLaxMode`, `MaxAge==int(ttl.Seconds())`.
2. `SetRefreshCookie` → `Name=="fitlytics_rt"`, `Path=="/auth"`, `HttpOnly==true`,
   `MaxAge==60*60*24*30`.
3. `NewOAuthState()` returns a non-empty string, and two calls return different
   values (randomness).
4. `ConsumeOAuthState` happy path: state cookie value == echoed → returns `nil`,
   AND a cleared `fitlytics_oauth_state` cookie (`MaxAge==-1`) is written.
5. `ConsumeOAuthState` mismatch: cookie value != echoed → `ErrStateMismatch`.
6. `ConsumeOAuthState` missing cookie → `ErrStateMismatch`.
7. `ConsumeOAuthState` empty `echoed` → `ErrStateMismatch`.
8. `ClearSessionCookies` writes two expiring cookies (`fitlytics_at` Path `/`,
   `fitlytics_rt` Path `/auth`, both `MaxAge==-1`).

Write a small helper, e.g. `func cookieByName(t *testing.T, rec *httptest.ResponseRecorder, name string) *http.Cookie`.

**Verify**: `cd backend && go test ./internal/auth/ -run 'Session|OAuthState|Cookie' -v` → all pass.

### Step 2: Test `principal.go`

Create `backend/internal/auth/principal_test.go`, `package auth`. Build a test gin
context with `gin.CreateTestContext(httptest.NewRecorder())` (returns `(*gin.Context, *gin.Engine)`).

Cover:
1. `PrincipalFrom` on a fresh context → `(nil, false)`.
2. After `SetPrincipal(c, p)`, `PrincipalFrom(c)` → `(p, true)` (same pointer).
3. `MustPrincipal` returns `p` when set.
4. `MustPrincipal` **panics** when unset — assert with
   `defer func(){ if recover()==nil { t.Error("expected panic") } }()`.

Use a minimal `&Principal{User: &generated.User{...}, Claims: &Claims{}}`
(`generated.User` is in `github.com/thompsonlogan/fitlytics/backend/internal/models/generated`).

**Verify**: `cd backend && go test ./internal/auth/ -run Principal -v` → all pass,
including the panic case.

### Step 3: Test `verifier.go` (JWT validation) — has an escape hatch

Goal: exercise `Verifier.Verify` offline by signing tokens with a test RSA key and
giving the `Verifier` a JWKS that returns that key's **public** half.

Primary approach (white-box, `package auth`):
1. Generate a key once per test: `rsa.GenerateKey(rand.Reader, 2048)`.
2. Implement a fake of the `keyfunc.Keyfunc` interface. **Note**: that interface
   (from `github.com/MicahParks/keyfunc/v3`, verified at v3.8.0) has FOUR methods —
   `Keyfunc(*jwt.Token)(any,error)`, `KeyfuncCtx(context.Context) jwt.Keyfunc`,
   `Storage() jwkset.Storage`, and `VerificationKeySet(context.Context)(jwt.VerificationKeySet,error)`.
   `Verify` only ever calls `Keyfunc`, so **embed the interface** to satisfy the
   type without stubbing the other three, then override just `Keyfunc`:
   ```go
   type fakeKeyfunc struct {
       keyfunc.Keyfunc // embedded (nil) — satisfies the 4-method interface; unused methods are never called by Verify
       pub *rsa.PublicKey
   }
   func (f fakeKeyfunc) Keyfunc(_ *jwt.Token) (any, error) { return f.pub, nil }
   ```
   This needs only the `github.com/MicahParks/keyfunc/v3` and
   `github.com/golang-jwt/jwt/v5` imports (both already in `go.mod`) — no `jwkset` import.
3. Construct the verifier directly: `v := &Verifier{jwks: fakeKeyfunc{pub: &key.PublicKey}, issuer: ""}`.
4. Build tokens with `jwt.NewWithClaims(jwt.SigningMethodRS256, claims)` then
   `.SignedString(key)`, where `claims` is an `auth.Claims` with
   `RegisteredClaims{Subject: "user_x", ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}`.

Cover:
1. Valid token → `Verify` returns claims with `Subject=="user_x"`, no error.
2. Expired token (`ExpiresAt` in the past) → `ErrInvalidToken`.
3. Token signed with a **different** RSA key (but verifier still returns the first
   key) → signature fails → `ErrInvalidToken`.
4. Valid signature/expiry but empty `Subject` → `ErrInvalidToken`.
5. Token with no expiry set → `ErrInvalidToken` (verifier uses
   `jwt.WithExpirationRequired()`).
6. (If issuer-checking is easy to add) construct `&Verifier{..., issuer:"https://issuer"}`
   and assert a token with the wrong `Issuer` → `ErrInvalidToken`.

**Escape hatch**: the embedded-interface fake above handles the multi-method
interface. If for any reason it still won't compile against the interface (e.g. the
embedded-interface approach is rejected by the toolchain), **STOP and report** the
exact compiler error. Do **not** modify `verifier.go` to add a test seam without
checking back first; and do **not** fetch a real JWKS over the network in a test.

**Verify**: `cd backend && go test ./internal/auth/ -run Verif -v` → all pass.

### Step 4: Full suite green

**Verify**: `cd backend && go vet ./internal/auth/... && make test` → exit 0, every
package `ok`.

## Test plan

- New files: `session_test.go`, `principal_test.go`, `verifier_test.go` — cases
  enumerated per step above (happy path + each rejection branch).
- Structural pattern to copy: `backend/internal/users/service_test.go` (helper funcs,
  `t.Fatalf` messages, one-concept-per-test). Ignore its sqlmock setup — not needed here.
- Verification: `cd backend && go test ./internal/auth/... -v` → all new tests pass;
  `make test` stays green across all packages.

## Done criteria

ALL must hold:

- [ ] `cd backend && go test ./internal/auth/...` exits 0 with the three new test files present.
- [ ] `cd backend && make test` exits 0 (no other package broke).
- [ ] `cd backend && go vet ./internal/auth/...` exits 0.
- [ ] `git status` shows only the three new `_test.go` files added under
      `backend/internal/auth/` (plus `plans/README.md`); no production file changed.
- [ ] `plans/README.md` status row for 002 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- A test you write fails because the **production code is actually wrong** (e.g. a
  cookie is missing `HttpOnly`). Report the discrepancy — fixing it is a separate
  finding, not this characterization plan.
- The `keyfunc.Keyfunc` interface can't be satisfied by a small fake (Step 3 escape
  hatch).
- Reaching `Verify`'s success path appears to require a network call you can't avoid.
- The "Current state" excerpts don't match the live files (drift).

## Maintenance notes

- These are **characterization** tests: they assert current behavior. If a future
  change intentionally alters a cookie attribute or token rule, the corresponding
  test is expected to change in the same PR — that's the signal working.
- A reviewer should confirm the cookie assertions check `HttpOnly`, `Secure`, and
  `SameSite` (the security-relevant flags), not just the name/value.
- Deferred follow-ups (separate plans if desired): tests for
  `middleware/auth.go` `RequireAuth` (needs a verifier seam or a real test key),
  `handlers/auth.go` (needs a WorkOS-client interface), and `storage/r2.go` (S3 mock).
