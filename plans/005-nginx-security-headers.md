# Plan 005: Add security headers to the production nginx config

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/nginx.conf frontend/Dockerfile`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED for the CSP line only (a too-strict policy can break video
  playback/upload against R2); LOW for the rest. The plan ships CSP in
  Report-Only mode first to de-risk it.
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The production SPA is served by nginx (`frontend/nginx.conf`, rendered into
the image built by `frontend/Dockerfile`) with **zero** security response
headers: no `Strict-Transport-Security`, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, or `Content-Security-Policy`. This is a
cookie-authenticated app (HttpOnly session cookies set by the Go backend), so
clickjacking and content-sniffing hardening are cheap, standard wins. TLS is
terminated in front of this container by the Coolify proxy — the app sets
`Secure` cookies in production (`backend/cmd/api/main.go:109`), so HSTS is
appropriate.

## Current state

- `frontend/nginx.conf` — the only nginx config; copied to
  `/etc/nginx/templates/default.conf.template` and rendered by envsubst at
  container start (only `${BACKEND_UPSTREAM}` is substituted;
  `NGINX_ENVSUBST_FILTER=BACKEND_` in the Dockerfile protects nginx's own
  `$vars`). Structure today: one `server` block with locations `/api/`,
  `/auth/` (proxied to the Go backend), `/` (SPA fallback), `/assets/`
  (immutable cache) and `= /index.html` (no-cache):

```nginx
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }
```

- **The nginx `add_header` inheritance trap (load-bearing for this plan):**
  `add_header` directives are inherited from the `server` block ONLY if a
  location defines **no** `add_header` of its own. The `/assets/` and
  `= /index.html` locations above each define one, so server-level security
  headers would silently vanish exactly on the HTML shell and all static
  assets. The fix is a shared snippet `include`d everywhere.

- App facts the CSP must accommodate:
  - Video playback uses presigned GET URLs on the R2 endpoint host
    (`https://<account>.r2.cloudflarestorage.com/...`, path-style) — `<video>`
    elements need `media-src`.
  - Video upload PUTs go directly from the browser to the same host —
    `connect-src`.
  - The theme provider injects a transient inline `<style>` element
    (`frontend/src/components/theme-provider.tsx:40–57`) and Base UI/inline
    style attributes are used — `style-src` needs `'unsafe-inline'`.
  - Fonts are self-hosted (`@fontsource-variable/inter` bundled by Vite) —
    `font-src 'self'` suffices; images are local/data URIs.

## Commands you will need

| Purpose            | Command (repo root)                                            | Expected on success |
|--------------------|----------------------------------------------------------------|---------------------|
| Build the image    | `docker build -t fitlytics-frontend-hdrtest frontend/`         | exit 0              |
| Run it             | `docker run -d --rm --name hdrtest -p 8089:80 -e BACKEND_UPSTREAM=localhost:9 fitlytics-frontend-hdrtest` | container id printed |
| Check headers      | `curl -sI http://localhost:8089/`                              | headers listed in Step 3 present |
| Check asset headers| `curl -sI http://localhost:8089/assets/` (any asset file also works) | same security headers + Cache-Control |
| Cleanup            | `docker stop hdrtest`                                          | exit 0              |

If Docker is not available in your environment, the config-syntax fallback is:
render the template manually and run `nginx -t` in a container — if that's
also impossible, STOP and report that verification requires Docker.

## Scope

**In scope**:
- `frontend/nginx.conf`
- `frontend/security-headers.conf` (create — the shared snippet)
- `frontend/Dockerfile` (one COPY line for the snippet)

**Out of scope** (do NOT touch):
- Backend Go code (backend hardening is plan 006).
- `database/docker-compose*.yml`, Coolify settings, DNS/TLS config.
- The proxied locations' behavior (`proxy_pass`, timeouts) — headers only.

## Git workflow

- Branch: `advisor/005-nginx-security-headers`
- Commit style: `chore(deploy): security headers for the frontend nginx`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared snippet

