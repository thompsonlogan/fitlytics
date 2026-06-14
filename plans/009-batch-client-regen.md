# Plan 009: Replace the hand-rolled batch fetch with the generated API client

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb2af4b..HEAD -- frontend/src/hooks/use-session.ts frontend/src/services/generated/apis/SessionsApi.ts`
> If either changed, compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S (mechanical) — but has a hard environment prerequisite (see below)
- **Risk**: LOW
- **Depends on**: none. **Soft**: if doing plan 005, that plan defers `useLogSetBatch`
  tests to after this one.
- **Category**: tech-debt
- **Planned at**: commit `cb2af4b`, 2026-06-14

## Why this matters

`useLogSetBatch` hand-rolls a `fetch` with manual JSON field mapping
(`set_log_id`, `reps_actual`, …) instead of using the generated, typed OpenAPI client
the rest of the app uses. The hook's own comment says this is temporary: the batch
route was added after the last client regeneration. Until it's swapped, the batch
request body is untyped — a backend schema change won't surface as a TypeScript error.
This plan regenerates the client and replaces the manual fetch.

> **⚠ Environment prerequisite (read before starting)**: regenerating the client
> requires a **running backend API** and **Docker**. `pnpm api_generate` runs
> `docker compose -f ../tools/docker-compose.yml run --rm main` against the live
> backend's Swagger spec. This plan **cannot be completed in an offline worktree**. If
> you cannot bring up the backend + Docker, STOP immediately and report — do not fake
> the generated method by hand.

## Current state

`frontend/src/hooks/use-session.ts:174-218` — the hand-rolled batch call:
```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""
// …
// NOTE: This hand-rolls a fetch rather than using the generated client because
// the batch route was added after the last api_generate run. Swap to the
// generated method after the next `make swagger && pnpm api_generate`.
export function useLogSetBatch(programId, programDayId) {
  // …
  mutationFn: async (vars: UseLogSetBatchVars): Promise<SetLogResponse[]> => {
    // … reads cached.id …
    const res = await fetch(`${API_BASE_URL}/api/sessions/${cached.id}/set-logs`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: vars.updates.map((u) => ({
          set_log_id: u.setLogId,
          reps_actual: u.body.repsActual,
          actual_load_kg: u.body.actualLoadKg,
          actual_rpe: u.body.actualRpe,
          state: u.body.state,
        })),
      }),
    })
    if (!res.ok) throw new Error(`batch set-log update failed: ${res.status}`)
    const raw: unknown[] = await res.json()
    return raw.map(SetLogResponseFromJSON)
  },
  // … onSuccess cache merge — unchanged …
}
```
- The generated client lives in `frontend/src/services/generated/`. `SessionsApi.ts`
  currently has methods like `apiSessionsSessionIdSetLogsSetLogIdPatch` (single set
  log) but **not yet** a batch method — that's why the fetch is hand-rolled.
- Backend codegen commands: `cd backend && make swagger` (regenerates `docs/swagger.json`),
  then `cd frontend && pnpm api_generate` (regenerates the TS client from it). The
  backend API must be running for nothing here actually — `api_generate` reads the spec;
  but `make swagger` needs the `swag` CLI, and the toolchain expects the standard dev
  setup. Follow the repo's documented flow.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Regenerate backend spec | `cd backend && make swagger` | writes `docs/swagger.json` |
| Regenerate TS client | `cd frontend && pnpm api_generate` | updates `src/services/generated/**` |
| Typecheck | `cd frontend && pnpm typecheck` | exit 0 |
| Tests | `cd frontend && pnpm test` | all pass |
| Lint | `cd frontend && pnpm lint` | exit 0 |

## Scope

**In scope**:
- `frontend/src/services/generated/**` — regenerated output (do not hand-edit; let the
  generator write it).
- `frontend/src/hooks/use-session.ts` — replace the fetch in `useLogSetBatch` with the
  generated method; remove the now-unused `API_BASE_URL` / `SetLogResponseFromJSON`
  imports if they become dead.

**Out of scope** (do NOT touch):
- The `onSuccess` cache-merge logic in `useLogSetBatch` — unchanged.
- The single-set `useLogSet` and other hooks.
- Backend handler/route code — the batch route already exists; you are only
  regenerating its client.

## Git workflow

- Branch: `advisor/009-batch-client-regen`
- One commit (or two: "chore: regenerate API client" + "refactor: use generated batch
  method"); conventional-commit style.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm you can regenerate (prerequisite gate)

Bring up whatever the repo's dev flow requires for codegen and run:
`cd backend && make swagger` then `cd frontend && pnpm api_generate`.

**Verify**: `git status` shows changes under `frontend/src/services/generated/` and the
new method exists —
`grep -rn "set-logs" frontend/src/services/generated/apis/SessionsApi.ts` shows a
**PATCH** operation whose path is `/api/sessions/{sessionId}/set-logs` (the batch
route, distinct from the single-set `/set-logs/{setLogId}` PATCH). Note the exact
generated method name (e.g. `apiSessionsSessionIdSetLogsPatch`) and its request type
(e.g. `BatchUpdateSetLogsRequest`).

If `make swagger` / `pnpm api_generate` cannot run (no Docker, backend won't start),
**STOP and report** — this plan is blocked on environment, not code.

### Step 2: Swap the fetch for the generated method

In `useLogSetBatch`, replace the `fetch(...)` block with a call to the generated method
discovered in Step 1, using `sessionsApi` from `useServices()` (mirror how `useLogSet`
obtains and calls `sessionsApi.apiSessionsSessionIdSetLogsSetLogIdPatch`). The request
body uses the generated request type's camelCase fields, so the manual snake_case
mapping is dropped — pass `{ updates: vars.updates.map((u) => ({ setLogId: u.setLogId, ...u.body })) }`
in whatever shape the generated `*Request` type specifies (check the generated
`models/BatchUpdateSetLogsRequest.ts` and `BatchUpdateSetLogItem.ts`).

Add `const { sessionsApi } = useServices()` at the top of `useLogSetBatch` (it isn't
currently called there). Remove `API_BASE_URL` and the `SetLogResponseFromJSON` import
if the typecheck/lint flags them as unused after the change.

**Verify**: `cd frontend && pnpm typecheck` → exit 0; the `fetch(` and `set_log_id`
strings are gone from `useLogSetBatch` (`grep -n "set_log_id\|API_BASE_URL" frontend/src/hooks/use-session.ts` → no matches).

### Step 3: Full verification

**Verify**: `cd frontend && pnpm lint && pnpm test && pnpm build` → all exit 0.

## Test plan

- No new tests required by this plan (plan 005 covers hook behavior; its `useLogSetBatch`
  tests were deferred to land after this). If plan 005 already added a `useLogSetBatch`
  test against the hand-rolled fetch, update it to stub the generated method instead.
- Verification gate: typecheck + lint + existing tests + build all green, and the manual
  `grep` checks confirming the fetch is gone.

## Done criteria

ALL must hold:

- [ ] `frontend/src/services/generated/apis/SessionsApi.ts` contains the batch PATCH method.
- [ ] `useLogSetBatch` calls that generated method; no `fetch(` / `set_log_id` remain in it.
- [ ] `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all exit 0.
- [ ] `plans/README.md` status row for 009 updated.

## STOP conditions

Stop and report back if:

- You cannot run `make swagger` / `pnpm api_generate` (no Docker / backend) — mark the
  plan **BLOCKED** in the index with that reason; do not hand-write generated code.
- After regeneration the batch PATCH method does **not** appear (the backend route may
  not be in the Swagger spec — the doc-comment annotations might be missing on the
  handler). Report it; adding Swagger annotations to the backend handler is a separate
  task.
- The generated request shape differs materially from what `useLogSetBatch` sends
  (e.g. different field names that would change the wire payload) — report before
  forcing it.

## Maintenance notes

- After this lands, the rule "regenerate the client after adding a route" is enforced
  by types again — a future batch-schema change will fail `pnpm typecheck`.
- If plan 001 (CI) is in place, consider a CI check that fails when `pnpm api_generate`
  produces a diff (drift detection) — noted as a future enhancement, not part of this plan.
