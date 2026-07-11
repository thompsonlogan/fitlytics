# Plan 023: Merge SubBar and MobileSubBar into one responsive component

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/components/workout/sub-bar.tsx frontend/src/components/workout/mobile-sub-bar.tsx frontend/src/components/workout/mobile-today.tsx frontend/src/routes/today.tsx`
> These files WILL have drifted if plans 003/011 landed (expected — 011 is a
> prerequisite). Compare the "Current state" excerpts for the parts this
> plan touches; on an unexplained mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — this is a visual merge of two layouts into one responsive
  component; the failure mode is a layout regression on one viewport. The
  class-mapping table below and a side-by-side visual check are the
  mitigations. No behavioral logic changes.
- **Depends on**: 011 (removes the dead "Start session" buttons from both
  files first — shrinking the merge surface), 021 (the doctrine this
  implements — rung 1/2 instead of a fork)
- **Category**: tech-debt (responsive doctrine)
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

`SubBar` (desktop) and `MobileSubBar` (phone) render the same content —
breadcrumb, day title, "Today" badge, week pager, `DaySelector` — with the
week-pager markup duplicated **verbatim** (same class strings, same
disabled logic) and everything else differing only in arrangement and
sizing. Per the responsive doctrine (CLAUDE.md, added by plan 021), that's a
rung-1/rung-2 case: one component with Tailwind responsive classes, not a
fork. Merging deletes `mobile-sub-bar.tsx` outright, halves the maintenance
surface of the page header, and is the enabling step for plan 024
(un-forking the Today page — which becomes trivial once there's only one
SubBar to render).

## Current state

(Line numbers are planning-time, BEFORE plan 011 deletes the Start-session
buttons from both files — re-locate after its landing.)

- `frontend/src/components/workout/sub-bar.tsx` — desktop row layout:
  - Props: `programName, weekCount, days, week, dayIndex, todayWeek,
    todayDayIndex, dayData, startDate, completedDays, onWeekChange,
    onDayChange, onResetToToday`.
  - Structure: one flex row (`flex flex-wrap items-center gap-3 border-b
    bg-background px-5 py-3.5`): breadcrumb+title block → spacer → week
    pager (`h-7`, chevron buttons `w-7`, label `min-w-20`) → `DaySelector`
    (no className) → conditional "Today" reset `Button`
    (`showTodayButton = todayWeek != null && todayDayIndex != null && !isToday`).
- `frontend/src/components/workout/mobile-sub-bar.tsx` — stacked layout:
  - Same props minus `onResetToToday` (its header comment records the
    decision: "The desktop 'back to Today' button is dropped — tapping a day
    chip is the touch equivalent and the 'Today' badge already marks the
    spot.").
  - Structure: stacked column (`border-b bg-background px-3.5 pt-3.5 pb-4`):
    breadcrumb (`text-[0.625rem]`, truncating) → title block (`text-xl`,
    Badge right-aligned) → week pager (`h-8 flex-1`, chevrons `w-9`, label
    `flex-1`) → `DaySelector` with scroll classes
    (`mt-2.5 overflow-x-auto [scrollbar-width:none]
    [&::-webkit-scrollbar]:hidden [&>button]:min-w-13 [&>button]:flex-1`).
  - The week pager markup is character-identical to the desktop one except
    for the size classes and `title=` vs `aria-label=` on the chevrons.
- Consumers: `frontend/src/routes/today.tsx:130` renders `SubBar` (desktop
  branch); `frontend/src/components/workout/mobile-today.tsx:57` renders
  `MobileSubBar`. (`grep -rn "MobileSubBar\|SubBar" frontend/src` to confirm
  post-drift.)
- `DaySelector` (`day-selector.tsx`) already accepts a `className` — no
  change needed there.
- Doctrine reference: CLAUDE.md `## Responsive design (web + mobile)`,
  rungs 1–2. The breakpoint pairing: JS `MOBILE_MAX_WIDTH = 767` ↔ Tailwind
  `md` (768px) — so "mobile" styles are the base and desktop styles use
  `md:` prefixes.

## Commands you will need

| Purpose   | Command (run in `frontend/`)        | Expected on success |
|-----------|--------------------------------------|---------------------|
| Tests     | `pnpm test`                          | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`  | exit 0              |
| Visual    | `pnpm dev` + browse `/today` at ≥768px and ≤767px | layouts match the previous two components |

## Scope

**In scope**:
- `frontend/src/components/workout/sub-bar.tsx` (becomes the merged, responsive component)
- `frontend/src/components/workout/week-pager.tsx` (create — the extracted pager)
- `frontend/src/components/workout/mobile-sub-bar.tsx` (delete)
- `frontend/src/components/workout/mobile-today.tsx` (import the merged SubBar)

**Out of scope** (do NOT touch):
- `day-selector.tsx` — already shared and className-parameterized.
- `today.tsx` beyond what compiles — the page un-fork is plan 024.
- Any content/copy change; any behavior change to week/day navigation.

## Git workflow

- Branch: `advisor/023-merge-sub-bars`
- Commit style: `refactor(frontend): one responsive SubBar (doctrine rung 1–2)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract the WeekPager

Create `week-pager.tsx` with the duplicated pager, parameterized only where
the two copies differ:

```tsx
type WeekPagerProps = {
  week: number
  weekCount: number
  onWeekChange: (next: number) => void
  className?: string       // container: mobile passes "h-8 flex-1", desktop "h-7"
  buttonClassName?: string // chevron cells: mobile "w-9", desktop "w-7"
  labelClassName?: string  // center label: mobile "flex-1", desktop "min-w-20 px-2"
}
```

