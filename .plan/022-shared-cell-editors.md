# Plan 022: Extract shared load/RPE cell editors for the table and mobile cards

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/components/workout/workout-table.tsx frontend/src/components/workout/mobile-exercise-card.tsx`
> Both files WILL have drifted if plans 011 and 019 landed (expected — they
> are prerequisites). Compare the "Current state" excerpts for the input
> markup this plan extracts; on an unexplained mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED — moves ~80 lines of duplicated input markup into two
  shared components; the risk is a subtle class/attribute drop changing
  visuals or a11y. The plan pins attributes with greps and preserves
  variant styling via className props.
- **Depends on**: 011, 019 (both modify the same files); 001 recommended
  first (its hook tests exercise the editors' handlers end-to-end)
- **Category**: tech-debt (doctrine rung 3: "widgets may not fork")
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The desktop table and the mobile exercise card are a *justified* structural
fork (table vs card list — doctrine rung 3, see the "Responsive design"
section plan 021 adds to CLAUDE.md), but they each hand-roll the same two
interactive widgets: the load input and the RPE input. Each copy is ~40
lines carrying identical behavior — the `edited ?? persisted` value merge,
`inputMode="numeric"`, `maxLength`, placeholder, error styling
(`border-destructive bg-destructive/10 text-destructive`), `title`,
`aria-invalid`, and the `data-testid={load-input-${key}}` contract — and
they differ only in size/shape classes. Duplicated widgets drift: a fix to
one input's a11y or error handling silently misses the other. The doctrine's
rule is "markup may fork, widgets may not" — this plan makes it true.

## Current state

- `frontend/src/components/workout/workout-table.tsx` — the two column
  `cell` renderers (planning-time lines 136–208). Load cell core:

```tsx
      const edited = meta.loadEdits[r.key]
      const persisted = meta.persistedLoad[r.key]
      const fallback = persisted == null || persisted === "" ? "" : String(persisted)
      const value = edited != null ? edited : fallback
      const isEmpty = value === ""
      const errorMsg = meta.cellErrors[`${r.key}:load`]
      return (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Input
            value={value}
            onChange={(e) => meta.onEditLoad(r.key, e.target.value)}
            onBlur={(e) => meta.onBlurLoad(r.key, e.target.value)}
            placeholder="—"
            inputMode="numeric"
            maxLength={4}
            title={errorMsg}
            aria-invalid={!!errorMsg}
            data-testid={`load-input-${r.key}`}
            className={cn(
              "h-6 w-14 border-transparent bg-transparent px-1.5 text-right text-[0.8125rem] tabular-nums shadow-none hover:border-input hover:bg-background",
              isEmpty && "text-muted-foreground",
              errorMsg && "border-destructive bg-destructive/10 text-destructive"
            )}
          />
          <span className="text-xs text-muted-foreground">lb</span>
        </span>
      )
```

  The RPE cell mirrors it with `maxLength={2}`, a pill styling, and an
  `aria-label` (`RPE for ${name} set ${blIdx + 1}`).

- `frontend/src/components/workout/mobile-exercise-card.tsx` — the same two
  widgets inline (planning-time lines 69–80 value merges, 129–147 load
  input, 155–172 RPE input), identical attributes, different classes
  (`h-8 w-16 border-input …` / `h-8 w-12 rounded-full …`) and a
  slightly different aria wording ("block" vs "set").

- Shared leaves that already follow the target pattern (the exemplars):
  `set-state-cell.tsx` (accepts `className`/`iconClassName` for per-context
  sizing), `video-cell.tsx`.

- Behavior source: the handlers (`onEditLoad`, `onBlurLoad`, …) come from
  `use-cell-logging.ts` in both cases — the widgets are pure controlled
  views over the same hook.

- Repo conventions: named UI components get their own file alongside the
  parent; Tailwind only; `cn` from `@/lib/utils` for class merging.

## Commands you will need

| Purpose   | Command (run in `frontend/`)             | Expected on success |
|-----------|-------------------------------------------|---------------------|
| New tests | `pnpm vitest run cell-input`               | all pass            |
| All tests | `pnpm test`                                | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`        | exit 0              |

## Scope

**In scope**:
- `frontend/src/components/workout/load-cell-input.tsx` (create)
- `frontend/src/components/workout/rpe-cell-input.tsx` (create)
- `frontend/src/components/workout/load-cell-input.test.tsx` (create — may
  cover both components in one file: `cell-input.test.tsx` is also fine)
- `frontend/src/components/workout/workout-table.tsx` (consume)
- `frontend/src/components/workout/mobile-exercise-card.tsx` (consume)

**Out of scope** (do NOT touch):
- `use-cell-logging.ts` — the handlers/value shapes are the contract; the
  widgets adapt to them, not vice versa.
- `set-state-cell.tsx`, `video-cell.tsx` — already shared.
- Any styling CHANGE — each context keeps its exact current classes, passed
  in via props.

## Git workflow

- Branch: `advisor/022-shared-cell-editors`
- Commit style: `refactor(frontend): shared load/RPE cell editors`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the two widgets

`load-cell-input.tsx` — owns everything both copies share; variant styling
comes in via `className`; the "lb" suffix is included (both contexts render
it):

