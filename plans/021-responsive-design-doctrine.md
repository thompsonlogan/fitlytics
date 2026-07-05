# Plan 021: Define and document the responsive (web vs mobile) design doctrine

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/hooks/use-is-mobile.ts CLAUDE.md`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition. (A CLAUDE.md change from plan 009 or 020 is
> expected and fine — they add unrelated sections/bullets.)

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — one new constants module, one import change, one docs
  section. No visual or behavioral change.
- **Depends on**: none (but should land BEFORE plans 022–024, which cite the
  doctrine it writes)
- **Category**: dx / docs
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The app supports two viewports and currently uses three different responsive
mechanisms without a written rule for choosing between them: Tailwind
breakpoint classes (`DayBoard`'s `lg:` grid), a layout prop on a shared
component (`SidePanel layout="stack"`), and JS forking on `useIsMobile`
(`TodayPage` → `MobileToday`). The result is that each new screen picks its
mechanism by copying whichever file the author saw last — which is how the
Today page ended up forked at the top with a 17-prop re-plumbing funnel.
This plan writes the decision ladder into `CLAUDE.md` (the file both humans
and agents read before coding) and gives the JS breakpoint a single exported
source of truth. Plans 022–024 then bring the Today page into compliance.

## Current state

- `frontend/src/hooks/use-is-mobile.ts` — defines the breakpoint inline:

```ts
const MOBILE_MAX_WIDTH = 767

const QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`
```

  with a comment noting it is "kept just under Tailwind's `md` (768px) so
  the two never disagree" — a pairing enforced only by that comment. The
  hook itself (a `useSyncExternalStore` matchMedia read) is correct and
  stays unchanged.

- `CLAUDE.md` — has a `## Conventions` bullet list at the end (plan 020 adds
  a hook-per-API bullet there). The doctrine is too long for a bullet; it
  gets its own `## Responsive design (web + mobile)` section placed just
  above `## Conventions`.

- The in-repo exemplars the doctrine cites (verify they still exist):
  - Rung 1: `frontend/src/components/workout/day-board.tsx` —
    `lg:grid-cols-…` + side panel `hidden lg:block`.
  - Rung 2: `frontend/src/components/workout/side-panel.tsx` —
    `layout?: "panel" | "stack"`.
  - Rung 3: `frontend/src/components/workout/workout-table.tsx` vs
    `mobile-exercise-card.tsx`, both driven by
    `use-day-board.ts`/`use-cell-logging.ts`.

## Commands you will need

| Purpose   | Command (run in `frontend/`)        | Expected on success |
|-----------|--------------------------------------|---------------------|
| Tests     | `pnpm test`                          | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`  | exit 0              |

## Scope

**In scope**:
- `frontend/src/lib/breakpoints.ts` (create)
- `frontend/src/hooks/use-is-mobile.ts` (import the constant)
- `CLAUDE.md` (new section)

**Out of scope** (do NOT touch):
- Any component — refactors toward the doctrine are plans 022–024.
- Tailwind configuration/theme (`index.css`) — the JS constant deliberately
  references Tailwind's `md` by convention; wiring a custom Tailwind screen
  token is not worth the churn while `md` is the only paired breakpoint.

## Git workflow

- Branch: `advisor/021-responsive-doctrine`
- Commit style: `docs(frontend): responsive design doctrine + breakpoint module`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the breakpoint module

`frontend/src/lib/breakpoints.ts`:

```ts
// The app's single phone breakpoint. 767px = just under Tailwind's `md`
// (768px) so CSS (`md:` variants) and JS (useIsMobile) can never disagree
// about "is this a phone". If `md` is ever re-themed, change BOTH together.
export const MOBILE_MAX_WIDTH = 767

// matchMedia query string for the phone viewport. Consumed by useIsMobile;
// import it rather than re-deriving so every JS viewport check shares one
// definition.
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`
```

### Step 2: Point useIsMobile at it

