# Plan 024: Un-fork the Today page — one page, adaptive chrome, one board

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/routes/today.tsx frontend/src/components/workout/day-board.tsx frontend/src/components/workout/mobile-day-board.tsx frontend/src/components/workout/mobile-today.tsx frontend/src/components/workout/sub-bar.tsx`
> Every one of these WILL have drifted if the prerequisite plans landed
> (003, 011, 023 — expected). Read the live files fully before starting;
> the excerpts below describe the `84d129d` baseline plus the prerequisite
> plans' documented outcomes. On anything unexplained, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — restructures the app's main page across both viewports.
  Mitigations: all behavior stays in `useDayBoard` (untouched), the chrome
  components move rather than change, and a required visual check gates the
  result.
- **Depends on**: 003 (today.tsx empty state), 011 (dead buttons), 023
  (single responsive SubBar). Run AFTER 022 if both are queued (shared cell
  editors reduce the mobile card's surface). Coordinate with 018 (it
  regenerates the client and sweeps `use-day-board.ts`; different files,
  but serialize rather than parallelize).
- **Category**: tech-debt (responsive doctrine, rung 4: "never fork a page")
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

`TodayPage` forks the entire page on `useIsMobile`: the mobile branch
returns `<MobileToday …17 props…/>` whose only job is re-plumbing state the
page already owns (week/day selection, today position, completions,
prevDayId, handlers) into mobile copies of the same sections. Every new
piece of page state costs another prop through that funnel, the page shell
(error/empty/loading handling) exists twice, and crossing the 767px
boundary unmounts the entire tree — discarding in-flight cell edits. The
responsive doctrine (CLAUDE.md, plan 021) rule 4 says pages never fork.
After this plan: `TodayPage` owns state once and renders one tree; the only
remaining `useIsMobile` calls live in two section components — `AppChrome`
(top-nav vs app-bar+tab-bar) and `DayBoard` (table vs card list), each a
justified rung-3 structural fork with a single shared hook underneath.

## Current state

(Baseline `84d129d`, adjusted for prerequisites: 003 added an empty-state
branch to `today.tsx`; 011 removed dead buttons; 023 merged the sub-bars
into one responsive `SubBar` with optional `onResetToToday`.)

- `frontend/src/routes/today.tsx` — owns ALL page state (program query,
  `selected` week/day override, `todayPos`, `completedDays`, `prevDayId`,
  `nextDay`), then forks:
  - error branch (~lines 73–97): its own shell —
    `<div className="grid min-h-svh …" style={{gridTemplateRows:"auto minmax(0,1fr) auto"}}>`
    with `AppHeader` + message + `Footer`;
  - empty-state branch (added by plan 003): same shell with `NoProgramCard`;
  - `if (isMobile) return <MobileToday …17 props… />` (~lines 99–122);
  - desktop return (~lines 124–160): grid shell
    (`gridTemplateRows:"auto auto minmax(0,1fr) auto"`) with `AppHeader`,
    `SubBar`, `DayBoardSkeleton | DayBoard key={week-dayIndex}`, `Footer`.
- `frontend/src/components/workout/mobile-today.tsx` — the 17-prop funnel:
  `MobileAppBar` → `SubBar` (post-023) → `<main>` with safe-area padding
  (`paddingBottom: calc(5rem + env(safe-area-inset-bottom))`) containing
  `MobileDayBoardSkeleton | MobileDayBoard` plus a "Synced · Fitlytics
  v0.0.1" status chip → `MobileTabBar`.
- `frontend/src/components/workout/day-board.tsx` — desktop board: calls
  `useDayBoard`, renders `RestDayCard | WorkoutTable` in a
  `lg:grid-cols-[minmax(0,1fr)_clamp(16rem,22vw,22rem)]` grid with
  `SidePanel` in a `hidden lg:block` column, plus `BlockVideoDialog`.
  Exports `DayBoardSkeleton` (+ private `SidePanelSkeleton`).
- `frontend/src/components/workout/mobile-day-board.tsx` — mobile board:
  calls `useDayBoard` **again** (separate instance), renders
  `RestDayCard | <Card>` of `MobileExerciseCard`s, `SidePanel
  layout="stack"`, the same `BlockVideoDialog` wiring, and
  `MobileDayBoardSkeleton` (testid `mobile-day-board-skeleton`).
- Chrome components (all stay, unmodified): `app-header.tsx`,
  `mobile-app-bar.tsx`, `mobile-tab-bar.tsx`, `footer.tsx`.
- Doctrine: CLAUDE.md `## Responsive design (web + mobile)` — this plan
  implements rung 4 and relocates the two remaining forks to rung-3
  compliant altitude.

## Commands you will need