```tsx
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type LoadCellInputProps = {
  cellKey: string
  edited: string | undefined
  persisted: number | ""
  error: string | undefined
  onEdit: (key: string, value: string) => void
  onBlur: (key: string, value: string) => void
  // Context styling: the desktop table passes its compact borderless look,
  // the mobile card its larger bordered one. Shared behavior lives here;
  // shape lives with the caller (doctrine: widgets may not fork).
  className?: string
  wrapperClassName?: string
}

// LoadCellInput is the "Load Used" editor shared by the workout table cell
// and the mobile exercise card. Controlled entirely by use-cell-logging's
// keyed state: a local edit wins while typing, else the persisted actual.
export function LoadCellInput({
  cellKey,
  edited,
  persisted,
  error,
  onEdit,
  onBlur,
  className,
  wrapperClassName,
}: LoadCellInputProps) {
  const fallback = persisted == null || persisted === "" ? "" : String(persisted)
  const value = edited != null ? edited : fallback
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", wrapperClassName)}>
      <Input
        value={value}
        onChange={(e) => onEdit(cellKey, e.target.value)}
        onBlur={(e) => onBlur(cellKey, e.target.value)}
        placeholder="—"
        inputMode="numeric"
        maxLength={4}
        title={error}
        aria-invalid={!!error}
        data-testid={`load-input-${cellKey}`}
        className={cn(
          className,
          value === "" && "text-muted-foreground",
          error && "border-destructive bg-destructive/10 text-destructive"
        )}
      />
      <span className="text-xs text-muted-foreground">lb</span>
    </span>
  )
}
```

`rpe-cell-input.tsx` — same shape with `maxLength={2}`,
`data-testid={rpe-input-${cellKey}}`, an `ariaLabel: string` prop (the two
contexts word it differently today — "set" vs "block"; keep each context's
current wording by passing it in), and an `emptyClassName?: string` prop for
the mobile card's dashed-empty look vs the table's (the table folds empty
styling differently — compare both current class expressions carefully and
preserve each exactly via the props).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Consume in the table

In `workout-table.tsx`, replace the `load` and `rpe` column cell bodies with
the shared components, passing the exact current classes:

```tsx
      return (
        <LoadCellInput
          cellKey={r.key}
          edited={meta.loadEdits[r.key]}
          persisted={meta.persistedLoad[r.key]}
          error={meta.cellErrors[`${r.key}:load`]}
          onEdit={meta.onEditLoad}
          onBlur={meta.onBlurLoad}
          className="h-6 w-14 border-transparent bg-transparent px-1.5 text-right text-[0.8125rem] tabular-nums shadow-none hover:border-input hover:bg-background"
        />
      )
```

(equivalently for RPE with its pill classes + current aria-label). Remove
the now-unused `Input` import if nothing else in the file uses it.

### Step 3: Consume in the mobile card

Same substitution in `mobile-exercise-card.tsx` (keep the surrounding
`<label>` structure and "Load"/"RPE" caption spans — they're mobile-only
chrome, not widget), passing the mobile classes and "block" aria wording.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.
**Verify** (attribute-parity gate): the following greps each return exactly
2 matches across the two NEW component files and 0 in the two consumer
files: `grep -rn "inputMode=\"numeric\"" frontend/src/components/workout`,
`grep -rn "data-testid={\`load-input" …`, `…rpe-input…`.

### Step 4: Test the widgets

One test file (pattern: `video-cell.test.tsx`), cases:

1. Value precedence: `edited="315"` + `persisted={225}` renders `315`;
   `edited=undefined` renders `225`; `persisted=""` renders empty with
   placeholder.
2. Error state: `error="out of range"` sets `aria-invalid`, `title`, and the
   destructive classes.
3. Handlers: typing calls `onEdit(cellKey, value)`; blur calls
   `onBlur(cellKey, value)`.
4. Testid contract: `load-input-0-1` / `rpe-input-0-1` present for
   `cellKey="0-1"`.

**Verify**: `pnpm vitest run cell-input` (or the chosen filename) → all pass.

### Step 5: Full pass

**Verify**: `pnpm test` → all pass (notably plan 001's
`use-cell-logging.test.tsx` — it tests the hook, not the widgets, and must
be untouched). `pnpm lint`, `pnpm typecheck` → exit 0.

Optional visual check if a dev environment exists: load `/today` at desktop
and mobile widths and compare the inputs against the previous build (they
must be pixel-identical; only the source moved).

## Test plan

Step 4's widget tests (≥ 6 assertions across the two components). Existing
suites unmodified.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Both widget files exist; `workout-table.tsx` and `mobile-exercise-card.tsx` contain no raw `<Input` for load/RPE (grep gate in Step 3)
- [ ] The `data-testid` contract is unchanged (`load-input-${key}` / `rpe-input-${key}`)
- [ ] `pnpm vitest run` for the new test file passes
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `.plan/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plans 011/019 are not DONE (same-file conflicts).
- The two copies turn out to differ BEHAVIORALLY somewhere this plan calls
  them identical (an attribute one has and the other lacks, beyond classes
  and aria wording) — that's either a latent bug or intent; report the
  attribute rather than silently unifying.
- Preserving both contexts' exact appearance requires more than the
  `className`/`wrapperClassName`/`emptyClassName`/`ariaLabel` knobs — the
  variants differ more than planned; report before growing the prop surface.

## Maintenance notes

- Future editor changes (validation UX, a11y, keyboards) happen in ONE place
  now; reviewers should reject any new inline `<Input>` for actuals in a
  table cell or card.
- Plan 024 (un-forked page shell) leaves these widgets untouched — they're
  below the fork.
- If a third context appears (e.g. a History quick-edit), it composes these
  same components — that's the doctrine's rung-3 leaf rule working.
