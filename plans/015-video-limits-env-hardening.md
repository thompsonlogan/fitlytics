# Plan 015: Harden the frontend video-limit env parsing (no module-load crash, no NaN)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/src/hooks/use-set-videos.ts frontend/src/hooks/use-set-videos.test.tsx frontend/.env.example frontend/vite.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — adds fallbacks matching the backend defaults; configured
  environments behave identically.
- **Depends on**: none
- **Category**: bug (DX/robustness)
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

`use-set-videos.ts` reads two Vite env vars at module load with no guard:
`Number(import.meta.env.VITE_MAX_VIDEO_BYTES)` yields `NaN` when the var is
absent — and every `file.size > NaN` comparison is silently `false`, so the
client-side size check disappears without a trace. Worse,
`import.meta.env.VITE_ALLOWED_VIDEO_TYPES.split(...)` throws a `TypeError` on
`undefined` **at module load**, which crashes the entire app for any fresh
checkout without a `frontend/.env` — with a stack trace that says nothing
about env vars. The server enforces the real limits regardless (backend
`MAX_VIDEO_BYTES` default 500 MB, `allowedContentTypes` in
`backend/internal/videos/service.go:26–30`), so the correct client behavior
on missing env is: fall back to those same defaults and warn, not crash.

This also reduces (but does not eliminate) the four-place config duplication
— backend env, frontend env, `frontend/Dockerfile` ARGs, `vite.config.ts`
test env. Serving limits from the API is the full fix; it's recorded as a
deferred follow-up in the maintenance notes because it requires a backend
endpoint + client regeneration.

## Current state

- `frontend/src/hooks/use-set-videos.ts:10–24`:

```ts
// Pre-upload UX hints, sourced entirely from Vite build-time env (see
// frontend/.env). These only drive client-side validation messages and the
// dropzone caption — the server enforces the real limits regardless.
export const MAX_VIDEO_BYTES = Number(import.meta.env.VITE_MAX_VIDEO_BYTES)

export const ALLOWED_VIDEO_TYPES: readonly string[] = import.meta.env.VITE_ALLOWED_VIDEO_TYPES.split(
  ","
).flatMap((t) => {
  const trimmed = t.trim()
  return trimmed ? [trimmed] : []
})

export function isAllowedVideoType(type: string, allowed?: string[]): boolean {
  return (allowed ?? (ALLOWED_VIDEO_TYPES as readonly string[])).includes(type)
}
```

- Consumers of these exports: `use-video-upload.ts` (size/type validation in
  `stageFile`) and `video-media-region.tsx` (drop-zone caption). Their
  behavior must not change when env is present.
- `frontend/vite.config.ts` test-env block sets both vars for CI, with a
  comment saying the module has "no in-code fallback by design (see
  .env.example)" — **this plan changes that design**, so both comments must
  be updated (stale comments are worse than none).
- `frontend/.env.example` documents the two vars (read it before editing —
  match its comment style).
- Backend defaults these must mirror: `524288000` bytes
  (`backend/internal/config/config.go:42`) and
  `video/mp4, video/quicktime, video/webm`
  (`backend/internal/videos/service.go:26–30`).
- Existing tests: `frontend/src/hooks/use-set-videos.test.tsx` (6 tests) —
  they currently rely on the vite test env providing the vars.

## Commands you will need

| Purpose   | Command (run in `frontend/`)        | Expected on success |
|-----------|--------------------------------------|---------------------|
| This test | `pnpm vitest run use-set-videos`     | all pass            |
| All tests | `pnpm test`                          | all pass            |
| Typecheck | `pnpm typecheck`; Lint: `pnpm lint`  | exit 0              |
| Build     | `pnpm build`                         | exit 0              |

## Scope

**In scope**:
- `frontend/src/hooks/use-set-videos.ts`
- `frontend/src/hooks/use-set-videos.test.tsx`
- `frontend/.env.example` (comment update only)
- `frontend/vite.config.ts` (comment update only — keep the test env values)

**Out of scope** (do NOT touch):
- Backend config or a new limits endpoint (deferred follow-up; see
  maintenance notes).
- `frontend/Dockerfile` ARG defaults — already correct and still useful.
- `use-video-upload.ts` / `video-media-region.tsx` — they consume the same
  exports and need no change.

## Git workflow

- Branch: `advisor/015-video-env-hardening`
- Commit style: `fix(frontend): fallbacks for video-limit env vars`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Parse with validated fallbacks

Replace lines 10–20 of `use-set-videos.ts`:

