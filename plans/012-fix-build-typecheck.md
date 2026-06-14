# Plan 012: Make `pnpm build` pass — clear 143 `tsc -b` errors and fix the no-op `typecheck`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat cb2af4b..HEAD -- frontend/tsconfig.app.json frontend/package.json frontend/src/components/workout/day-board.tsx frontend/src/components/workout/video-upload-dialog.tsx frontend/src/hooks/use-session.ts frontend/src/hooks/use-set-videos.ts frontend/src/lib/program-data.test.ts frontend/src/hooks/use-workout-program.test.tsx`
> If any of those changed since this plan was written, compare the "Current
> state" excerpts against the live files before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches a shared tsconfig and several call sites; behavior must not change)
- **Depends on**: none (independent of 011; can land before or after it)
- **Blocks**: 001 (CI pipeline) — 001's frontend job runs `pnpm build` as its last step.
- **Category**: tech-debt / bug
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

`pnpm build` (`tsc -b && vite build`) fails with **143 TypeScript errors** on
clean `master` — verified at `cb2af4b` in both the main tree and a fresh worktree.
It has been broken silently because `pnpm typecheck` (`tsc --noEmit`) reads the
root `tsconfig.json`, which has `"files": []` and only project *references*;
non-build `tsc` ignores references, so **`typecheck` compiles zero files and
trivially passes**, hiding everything that `tsc -b` (build mode) catches. No CI
runs today, so nothing surfaced it.

The 143 errors are two distinct problems:

1. **128 errors are in the generated OpenAPI client** (`src/services/generated/**`)
   and are all codegen artifacts: 118 "declared but never used" (`noUnusedLocals` /
   `noUnusedParameters`) and 10 "syntax not allowed when `erasableSyntaxOnly` is
   enabled" (parameter properties in `runtime.ts`). These are not bugs — the
   generator emits unused per-model `*FromJSON`/`*ToJSON` imports and non-erasable
   constructor syntax. The three tsconfig flags that flag them are **redundant for
   app code** (ESLint already enforces `@typescript-eslint/no-unused-vars` and
   `erasableSyntaxOnly` is a niche type-stripping flag a Vite/esbuild SPA doesn't
   need) and **fatal for the generated client** (which ESLint ignores). Excluding
   the generated dir from tsconfig does **not** work — TypeScript still checks files
   imported by app code (verified: errors only drop 143→135). The fix is to drop
   the three flags.
2. **15 errors are genuine** app/test type errors that must be fixed individually
   (mostly the generated models marking always-present `id` fields optional, plus
   stale test fixtures and an untyped `import.meta.env`).

When this lands, `pnpm build` passes, `pnpm typecheck` becomes a real check, and
plan 001's CI can go green.

## Current state

### The config that hides everything

`frontend/package.json` scripts (note `typecheck` is the no-op):
```json
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
```
`frontend/tsconfig.json` (root) has `"files": []` + references — which is why
`tsc --noEmit` checks nothing. `frontend/tsconfig.app.json` (`"include": ["src"]`)
is the real app project and carries the three flags to drop:
```jsonc
    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
```

`frontend/eslint.config.js` confirms ESLint already covers unused vars on app code
and ignores generated:
```js
  globalIgnores(['dist', 'src/services/generated/**']),
  // ...
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
  },
```

### The 15 genuine errors (exact list)

Root cause for most: the generated `SetLogResponse.id` (and similar) is typed
`id?: string` (`src/services/generated/models/SetLogResponse.ts:53`), but these IDs
are always present in server responses and are used where a `string` is required.

