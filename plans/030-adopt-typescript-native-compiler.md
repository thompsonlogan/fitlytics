# Plan 030: Adopt the TypeScript 7.0 native (Go) compiler for the frontend

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **This plan starts with a mandatory spike (Step 1).** The unknown is not
> "can we run the native `tsc`" — it is "can `typescript-eslint` keep working
> alongside it." Do not touch the committed `package.json` until the spike has
> answered that.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- frontend/package.json frontend/pnpm-lock.yaml frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/eslint.config.js .github/workflows/ci.yml frontend/Dockerfile`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH — swaps the compiler under `typecheck`/`build` (the CI gate
  for every frontend PR) and forces a side-by-side arrangement so
  `typescript-eslint` keeps working. A misstep breaks CI for all frontend
  work. Mitigated by the Step 1 spike and a documented fallback.
- **Depends on**: none hard, but **prefer to run AFTER plan 018**
  (client regeneration) and after the round-4 responsive plans have settled —
  018 rewrites large swaths of typed code and would otherwise force you to
  re-triage any new 7.0 type errors twice.
- **Category**: maintenance / dependencies / DX
- **Planned at**: authored 2026-07-11 against HEAD of `docs/improvement-plans`
  (round 6 — toolchain currency)

## Why this matters

TypeScript **7.0** — the compiler and language service rewritten in Go
("Project Corsa") — reached GA on 2026-07-08 and ships as the native `tsc`
under the normal `typescript@latest` npm tag. Microsoft reports ~8–12× faster
full builds and type-checks; the port deliberately preserves the same
algorithms and type-checking **semantics** as 6.0. This repo type-checks via
`tsc -b` (project references) in both `pnpm typecheck` and `pnpm build`, so it
is a direct beneficiary — a green migration means dramatically faster CI and
local `typecheck`.

**The catch that defines this plan**: TypeScript 7.0 ships **without a stable
programmatic compiler API** (Microsoft targets that for 7.1, "at least several
months" out). Tools that `import` the TypeScript API — notably
`typescript-eslint` — cannot consume 7.0 directly. Microsoft's supported
answer is **side-by-side**: run native `tsc` (7.0) for compilation while
tooling keeps the 6.0-compatible API via the `@typescript/typescript6` package
(which also exposes a `tsc6` binary to avoid a name clash). So this is not a
one-line version bump; it is a compiler swap plus a tooling-compat wiring.

## Current state

- `frontend/package.json` devDependencies:

```json
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.57.1",
```

  Scripts of interest:

```json
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b",
    "lint": "eslint .",