```ts
// Pre-upload UX hints from Vite build-time env, with in-code fallbacks that
// mirror the backend defaults (MAX_VIDEO_BYTES / allowedContentTypes in
// backend/internal/videos + config). The server enforces the real limits
// regardless — these only drive client-side validation messages and the
// dropzone caption, so a missing/garbled var degrades to the defaults with a
// console warning instead of crashing the app at module load.
const FALLBACK_MAX_VIDEO_BYTES = 524_288_000 // 500 MB — keep in sync with backend MAX_VIDEO_BYTES default
const FALLBACK_ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm"]

function readMaxVideoBytes(): number {
  const raw = import.meta.env.VITE_MAX_VIDEO_BYTES as string | undefined
  const n = Number(raw)
  if (raw == null || raw === "" || !Number.isFinite(n) || n <= 0) {
    console.warn(`VITE_MAX_VIDEO_BYTES is missing or invalid (${raw}); using default`)
    return FALLBACK_MAX_VIDEO_BYTES
  }
  return n
}

function readAllowedTypes(): string[] {
  const raw = import.meta.env.VITE_ALLOWED_VIDEO_TYPES as string | undefined
  const types = (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
  if (types.length === 0) {
    if (raw !== undefined) {
      console.warn(`VITE_ALLOWED_VIDEO_TYPES is empty or invalid (${raw}); using defaults`)
    } else {
      console.warn("VITE_ALLOWED_VIDEO_TYPES is not set; using defaults")
    }
    return FALLBACK_ALLOWED_TYPES
  }
  return types
}

export const MAX_VIDEO_BYTES = readMaxVideoBytes()
export const ALLOWED_VIDEO_TYPES: readonly string[] = readAllowedTypes()
```

Keep `isAllowedVideoType` and everything below unchanged. Export the two
`read*` helpers ONLY if the tests need them (Step 3 tests via module re-import
instead — prefer keeping them private).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Update the now-stale comments

1. `frontend/vite.config.ts` — the test-env comment says the module has "no
   in-code fallback by design". Rewrite to: the values are still provided
   here so tests exercise the configured path; the module now falls back to
   backend-mirroring defaults when unset.
2. `frontend/.env.example` — adjust the wording for the two vars to say they
   are optional overrides of the built-in defaults (state the defaults).

### Step 3: Tests

`import.meta.env` is read at module load, so the missing-env cases need a
fresh module instance per case: use `vi.stubEnv` + `vi.resetModules()` +
`await import("./use-set-videos")` inside each test (and
`vi.unstubAllEnvs()` in `afterEach`). Add to `use-set-videos.test.tsx`:

1. **Missing `VITE_MAX_VIDEO_BYTES`** (`vi.stubEnv("VITE_MAX_VIDEO_BYTES", "")`)
   → re-imported `MAX_VIDEO_BYTES === 524_288_000`.
2. **Garbage value** (`"not-a-number"`) → fallback, and `console.warn` called
   (spy on it).
3. **Missing `VITE_ALLOWED_VIDEO_TYPES`** → re-imported list equals the three
   defaults; **the import itself does not throw** (this is the crash
   regression test — assert the dynamic import resolves).
4. **Configured path unchanged**: with the standard test env, the existing 6
   tests pass unmodified.

Note: if `vi.stubEnv` proves unable to override `import.meta.env` for a
static value in your vitest version, the accepted alternative is
`vi.stubGlobal` on `import.meta` — and if neither works, test through the
exported values with `vi.resetModules()` + direct `import.meta.env`
mutation (`import.meta.env.VITE_MAX_VIDEO_BYTES = ""` before the dynamic
import, restoring in `afterEach`). Use whichever works; the assertions stay
the same.

**Verify**: `pnpm vitest run use-set-videos` → all pass (6 existing + ≥ 4 new).

### Step 4: Full pass

**Verify**: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` → all
exit 0.

## Test plan

Step 3's four cases, in the existing `use-set-videos.test.tsx`, following its
current structure. The crash-regression case (dynamic import resolves with no
env) is the one that must exist.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "VITE_ALLOWED_VIDEO_TYPES.split" frontend/src/hooks/use-set-videos.ts` → no match (the unguarded split is gone)
- [ ] `pnpm vitest run use-set-videos` → ≥ 10 tests pass, including the no-env import case
- [ ] The "no in-code fallback by design" comment is gone from `vite.config.ts`
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- None of the three env-stubbing approaches in Step 3 can vary
  `import.meta.env` per test — report the vitest behavior observed rather
  than shipping the fix untested.
- Existing `use-set-videos` tests fail after Step 1 with the standard env —
  the configured path changed, which this plan forbids.

## Maintenance notes

- **Deferred follow-up (the full fix)**: serve the video limits from the API
  (extend `/api/me` or add a config endpoint) so backend and frontend can't
  drift; requires a backend DTO change + `pnpm api_generate` (running
  backend + Docker) — schedule it with a backend-capable environment.
- If the backend defaults ever change, the two `FALLBACK_*` constants here
  must follow (the comments point both ways).
- Reviewer scrutiny: the configured-env path must be byte-for-byte behavior
  identical — only the missing/invalid paths gained behavior.