```
src/components/workout/day-board.tsx(157,34)   TS2345  videosBySetLogId.get(log.id)
src/components/workout/day-board.tsx(241,31)   TS2322  return { sessionId: s.id, setLogId: log.id }
src/components/workout/day-board.tsx(305,9)    TS2322  logs.map(log => ({ setLogId: log.id, body: { actualLoadKg } }))
src/components/workout/day-board.tsx(343,9)    TS2322  logSet.mutateAsync({ setLogId: last.id, ... })
src/components/workout/day-board.tsx(395,11)   TS2322  logs.map(log => ({ setLogId: log.id, body: { state: desired } }))
src/components/workout/video-upload-dialog.tsx(115,39)  TS2345  videosBySetLogId.get(log.id)
src/hooks/use-session.ts(229,25)               TS2345  updatesById.set(log.id, log)
src/hooks/use-session.ts(238,60)               TS2345  updatesById.get(l.id)
src/hooks/use-set-videos.ts(18,9)              TS7006  .map((t) => t.trim())  — t implicitly any
src/hooks/use-workout-program.test.tsx(30,41)  TS2739  ServiceContext value missing sessionsApi, videosApi
src/lib/program-data.test.ts(10,7)             TS2741  ProgramDay fixture missing id
src/lib/program-data.test.ts(12,7)             TS2741  ProgramDay fixture missing id
src/lib/program-data.test.ts(29,24)            TS2345  ProgramDay literal missing id
src/lib/program-data.test.ts(71,22)            TS2345  ProgramDay literal missing id
src/lib/program-data.test.ts(91,11)            TS2741  ProgramDay fixture missing id
```

`ProgramDay` requires `id: string` (`src/lib/program-data.ts:26-35`). `ServiceApis`
requires `authApi, programsApi, sessionsApi, videosApi` (`src/services/data.ts:13-18`).
There is **no** `src/vite-env.d.ts`, so `import.meta.env.VITE_*` is typed `any`,
which is why `use-set-videos.ts:18`'s `.map((t) => ...)` makes `t` implicitly any.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (Windows worktree) | `cd frontend && pnpm install --frozen-lockfile --node-linker=hoisted` | exit 0 |
| Install (Linux/CI) | `cd frontend && pnpm install --frozen-lockfile` | exit 0 |
| Build / full type-check | `cd frontend && pnpm exec tsc -b --force` | exit 0, no errors |
| Count remaining errors | `cd frontend && pnpm exec tsc -b --force 2>&1 \| grep -c "error TS"` | `0` |
| Lint | `cd frontend && pnpm lint` | exit 0 |
| Test | `cd frontend && pnpm test` | exit 0, all pass |
| Build (full) | `cd frontend && pnpm build` | exit 0 |

> On Windows, `pnpm install` may need `--node-linker=hoisted` to avoid a
> path-length error. That flag is local-only; it does not change committed files.
> Use `tsc -b --force` while iterating so the incremental `.tsbuildinfo` cache
> doesn't mask a fresh run.

## Scope

**In scope** (modify/create only these):
- `frontend/tsconfig.app.json` — remove three flags.
- `frontend/src/vite-env.d.ts` — **create**: type the `VITE_*` env vars.
- `frontend/src/components/workout/day-board.tsx` — 5 call-site fixes.
- `frontend/src/components/workout/video-upload-dialog.tsx` — 1 call-site fix.
- `frontend/src/hooks/use-session.ts` — 2 call-site fixes.
- `frontend/src/lib/program-data.test.ts` — add `id` to 5 fixtures.
- `frontend/src/hooks/use-workout-program.test.tsx` — complete the mock `ServiceApis`.
- `frontend/package.json` — make `typecheck` a real check.

**Out of scope** (do NOT touch, even though related):
- `src/services/generated/**` — generated code; never hand-edit. The fix is the
  tsconfig flags, not editing generated files.
- `frontend/tsconfig.json`, `frontend/tsconfig.node.json` — the root no-op is handled
  via the `package.json` script change; do not restructure project references.
- `frontend/src/hooks/use-set-videos.ts` **logic** — you only fix its type error
  indirectly via `vite-env.d.ts`; do not add env fallbacks or change runtime behavior.
- The backend swagger / `pnpm api_generate` — regenerating the client with required
  `id` fields is the real long-term fix but needs a running backend (see plan 009 /
  Maintenance notes). Not in this offline plan.
- `.github/workflows/ci.yml` — plan 001's artifact.

## Git workflow

- Branch: `advisor/012-fix-build-typecheck`
- One commit. Message style matches the repo's conventional-commit log: e.g.
  `fix(frontend): make pnpm build pass — drop codegen-hostile tsconfig flags, fix 15 type errors`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Drop the three codegen-hostile flags from `tsconfig.app.json`