Create `frontend/security-headers.conf`:

```nginx
# Shared security headers. Include this in the server block AND in every
# location that declares its own add_header — nginx drops all inherited
# add_header directives the moment a location defines one.
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
# TLS is terminated by the platform proxy in front of this container; the app
# only runs over HTTPS in production (cookies are Secure), so HSTS is safe.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
# Report-Only first: observe violations in the browser console for a release,
# then promote to Content-Security-Policy (see plans/README.md follow-up).
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self' https://*.r2.cloudflarestorage.com; connect-src 'self' https://*.r2.cloudflarestorage.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

### Step 2: Wire the snippet into nginx.conf and the image

In `frontend/nginx.conf`:

1. In the `server` block, directly under the `index index.html;` line, add:
   `include /etc/nginx/security-headers.conf;`
2. Add the same `include` line inside BOTH locations that declare their own
   `add_header` (`location /assets/` and `location = /index.html`), so the
   security headers survive there too.

In `frontend/Dockerfile`, next to the existing template COPY, add:

```dockerfile
COPY security-headers.conf /etc/nginx/security-headers.conf
```

Note: the snippet must NOT go under `/etc/nginx/templates/` — envsubst
processes everything there and the file contains no `${BACKEND_*}` variables;
keeping it out of templates avoids any accidental substitution and keeps the
render step fast.

**Verify**: `docker build -t fitlytics-frontend-hdrtest frontend/` → exit 0.

### Step 3: Verify the headers on every response class

Run the container (see commands table), then:

`curl -sI http://localhost:8089/` (the SPA shell) must include ALL of:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy-Report-Only: default-src 'self'; ...
```

Then list a real asset (`docker exec hdrtest ls /usr/share/nginx/html/assets | head -1`)
and `curl -sI http://localhost:8089/assets/<that-file>` → must include the
same security headers AND `Cache-Control: public, immutable`.

`curl -sI http://localhost:8089/index.html` → security headers AND
`Cache-Control: no-cache`.

If the security headers are missing on the asset/index responses but present
on `/`, the include lines from Step 2.2 are missing — that's the inheritance
trap firing.

**Verify**: all three curl checks pass. Then `docker stop hdrtest`.

## Test plan

No unit tests apply — verification is the live-container header checks in
Step 3 (these are the machine-checkable gate).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `frontend/security-headers.conf` exists with the six headers above
- [ ] `grep -c "include /etc/nginx/security-headers.conf;" frontend/nginx.conf` → `3`
- [ ] `grep -n "security-headers.conf" frontend/Dockerfile` → one COPY line
- [ ] Docker image builds; all three curl header checks in Step 3 pass
- [ ] Only the three in-scope files are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Docker is unavailable and no alternative nginx is present to run `nginx -t`
  — do not ship an unverified nginx config.
- The running container's `/` response lacks a header you added — the
  envsubst template step may be mangling the include; report the rendered
  config (`docker exec hdrtest cat /etc/nginx/conf.d/default.conf`).
- You are tempted to set `Content-Security-Policy` (enforcing) directly —
  the plan deliberately ships Report-Only; enforcement is the follow-up
  after real-traffic observation.

## Maintenance notes

- **Follow-up (deliberate, not forgotten)**: after one production release with
  no CSP violation reports in the browser console during normal use (log a
  workout, upload + play a video, toggle theme), rename
  `Content-Security-Policy-Report-Only` → `Content-Security-Policy`.
- If video storage ever moves off `*.r2.cloudflarestorage.com` (e.g. a custom
  R2 domain), `media-src`/`connect-src` must be updated in lockstep — playback
  breaking with a console CSP error is the symptom.
- If a third-party script/analytics is ever added, `script-src 'self'` is the
  line that blocks it — extend deliberately, never with `'unsafe-inline'`.
- `X-Frame-Options: DENY` + `frame-ancestors 'none'`: if the app is ever
  embedded (unlikely), both must change together.