| Purpose   | Command (run in `frontend/`)        | Expected on success |
|-----------|--------------------------------------|---------------------|
| Tests     | `pnpm test`                          | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`  | exit 0              |
| Visual    | `pnpm dev` + `/today` at ≥768px / ≤767px / resize across | both layouts match pre-change |

## Scope

**In scope**:
- `frontend/src/components/workout/app-chrome.tsx` (create)
- `frontend/src/routes/today.tsx` (single tree)
- `frontend/src/components/workout/day-board.tsx` (absorbs the mobile board;
  adaptive skeleton)
- `frontend/src/components/workout/mobile-day-board.tsx` (delete)
- `frontend/src/components/workout/mobile-today.tsx` (delete)
- Any test file referencing the deleted components/testids
  (`grep -rn "mobile-day-board\|MobileToday" frontend/src` first)

**Out of scope** (do NOT touch):
- `use-day-board.ts` / `use-cell-logging.ts` — behavior is frozen; this is
  a presentation restructure.
- `mobile-exercise-card.tsx`, `workout-table.tsx`, `side-panel.tsx`,
  `sub-bar.tsx`, all chrome components — consumed as-is.
- The landing page and router.

## Git workflow

- Branch: `advisor/024-unfork-today`
- Commit style: `refactor(frontend): un-fork the Today page (doctrine rung 4)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create AppChrome (the rung-3 chrome fork, in a section component)

`frontend/src/components/workout/app-chrome.tsx`:

```tsx
// AppChrome is the app shell for authenticated pages: top nav + footer on
// desktop, app bar + bottom tab bar (with home-indicator safe area) on
// phones. It is one of the two sanctioned useIsMobile forks (doctrine rung
// 3) — pages render it once and never branch on viewport themselves.
type AppChromeProps = {
  user: MeResponse | null
  onLogout: () => void
  // subBar renders between the header and the body, outside the padded
  // main region, on both viewports. Omit it on shell-only states (error,
  // empty, loading-without-context).
  subBar?: ReactNode
  children: ReactNode
}

export function AppChrome({ user, onLogout, subBar, children }: AppChromeProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="flex min-h-svh flex-col bg-background text-foreground">
        <MobileAppBar user={user} onLogout={onLogout} />
        {subBar}
        <main
          className="flex-1 px-3.5 pt-3.5"
          style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        >
          {children}
          <div className="mt-3 flex items-center justify-center gap-2 py-1 text-[0.625rem] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>Synced</span>
            <span className="text-border">·</span>
            <span>Fitlytics v0.0.1</span>
          </div>
        </main>
        <MobileTabBar />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <AppHeader onLogout={onLogout} user={user} />
      {subBar}
      <main className="flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1">
        {children}
      </main>
      <Footer />
    </div>
  )
}
```

Note the desktop shell moves from the page's inline CSS grid
(`gridTemplateRows`) to an equivalent flex column — same visual result
(header/subbar auto, body fills, footer auto). If the `[&>*]` utility
selector proves awkward for the board's internal grid, wrapping children in
a plain `<div className="min-h-0 flex-1">` is equally acceptable — pick
whichever keeps `DayBoard`'s existing internal layout pixel-identical.

### Step 2: Absorb the mobile board into DayBoard (one hook instance)

In `day-board.tsx`:

1. Add `const isMobile = useIsMobile()` and keep the single existing
   `useDayBoard(...)` call — this is the state-loss fix: both layouts now
   share one hook instance, so crossing the breakpoint re-renders instead
   of remounting the board's data wiring. (The local edit state still lives
   in the hook; only the presentation subtree swaps.)
2. Render:

```tsx
  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        {day.off ? <RestDayCard name={day.name} /> : (
          /* the Card + header + MobileExerciseCard list, moved verbatim
             from mobile-day-board.tsx (post-011: no dead buttons) */
        )}
        <SidePanel … layout="stack" />
        <BlockVideoDialog … />
      </div>
    )
  }
  return ( /* existing desktop grid, unchanged */ )
```

   Move the card-list JSX from `mobile-day-board.tsx` verbatim; both
   branches share the identical `useDayBoard` destructuring above them, and
   `BlockVideoDialog` appears once per branch with the same props (or once
   below a fragment — either is fine; don't duplicate its props object,
   extract a local variable if needed).
3. Make `DayBoardSkeleton` adaptive the same way: `useIsMobile()` choosing
   between the existing desktop skeleton and the moved
   `MobileDayBoardSkeleton` body (keep both testids:
   `day-board-skeleton` / `mobile-day-board-skeleton`).
4. Delete `mobile-day-board.tsx`.

**Verify**: `pnpm typecheck` → errors only in `mobile-today.tsx` /
`today.tsx` (next step); nothing else may reference the deleted file
(`grep -rn "mobile-day-board" frontend/src` → test files at most — update
their imports to `day-board`).