In `frontend/tsconfig.app.json`, delete these three lines from `compilerOptions`:
```jsonc
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
```
Leave `strict`, `noFallthroughCasesInSwitch`, and `noUncheckedSideEffectImports`
in place. (ESLint's `@typescript-eslint/no-unused-vars` continues to enforce
unused-variable detection on app code — these tsconfig flags were redundant there
and only broke the eslint-ignored generated client.)

**Verify**: `cd frontend && pnpm exec tsc -b --force 2>&1 | grep -c "error TS"`
→ should drop from `143` to `15`, and **zero** of the remaining should be in
`src/services/generated/` — confirm with
`pnpm exec tsc -b --force 2>&1 | grep "error TS" | grep -c "src/services/generated"` → `0`.
If any generated-client error remains, STOP and report.

### Step 2: Type the Vite env vars (fixes `use-set-videos.ts:18`)

Create `frontend/src/vite-env.d.ts` with exactly:
```ts
/// <reference types="vite/client" />

// Build-time SPA config. All VITE_* vars are inlined by Vite at build time;
// declaring them here gives import.meta.env.VITE_* precise types instead of
// `any`. Keep in sync with .env.example.
interface ImportMetaEnv {
  readonly VITE_MAX_VIDEO_BYTES: string
  readonly VITE_ALLOWED_VIDEO_TYPES: string
  readonly VITE_API_PROXY_TARGET?: string
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```
With `VITE_ALLOWED_VIDEO_TYPES` typed `string`, `.split(",")` returns `string[]`,
so the `(t) => t.trim()` parameter in `use-set-videos.ts:18` is `string`, not `any`.
Do **not** edit `use-set-videos.ts`.

**Verify**: `cd frontend && pnpm exec tsc -b --force 2>&1 | grep "use-set-videos.ts"`
→ no output (the TS7006 is gone).

### Step 3: Fix the `string | undefined` id call sites (8 errors)

These IDs are always present in server responses; the generated type marks them
optional. Assert non-null at each use, matching the existing "server-guaranteed
id" assumption already relied on elsewhere in these files. Make exactly these edits:

`frontend/src/components/workout/day-board.tsx`:
- line ~157: `videosBySetLogId.get(log.id)` → `videosBySetLogId.get(log.id!)`
- line ~241: `return { sessionId: s.id, setLogId: log.id }` → `return { sessionId: s.id, setLogId: log.id! }`
- line ~305: `logs.map((log) => ({ setLogId: log.id, body: { actualLoadKg } }))` → `...({ setLogId: log.id!, body: { actualLoadKg } })`
- line ~343: `setLogId: last.id,` → `setLogId: last.id!,`
- line ~395: `logs.map((log) => ({ setLogId: log.id, body: { state: desired } }))` → `...({ setLogId: log.id!, body: { state: desired } })`

`frontend/src/components/workout/video-upload-dialog.tsx`:
- line ~115: `return log ? videosBySetLogId.get(log.id) : undefined` → `return log ? videosBySetLogId.get(log.id!) : undefined`

`frontend/src/hooks/use-session.ts`:
- line ~229: `updatesById.set(log.id, log)` → `updatesById.set(log.id!, log)`
- line ~238: `updatesById.get(l.id) ?? l` → `updatesById.get(l.id!) ?? l`

Change nothing else on these lines. Do not add guards/early-returns — the `!`
assertion is the minimal, behavior-preserving fix and matches the contract.

**Verify**: `cd frontend && pnpm exec tsc -b --force 2>&1 | grep -E "day-board.tsx|video-upload-dialog.tsx|use-session.ts"`
→ no output.

### Step 4: Fix the test type errors (7 errors)

`frontend/src/hooks/use-workout-program.test.tsx`, line ~30 — complete the mock
`ServiceApis` (it currently provides only `authApi` + `programsApi`):
```tsx
        value={{ apis: { authApi: {} as never, programsApi: api, sessionsApi: {} as never, videosApi: {} as never } }}
```

`frontend/src/lib/program-data.test.ts` — add an `id` to each `ProgramDay` literal
(the type requires `id: string`). Use any stable string:
- line 10: `const REST_DAY: ProgramDay = { id: "rest", name: "Rest", tag: "OFF", off: true }`
- line 12: `const TWO_EXERCISE_DAY: ProgramDay = {` → add `id: "d1",` as the first property
- line 29: `flattenRows({ name: "Day", tag: "Day" })` → `flattenRows({ id: "d", name: "Day", tag: "Day" })`
- line 71: `totalSets({ name: "x", tag: "x" })` → `totalSets({ id: "x", name: "x", tag: "x" })`
- line 91: `const day: ProgramDay = {` (inside the single-set test) → add `id: "x",` as the first property