In `frontend/src/hooks/use-is-mobile.ts`, delete the local
`MOBILE_MAX_WIDTH`/`QUERY` definitions and their breakpoint comment, and
`import { MOBILE_MEDIA_QUERY } from "@/lib/breakpoints"`; use it in
`subscribe`/`getSnapshot`. Everything else (the `useSyncExternalStore`
mechanics and their comments) stays byte-identical.

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all pass (the
`use-is-mobile` behavior is exercised indirectly by today-page consumers).

### Step 3: Write the doctrine into CLAUDE.md

Insert this section immediately above `## Conventions` (adjust nothing in
it — the wording has been reviewed):

```markdown
## Responsive design (web + mobile)

The app serves two viewports from one codebase: desktop web and phone
(≤767px — `MOBILE_MAX_WIDTH` in `src/lib/breakpoints.ts`, deliberately one
pixel under Tailwind's `md`). When a page or component must differ between
them, use the **weakest tool that works**, escalating only when the current
rung provably cannot express the difference:

1. **Tailwind responsive classes** — when only spacing, columns, ordering,
   or visibility change. Exemplar: `day-board.tsx` (`lg:` grid, side panel
   `hidden lg:block`). This should cover most cases.
2. **A `layout` prop on one shared component** — when the content is
   identical but its arrangement differs. Exemplar: `side-panel.tsx`
   (`layout="panel" | "stack"`).
3. **Forked presentation components** — only when the DOM structure is
   fundamentally different (a `<table>` vs a card list; top nav vs bottom
   tab bar). Exemplar: `workout-table.tsx` vs `mobile-exercise-card.tsx`.
   Three rules make a fork acceptable:
   - the fork sits at the **lowest** node where structure actually diverges,
     never higher;
   - **all** behavior lives in a shared headless hook (`use-day-board.ts`,
     `use-cell-logging.ts`) — a mobile variant never re-implements logic;
   - interactive leaves (inputs, state cells, video triggers) are shared
     components both variants compose — markup may fork, widgets may not.
4. **Never fork a page.** Route components own data fetching and state
   exactly once and render adaptive sections. `useIsMobile` belongs in
   section-level components choosing between rung-3 variants — never in a
   route file, and never to duplicate state plumbing.

Naming: a rung-3 phone variant is `mobile-<name>.tsx` next to its desktop
counterpart, and both must consume the same hook and the same leaf
components. If you find yourself passing a page's state through a dozen
props to reach a `Mobile*` component, the fork is too high — move it down.
```

**Verify**: `grep -n "Responsive design (web + mobile)" CLAUDE.md` → match;
`grep -c "MOBILE_MAX_WIDTH" frontend/src/lib/breakpoints.ts CLAUDE.md` → 1+
in each.

## Test plan

No new tests — Step 2's suite run covers the refactored import; the doctrine
is documentation.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `frontend/src/lib/breakpoints.ts` exists; `use-is-mobile.ts` imports `MOBILE_MEDIA_QUERY` and defines no local width constant (`grep -n "767" frontend/src/hooks/use-is-mobile.ts` → no match)
- [ ] CLAUDE.md contains the doctrine section with all four rungs
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0
- [ ] Only the three in-scope files are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- An exemplar file the doctrine cites no longer matches its description
  (e.g. `side-panel.tsx` lost its `layout` prop) — the doctrine text must
  cite real code; report the mismatch.
- More than one JS file defines a viewport width constant
  (`grep -rn "max-width: 76" frontend/src`) — consolidate them all here or
  report why one can't move.

## Maintenance notes

- Plans 022–024 implement the doctrine on the Today page (shared cell
  editors; merged SubBar; un-forked page shell). New pages (History,
  Analytics) must start at rung 1.
- If a second JS breakpoint ever appears (e.g. a tablet query), it goes in
  `breakpoints.ts` with the same Tailwind-pairing comment.
- Reviewer scrutiny: the CLAUDE.md section should be inserted verbatim — its
  rules are load-bearing for the follow-up plans' review criteria.