```

  Note the repo is on **5.9**, not 6.0. TypeScript 6.0 was the transitional
  release that turned the deprecations 7.0 now hard-enforces into warnings.
  Jumping 5.9 → 7.0 semantics in one hop may surface new type errors that a
  6.0 stopover would have flagged as warnings first (see Step 3 and the
  Option B note).

- `frontend/tsconfig.json` — solution file, `references` to
  `tsconfig.app.json` + `tsconfig.node.json`, `files: []`. The native compiler
  supports **build mode / project references / incremental** (all marked done
  upstream), so `tsc -b` against this layout is expected to work.

- `frontend/tsconfig.app.json` — `strict: true`, `moduleResolution: "bundler"`,
  `verbatimModuleSyntax: true`, `noEmit: true`, `skipLibCheck: true`. The
  vendored client in `src/services/generated/**` is part of the type program
  (the comment at lines 21–26 explains why `noUnusedLocals` etc. are omitted);
  do not "fix" generated code to satisfy 7.0 — if 7.0 flags it, that is a
  finding to report.

- `frontend/eslint.config.js` — extends `tseslint.configs.recommended` (the
  **non-type-checked** preset; no `parserOptions.project`/projectService).
  That means no full type-information program is built for linting — but the
  `typescript-eslint` **parser still imports the TypeScript compiler** to build
  the AST, so the 7.0 API gap still applies. The compat package is what keeps
  the parser working.

- `.github/workflows/ci.yml` — frontend job runs `pnpm typecheck`, `pnpm lint`,
  `pnpm test`, `pnpm build` on Node 22 with pnpm. `pnpm install --frozen-lockfile`
  gates on the lockfile.

- `frontend/Dockerfile:4` — `FROM node:22-alpine AS build`, runs `pnpm build`.
  **Alpine is musl, not glibc.** The native `tsc` ships as per-platform
  prebuilt binaries; Step 5 must confirm a **linux musl** binary resolves in
  the Alpine image, exactly as one would check for `esbuild`/`@swc` native
  optional deps.

## Approach: recommended vs alternative

**Option A — hybrid side-by-side (recommended, this plan's path):**
Install native `typescript@7` for `tsc` (typecheck/build) and give
`typescript-eslint` the 6.0-compatible API via `@typescript/typescript6`.
Everything stays on one branch; the compiler is fast, lint keeps working.

**Option B — stage through 6.0 first (fallback if Step 3 explodes):**
First bump 5.9 → 6.0, drive `typecheck` to green against 6.0's stricter
defaults (deprecations become errors), ship that, *then* do Option A. Heavier,
two PRs, but it isolates "new type errors from stricter semantics" from
"compiler swap." Escalate to Option B only if Step 3 surfaces a large,
entangled set of new type errors (STOP condition below).

## Commands you will need

| Purpose        | Command (run in `frontend/`)                 | Expected |
|----------------|----------------------------------------------|----------|
| Install        | `pnpm install` (`--node-linker=hoisted` on MAX_PATH) | exit 0 |
| Native version | `pnpm exec tsc --version`                    | reports 7.0.x |
| Typecheck      | `pnpm typecheck`                             | exit 0 |
| Lint           | `pnpm lint`                                  | exit 0 |
| Test           | `pnpm test`                                  | all pass |
| Build          | `pnpm build`                                 | exit 0 |

## Scope

**In scope**:
- `frontend/package.json` (dependency swap + any `overrides`/alias needed to
  wire `typescript-eslint` to the compat API)
- `frontend/pnpm-lock.yaml` (regenerated by install)
- `frontend/eslint.config.js` (only if the compat wiring needs a parser/
  `programmatic` option — prefer to avoid)
- `.github/workflows/ci.yml` (only if install/caching needs adjustment)
- `frontend/Dockerfile` (only if the musl-binary check in Step 5 requires it)

**Out of scope** (do NOT touch):
- `frontend/src/services/generated/**` — vendored, regenerated by
  `pnpm api_generate`. If 7.0 flags it, report; do not edit.
- Application source under `frontend/src/**` — a compiler swap should need
  **zero** app-code edits. If 7.0's stricter semantics demand code changes,
  that is Step 3's finding to report and size, not a free-for-all refactor.
- `tsconfig.*` compiler *options* — keep the type-check configuration
  identical so any new errors are attributable to the compiler, not a config
  change. (Editing the `references`/paths is not needed.)
- Backend, database.

## Git workflow

- Branch: `advisor/030-adopt-typescript-native-compiler`
- Commit style: `chore(frontend): adopt the TypeScript 7.0 native compiler`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1 (MANDATORY SPIKE): prove `typescript-eslint` survives

Before editing the committed manifest, verify the two moving parts in a
throwaway install:

1. Native `tsc` type-checks the repo:
   - Temporarily install `typescript@7` and run `pnpm typecheck`.
   - Capture the full error list (expected: some, none, or many — Step 3 sizes
     it). `pnpm exec tsc --version` must report 7.0.x.
2. `typescript-eslint` can resolve a compatible compiler API:
   - Confirm the current `typescript-eslint@8.57.1` (or the minimum version
     that documents 7.0/compat support — check its release notes) works when
     the TypeScript API is provided by `@typescript/typescript6`.
   - Run `pnpm lint`; it must exit 0 with no "cannot find/parse TypeScript"
     class of error.

**Decision gate**: if `typescript-eslint` cannot be made to parse under any
supported wiring (compat package or a version that supports 7.0), **STOP** and
report — the ecosystem isn't ready for this repo yet and the plan should park
as BLOCKED rather than force it.

Record the exact package names/versions that worked; Steps 2–4 encode them.

### Step 2: Wire the dependencies (Option A)

In `frontend/package.json`:

- Set `typescript` to the native GA line (`^7.0.0`), which provides `tsc` for
  `typecheck`/`build`.
- Add `@typescript/typescript6` (the 6.0-compat API + `tsc6`) and wire
  `typescript-eslint` to consume it, using the mechanism the Step 1 spike
  proved (an npm alias for the tool's `typescript` peer, a pnpm `overrides`
  entry, or a `typescript-eslint` version that resolves it natively — use
  whichever the spike validated, and comment *why* in `package.json`).

Keep the `typecheck`/`build`/`lint` script strings unchanged — `tsc` now
resolves to the native binary; `eslint` reads the compat API.

**Verify**: `pnpm install` → exit 0; `pnpm exec tsc --version` → 7.0.x.

### Step 3: Triage new type errors from 7.0 semantics

Run `pnpm typecheck` and classify every new error:

- **Generated code** (`src/services/generated/**`): do NOT edit. If 7.0 flags
  it, note it — a client regeneration (plan 018) or a `skipLibCheck`-adjacent
  setting is the right lever, reported separately.
- **App code**: 7.0 preserves 6.0 semantics, so genuine new errors are most
  likely 6.0 deprecations now hard-enforced. If the set is **small and
  mechanical** (a handful of clearly-correct fixes), apply them and note each
  in the PR. If it is **large or entangled** (broad `any` fallout, many files,
  or anything needing a real refactor), **STOP** and recommend Option B
  (stage through 6.0 as its own plan) rather than absorbing it here.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Full frontend gate

```bash
cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**Verify**: all exit 0. `pnpm build` runs `tsc -b && vite build`; confirm the
`tsc -b` half is the native compiler (it will be noticeably faster). Vite/
Vitest transpile via esbuild and do not need the TypeScript API, so they are
expected to be unaffected — confirm, don't assume.

### Step 5: CI + Docker (musl) validation

- `.github/workflows/ci.yml`: usually no change — `pnpm install --frozen-lockfile`
  picks up the new lockfile. Only touch it if the native binary needs a
  platform/caching tweak; report if so.
- `frontend/Dockerfile` (`node:22-alpine`, musl): build the image and confirm
  `pnpm build`'s `tsc -b` step resolves a **musl** native binary and succeeds:

```bash
docker build -t fitlytics-web:ts7 frontend
```

  If no musl binary resolves (analogous to an esbuild platform miss), report
  the resolution error. A switch to a glibc base (`node:22-slim`) is a possible
  remedy but is a **STOP-and-ask** decision, not an in-plan change.

**Verify**: the frontend image builds. Skip only if Docker is unavailable, and
say so — but the Alpine/musl risk is real and should be validated before this
lands in production.

## Test plan

No new unit tests — this is a toolchain swap. The gate is the existing suite
plus `typecheck`/`lint`/`build` all green under the native compiler, and a
successful Docker build proving the musl binary resolves. Record the observed
`pnpm typecheck` wall-clock before/after as evidence of the speedup.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm exec tsc --version` (in `frontend/`) reports a 7.0.x version
- [ ] `frontend/package.json` pins `typescript` to `^7` and wires
      `typescript-eslint` to the 6.0-compat API (with an explanatory comment)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all exit 0
- [ ] No files under `frontend/src/services/generated/**` were modified
- [ ] App-code edits (if any) are limited to mechanical 6.0-deprecation fixes,
      each called out in the PR description
- [ ] The frontend Docker image builds (musl native binary resolves) — or the
      Alpine/musl risk is explicitly reported if Docker was unavailable
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1: `typescript-eslint` cannot be made to parse under any supported
  wiring → park this plan as BLOCKED (ecosystem not ready).
- Step 3: new 7.0 type errors are large/entangled or would require real
  refactors or edits to generated code → recommend Option B (stage via 6.0).
- Step 5: no musl native `tsc` binary resolves in the Alpine image → report;
  the glibc-base switch is an operator decision.
- You find yourself wanting to change `tsconfig` compiler options or edit app
  source beyond mechanical deprecation fixes — that means the swap grew into a
  semantics migration and should be re-scoped.

## Maintenance notes

- The side-by-side arrangement is **temporary**: when TypeScript **7.1** ships
  the stable programmatic API and `typescript-eslint` supports it natively,
  drop `@typescript/typescript6` and the alias/override, and put
  `typescript-eslint` back on a plain `typescript@7` peer. Leave a comment in
  `package.json` pointing here so the cleanup isn't forgotten.
- Watch `typescript-eslint` release notes for a version that declares 7.0/7.x
  support — adopting it may simplify or remove the compat wiring entirely.
- Vue/Svelte/Angular-template and other API-dependent tooling remain blocked on
  7.1; not relevant to this React repo, but note it if the stack grows.
- Keep this plan's compiler swap separate from any `tsconfig` tightening
  (e.g. enabling `noUnusedLocals` once the generated-code constraint is lifted
  by plan 018) — one concern per change.
- Independent of the Go toolchain bump
  ([[029-upgrade-go-toolchain]]); order between them doesn't matter.