These are test fixtures; adding an `id` does not change any assertion.

**Verify**: `cd frontend && pnpm exec tsc -b --force 2>&1 | grep -c "error TS"` → `0`.

### Step 5: Make `typecheck` a real check

In `frontend/package.json`, change the `typecheck` script from the no-op
`tsc --noEmit` (which checks nothing because the root tsconfig has `"files": []`)
to build-mode, which type-checks the referenced projects without emitting (the leaf
configs already set `noEmit: true`):
```json
    "typecheck": "tsc -b",
```

**Verify**: `cd frontend && pnpm typecheck` → exit 0 (and it now actually checks —
confirm it is no longer instantaneous/empty).

### Step 6: Full gate

**Verify**: `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
→ every command exits 0. (`pnpm build` is the one that was failing; it must now pass.)

## Test plan

This plan fixes type errors and changes no runtime behavior, so it adds no new
tests. The test-file edits (Step 4) only satisfy the type checker; do not change
any assertion or `expect(...)`. Existing suites must still pass unchanged
(`pnpm test` → all green, same test count as before).

## Done criteria

ALL must hold (run from `frontend/`):

- [ ] `pnpm exec tsc -b --force 2>&1 | grep -c "error TS"` prints `0`.
- [ ] `pnpm typecheck` exits 0 and runs `tsc -b` (not the no-op).
- [ ] `pnpm build` exits 0.
- [ ] `pnpm lint` exits 0.
- [ ] `pnpm test` exits 0; same number of passing tests as before this plan.
- [ ] `tsconfig.app.json` no longer contains `noUnusedLocals`, `noUnusedParameters`, or `erasableSyntaxOnly`.
- [ ] `src/vite-env.d.ts` exists.
- [ ] No `src/services/generated/**` file was modified (`git status`).
- [ ] `git status` shows only the in-scope files changed/created.
- [ ] `plans/README.md` status row for 012 updated (unless a reviewer maintains the index).

## STOP conditions

Stop and report back (do not improvise) if:

- After Step 1, any `error TS` remains in `src/services/generated/` — the flag set
  is different from what this plan assumes; report the remaining errors.
- After all steps, `pnpm exec tsc -b --force` still reports errors not listed in
  "The 15 genuine errors" — a new error surfaced; report it rather than chasing it.
- A `string | undefined` site in Step 3 turns out to be reachable with an actually
  undefined id (e.g. you find a code path that builds a `SetLogResponse` without an
  id) — report it; a non-null assertion would hide a real bug.
- `pnpm test`'s passing count drops or any previously-green test fails — report it.
- Fixing any error appears to require editing an out-of-scope file (especially
  anything under `src/services/generated/`).

## Maintenance notes

- **Root cause of the `string | undefined` class**: the backend swagger marks
  always-present fields (like `SetLogResponse.id`) as optional, so the generated
  client types them `id?: string`. The proper long-term fix is to mark those fields
  required in the swagger annotations and regenerate the client
  (`pnpm api_generate`, which needs a running backend — see plan 009). When that
  happens, the `!` assertions added in Step 3 become unnecessary and can be removed.
- **Why drop the three flags rather than fix the generated code**: the generated
  client is regenerated from the backend spec; hand-edits are lost on the next
  `pnpm api_generate`. `noUnusedLocals`/`noUnusedParameters` are redundant with
  ESLint for app code, and `erasableSyntaxOnly` targets type-stripping runtimes a
  bundled Vite SPA doesn't use. A reviewer should confirm ESLint still flags unused
  vars in app code after this change (it does — `@typescript-eslint/no-unused-vars`
  is `error`).
- **This unblocks 001.** After it lands, re-run 001's frontend gate on a checkout
  without `.env` to confirm green, then 001 can be marked DONE.
- If `tsc -b` ever feels slow in CI because both `typecheck` and `build` run it,
  consider dropping the standalone `typecheck` step from the CI job (build already
  type-checks). Out of scope here.
