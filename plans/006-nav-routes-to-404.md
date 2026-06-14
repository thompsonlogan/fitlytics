# Plan 006: Wire the dead nav buttons to real routes that render the branded 404

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb2af4b..HEAD -- frontend/src/router.tsx frontend/src/components/workout/app-header.tsx frontend/src/routes/today.tsx`
> If any of those changed, compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (small FE wiring)
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

The app header renders four nav buttons — **Today / Programs / History / Analytics** —
but only `/today` exists as a route. Today the buttons just flip a local `section`
state that nothing reads, so clicking *Programs / History / Analytics* re-highlights a
button and shows the same Today board: a silent dead end. The product decision (from
the maintainer) is: keep the buttons, but make each one **navigate to its route**, and
since those features don't exist yet, that route should render the app's existing
**branded 404 page**. This turns three confusing no-ops into honest "not built yet"
feedback, and leaves a clean seam to drop the real pages in later.

## Current state

**`frontend/src/router.tsx`** registers only `/` and `/today`, with the branded 404 as
the fallback component:
```tsx
import { NotFoundPage } from "@/components/not-found/not-found-page"
// ...
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: LandingPage })
const todayRoute = createRoute({ getParentRoute: () => rootRoute, path: "/today", beforeLoad: /*…auth guard…*/, component: TodayPage })
const routeTree = rootRoute.addChildren([indexRoute, todayRoute])
export const router = createRouter({
  routeTree,
  // …
  defaultNotFoundComponent: NotFoundPage,
})
```
`NotFoundPage` is already imported here and is a full-screen branded 404
(`frontend/src/components/not-found/not-found-page.tsx`) — it reads
`window.location.pathname` and shows a "GET <path> 404" chip.

**`frontend/src/components/workout/app-header.tsx`** drives the nav off a `section`
prop and `onSectionChange` callback:
```tsx
export type Section = "today" | "program" | "history" | "analytics"
type NavItem = { id: Section; label: string; Icon: typeof CalendarCheck2 }
const NAV_ITEMS: NavItem[] = [
  { id: "today", label: "Today", Icon: CalendarCheck2 },
  { id: "program", label: "Programs", Icon: ClipboardList },
  { id: "history", label: "History", Icon: History },
  { id: "analytics", label: "Analytics", Icon: ChartLine },
]
// …
<nav className="flex items-center gap-0.5">
  {NAV_ITEMS.map(({ id, label, Icon }) => (
    <Button
      key={id}
      variant={section === id ? "secondary" : "ghost"}
      size="sm"
      onClick={() => onSectionChange(id)}
      className={cn(
        "h-7 gap-1.5 px-2.5 text-[0.8125rem] font-medium",
        section === id ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
      <span>{label}</span>
    </Button>
  ))}
</nav>
```
`AppHeaderProps` is `{ section, onSectionChange, onLogout, user }`.

**`frontend/src/routes/today.tsx`** owns the `section` state and passes it down (it is
the only consumer of `Section`/`onSectionChange`):
```tsx
import { AppHeader, type Section } from "@/components/workout/app-header"
// …
const [section, setSection] = useState<Section>("today")
// …in the error branch and the main return:
<AppHeader section={section} onSectionChange={setSection} onLogout={signOut} user={user} />
```

**Established repo pattern for a button-styled link** — `not-found-page.tsx` styles a
TanStack `Link` with `buttonVariants` rather than `asChild` (the `Button` uses
`@base-ui`, which has no Radix `Slot`):
```tsx
import { Button, buttonVariants } from "@/components/ui/button"
<Link to="/today" className={cn(buttonVariants({ variant: "default" }))}> … </Link>
```
`buttonVariants` accepts `variant: "secondary" | "ghost"` and `size: "sm"` (confirmed
in `frontend/src/components/ui/button.tsx`) and merges a `className`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `cd frontend && pnpm typecheck` | exit 0 |
| Lint | `cd frontend && pnpm lint` | exit 0 |
| Tests | `cd frontend && pnpm test` | all pass |
| Build | `cd frontend && pnpm build` | exit 0 |
| Manual check (optional) | `cd frontend && pnpm dev`, click Programs/History/Analytics | each shows the 404 page with the matching path |

## Scope

**In scope**:
- `frontend/src/router.tsx` — register `/program`, `/history`, `/analytics` routes
  rendering `NotFoundPage`.
- `frontend/src/components/workout/app-header.tsx` — make nav items navigate via `Link`;
  drop the `section`/`onSectionChange` props.
- `frontend/src/routes/today.tsx` — remove the now-unused `section` state and props.

**Out of scope** (do NOT touch):
- `NotFoundPage` and its `JUMP_LINKS` — reuse as-is; do not change its copy.
- The `/today` auth guard (`beforeLoad`) — leave it exactly as-is. The three new
  routes are intentionally **unguarded** (an unauthenticated visitor simply sees the
  404), matching the existing behavior of hitting an unknown path.
- Any attempt to actually build Programs/History/Analytics pages — that's deliberately
  not this plan.

## Git workflow

- Branch: `advisor/006-nav-routes-to-404`
- One commit; message style: conventional commits, e.g.
  `feat(nav): route Programs/History/Analytics to the branded 404 until built`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Register the three stub routes (do this first — typing depends on it)

In `frontend/src/router.tsx`, add three routes that render `NotFoundPage`, and include
them in `addChildren`. Declare each explicitly (do not use a `path: string` helper —
the literal path is what makes `Link to="/program"` typecheck):

```tsx
// Features promised in the nav/marketing but not built yet. Each renders the
// branded 404 so the nav buttons lead somewhere honest; swap the component when
// the real page lands.
const programRoute = createRoute({ getParentRoute: () => rootRoute, path: "/program", component: NotFoundPage })
const historyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/history", component: NotFoundPage })
const analyticsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/analytics", component: NotFoundPage })

const routeTree = rootRoute.addChildren([indexRoute, todayRoute, programRoute, historyRoute, analyticsRoute])
```

**Verify**: `cd frontend && pnpm typecheck` → exit 0 (the new route paths are now part
of the typed route tree).

### Step 2: Make the nav buttons navigate

In `frontend/src/components/workout/app-header.tsx`:

1. Add imports: `import { Link, useLocation } from "@tanstack/react-router"`. Keep the
   existing `buttonVariants` import available — change the import line
   `import { Button } from "@/components/ui/button"` to
   `import { Button, buttonVariants } from "@/components/ui/button"` (the `Button` is
   still used elsewhere in the header for the theme/notification/search controls).
2. Replace the `Section` type and `NavItem`/`NAV_ITEMS` with a `to`-carrying shape:
   ```tsx
   type NavItem = { label: string; to: "/today" | "/program" | "/history" | "/analytics"; Icon: typeof CalendarCheck2 }
   const NAV_ITEMS: NavItem[] = [
     { label: "Today", to: "/today", Icon: CalendarCheck2 },
     { label: "Programs", to: "/program", Icon: ClipboardList },
     { label: "History", to: "/history", Icon: History },
     { label: "Analytics", to: "/analytics", Icon: ChartLine },
   ]
   ```
   Delete `export type Section = …`.
3. Change `AppHeaderProps` to `{ onLogout: () => void; user: MeResponse | null }` —
   remove `section` and `onSectionChange`.
4. Inside the component, compute the active path and render `Link`s styled with
   `buttonVariants` (mirroring `NotFoundPage`), preserving the existing extra classes:
   ```tsx
   const pathname = useLocation({ select: (l) => l.pathname })
   // …
   <nav className="flex items-center gap-0.5">
     {NAV_ITEMS.map(({ label, to, Icon }) => {
       const active = pathname === to
       return (
         <Link
           key={to}
           to={to}
           className={cn(
             buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
             "h-7 gap-1.5 px-2.5 text-[0.8125rem] font-medium",
             active ? "text-foreground" : "text-muted-foreground"
           )}
         >
           <Icon className="size-3.5" strokeWidth={1.75} />
           <span>{label}</span>
         </Link>
       )
     })}
   </nav>
   ```
   > If `useLocation({ select: … })` doesn't typecheck in this version of
   > `@tanstack/react-router`, use `const pathname = useLocation().pathname` instead.

**Verify**: `cd frontend && pnpm typecheck` → exit 0.

### Step 3: Drop the dead state in `today.tsx`

In `frontend/src/routes/today.tsx`:
- Change the import to `import { AppHeader } from "@/components/workout/app-header"`
  (remove `, type Section`).
- Delete `const [section, setSection] = useState<Section>("today")`.
- In **both** `<AppHeader … />` usages (the error branch and the main return), change
  the props to just `<AppHeader onLogout={signOut} user={user} />`.
- If `useState` is now unused on the line `import { useMemo, useState } from "react"`,
  check the rest of the file — `selected`/`setSelected` still use `useState`, so keep
  the import. (Confirm with the typecheck/lint below; remove an import only if the
  linter flags it.)

**Verify**: `cd frontend && pnpm typecheck && pnpm lint` → both exit 0. Then confirm no
stale references remain:
`grep -rn "onSectionChange\|type Section\|: Section" frontend/src` → no matches.

### Step 4: Full verification

**Verify**: `cd frontend && pnpm test && pnpm build` → both exit 0.

Optional manual check: `pnpm dev`, sign in / open `/today`, click **Programs** →
URL becomes `/program` and the branded 404 renders with a "GET /program 404" chip;
the same for History and Analytics; **Today** returns to the board and is highlighted.

## Test plan

- No new automated tests are required (there are no existing tests for `app-header.tsx`
  or `today.tsx`, and this is a routing/wiring change). The verification gate is
  typecheck + lint + existing test suite + build all green, plus the optional manual
  navigation check.
- If you want a regression guard (optional, not required): a small Testing-Library
  test that renders `AppHeader` inside a `RouterProvider`/memory router and asserts the
  Programs link has `href="/program"`. Skip if the router test setup is non-trivial —
  do not block the plan on it.

## Done criteria

ALL must hold:

- [ ] `/program`, `/history`, `/analytics` are registered in `router.tsx` and render `NotFoundPage`.
- [ ] Nav items are `Link`s pointing at those paths; `Section`/`onSectionChange` are gone.
- [ ] `grep -rn "onSectionChange\|type Section" frontend/src` → no matches.
- [ ] `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all exit 0.
- [ ] `git status` shows only `router.tsx`, `app-header.tsx`, `today.tsx` changed
      (plus `plans/README.md`).
- [ ] `plans/README.md` status row for 006 updated.

## STOP conditions

Stop and report back if:

- `Link to="/program"` does not typecheck even after Step 1 registers the route (the
  router's type generation works differently in this version) — report the error.
- Removing `section`/`onSectionChange` reveals another consumer of `Section` outside
  `today.tsx` that you'd have to change (grep first; if there is one, it's out of the
  excerpts and warrants a check-in).
- The "Current state" excerpts don't match the live files (drift).

## Maintenance notes

- When a real Programs/History/Analytics page is built, swap that route's
  `component: NotFoundPage` for the real component in `router.tsx` — the nav already
  points at the right path, so no header change is needed.
- These three routes are deliberately **unguarded** (no `beforeLoad` auth check). When
  the real pages land and need the signed-in user, add the same `beforeLoad` guard
  `todayRoute` uses.
- Alternative considered: leaving the paths unregistered and letting
  `defaultNotFoundComponent` catch them. Rejected because TanStack Router's typed
  `Link to` requires registered paths; registering stub routes keeps SPA navigation and
  type safety. A reviewer should confirm the 404 chip shows the attempted path
  (`/program`, etc.), not `/today`.
