# Plan 010: Fix the stale README note that says the dev proxy "isn't wired up"

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4b5ccda..HEAD -- README.md frontend/vite.config.ts`
> If either changed, compare the "Current state" excerpt against the live files before
> proceeding; on a mismatch, treat it as a STOP condition.
>
> **Reconcile note (2026-06-14)**: re-based from `cb2af4b` to `4b5ccda`. The in-scope
> file `README.md` is unchanged — the stale note is still at line 106. `vite.config.ts`
> (evidence only) gained an 8-line Vitest `env` block since `cb2af4b`, which shifted the
> proxy block to lines 27-30; the proxy config itself is unchanged, so this plan's
> premise still holds.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `cb2af4b`, 2026-06-14 (reconcile-refreshed to `4b5ccda`, 2026-06-14)

## Why this matters

The root `README.md` tells a new contributor that to call the API from the frontend
they'll "need either a Vite proxy entry or CORS middleware on the API — neither is
wired up yet." That is **factually wrong**: `frontend/vite.config.ts` already proxies
`/api` and `/auth` to the backend. A reader follows the stale note, expects a broken
setup, and wastes time. Stale docs that are actively wrong are worse than missing ones;
this corrects it.

## Current state

`README.md:105-107` (the wrong note):
```
> The frontend calls the API at `localhost:8080`. For local dev you'll need
> either a Vite proxy entry or CORS middleware on the API — neither is wired
> up yet.
```

The reality — `frontend/vite.config.ts:27-30` (inside `server.proxy`):
```ts
server: {
  port: process.env.PORT ? Number(process.env.PORT) : undefined,
  proxy: {
    "/api": { target: apiTarget, changeOrigin: true },
    "/auth": { target: apiTarget, changeOrigin: true },
  },
},
```
where `apiTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8080"`. So the dev
server already forwards `/api` and `/auth` same-origin (no CORS needed). This is also
documented correctly in `frontend/.env.example:11-15` and `frontend/README.md:55`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Confirm the proxy exists | `grep -n "proxy" frontend/vite.config.ts` | shows the `/api` and `/auth` entries |
| Confirm the edit | `grep -n "neither is wired" README.md` | no matches after the edit |

## Scope

**In scope**:
- `README.md` — replace the stale blockquote at lines 105-107.

**Out of scope** (do NOT touch):
- `frontend/vite.config.ts` — it's already correct; this is a docs-only fix.
- `frontend/README.md`, `frontend/.env.example` — already accurate.
- Any other README section.

## Git workflow

- Branch: `advisor/010-fix-stale-readme-proxy-note`
- One commit; message style: conventional commits, e.g.
  `docs: correct stale note — Vite dev proxy is already configured`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Replace the stale note

In `README.md`, replace the blockquote at lines 105-107 with an accurate description:

```
> The Vite dev server proxies `/api` and `/auth` to the backend at
> `http://localhost:8080` (see `frontend/vite.config.ts`), so the SPA and API are
> same-origin in dev — no CORS setup needed. Point the proxy at a different backend
> by setting `VITE_API_PROXY_TARGET` (see `frontend/.env.example`).
```

**Verify**: `grep -n "neither is wired" README.md` → no matches;
`grep -n "proxies .api. and .auth." README.md` → shows the new line.

### Step 2: Sanity-check the claim is true

**Verify**: `grep -n "proxy" frontend/vite.config.ts` shows the `/api` and `/auth`
proxy entries (confirming the new README text is accurate).

## Test plan

- Documentation-only change; no code tests. Verification is the two `grep` checks above.

## Done criteria

ALL must hold:

- [ ] The "neither is wired up yet" sentence is gone from `README.md`.
- [ ] The replacement accurately describes the `/api` + `/auth` Vite proxy and
      `VITE_API_PROXY_TARGET`.
- [ ] `git status` shows only `README.md` changed (plus `plans/README.md`).
- [ ] `plans/README.md` status row for 010 updated.

## STOP conditions

Stop and report back if:

- `frontend/vite.config.ts` no longer contains the `/api`/`/auth` proxy (drift) — the
  README note might no longer be stale, in which case the fix changes.

## Maintenance notes

- If the proxy config moves or the default target changes, this README paragraph and
  `frontend/.env.example` should be updated together.