### Step 3: Collapse TodayPage to one tree

Rewrite the return paths of `today.tsx`:

1. Error branch: `<AppChrome user={user} onLogout={signOut}>` around the
   existing retry message (delete the hand-rolled grid shell).
2. Empty-state branch (from plan 003): same — `AppChrome` around
   `NoProgramCard`.
3. Main return — ONE tree, no `isMobile` anywhere in the file:

```tsx
  return (
    <AppChrome
      user={user}
      onLogout={signOut}
      subBar={
        <SubBar
          programName={program?.name ?? "Loading…"}
          weekCount={Math.max(1, weekCount)}
          days={days} week={week} dayIndex={dayIndex}
          todayWeek={todayPos?.week ?? null}
          todayDayIndex={todayPos?.dayIndex ?? null}
          dayData={dayData} startDate={program?.startDate}
          completedDays={completedDays}
          onWeekChange={(next) => setSelected({ week: next, dayIndex })}
          onDayChange={(next) => setSelected({ week, dayIndex: next })}
          onResetToToday={() => setSelected(null)}
        />
      }
    >
      {isLoading || !program ? (
        <DayBoardSkeleton />
      ) : (
        <DayBoard
          key={`${week}-${dayIndex}`}
          day={dayData}
          programId={program.id}
          programDayId={dayData.id}
          prevDayId={prevDayId}
          nextDay={nextDay}
          initialCompleted={EMPTY_COMPLETED}
        />
      )}
    </AppChrome>
  )
```

   (`onResetToToday` is always passed; SubBar hides the button on mobile —
   plan 023's design.)
4. Delete `mobile-today.tsx` and the `useIsMobile` import from `today.tsx`.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.
**Verify**: `grep -rn "useIsMobile" frontend/src --include="*.tsx" --include="*.ts" | grep -v use-is-mobile.ts` → exactly two files: `app-chrome.tsx` and `day-board.tsx`.
**Verify**: `grep -rn "MobileToday\|MobileSubBar\|MobileDayBoard" frontend/src` → no output.

### Step 4: Tests + visual gate

1. `pnpm test` → all pass; update any test that imported the deleted
   modules (skeleton testids were preserved, so assertions should survive
   with import-path changes only — if an ASSERTION must change, STOP).
2. Visual check (required): `pnpm dev`, `/today` at ~1280px and ~390px —
   both match the pre-change layouts; resize across 768px live: the board
   swaps layout **without losing an in-progress cell edit** (type into a
   load cell, resize, confirm the draft value survives — that's the
   single-hook-instance payoff and the regression test for this plan's core
   claim). Check the error state too (`stop the backend` or block the API)
   on both widths.

If no environment can render `/today`, STOP — same rule as plan 023.

## Test plan

Existing suites (import paths updated, assertions unchanged) + the manual
visual/resize gate in Step 4. No new unit tests: the moved JSX is covered by
the hook tests underneath and the skeleton tests via preserved testids.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `mobile-today.tsx` and `mobile-day-board.tsx` deleted; the Step 3 greps return exactly the stated results
- [ ] `today.tsx` contains no `useIsMobile` and exactly one `return`ed tree plus the error/empty branches, all inside `AppChrome`
- [ ] `day-board.tsx` calls `useDayBoard` exactly once (`grep -c "useDayBoard(" frontend/src/components/workout/day-board.tsx` → 1)
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0; no test assertions changed
- [ ] Visual + resize-with-draft-edit check performed on both viewports
- [ ] Only in-scope files modified (`git status`)
- [ ] `.plan/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Prerequisites 003/011/023 are not DONE (`.plan/README.md`).
- The desktop grid→flex shell swap in Step 1 visibly changes the layout and
  can't be matched within two attempts — report with a screenshot; forcing
  it with `!important`-style utilities is not acceptable.
- Any test assertion (not import) must change to pass.
- You need a third `useIsMobile` call site beyond AppChrome/DayBoard — the
  restructure missed a fork; report where.
- No environment can render `/today` for the visual gate.

## Maintenance notes

- **This plan sets the template for every future page**: History/Analytics
  render `<AppChrome subBar={…}>{body}</AppChrome>` and start at doctrine
  rung 1 — a new page should never import `useIsMobile` directly.
- `MobileTabBar`/`MobileAppBar` are now rendered only by `AppChrome`; nav
  changes happen once.
- The `key={week-dayIndex}` remount on day change is deliberate (resets
  per-day edit state) and unrelated to the breakpoint fix — don't remove it.
- Reviewer scrutiny: `day-board.tsx`'s diff should show the mobile JSX moved
  verbatim (post-011), not rewritten; and exactly one `useDayBoard` call.
