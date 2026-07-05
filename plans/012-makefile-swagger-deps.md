# Plan 012: Fix the Makefile so swagger docs regenerate for ALL handler packages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- backend/Makefile`
> If the Makefile changed since this plan was written, compare the
> "Current state" excerpt against the live file before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — a make prerequisite list; worst case is an unnecessary
  swag re-run (seconds).
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The `docs/docs.go` file rule in `backend/Makefile` only lists
`internal/programs/*.go` and `internal/handlers/*.go` as prerequisites — it
predates the sessions and videos feature slices. Editing a swag doc comment
or a response DTO in `internal/sessions/` or `internal/videos/` does **not**
retrigger regeneration for `make run` / `make build` / `make test`, so the
served `/swagger/doc.json` goes stale — and `pnpm api_generate` then builds
the frontend's typed client from an outdated contract. That's a silent
type-drift vector aimed at exactly the packages where the API actually
evolves.

## Current state

- `backend/Makefile`, the file rule (lines 14–18):

```make
# File rule for the swag-generated package. Re-runs whenever the entrypoint or
# any handler / DTO source changes, which catches most doc-comment edits. Force
# a regeneration regardless by running `make swagger`.
docs/docs.go: cmd/api/main.go $(wildcard internal/programs/*.go) $(wildcard internal/handlers/*.go)
	swag init --generalInfo cmd/api/main.go --output docs --parseInternal
```

- Packages containing swag annotations today (verify with the grep in
  Step 1): `internal/handlers`, `internal/programs`, `internal/sessions`,
  `internal/videos`, `internal/apierr` (the `ProblemDetails` response model),
  `internal/storage` (`PresignedUpload` appears in `CreateVideoUploadResponse`).
- `make swagger` (unconditional) and CI both regenerate correctly — the gap
  is only the incremental file rule used by `run`/`build`/`test`.
- `docs/` is git-ignored; `swag` must be on PATH (`make swagger-install`).

## Commands you will need

| Purpose        | Command (run in `backend/`, bash)      | Expected on success |
|----------------|-----------------------------------------|---------------------|
| Swag on PATH   | `swag --version`                        | prints a version (else `make swagger-install`) |
| Generate once  | `make swagger`                          | exit 0, `docs/docs.go` exists |
| Staleness check| `make --question docs/docs.go`          | exit 0 = up to date; exit 1 = would rebuild |
| Tests          | `make test`                             | ok                  |

## Scope

**In scope**:
- `backend/Makefile` (the `docs/docs.go` prerequisite line and its comment)

**Out of scope** (do NOT touch):
- `.github/workflows/ci.yml` — CI already runs `make swagger`
  unconditionally.
- `backend/Dockerfile` — it runs `swag init` unconditionally too.
- The swag invocation flags themselves (`--parseInternal` is deliberate; see
  the NOTE comment in the Makefile about `--parseDependency`).

## Git workflow

- Branch: `advisor/012-makefile-swagger-deps`
- Commit style: `chore(backend): make swagger docs depend on all annotated packages`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm which packages carry swagger annotations

```
grep -rln "@Summary\|@Description\|@name " backend/internal --include="*.go" | sed 's|/[^/]*$||' | sort -u
```

Expected (as of planning): `backend/internal/apierr`, `backend/internal/handlers`,
`backend/internal/programs`, `backend/internal/sessions`,
`backend/internal/storage`, `backend/internal/videos`. If more appear, the
fix below covers them anyway.

### Step 2: Widen the prerequisite list

Replace the rule's dependency line with a wildcard over all internal
packages (generated packages churn only on `make generate`, and an extra
seconds-long swag run after that is harmless — simpler beats a hand-kept
package list that rots again):

```make
# File rule for the swag-generated package. Re-runs whenever the entrypoint or
# any internal package source changes — swag annotations live across the
# feature slices (handlers, programs, sessions, videos) plus apierr/storage
# response models, so depend on all of internal/ rather than a hand-kept list
# that goes stale when the next feature slice is added.
docs/docs.go: cmd/api/main.go $(wildcard internal/*/*.go) $(wildcard internal/*/*/*.go)
	swag init --generalInfo cmd/api/main.go --output docs --parseInternal
```

(The second wildcard depth covers `internal/models/generated/*.go` — needed
because DTOs may embed generated types; two levels is the repo's maximum
package depth under `internal/`.)

### Step 3: Prove the staleness bug is fixed

All in bash, from `backend/`:

1. `make swagger` → regenerates; `make --question docs/docs.go` → exit **0**
   (up to date).
2. `touch internal/sessions/handler.go` →
   `make --question docs/docs.go` → exit **1** (would rebuild). This is the
   case that failed before the fix.
3. `touch internal/videos/dto.go` → same, exit **1**.
4. `make test` → regenerates docs first, then all packages pass.

**Verify**: the exit codes above, in order: 0, 1, 1, then `make test` ok.

### Step 4 (sanity): the old rule really was broken

Optional but cheap: `git stash`, run check 2 against the original Makefile
(`touch internal/sessions/handler.go && make --question docs/docs.go`) →
exit **0** (wrongly "up to date"), then `git stash pop`. Mention the observed
behavior in your report.

## Test plan

No Go tests apply — the machine-checkable gates are the `make --question`
exit codes in Step 3.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "wildcard internal/\*/\*.go" backend/Makefile` → match on the `docs/docs.go` rule line
- [ ] Step 3's four checks pass with the exact expected exit codes
- [ ] `make test` (backend) → ok
- [ ] Only `backend/Makefile` is modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `swag` is not installable in your environment (`make swagger-install`
  fails) — the rule can't be verified without it.
- Widening the prerequisites makes `make test` rebuild docs on EVERY
  invocation even with no file changes (a wildcard picked up a file that make
  always considers newer, e.g. something regenerating on each run) — report
  which file (`make -d docs/docs.go 2>&1 | grep -i newer | head`) instead of
  narrowing blindly.
- The swag regeneration in Step 3 fails on current sources — the annotations
  themselves have an error unrelated to this plan.

## Maintenance notes

- New feature slices under `internal/` are now covered automatically — no
  Makefile edit needed when `internal/history/` or similar appears.
- The Windows caveat stands: `make` targets here assume a bash-compatible
  environment (Git Bash works); CI is the authoritative runner.
- Reviewer scrutiny: confirm the recipe line itself (swag flags) is
  byte-identical to before — only the prerequisites changed.
