# Plan 026: PostHog Cloud product analytics (proxied, PII-bounded, env-gated)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/nginx.conf frontend/src/hooks/use-auth.ts frontend/src/main.tsx frontend/.env.example frontend/Dockerfile frontend/package.json`
> `nginx.conf` WILL have drifted if plans 005/006/007 landed (expected —
> they're ordering prerequisites). Compare the "Current state" excerpts for
> the parts this plan touches; on an unexplained mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED — additive integration that is a no-op without a key;
  the risky sliver is the nginx proxy locations (verified live in Step 5)
  and bundle growth (~50 KB gz, measured in Step 6).
- **Depends on**: 005, 006, 007 (all touch `frontend/nginx.conf` — land
  them first to avoid conflicts; none is a logical dependency)
- **Category**: ops / product-analytics
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The app has zero visibility into usage: how many users are active, when
they train, which features they touch. PostHog answers that (pageviews,
autocaptured interactions, funnels, "users online") — and the deployment
concern that motivated hesitation (a long-standing PostHog-on-Coolify
self-hosting bug) does not apply here, because this plan uses **PostHog
Cloud**: the browser SDK talks to PostHog's hosted API; nothing PostHog
runs on the Coolify box. Ingestion is reverse-proxied through the app's own
nginx (same pattern as the existing `/api`/`/auth` proxies) so events are
first-party — ad-blockers don't eat them and the CSP from plan 005 needs no
new origins. Identification uses the **opaque local `users.id` only** —
never email or display name — keeping the PII boundary deliberate.

Everything is gated on a `VITE_POSTHOG_KEY` build arg: absent (local dev,
CI, tests) → analytics is a complete no-op. The executor needs no PostHog
account; the operator adds the key in Coolify when ready.

## Current state

- `frontend/src/main.tsx` — app bootstrap; reads `VITE_API_BASE_URL`,
  builds services, renders. No analytics of any kind in the repo (verified:
  `grep -rn "posthog\|analytics" frontend/src` → nothing).
- `frontend/src/hooks/use-auth.ts` — `fetchMe(authApi)` resolves the
  current user (`MeResponse` with `id`, the local users.id UUID) or `null`;
  `useAuth().signOut` clears the query cache and hard-navigates to `/`.
  These are the identify/reset hook points.
- `frontend/nginx.conf` — post-005/006/007 it has: `limit_req` zones, an
  `include /etc/nginx/security-headers.conf`, and proxied `/api/`+`/auth/`
  locations using the request-time-resolved `$backend` variable pattern.
  Only `BACKEND_*` is envsubst-substituted (`NGINX_ENVSUBST_FILTER` in the
  Dockerfile), so literal PostHog hostnames pass through untouched.
- `frontend/Dockerfile` — build ARGs `VITE_API_BASE_URL`,
  `VITE_MAX_VIDEO_BYTES`, `VITE_ALLOWED_VIDEO_TYPES` exported as ENV before
  `pnpm build`; new VITE vars must follow the same pattern (Vite inlines at
  build time).
- Plan 005's CSP (if landed): `script-src 'self'; connect-src 'self' …` —
  the `/ingest` proxy keeps all PostHog traffic same-origin, so **no CSP
  changes are needed**; verify rather than edit.
- Conventions: no `useEffect` for derived state (the SDK init is a module
  side effect, the identify call rides the existing data-loading path);
  named modules get their own file.

## Commands you will need

| Purpose   | Command (run in `frontend/`)        | Expected on success |
|-----------|--------------------------------------|---------------------|
| Install   | `pnpm add posthog-js` (add `--node-linker=hoisted` on MAX_PATH errors) | exit 0 |
| Tests     | `pnpm test`                          | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`  | exit 0              |
| Build     | `pnpm build`                         | exit 0              |
| Proxy check | docker build + run + curl (Step 5) | 200/2xx from PostHog via `/ingest` |

## Scope

**In scope**:
- `frontend/package.json` / `pnpm-lock.yaml` (`posthog-js` dependency)
- `frontend/src/lib/analytics.ts` (create) + `frontend/src/lib/analytics.test.ts` (create)
- `frontend/src/main.tsx` (one init import/call)
- `frontend/src/hooks/use-auth.ts` (identify on resolve, reset on sign-out)
- `frontend/nginx.conf` (two `/ingest` locations)
- `frontend/.env.example`, `frontend/Dockerfile` (the new build args)

**Out of scope** (do NOT touch):
- Custom app events (e.g. "set_logged") — autocapture + pageviews +
  identified users cover the stated questions; a curated event taxonomy is
  a follow-up once real questions emerge.
- Session replay configuration — leave whatever the SDK does by default at
  init; enabling/tuning replay is an operator decision in the PostHog UI.
- Backend code — this is a browser-side integration.
- Any self-hosted PostHog anything.

## Git workflow

- Branch: `advisor/026-posthog-analytics`
- Commit style: `feat(frontend): PostHog Cloud analytics behind /ingest proxy`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The analytics module (single owner of the SDK)

Create `frontend/src/lib/analytics.ts`:

```ts
import posthog from "posthog-js"

// Product analytics — PostHog Cloud, reverse-proxied through our own nginx
// at /ingest so events are first-party (see nginx.conf). Fully disabled
// when VITE_POSTHOG_KEY is unset (local dev, CI, tests): every export
// no-ops, so callers never need to guard.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined

export const analyticsEnabled = Boolean(KEY)

export function initAnalytics() {
  if (!KEY) return
  posthog.init(KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com", // match the nginx upstream region
    // PII boundary: we identify with the opaque local users.id only; never
    // send email or display name as person properties.
    person_profiles: "identified_only",
    // Current SDK config preset — includes history-based (SPA) pageview
    // capture. If this option is rejected by the installed SDK version,
    // see the STOP conditions.
    defaults: "2025-05-24",
  })
}

