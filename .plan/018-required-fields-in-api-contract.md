# Plan 018: Declare required fields in the API contract so generated types stop being all-optional

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 84d129d..HEAD -- backend/internal/programs/dto.go backend/internal/sessions/dto.go backend/internal/videos/dto.go backend/internal/handlers/me.go backend/internal/storage/store.go frontend/src/lib/program-mapper.ts frontend/src/services/generated/`
> Several in-scope files WILL have drifted if plans 001/002/003/013/019
> landed (expected — those are prerequisites). Compare the "Current state"
> excerpts against the live code for the parts this plan touches; on an
> unexplained mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — regenerates the entire typed client and tightens types
  repo-wide. Mitigations: optional→required is compile-compatible for
  readers (existing `??`/`!` remain valid, just redundant), the backend
  mappers provably always populate the fields being marked, and the full
  frontend suite gates the change.
- **Depends on**: 001, 002, 013, 019 (all touch files this plan cleans up or
  regenerates against); prefer after 015 and 017 too (they touch
  `use-set-videos.ts` / `use-video-upload.ts`).
- **Category**: tech-debt (contract)
- **Planned at**: commit `84d129d`, 2026-07-04

## Why this matters

The swagger spec never marks any response field as `required`, so the
generated TypeScript models make **every** field optional — `id?: string` on
rows whose id cannot be absent. The frontend pays for that undeclared
guarantee on every line: at planning time, 21 of the 47 null-coalescing
fallbacks in the frontend live in `program-mapper.ts` alone, and ~15 non-null
assertions (`log.id!` etc.) overrule the compiler across the hooks. The
backend already guarantees these fields (non-pointer Go struct fields always
serialize; the mappers initialize every slice) — it just doesn't say so.
Declaring `required` in the spec makes the generated types truthful, deletes
the fallback noise at its root, and turns the compiler back into an ally.

## Current state

**Backend response DTOs** (the files to annotate — all hand-written,
none generated):

- `backend/internal/programs/dto.go` — e.g.:

```go
type ProgramSetGroupResponse struct {
	ID       uuid.UUID            `json:"id"`
	Sequence int32                `json:"sequence" example:"1"`
	Sets     []ProgramSetResponse `json:"sets"`
} // @name ProgramSetGroupResponse
```

- `backend/internal/sessions/dto.go` — `SessionResponse`,
  `SessionExerciseResponse`, `SetLogResponse`, `CompletedDayResponse`.
- `backend/internal/videos/dto.go` — `VideoResponse`,
  `CreateVideoUploadResponse`.
- `backend/internal/handlers/me.go` — `MeResponse`.
- `backend/internal/storage/store.go` — `PresignedUpload` (embedded in
  `CreateVideoUploadResponse`):

```go
type PresignedUpload struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
}
```

- `backend/internal/apierr/problem.go` — `ProblemDetails` (`Title`,
  `Status`, `Detail` are always set; `Type`/`Instance` are omitempty and
  stay optional).

**The rule for what gets marked required**: every field that is (a) a
non-pointer scalar/struct (Go zero-values still serialize — always present),
or (b) a slice that the mapper provably initializes with `make(...)`.
Pointer fields with `omitempty` stay optional — they're genuinely nullable.
Slice-initialization evidence (verified at planning time):
`programs/mapper.go` builds every `Weeks/Days/Exercises/Groups/Sets` with
`make(..., 0, len(...))`; `sessions/mapper.go` likewise for
`Exercises`/`SetLogs`. `PresignedUpload.Headers` is built with `make` in
`storage/r2.go:62`. Re-verify during execution (STOP condition if any nil
slice can escape).

**How swag emits `required`**: swag (v1.16.x, pinned in `backend/Makefile` /
CI) marks a schema property required when the struct field carries a
`binding:"required"` or `validate:"required"` tag. This repo already uses
`binding:"required"` on request DTOs (e.g. `sessions/dto.go:74`
`BatchUpdateSetLogItem.SetLogID`), so use `binding:"required"` on response
DTOs too for consistency — gin never binds responses, so the tag is inert at
runtime.

**Client regeneration**: the normal path is `cd frontend && pnpm api_generate`
(docker compose in `tools/`, hits a **running** backend at
`host.docker.internal:8080/swagger/doc.json`). Booting the backend requires a
full `.env` (WorkOS JWKS is fetched at startup). The file-based alternative
needs no running backend: `make swagger` writes `backend/docs/swagger.json`,
then run the same generator image against the file:

```bash
cd /c/Users/Logan/OneDrive/Desktop/Github/fitlytics
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd)/backend/docs:/spec:ro" \
  -v "$(pwd)/frontend/src/services/generated:/local" \
  openapitools/openapi-generator-cli generate \
  -i /spec/swagger.json -g typescript-fetch -o /local
