# Plan 011: Remove the non-functional buttons from the workout views

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/components/workout/workout-table.tsx frontend/src/components/workout/mobile-day-board.tsx frontend/src/components/workout/sub-bar.tsx frontend/src/components/workout/mobile-sub-bar.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — deletion of inert UI; git history preserves the markup for
  when the features ship.
- **Depends on**: none
- **Category**: bug (UX)
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

Nine buttons across the workout views render as fully interactive controls
but have **no `onClick` handler** — clicking them does nothing, which reads
as "the app is broken" to a user mid-workout. That includes a prominent
"Start session" button in BOTH sub-bars — misleading twice over, because
sessions actually start lazily on the first cell edit (see `ensureSession`
in `use-day-board.ts`), so the button implies a step that doesn't exist. They are aspirational UI for
features that don't exist yet (exercise editing, activity logging). Until
those features are built, the honest UI is no button at all. The removed
markup stays recoverable via git history, and the roadmap intent is already
recorded in `plans/README.md` (Direction notes: ad-hoc sessions / activity
logging).

## Current state

All in two files; every one of these `Button`s lacks an `onClick`:

- `frontend/src/components/workout/workout-table.tsx`
  - Lines 279–285, in the `WorkoutTable` card header:

```tsx
        <Button variant="ghost" size="xs">
          <Plus className="size-3" />
          Add exercise
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="More">
          <MoreHorizontal className="size-3" />
        </Button>
```

  - Lines 383–386 (`RestDayCard` header: "Log activity") and 397–406
    (`RestDayCard` body: "Log walk", "Log mobility"):

```tsx
        <Button variant="ghost" size="xs">
          <Plus className="size-3" />
          Log activity
        </Button>
```

```tsx
        <div className="mt-2 flex gap-2">
          <Button variant="outline" size="sm">
            <Footprints className="size-3.5" />
            Log walk
          </Button>
          <Button variant="outline" size="sm">
            <HeartPulse className="size-3.5" />
            Log mobility
          </Button>
        </div>
```

  - The `RestDayCard` body copy (lines 393–396) also instructs the user to
    use those buttons: "Log a recovery walk, mobility, or skip to keep your
    streak. Programmed strain returns next session."

- `frontend/src/components/workout/mobile-day-board.tsx:73–79`, the mobile
  card header ("Add" + "More"):

```tsx
            <Button variant="ghost" size="xs">
              <Plus className="size-3" />
              Add
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="More">
              <MoreHorizontal className="size-3" />
            </Button>
```

- `frontend/src/components/workout/sub-bar.tsx:108–111` ("Start session" —
  note the "Today" `Button` directly above it at lines 102–107 HAS a handler
  and stays):

```tsx
      <Button size="sm">
        <Play className="size-3.5" />
        Start session
      </Button>
```

- `frontend/src/components/workout/mobile-sub-bar.tsx:108–111` (the mobile
  "Start session"):

```tsx
      <Button size="lg" className="mt-3.5 h-10 w-full justify-center text-sm">
        <Play className="size-3.5" />
        Start session
      </Button>
```

Conventions: Tailwind-only styling; lucide icons imported per-file — removing
a button whose icon is no longer used elsewhere in the file means removing
the icon import too, or `pnpm lint` fails on unused imports.

## Commands you will need

| Purpose   | Command (run in `frontend/`)   | Expected on success |
|-----------|--------------------------------|---------------------|
| Typecheck | `pnpm typecheck`               | exit 0              |
| Lint      | `pnpm lint`                    | exit 0 (catches unused imports) |
| Tests     | `pnpm test`                    | all pass            |

## Scope

**In scope**:
- `frontend/src/components/workout/workout-table.tsx`
- `frontend/src/components/workout/mobile-day-board.tsx`
- `frontend/src/components/workout/sub-bar.tsx`
- `frontend/src/components/workout/mobile-sub-bar.tsx`