// identifyUser ties events to the opaque local user id (users.id UUID).
// Deliberately takes ONLY the id — adding email/name here would cross the
// PII boundary this module exists to enforce.
export function identifyUser(id: string) {
  if (!KEY) return
  posthog.identify(id)
}

// resetAnalytics unlinks the device from the user on sign-out so a shared
// device doesn't attribute the next person's events to the previous account.
export function resetAnalytics() {
  if (!KEY) return
  posthog.reset()
}
```

In `frontend/src/main.tsx`, before `createRoot(...)`:

```ts
import { initAnalytics } from "@/lib/analytics"

initAnalytics()
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Identify on session resolve, reset on sign-out

In `frontend/src/hooks/use-auth.ts`:

1. In `fetchMe`, at each point a non-null `MeResponse` is returned (the
   initial success and the post-refresh retry success), call
   `identifyUser(me.id)` before returning — `fetchMe` is the single choke
   point through which every authenticated session passes (the route guard
   and `useAuth` both use it), which is why the call lives here and not in
   a component effect (repo rule: no `useEffect`).
2. In `signOut`, call `resetAnalytics()` inside the `finally`, before the
   hard navigation.

Note: `MeResponse.id` is optional in the generated types until plan 018
lands — guard with `if (me?.id) identifyUser(me.id)`.

**Verify**: `pnpm test` → all pass. The existing `use-auth.test.tsx` fakes
never set `VITE_POSTHOG_KEY`, so the analytics calls no-op; if any test
fails on the import, mock the module
(`vi.mock("@/lib/analytics", …)`) rather than weakening it.

### Step 3: Test the gating