```

(Same image, generator, and output dir as `tools/docker-compose.yml` — just
`-i` pointed at the file. `MSYS_NO_PATHCONV=1` stops Git Bash mangling the
`/spec` paths on Windows.)

**Frontend cleanup targets** (post-regeneration): the `?? <default>`
fallbacks in `frontend/src/lib/program-mapper.ts` on now-required fields, and
the `!` assertions on API-model fields in
`frontend/src/components/workout/use-cell-logging.ts`,
`use-day-board.ts`, `frontend/src/hooks/use-session.ts`, and
`use-video-upload.ts` (e.g. `log.id!`, `v.setLogId`).

## Commands you will need

| Purpose        | Command                                             | Expected on success |
|----------------|------------------------------------------------------|---------------------|
| Regenerate spec| `cd backend && make swagger`                         | exit 0; `docs/swagger.json` updated |
| Spec check     | `grep -c '"required"' backend/docs/swagger.json`     | > 0 (was 0 for response models) |
| Backend tests  | `cd backend && go test ./... && go vet ./...`        | ok / exit 0         |
| Regenerate client | file-based docker command above (or `pnpm api_generate` with a running backend) | exit 0; `generated/` diff shows fields losing `?` |
| Frontend gates | `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build` | all exit 0 |

## Scope

**In scope**:
- The six backend files listed above (tag additions ONLY — no field, type,
  or JSON-name changes)
- `backend/docs/` (regenerated, git-ignored — no commit)
- `frontend/src/services/generated/**` (regenerated wholesale — commit the
  result; this is the one plan allowed to change this directory, via the
  generator only, never by hand)
- `frontend/src/lib/program-mapper.ts`, `frontend/src/hooks/use-session.ts`,
  `frontend/src/components/workout/use-cell-logging.ts`,
  `frontend/src/components/workout/use-day-board.ts`,
  `frontend/src/components/workout/use-video-upload.ts` (redundant-guard
  cleanup only)

**Out of scope** (do NOT touch):
- Request DTO validation semantics — `binding:"required"` on request types
  already has runtime meaning; don't add/remove any there.
- Any behavioral change: no handler, mapper-logic, or component changes
  beyond deleting now-redundant `??`/`!`.
- Hand-editing anything under `frontend/src/services/generated/`.
- `ProblemDetails.Type` / `.Instance` and every pointer+omitempty field —
  genuinely optional, leave them.

## Git workflow

- Branch: `advisor/018-required-api-contract`
- Commit style: `refactor(api): declare required response fields; regenerate typed client`
  (two commits is fine: backend tags + regen, then frontend cleanup)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Tag the backend response DTOs

In each listed file, add `binding:"required"` to every field matching the
rule (non-pointer, or mapper-initialized slice). Example — before/after for
`ProgramSetGroupResponse`:

```go
type ProgramSetGroupResponse struct {
	ID       uuid.UUID            `json:"id" binding:"required"`
	Sequence int32                `json:"sequence" binding:"required" example:"1"`
	Sets     []ProgramSetResponse `json:"sets" binding:"required"`
} // @name ProgramSetGroupResponse
```

Field-by-field guide (apply the rule; this list is the expected outcome):

- `programs/dto.go`: `ID`, `Name`, `CreatedAt`, `UpdatedAt`, `Weeks`,
  `Sequence`, `Days`, `IsRestDay`, `Exercises`, `ExerciseID`,
  `ExerciseName`, `Groups`, `Sets`, `SetType`, `PrescribedLoadModifier` —
  required. All `*T` + omitempty fields — not.
- `sessions/dto.go`: `SessionResponse.{ID,UserID,State,Exercises}`;
  `SessionExerciseResponse.{ID,Sequence,ExerciseID,ExerciseNameSnapshot,SetLogs}`;
  `SetLogResponse.{ID,Sequence,SetType,PrescribedLoadModifier,ActualLoadModifier,State}`;
  `CompletedDayResponse.{WeekSequence,DaySequence}`.
- `videos/dto.go`: `VideoResponse.{ID,SetLogID,Status,CreatedAt}`;
  `CreateVideoUploadResponse.{Video,Upload}`.
- `handlers/me.go`: everything except `Email` (a `*string` omitempty).
- `storage/store.go`: `PresignedUpload.{URL,Method,Headers}`.
- `apierr/problem.go`: `Title`, `Status`, `Detail`.

Before tagging each slice field, confirm its mapper initializes it (grep the
package's `mapper.go` for `make(`) — see STOP conditions.

**Verify**: `cd backend && go test ./... && go vet ./...` → ok (tags are
inert; nothing should change behavior).

### Step 2: Regenerate and inspect the spec

`cd backend && make swagger`, then confirm swag honored the tags:

```
python -c "import json;d=json.load(open('backend/docs/swagger.json'));m=d['definitions'];print({k:v.get('required') for k,v in m.items() if 'required' in v})"
```

(or eyeball `grep -A3 '"required"' backend/docs/swagger.json | head -40`).
Expected: `required` arrays on `ProgramResponse`, `SessionResponse`,
`SetLogResponse`, `VideoResponse`, `MeResponse`, `ProblemDetails`, etc.,
containing exactly the JSON names you tagged.

**STOP** if no `required` arrays appear — the swag version in use doesn't
honor the tag form chosen; try `validate:"required"` instead, and if that
also fails, report.

### Step 3: Regenerate the frontend client

Run the file-based generator command from "Current state" (or
`pnpm api_generate` if you have a configured, running backend). Inspect the
diff: fields you marked lose their `?` (e.g. `SetLogResponse.id?: string` →
`id: string`); untagged fields keep it.

**Verify**: `cd frontend && pnpm typecheck` → exit 0 (required-ward moves
can't break readers; if typecheck fails, a WRITE site constructs a model
without a now-required field — usually a test factory; fix the factory to
supply the field, e.g. `makeSetLog` already sets `id`).

### Step 4: Delete the now-redundant guards

With the truthful types in place:

1. `program-mapper.ts`: remove `?? ""` / `?? 0` on fields that are now
   required (`id`, `name`, `sequence`, the tree arrays). Keep fallbacks on
   genuinely-optional fields (`tag`, `notes`, `startDate`, `repsMin/Max`,
   loads, `subText`, `restSeconds`).
2. Hooks/components: remove `!` on now-required fields — `log.id!` →
   `log.id` in `use-cell-logging.ts`, `use-day-board.ts`,
   `use-video-upload.ts`; `log.id!` map keys in `use-session.ts`.
3. Sweep for stragglers:
   `grep -rn "\.id!" frontend/src --include="*.ts*" | grep -v generated` →
   should return nothing.

Do NOT chase optionality on genuinely-nullable fields — the goal is deleting
lies, not deleting all defensiveness.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 5: Full gates

**Verify**: `cd frontend && pnpm test && pnpm build` → all pass / exit 0.
**Verify**: `cd backend && go test ./...` → ok.

The existing mapper/hook tests are the behavioral gate: `program-mapper.test.ts`,
`use-session.test.tsx`, `use-cell-logging.test.tsx` (from plan 001), etc.
must pass — factories may need required fields added (that's expected and
fine), but **assertions must not change**.

## Test plan

No new tests — this plan makes existing types truthful. The gates: the spec
`required` check (Step 2), the regenerated-client diff (Step 3), and the full
existing suites passing with unchanged assertions (Step 5).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `backend/docs/swagger.json` contains `required` arrays for the response models (Step 2 check)
- [ ] Regenerated client committed; `git diff --stat` shows only generator output under `frontend/src/services/generated/`
- [ ] `grep -rn "\.id!" frontend/src --include="*.ts*" | grep -v generated` → no output
- [ ] `?? ` count in `program-mapper.ts` dropped (report before/after; expected roughly 21 → ≤ 10)
- [ ] `go test ./...`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass
- [ ] No test ASSERTION changed (factories may gain fields)
- [ ] `.plan/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 2 produces no `required` arrays under either tag form — the swag
  version doesn't support this; report the version and output.
- A slice field you're about to tag is NOT `make`-initialized in its mapper
  (nil → JSON `null` → a required array that can be null at runtime) — list
  it; the fix is initializing it in the mapper, which is a behavior change
  needing a decision.
- The regenerated client diff shows changes beyond optionality (renamed
  models, different serializers) — the generator image moved under you;
  report the image digest and diff summary.
- Prerequisite plans (001/002/013/019) are not DONE in `.plan/README.md`.

## Maintenance notes

- **New response DTO fields must carry `binding:"required"` when
  always-present** — otherwise the optional-noise creep restarts. Worth a
  line in CLAUDE.md's conventions (plan 020 adds a related convention; add
  this there or in review).
- The generator image is unpinned (`openapitools/openapi-generator-cli`
  latest) in both `tools/docker-compose.yml` and this plan's command;
  pinning it is a sensible tiny follow-up if regeneration churn appears.
- Reviewers should spot-check one runtime response (e.g. `/api/me` via
  swagger UI in dev) against the spec if any doubt remains about a marked
  field.