**Out of scope** (do NOT touch):
- Buttons that DO have handlers anywhere in these files (e.g. everything
  driven by table meta callbacks).
- `RestDayCard`'s "Next session" flow, `NotesCard`, `SidePanel`.
- Building any of the implied features — deliberately not this plan.
- Landing-page components (marketing mockups are allowed to be inert).

## Git workflow

- Branch: `advisor/011-remove-dead-buttons`
- Commit style: `fix(frontend): remove non-functional buttons from workout views`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: WorkoutTable header

In `workout-table.tsx`, delete the "Add exercise" and "More" buttons
(lines 279–285) and the now-dangling `<div className="flex-1" />` spacer ONLY
if the header layout no longer needs it (the title + count should stay
left-aligned; keep the spacer if removing it shifts anything — simplest is to
keep it). Remove `Plus` and `MoreHorizontal` from the lucide import if no
other use remains in the file (`RestDayCard` uses `Plus` — check before
removing; after Step 2 removes RestDayCard's buttons, both icons plus
`Footprints`/`HeartPulse`/`Moon`… careful: `Moon` stays, it's the rest-day
icon).

### Step 2: RestDayCard

Delete the "Log activity" header button and the "Log walk"/"Log mobility"
button row (including its wrapping `div.mt-2`). Update the body copy so it
no longer instructs an action the UI can't do — replace the paragraph with:

```tsx
        <p className="m-0 max-w-72 text-[0.8125rem] leading-relaxed">
          No session scheduled today. Programmed strain returns next session.
        </p>
```

Then prune unused lucide imports (`Footprints`, `HeartPulse`, and `Plus` /
`MoreHorizontal` if now unused file-wide). `Moon` remains.

### Step 3: MobileDayBoard header

Delete the "Add" and "More" buttons (lines 73–79) and prune `Plus` /
`MoreHorizontal` imports if unused. The `Button` import itself may become
unused in this file — remove it if so.

### Step 4: Both sub-bars' "Start session"

Delete the handler-less "Start session" `Button` from `sub-bar.tsx` (lines
108–111) and `mobile-sub-bar.tsx` (lines 108–111). Do NOT touch the desktop
sub-bar's "Today" button (it has `onClick={onResetToToday}`). Prune the now-
unused `Play` import in each file; in `mobile-sub-bar.tsx` the `Button`
import also becomes unused — remove it.

**Verify**: `pnpm lint` → exit 0 (this is the unused-import check).
**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Confirm nothing referenced the removed controls

```
grep -rn "Add exercise\|Log activity\|Log walk\|Log mobility\|Start session" frontend/src --include="*.ts*"
```

→ no output. (If a test asserted on these strings, see STOP conditions.)

**Verify**: `pnpm test` → all pass.

## Test plan

No new tests — this deletes inert markup. The gates are lint (unused
imports), typecheck, and the existing suite (notably
`workout-table-skeleton.test.tsx` and `video-cell.test.tsx`, which must be
unaffected).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] The grep in Step 5 returns no output
- [ ] Zero `<Button` elements without an `onClick`/handler remain in the four in-scope files (manual scan of the diff)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all exit 0
- [ ] Only the four in-scope files are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A button listed above turns out to HAVE a handler in the live code (drift —
  someone wired it since this plan was written); skip that button and note it.
- An existing test asserts the presence of any removed button — report which
  test; deciding whether the test or the button is right is the maintainer's
  call.
- You're tempted to add a "coming soon" tooltip or disabled state instead of
  removing — that's a product decision this plan explicitly does not make.

## Maintenance notes

- When exercise editing or activity logging ships, recover the removed markup
  from this commit rather than redesigning from scratch — the layout was
  already reviewed.
- The related product intent (ad-hoc sessions — the schema already allows
  `sessions.program_day_id IS NULL`) is recorded in the Direction notes of
  `plans/README.md`.
