# Plan 008: Code-split the landing and app routes into separate chunks

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb2af4b..HEAD -- frontend/src/router.tsx`
> If it changed, compare the "Current state" excerpt against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (touches `router.tsx`; if doing plan 006 first, rebase the
  route additions — both edit `router.tsx`)
- **Category**: perf
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

`router.tsx` statically imports both the public marketing `LandingPage` (~1,000 lines
across 13 landing components) and the authenticated `TodayPage` (workout tables,
dialogs, hooks). Today they land in the same main bundle, so an unauthenticated
visitor to `/` downloads the whole app, and a signed-in user on `/today` downloads the
entire marketing site. Lazy-loading each route component splits them into separate
chunks so each entry point ships only what it renders.

## Current state

`frontend/src/router.tsx` (top imports + route definitions):
```tsx
import { LandingPage } from "@/routes/landing"
import { TodayPage } from "@/routes/today"
// …
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: LandingPage })
const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/today",
  beforeLoad: async ({ context }) => { /* auth guard — unchanged */ },
  component: TodayPage,
})
```
`LandingPage` and `TodayPage` are **named** exports of `@/routes/landing` and
`@/routes/today`. The project is React 19 + Vite 7 + `@tanstack/react-router@1.170.8`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `cd frontend && pnpm typecheck` | exit 0 |
| Tests | `cd frontend && pnpm test` | all pass |
| Build | `cd frontend && pnpm build` | exit 0; emits multiple JS chunks under `dist/assets/` |
| Inspect chunks | `cd frontend && ls dist/assets/*.js` | more than one JS file, incl. separate landing/today chunks |

## Scope

**In scope**:
- `frontend/src/router.tsx` — replace the static `component:` references with
  lazy-loaded ones.

**Out of scope** (do NOT touch):
- `frontend/src/routes/landing.tsx`, `today.tsx` — keep their named exports as-is.
- The `beforeLoad` auth guard on `/today` — leave it exactly as-is; it coexists with a
  lazy component.
- `vite.config.ts` — no manual chunking config needed; route-level dynamic import is
  enough.

## Git workflow

- Branch: `advisor/008-code-split-landing`
- One commit; message style: conventional commits, e.g.
  `perf(router): lazy-load landing and app routes into separate chunks`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Lazy-load both route components

In `frontend/src/router.tsx`, remove the two static imports of `LandingPage` and
`TodayPage` and load them with TanStack Router's `lazyRouteComponent` (it takes a
dynamic `import()` and the **named** export to use):

```tsx
import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, Outlet, redirect } from "@tanstack/react-router"
// (remove: import { LandingPage } from "@/routes/landing")
// (remove: import { TodayPage } from "@/routes/today")
// …
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("@/routes/landing"), "LandingPage"),
})

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/today",
  beforeLoad: async ({ context }) => { /* unchanged */ },
  component: lazyRouteComponent(() => import("@/routes/today"), "TodayPage"),
})
```

Keep everything else (`rootRoute`, `defaultNotFoundComponent`, context typing) as-is.

> **Escape hatch**: if `lazyRouteComponent` is not exported by this version of
> `@tanstack/react-router` (typecheck error "no exported member 'lazyRouteComponent'"),
> STOP and report — do **not** silently switch to a different mechanism. (`React.lazy` +
> `<Suspense>` is the fallback, but confirm with the operator first since it needs a
> Suspense boundary the router doesn't provide by default.)

**Verify**: `cd frontend && pnpm typecheck` → exit 0.

### Step 2: Verify behavior and chunking

**Verify**:
- `cd frontend && pnpm test` → all pass (no test imports `LandingPage`/`TodayPage`
  from the router; existing tests are unaffected).
- `cd frontend && pnpm build` → exit 0.
- `cd frontend && ls dist/assets/*.js` → there is more than one JS chunk, and the
  landing and today code are in **separate** files (their names usually include
  `landing` / `today`, or are distinct hashed chunks). If unsure, grep a chunk for a
  landing-only string: `grep -l "See the line go up" frontend/dist/assets/*.js` should
  match a chunk that does **not** also contain the today board.

If the build still emits a single app chunk containing both, the lazy import did not
take effect — re-check Step 1.

## Test plan

- No new automated tests. The verification gate is typecheck + existing tests + a
  successful build that produces separate landing/today chunks.

## Done criteria

ALL must hold:

- [ ] `router.tsx` no longer statically imports `LandingPage`/`TodayPage`; both use
      `lazyRouteComponent(() => import(...), "<Name>")`.
- [ ] `cd frontend && pnpm typecheck && pnpm test && pnpm build` → all exit 0.
- [ ] `dist/assets/` contains separate chunks for landing vs. today (Step 2 check).
- [ ] `git status` shows only `router.tsx` changed (plus `plans/README.md`).
- [ ] `plans/README.md` status row for 008 updated.

## STOP conditions

Stop and report back if:

- `lazyRouteComponent` isn't available (Step 1 escape hatch).
- The build fails or still bundles both routes into one chunk after the change and a
  re-check.
- `router.tsx` has drifted from the "Current state" excerpt (e.g. plan 006 already
  added routes) in a way that makes the edit ambiguous — reconcile by applying the same
  `lazyRouteComponent` change to whatever route components exist.

## Maintenance notes

- New top-level routes should follow the same `lazyRouteComponent` pattern to stay
  split.
- `defaultPreload: "intent"` (already set in `createRouter`) means TanStack will
  prefetch a route's chunk on link hover/focus, so the lazy split won't add a visible
  navigation delay in practice.
- A reviewer should confirm the `/today` auth `beforeLoad` still runs (it's independent
  of how the component is loaded) and that the landing page still renders at `/`.