`frontend/src/lib/analytics.test.ts` (module-reimport pattern as in plan
015's tests — `vi.resetModules()` + dynamic import per case):

1. No key → `analyticsEnabled === false`; `initAnalytics()` /
   `identifyUser("x")` / `resetAnalytics()` do not throw and do not call
   the SDK (mock `posthog-js` with `vi.mock` and assert zero calls).
2. Key set (`vi.stubEnv("VITE_POSTHOG_KEY", "phc_test")`) →
   `initAnalytics()` calls `posthog.init` with `api_host: "/ingest"` and
   `person_profiles: "identified_only"`; `identifyUser("u1")` passes ONLY
   the id (assert the mock received exactly one argument — this is the PII
   boundary's regression test).

**Verify**: `pnpm vitest run analytics` → all pass.

### Step 4: nginx `/ingest` reverse proxy

In `frontend/nginx.conf`, add above the `/api/` location (order within the
server block doesn't matter for these prefixes, but keep the proxied
locations grouped):

```nginx
    # ─ PostHog Cloud ingestion, first-party via our own origin ──────────────
    # US region hosts; if the PostHog project is created in the EU region,
    # change both to eu-assets.i.posthog.com / eu.i.posthog.com AND the
    # ui_host in src/lib/analytics.ts.
    location /ingest/static/ {
        proxy_pass https://us-assets.i.posthog.com/static/;
        proxy_set_header Host us-assets.i.posthog.com;
        proxy_ssl_server_name on;
    }
    location /ingest/ {
        proxy_pass https://us.i.posthog.com/;
        proxy_set_header Host us.i.posthog.com;
        proxy_ssl_server_name on;
        # Analytics bodies are batched JSON; the 20m client cap is plenty.
    }
```

(If plan 006 landed, do NOT add a `limit_req` to these — event batching is
bursty by design and PostHog rate-limits server-side.)

### Step 5: Build args + live proxy check

1. `frontend/.env.example`: add `VITE_POSTHOG_KEY=` with a comment: unset =
   analytics disabled; set only in production builds (Coolify build arg).
2. `frontend/Dockerfile`: add `ARG VITE_POSTHOG_KEY=""` and include it in
   the `ENV` block with the other `VITE_*` vars.
3. Live check (Docker required): build and run the frontend image (plan 005
   Step 3 pattern), then
   `curl -si http://localhost:8089/ingest/decide/ -X POST -d '{}'` →
   any response **from PostHog** (a JSON error/401 about a missing token is
   SUCCESS — it proves the proxy reached `us.i.posthog.com`; a 502/404 from
   nginx means the location is wrong). Also
   `curl -sI http://localhost:8089/ingest/static/array.js | head -3` →
   200 from the assets host.

**Verify**: both curls hit PostHog, not an nginx error page.

### Step 6: Full gates + bundle check

**Verify**: `pnpm test && pnpm lint && pnpm typecheck && pnpm build` → all
pass. Compare `dist/assets` total size before/after (`du -sh dist/assets`):
growth should be roughly the posthog-js bundle (~50–60 KB gz); report the
numbers.

If plan 005's CSP is live: load the built image in a browser with the key
set (operator step, or note as untested) and confirm no CSP violations from
`/ingest` — same-origin means there should be none by construction.

### Step 7 (operator handoff — document, don't perform)

Append to your report the operator's checklist: create a PostHog Cloud
project (choose US region, or EU + edit the two nginx hosts and `ui_host`),
copy the project API key into Coolify as the `VITE_POSTHOG_KEY` build arg
for the frontend app, redeploy, then confirm live events in PostHog's
Activity view and that persons show only opaque UUIDs (no emails).

## Test plan

Step 3's gating tests (the no-key no-op and the identify-id-only PII
check) plus the full existing suite. The nginx proxy is verified live in
Step 5.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm build` with no key produces a working bundle; `grep -rn "posthog" frontend/src` shows the SDK referenced ONLY from `lib/analytics.ts`
- [ ] `identifyUser` passes exactly one argument (the PII test in Step 3 asserts it)
- [ ] Both Step 5 curls reach PostHog through the proxy
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass
- [ ] `.env.example` + Dockerfile document/plumb `VITE_POSTHOG_KEY`
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated (and the operator checklist included in the report)

## STOP conditions

Stop and report back (do not improvise) if:

- The installed `posthog-js` rejects the `defaults: "2025-05-24"` option —
  fall back to `capture_pageview: true` plus a router subscription for SPA
  pageviews ONLY if the SDK documents it; if pageview capture can't be
  confirmed either way, report the SDK version and stop.
- Plans 005/006/007 are not all DONE (nginx conflicts).
- The Step 5 curls return nginx errors after two config attempts — report
  the rendered config (`docker exec <c> nginx -T | grep -A8 ingest`).
- Anything asks you to send email/name/display-name to PostHog — that's a
  deliberate boundary; changing it is the operator's call, not a plan
  deviation.

## Maintenance notes

- **Region coupling**: the two nginx hosts and `ui_host` in analytics.ts
  must agree with the PostHog project's region — all three are commented to
  point at each other.
- When custom events are wanted ("set_logged", "video_uploaded"), add
  thin wrappers in `lib/analytics.ts` so the SDK stays behind one module —
  reviewers should reject direct `posthog.capture` calls in components.
- Plan 027 (error tracking) adds `Sentry.setUser({ id })` at the same
  `fetchMe` hook point — coordinate if both are in flight.
- If the app ever adds a cookie/consent banner requirement, `initAnalytics`
  is the single gate to defer.