Body: the existing container/button/label markup (either copy — they're
identical apart from the parameterized classes), with `aria-label` on the
chevrons (the desktop copy's `title=` becomes `aria-label` + `title` so
both previous affordances survive). Keep the `aria-label="Week selector"`
container attribute.

### Step 2: Merge into one responsive SubBar

Rewrite `sub-bar.tsx` as mobile-first with `md:` desktop overrides. Keep the
existing exported name `SubBar` and the full desktop prop list
(`onResetToToday` included). Layout skeleton:

```tsx
<div className="border-b bg-background px-3.5 pt-3.5 pb-4 md:flex md:flex-wrap md:items-center md:gap-3 md:px-5 md:py-3.5">
  {/* breadcrumb + title block: stacked sizes by default, desktop sizes at md: */}
  {/* mobile-only "Today" badge placement vs desktop inline — express via
      responsive utilities on ONE badge, not two renders, where feasible */}
  <div className="hidden md:block md:flex-1" />           {/* desktop spacer */}
  <WeekPager week={…} weekCount={…} onWeekChange={…}
    className="mt-3.5 h-8 w-full md:mt-0 md:h-7 md:w-auto"
    buttonClassName="w-9 md:w-7"
    labelClassName="flex-1 md:flex-none md:min-w-20 md:px-2" />
  <DaySelector … className="mt-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:min-w-13 [&>button]:flex-1 md:mt-0 md:overflow-visible md:[&>button]:min-w-0 md:[&>button]:flex-none" />
  {showTodayButton && (
    <Button variant="outline" size="sm" onClick={onResetToToday}
      className="hidden md:inline-flex">…</Button>
  )}
</div>
```

Class-mapping rules (the reviewer's checklist):

| Element | ≤767px (from MobileSubBar) | ≥768px (from SubBar) |
|---|---|---|
| Container | `px-3.5 pt-3.5 pb-4`, stacked | `flex flex-wrap items-center gap-3 px-5 py-3.5` |
| Breadcrumb | `text-[0.625rem]`, truncate | `text-[0.6875rem]`, `mb-1` |
| Title | `text-xl`, tag on second line | `text-[1.0625rem]`, `· Week n · tag` inline |
| Pager | `h-8`, full width, `w-9` chevrons | `h-7`, auto width, `w-7` chevrons |
| DaySelector | scroll classes, flexed buttons | plain |
| Today reset button | hidden (decision preserved from MobileSubBar's comment) | conditional as today |

Where a single element can't express both title arrangements cleanly
(inline `· Week n · tag` vs two-line), it is acceptable to render the text
via two spans with `md:hidden` / `hidden md:inline` — that's still rung 1
(visibility classes), not a component fork. Prefer the single-element form
when it reads clearly.

Carry over BOTH header comments' intent into the merged component's comment
(including the recorded mobile decision about the Today button).

### Step 3: Switch consumers and delete the mobile copy

1. `mobile-today.tsx`: replace `MobileSubBar` with the merged `SubBar`,
   passing `onResetToToday` — but MobileToday doesn't receive it. Pass a
   no-op is WRONG (hidden button must stay functionally absent); instead
   make `onResetToToday` optional in `SubBarProps`
   (`onResetToToday?: () => void`) and include `onResetToToday != null` in
   the `showTodayButton` condition. MobileToday simply omits the prop.
2. Delete `mobile-sub-bar.tsx`.
3. `grep -rn "MobileSubBar" frontend/src` → no output.

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all pass.

### Step 4: Visual verification (required for this plan)

`pnpm dev`, open `/today` (needs a configured backend or
`AUTH_BYPASS_USER_ID` dev setup — see CLAUDE.md Quick start). Check at
~1280px and ~390px widths:

- Desktop: breadcrumb/title left, pager + day chips + (when off "today")
  the Today button right, all on one row — matching the pre-change layout.
- Mobile: stacked breadcrumb → title+badge → full-width pager → scrollable
  day strip; no Today reset button.
- Resize across 768px: layout flips with no console errors.

If no runnable environment exists, STOP and report — this plan's risk is
visual and must not ship unseen. (If the Claude Code preview tools are
available in your environment, use them: start the dev server, screenshot
both widths, and include the screenshots in your report.)

## Test plan

No new unit tests — the component is presentation-only and its interactive
children (`WeekPager` behavior, `DaySelector`) are exercised through
existing flows. The gates: typecheck/lint/tests green, the `MobileSubBar`
grep, and the Step 4 visual check.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `mobile-sub-bar.tsx` deleted; `grep -rn "MobileSubBar" frontend/src` → no output
- [ ] `week-pager.tsx` exists; the pager markup appears exactly once in the codebase (`grep -rn "Week selector" frontend/src` → 1 file)
- [ ] `SubBar` accepts optional `onResetToToday`; MobileToday renders it without the prop
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0
- [ ] Step 4 visual check performed (or the plan stopped)
- [ ] Only in-scope files modified (`git status`)
- [ ] `.plan/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 011 has not landed (the dead Start-session buttons complicate the
  merge and would resurrect deleted code).
- No environment can render `/today` for the visual check.
- The merged component needs `useIsMobile` to express any difference —
  that's a rung violation and means some difference is structural after
  all; report which element resisted CSS.
- More than ~3 elements need the dual-span `md:hidden`/`hidden md:inline`
  trick — the merge is fighting the layouts; report rather than shipping
  unreadable classes.

## Maintenance notes

- Plan 024 builds directly on this: with one SubBar, the Today page's fork
  loses most of its reason to exist.
- Future SubBar features (e.g. a real Start-session flow, a program picker
  entry point) must be added responsive-first in this one component — a new
  `MobileSubBar` is a doctrine regression a reviewer should reject.
- `WeekPager` is now available for any future paged UI (History months?);
  keep its props presentation-only.
