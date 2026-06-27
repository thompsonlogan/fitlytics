# Database Improvement Plan

Status: **Draft — implementation-ready pending final approval.** No implementation started.

This plan finalizes the schema **directly in `V1__001_init.sql`** rather than layering
versioned migrations. There is no production database yet and dev uses Flyway
`clean migrate`, so the cheapest, cleanest path is to edit V1 + seeds + codegen + backend
+ OpenAPI client + frontend **together** and verify from a clean reset.

> Gate: this approach assumes **no deployed or shared database** whose Flyway checksums
> anyone depends on. Confirm before starting. Once deployed, the
> [pre-deployment checklist](#pre-deployment-checklist) takes over and further schema
> changes become real forward migrations.

## Workflow

Each change is applied as a coordinated pass, not a migration:

1. Edit `V1__001_init.sql` (and repeatable migrations) directly.
2. Update `R__seed_dev_data.sql` to match (renamed columns, one-row-per-set, denormalized
   ids, equipment rows, etc.). **There is no production data, so there is no backfill** —
   "populate existing rows" everywhere means *update the dev seed and the snapshot writer*.
3. Update `backend/cmd/gen/main.go` for new/changed tables, types, and relationships.
4. `make db-reset` → `make generate` → fix backend (DTOs/mappers/services/repositories/triggers).
5. `make swagger` → `pnpm api_generate` → fix frontend consumers.
6. `make test` + `pnpm test` + `pnpm typecheck`, then a final **clean reset** to verify end to end.

There is **no need to preserve the existing API contract** — no external consumers
pre-deployment.

---

## Confirmed decisions (this revision)

- **V1 is strength-only.** Cardio/timed/distance columns and enum values are removed (§1).
- **Programs are hard-deleted** (cascade); **`program_runs` survive** via
  `program_id ON DELETE SET NULL`; history lives in session snapshots (§6, §7).
- **`programs.start_date` is kept** as the default that seeds a new run's `anchor_date` (§6).
- **Grouping is a `program_set_groups` entity**; `program_sets.group_id` FKs to it,
  `set_logs.group_id` snapshots it (§3).
- **Equipment is a lookup table, canonical-only for V1** (§4).
- **One current run** per user/program (active or paused), lazily created at session start,
  resolved server-side (§6).
- **Analytics consistency (`set_logs.exercise_id`) is enforced by a declarative composite FK, not a
  trigger** (§5); `user_id` and column immutability are documented application invariants.

---

## 1. Remove unused schema

Confirmed unused by cross-referencing every column against hand-written code **and** the
frontend (mapping into an ignored response is not usage).

**Drop:**

- **`extras jsonb`** everywhere it exists. (Was meant to back program-builder custom columns —
  wrong tool; see Deferred features.)
- **`exercises_resolved` view** — defined, never queried. Delete the repeatable file.
- **Unused notes** — `program_weeks.notes`, `program_exercises.notes`, `program_set_targets.notes`,
  `session_exercises.notes`, `set_logs.notes`. **Keep `program_days.notes`** (seeded + rendered).
- **`set_logs.started_at`** — per-set start time never captured.
- **`sessions.scheduled_for`** (+ `sessions_user_scheduled_idx`) — scheduling is sequence-driven.
- **`user_metrics`** — the whole wellness table + its `cmd/gen` entry (deferred feature).
- **Cardio/distance (strength-only):** `program_set_targets.duration_target_sec` /
  `distance_target_m`; `set_logs.duration_target_sec` / `distance_target_m` /
  `duration_actual_sec` / `distance_actual_m`. **Prune** `'timed'` and `'distance'` from the
  `set_type` and `load_type` enums.
- **Unused `session_state` values:** rollup only produces `planned`, `in_progress`, `completed`;
  **remove `skipped` and `partial`**. (Keep `set_log_state` as-is — `skipped` *is* used in the
  set-level rollup.)
- **Redundant index** `set_videos_setlog_idx` (the unique partial `set_videos_setlog_uq` covers it).

**Keep (verified used or load-bearing):** `sessions.notes`, `set_videos.note`,
`program_days.notes`, the name **snapshots**, **`set_logs.completed_at`** (kept + populated,
§5/§8), and the **exercise metadata** (analytics substrate).

---

## 2. Finalize naming (one pass)

| Old | New | Notes |
|---|---|---|
| `users.unit_pref` | `unit_preference` | incl. JSON + frontend |
| `program_days.week_id` | `program_week_id` | **delete** `WeekID` GORMTag override (`cmd/gen/main.go:138-143`) |
| `program_exercises.day_id` | `program_day_id` | **delete** `DayID` GORMTag override (`cmd/gen/main.go:130-136`) |
| `sessions.program_name_snap` / `day_name_snap` | `*_snapshot` | JSON + frontend |
| `session_exercises.exercise_name_snap` / `sub_snap` / `rest_seconds_snap` | `*_snapshot` | rendered |
| `set_logs.block_sequence` (int) | `group_id` (uuid) | **type/model replacement**, not just a rename — see §3 |
| `program_set_targets` (table) | `program_sets` | accurate only because of §3 |

`programs.owner_user_id` is **kept** (authorization key).

---

## 3. Normalize program sets (one row per set)

Replace `program_set_targets` with **`program_sets`** (one row = one prescribed set) plus a
**`program_set_groups`** table that owns grouping identity and order. Groups have a real attribute
— display order — so they justify being entities; this enforces ownership and ordering with
FKs/uniques instead of a concurrency-fragile trigger, and stops `group_sequence` from being
repeated (and drifting) across every set in a group.

- **`program_set_groups`** — `id uuid pk, program_exercise_id uuid not null references
  program_exercises(id) on delete cascade, sequence int not null check (sequence > 0)`;
  **`unique(program_exercise_id, sequence)`** (group display order within the exercise).
- **`program_sets`** — `id uuid pk, group_id uuid not null references program_set_groups(id)
  on delete cascade, sequence int not null check (sequence > 0)`; **`unique(group_id, sequence)`**
  (set order within the group). Absolute set order within an exercise = group `sequence`, then set
  `sequence`. `program_exercise_id` is **not** duplicated on `program_sets` — it's reached through
  the group, so **a group cannot span exercises by construction** (the FK does it, no trigger).
- **Drop `sets_count`** (count = number of rows in a group).
- Keep per-set on `program_sets`: `set_type`, `reps_min/max`, `prescribed_load_kg`,
  `prescribed_load_modifier`, `cap_load_kg`, `prescribed_rpe`, `intensity_text`. No `notes`/`extras`.

**`set_logs.group_id`:** `uuid` **NULL** (null for ad-hoc sets). It is a **snapshot of the
originating `program_set_groups.id`, copied at session start — NOT an FK** (program groups are
editable/deletable; the session must freeze the value). Group ids therefore **intentionally repeat
across sessions** and are **not unique** in `set_logs`; the session view collapses sets sharing a
snapshotted `group_id`.

**Out of scope — this plan is data-design cleanup only, no UI changes.** A program *editor*
(grouped insert/delete/reorder/split/merge on `program_set_groups`/`program_sets`) is a future
product feature, not part of this plan; the normalization just makes it possible. Programs stay
read-only here. (Frontend touches in this plan are limited to keeping the existing client/mapper
working against changed API shapes.)

---

## 4. Canonical exercise model + equipment

### Canonical exercises

Add **`is_canonical boolean not null default false`** and enforce via a **composite FK** (chosen
over a trigger):

- `unique(exercises.id, is_canonical)`.
- Generated helper: `canonical_ref_flag boolean generated always as
  (case when canonical_id is null then null else true end) stored`.
- FK **`(canonical_id, canonical_ref_flag) references exercises(id, is_canonical)`** — forces any
  `canonical_id` to point at a row with `is_canonical = true`; when `canonical_id` is null the
  helper is null and the FK is not enforced (both columns null together is allowed).
- Row-local CHECKs: `canonical_id <> id`; `not (is_canonical and canonical_id is not null)`.
- Together these make **canonical-reference cycles structurally impossible** (depth-1 graph:
  custom → canonical). Canonical rows require a globally unique `slug`
  (partial unique `where is_canonical`); custom slugs don't participate.

### Exercise ownership after user deletion

**Key correction:** `users` are **soft-deleted** (GORM sets `deleted_at`; no SQL `DELETE`), so
`created_by_user_id … ON DELETE SET NULL` **does not fire** during normal deletion.

- **Default (soft delete):** the custom exercise **retains attribution** to the soft-deleted user
  and stays private. No orphaning. (This is the normal path.)
- **Hard delete / GDPR erasure:** `SET NULL` fires → the exercise becomes ownerless; with
  `is_canonical = false` it remains a **private, inaccessible historical record**. `program_exercises`
  / `session_exercises` reference exercises `ON DELETE RESTRICT`, so a *used* exercise cannot be
  hard-deleted and simply persists as history.

### Equipment → lookup table (canonical-only for V1)

Equipment is an *open* vocabulary, unlike the *closed* `muscle` enum — so a lookup table, not an
enum. **User-created equipment is deferred**; V1 ships a curated canonical list.

- **`equipment`** — `id uuid pk, slug text not null unique, name text not null, timestamps`.
- **`exercise_equipment`** — `exercise_id uuid, equipment_id uuid, primary key (exercise_id,
  equipment_id)` (join uniqueness); both FKs `ON DELETE CASCADE`.
- Replaces `exercises.equipment text[]`. **Codegen:** add both models + a many-to-many relation on
  `exercises`. **Seed:** convert the existing `text[]` values (`barbell`, `rack`, `bench`, …) into
  canonical `equipment` rows + join rows.
- Structured to add `is_canonical` / `created_by_user_id` later (mirroring exercises) when
  user-created equipment lands.

---

## 5. Analytics denormalization (with declarative consistency)

`set_logs` carries neither owner nor lift, so the core analytics query is an un-indexed 4-table
join. Fix it now.

- Add **`user_id uuid not null references users(id)`** and
  **`exercise_id uuid not null references exercises(id)`** to `set_logs`.
- **Populate** them in the snapshot insert (`session.UserID`, `p.ExerciseID` in scope) **and in the
  seed** (no prod backfill exists).
- **Consistency — declarative, no triggers** (revised: triggers add per-row overhead and invisible
  "magic" to enforce invariants the single-writer path already guarantees):
  - `exercise_id` ↔ session exercise: a **composite FK**
    `set_logs (session_exercise_id, exercise_id) → session_exercises (id, exercise_id)`
    (needs `unique(id, exercise_id)` on `session_exercises`) — declarative, checked alongside the FK
    `set_logs` already has, negligible cost.
  - `user_id` + **immutability** of both columns: an **application invariant**, not DB-enforced. The
    snapshot writer is the sole inserter (sets them from the session owner); the logging path never
    touches them. Documented in the schema comment. (A composite FK for `user_id` would require
    denormalizing `user_id` onto `session_exercises` too — not worth it.)
- **Index:** a **partial composite index** `(user_id, exercise_id, completed_at DESC)
  where deleted_at is null and state = 'completed'`. (It is *not* a "covering" index unless an
  `INCLUDE (actual_load_kg, reps_actual, actual_rpe)` is added once concrete analytics queries are
  defined.)
- **Retain + populate `completed_at`** (timestamp rules in §8).
- Canonical rollup resolves through **`exercise_id` → canonical**; do **not** copy `canonical_id`.
- Enables the video composite FK via `unique(set_logs.id, user_id)` (§8).

---

## 6. Program runs + scheduling — ⚠️ DEFERRED (not MVP)

> Deferred: run-tracking for repeating programs is feature scope, not data-design cleanup. The MVP
> uses `program_day_id` + newest-wins; sequence-driven scheduling stands without a movable anchor.
> The design below is retained for when this is built.

### `program_runs`

| Column | Definition |
|---|---|
| `id` | uuid pk |
| `program_id` | uuid **NULL** references `programs(id)` **ON DELETE SET NULL** (run survives program hard-delete) |
| `user_id` | uuid **NOT NULL** references `users(id)` (= program owner at creation; enforced at insert) |
| `sequence` | int NOT NULL `CHECK (sequence > 0)` |
| `label` | text |
| `anchor_date` | date **NOT NULL** (seeded from `programs.start_date` or run start) |
| `status` | enum/CHECK: `active`, `paused`, `completed`, `abandoned` |
| `started_at` / `completed_at` | timestamptz |

- **`unique(program_id, user_id, sequence)`** — NULL `program_id` rows (orphaned by deletion) are
  distinct under NULL semantics, so they don't collide.
- **One current run:** **`unique(program_id, user_id) where status in ('active','paused')`** — at
  most one *non-terminal* run per user/program; terminal runs (completed/abandoned) don't block new ones.
- **Timestamps:** `completed_at >= started_at`; `status = 'completed' ⇒ completed_at not null`.
- **Status transitions:** `active ↔ paused`; `active → completed`; `active|paused → abandoned`;
  `completed`/`abandoned` are terminal. Pause/resume re-sets `anchor_date`; sequence-driven, so
  nothing else rewrites.

### Sessions

- Add **`sessions.program_run_id uuid NULL references program_runs(id) ON DELETE SET NULL`**.
- `program_day_id` stays `ON DELETE SET NULL`; `user_id` NOT NULL.
- Re-key "current session for a day" on `(program_run_id, program_day_id)` (`repository.go:54`, `:71`).

### Current-run resolution & lifecycle

Existing routes carry only program + day; the server resolves the **single non-terminal run** for
`(user, program)` (guaranteed unique by the partial index) — **no route change needed**. `runId`
on routes is a later enhancement for historical run views.

Session start (`StartSessionForDay`) handles run creation explicitly and race-safely — a unique
index alone is not the flow:

- **Resolve** the current non-terminal run for `(user, program)`:
  - **Active** → use it.
  - **Paused** → require an **explicit resume** (paused→active, re-anchor) before a session can
    start; the start flow never silently spawns a parallel run.
  - **None** (first run, or the previous run completed/abandoned) → **lazily create** a new run.
- **Race-safe creation** inside the session-start transaction: allocate
  `sequence = COALESCE(MAX(sequence),0)+1` for `(program_id, user_id)`, `INSERT` the run; a
  concurrent double-create fails on the partial unique (`active`/`paused`) or
  `unique(program_id, user_id, sequence)`, and the loser **retries → reads the now-existing run**
  (insert-or-select).
- **`anchor_date`** = `COALESCE(programs.start_date, current_date)` (start_date is nullable; fall
  back to today).
- **Completion/abandonment** are terminal; the next session start creates run *N+1* (repeat-run
  behavior). Pause is explicit and re-anchors on resume.

### Run / session / day consistency (the critical triad)

Enforced by a **trigger on `sessions`** (`BEFORE INSERT OR UPDATE`), written to be
**order-independent under cascading deletes**: it never blocks a transition that sets a reference to
NULL, and validates a cross-reference only when the relevant columns are non-null in the NEW row.

- `sessions.user_id = program_runs.user_id` — checked only when `program_run_id` is non-null.
- `sessions.program_day_id` resolves (day → week → program) to the run's `program_id` — checked
  only when **both** `program_run_id` and `program_day_id` are non-null.
- **Both-set-or-both-null** is enforced on **INSERT only** (`TG_OP = 'INSERT'`), not on UPDATE — so
  a program delete that nulls `program_day_id` (cascade) while `program_run_id` survives (state 3)
  passes **regardless of the order FK actions fire** within the `DELETE`.
- `user_id` immutability is a separate guard (§5/§8).

Because these references only ever transition **to NULL** during a program delete, no FK-driven
update can produce a non-null inconsistent combination — the trigger admits every cascade transition
while still rejecting manually-created invalid shapes.

**Three valid persistent session states** (this resolves the hard-delete interaction):

1. **Program-backed:** `program_run_id` + `program_day_id` both set and consistent.
2. **Ad-hoc:** both null.
3. **Template-deleted (historical):** after a program is hard-deleted, `program_day_id → NULL`
   (its day is cascade-deleted) while **`program_run_id` survives** (the run's `program_id → NULL`,
   but the run row and the session's link to it remain). The session stays attributable via the
   surviving run + its name/prescription snapshots.

So the "both set or both null" rule is an **insert-time invariant**, not a persistent CHECK — state
3 is a legitimate post-deletion shape. The trigger forbids *re-pointing* references to inconsistent
values but allows the FK `SET NULL` transitions.

---

## 7. Hard-delete programs — ⚠️ DEFERRED (with F)

> Deferred: Item 2's soft-delete/cascade mismatch is latent today (programs have no delete path), so
> `programs.deleted_at` stays unused for now. Revisit when a program-delete feature exists.

- **Hard-delete** program templates; cascading FKs remove weeks/days/exercises/sets.
- `program_runs.program_id → NULL` (runs survive as historical records);
  `sessions.program_day_id → NULL`; `sessions.program_run_id` remains pointing at the surviving run.
- History is preserved by session **snapshots** (names + prescriptions + denormalized ids).
- **Drop `programs.deleted_at`** (no soft-delete; no child `deleted_at`).
- "Hide without delete" later = an **`archived_at` flag on `programs` only** (no descendant
  cascade) — not in scope now.

---

## 8. Integrity constraints

### Session / set

- Make the active set-order index **unique**: `(session_exercise_id, sequence) where deleted_at is null`.
- `sequence > 0` throughout the program and session hierarchies; group ordering `> 0`.
- **Timestamp transition semantics (exact):**
  - **Set:** transition into `completed` sets `completed_at` **only when currently null**; editing
    actuals while `completed` does **not** reset it; reopening (→ `pending`/`skipped`) **clears**
    `completed_at`; re-completing records a **new** time.
  - **Session:** `recomputeSessionState` follows the same rules (set/clear `completed_at` on the
    completed/reopened transitions, not on every recompute).
  - `completed_at >= started_at` **at the session level** (`set_logs` no longer has `started_at`).
  - **State ⇒ completion timestamp** (row-local CHECKs): `sessions.state = 'completed' ⇒
    sessions.completed_at not null`; `set_logs.state = 'completed' ⇒ set_logs.completed_at not
    null`; `program_runs.status = 'completed' ⇒ program_runs.completed_at not null`.
    (`sessions`/`set_logs` use **`state`**; only `program_runs` uses **`status`** — corrected.)
  - **Enforcement split:** the invariants above are **row-local CHECKs** (DB); the transition
    *timing* (set-on-first-complete / preserve-on-edit / clear-on-reopen / new-on-re-complete) is
    enforced by **transactional application updates** in the serialized set-update +
    `recomputeSessionState` path, **not** triggers.
- **Serialize `recomputeSessionState`** with `SELECT … FOR UPDATE` on the session row to prevent
  concurrent stale rollups.
- One session per program-run day (the `unique(program_run_id, program_day_id)` from §6).

### Load-type compatibility (corrected)

A plain `CHECK` is **row-local only**, so "no load on a bodyweight exercise" — `load_type` on
`exercises`, load columns on `set_logs`/`program_sets` — **cannot** be a CHECK.

- Keep row-local CHECKs: nonnegative values, `reps_max >= reps_min`, `set_type`-based gating.
- Validate cross-table exercise/set compatibility in **backend services**.
- Triggers only if DB-level enforcement is essential.

### Video

- Composite FK **`(set_log_id, user_id) → set_logs(id, user_id)`** (needs `unique(set_logs.id, user_id)`).
- Constrain `status` with an enum/CHECK; add `duration_sec >= 0`.
- **Soft-deleted sets:** soft-deleting a `set_log` does **not** fire `ON DELETE CASCADE`, so the
  **application** must soft-delete attached `set_videos` and purge their R2 objects when a set is
  removed. (DB cascade covers hard delete only — the same GORM soft-delete subtlety as §4.)
- **Serialize quota checks** (`MAX_VIDEOS_PER_*`) to prevent concurrent requests exceeding limits.

---

## 9. Deferred — decimal precision

Keep `numeric` columns; **no Go decimal library now**; **remove** the JSON-number-to-string API
migration. Do exact aggregate analytics **in SQL** over `numeric`; `float64` is fine for
display/transport. **Guardrail:** never accumulate `numeric` in Go `float64` — aggregate in SQL.
Adopt a decimal type only when exact **chained** calculations move into application code.

## 10. Deferred — Row-Level Security

Continue explicit application ownership filters; treat RLS as a separate design project covering:
application DB roles; table-owner bypass + **`FORCE ROW LEVEL SECURITY`**; request transaction
boundaries + **GUC handling**; **background jobs** (no user context); administrative access; policies
for nested/child tables; cross-user integration tests. (`set_logs` policies become trivial after §5.)

---

## Database verification (integration tests)

Required tests proving the constraints actually hold, against a clean database:

1. Duplicate run/day sessions fail (`unique(program_run_id, program_day_id)`).
2. Duplicate ordering fails — `set_logs` `unique(session_exercise_id, sequence)` (active); `program_sets` `unique(group_id, sequence)`; `program_set_groups` `unique(program_exercise_id, sequence)`. A program set cannot span exercises (FK through the group).
3. A `set_logs` row whose `exercise_id` doesn't match its session-exercise fails (composite FK).
4. (Immutability of `set_logs.user_id`/`exercise_id` is an app invariant — covered by snapshot-writer tests, not a DB constraint.)
5. Invalid canonical references fail (non-canonical target, self-reference, canonical-with-parent).
6. Invalid run/day/program combinations fail (consistency trigger); the three valid session states pass.
7. Completion-timestamp rules hold (set on first complete, preserved on edit, cleared on reopen, new on re-complete; `completed ⇒ completed_at`).
8. Video ownership mismatch fails (composite FK); a second **non-terminal** run per user/program
   fails (partial unique); concurrent session starts with no current run yield **exactly one** run
   (race-safe lazy creation).
9. **Hard-deleting a program preserves history — via a real `DELETE FROM programs`, not simulated
   updates:** the cascade leaves sessions intact with snapshots, `program_run_id` surviving (run's
   `program_id` nulled) and `program_day_id` nulled (state 3); the session consistency trigger
   **permits the FK null-outs regardless of cascade action order**.

---

## Summary

| # | Workstream | Risk | Notes |
|---|---|---|---|
| 1 | Remove unused schema | low | drops + enum pruning (cardio, `session_state`) |
| 2 | Finalize naming | low | all renames in one pass |
| 3 | Normalize program sets | med | one-row-per-set + `program_set_groups` (FK ownership/order) |
| 4 | Canonical model + equipment lookup | med | composite-FK rules, ownership-on-delete, equipment tables |
| 5 | Analytics denormalization | med | denormalized ids + declarative composite-FK consistency (no triggers) |
| ~~6~~ | Program runs + scheduling | — | **DEFERRED (not MVP)** — feature scope |
| ~~7~~ | Hard-delete programs | — | **DEFERRED (with F)** — latent; no program-delete path in MVP |
| 8 | Integrity constraints | med | session/set/video, timestamp semantics, corrected load-type |
| 9 | Decimal precision | deferred | keep `numeric`; exact math in SQL |
| 10 | RLS | deferred | app filters now; future project |
| V | DB verification tests | — | prove the constraints hold |
| — | Pre-deployment checklist | — | complete near deploy |

Everything lands in **V1**; verify with a single clean reset + the verification tests.

---

## Implementation steps (one branch → single PR)

**Working model:** a single branch (`db/finalize-v1`), **one small commit per step**, reviewed
independently as it lands; merge **one PR** once every step is in.

**Green checkpoint each step:** `edit V1 → make db-reset → make generate → fix that step's app
slice → make test + pnpm test` all pass — so any single commit's diff is reviewable in isolation
and the branch is never half-broken. Each step carries its own verification tests
([Database verification](#database-verification-integration-tests)). Steps are in dependency order.

> Sequencing constraint: **D2, E1, and F2 all edit `StartSessionForDay`** — keep them consecutive
> so that function isn't re-reviewed across distant commits.

### A — Removals (low-risk, start here)
- [ ] **A1** — Drop all `extras` columns (+ regen). · ~60
- [ ] **A2** — Drop `exercises_resolved` view, unused notes columns, redundant `set_videos_setlog_idx`. · ~50
- [ ] **A3** — Drop `set_logs.started_at`, `sessions.scheduled_for` (+ index). · ~30
- [ ] **A4** — Drop `user_metrics` (table + `cmd/gen` entry). · ~40
- [ ] **A5** — Strength-only: drop cardio/distance columns; prune `'timed'`/`'distance'` from `set_type`/`load_type`. · ~80
- [ ] **A6** — Prune `session_state` to `planned`/`in_progress`/`completed`. · ~30

### B — Renames (small, mechanical)
- [ ] **B1** — `unit_pref` → `unit_preference` (schema + `/me` + frontend). · ~70
- [ ] **B2** — `week_id` → `program_week_id` (+ delete `WeekID` GORMTag override). · ~50
- [ ] **B3** — `day_id` → `program_day_id` (+ delete `DayID` GORMTag override). · ~50
- [ ] **B4** — `*_snap` → `*_snapshot` (5 columns, DTOs + frontend). · ~90

### C — Canonical + equipment
- [ ] **C1** — Add `is_canonical`; replace the `created_by IS NULL` heuristic; slug partial-unique; seed. · ~100
- [ ] **C2** — Composite FK (`unique(id,is_canonical)` + generated flag + FK) + row-local checks + tests. · ~80
- [ ] **C3** — Equipment lookup (`equipment` + `exercise_equipment` + codegen + seed conversion; drop `equipment text[]`). · ~160 → **split: (a) tables + codegen, (b) seed conversion + drop old column + frontend.**

### D — Program-set normalization
- [x] **D** — `program_set_groups` + `program_sets` (replace `program_set_targets`); `block_sequence`→`group_id`; snapshot writer 1:1; read DTO/mapper + regenerated client. Done as one atomic commit (schema/read/writer are compile-coupled).
- ~~D3 — set-editor UI~~ — **out of scope** (UI feature; this plan is data-design only).

### E — Analytics denormalization
- [x] **E1** — `set_logs.user_id` + `exercise_id` (NOT NULL FK); populate in snapshot + seed; partial composite index; `unique(set_logs.id, user_id)`.
- [x] **E2** — `exercise_id` consistency via composite FK (`unique(id, exercise_id)` on session_exercises + `set_logs (session_exercise_id, exercise_id)` FK); `user_id` + immutability as documented app invariants. **No triggers.**

### F — Program runs + triad — ⚠️ DEFERRED (not MVP)
Run-tracking for *repeating* programs is feature scope, not data-design cleanup, and the MVP doesn't
need it (sessions work via `program_day_id` + newest-wins). Deferred as a separate future effort,
with its dependents:
- ~~F1~~ `program_runs` table + `sessions.program_run_id`.
- ~~F2~~ active-run lifecycle in `StartSessionForDay`; re-key current-session on `(run, day)`.
- ~~F3~~ the session run/day/owner consistency triad.
- ~~F4~~ hard-delete programs (Item 2's soft-delete/cascade mismatch). Latent today — programs have
  no delete path — so deferred too; `programs.deleted_at` stays unused for now, revisited when a
  program-delete feature exists. Sequence-driven scheduling stands (newest-wins; no movable anchor).

### G — Integrity + video
- [ ] **G1** — Session/set CHECKs (`sequence > 0`, `state ⇒ completed_at`, unique active seq) + timestamp app rules. · ~80
- [ ] **G2** — Video integrity: composite FK, `status` CHECK, `duration_sec >= 0`, soft-delete→R2 purge, serialize quota. · ~100
- [ ] **G3** — Load-type: row-local checks + backend compatibility validation. · ~70

**Done:** final clean reset + full verification suite green → open the single PR.

---

## Modeling decisions (settled — don't relitigate)

**Hard-delete ↔ runs ↔ session consistency (the key interaction).** Programs are hard-deleted;
`program_runs` **survive** (`program_id ON DELETE SET NULL`) so run/scheduling history isn't lost;
sessions keep `program_run_id` and lose `program_day_id` on deletion. There are **three valid
session states** — program-backed (run+day set, consistent), ad-hoc (both null), and template-deleted
(run set with program-less run, day null). "Both set or both null" is an insert-time invariant, not a
persistent CHECK. Consistency (user match, day-belongs-to-run's-program) is trigger-enforced among
non-null refs. See §6/§7.

**`set_logs` snapshots the prescription on purpose.** Each set log holds the prescription snapshot
*and* the actuals; the template (`program_sets`) is the editable source, the set log is the frozen
copy — because edits/deletes must not rewrite history, per-run/session divergence, and
prescribed-vs-actual analytics needs both on one row. Invoice-line-copies-price pattern. Cost (dup
columns) mitigated by a drift test; §3 makes both sides one-row-per-set.

**Analytics consistency is declarative; immutability is an app invariant** (revised from triggers):
`set_logs.exercise_id` matching its session-exercise is enforced by a **composite FK**; `user_id`
and the immutability of both columns are **application invariants** (single-writer snapshot path,
never mutated). No triggers — they'd add per-row overhead and invisible behavior for invariants the
write path already guarantees. §5.

**Grouping is a `program_set_groups` entity; `set_logs.group_id` is a snapshot.** Template side:
`program_sets.group_id` is a real **FK** to `program_set_groups` (which owns `program_exercise_id`
+ group display order), so ownership and ordering are enforced structurally — no trigger, no
repeated/driftable `group_sequence`, and a group can't span exercises by construction. Session
side: `set_logs.group_id` is `uuid NULL`, a **snapshot** of the originating group id (no FK,
repeats across sessions). §3.

**`sessions.*_snapshot` (program/day names) stay** — history-immutability; the only surviving label
after deletion. Follow-up: render them on the session header.

**Scheduling is sequence-driven; `scheduled_for` removed.** Next-incomplete-session drives "today";
dates project from the run's movable `anchor_date`; pause/resume is a non-event.

**Programs are hard-deleted; soft-delete on programs removed.** History safe via snapshots +
surviving runs.

**Exercise ownership after deletion:** users are soft-deleted, so `ON DELETE SET NULL` doesn't fire
normally → custom exercises **retain attribution** and stay private. Only hard erasure nulls the
owner, leaving a private inaccessible historical record. §4.

**`session_state` pruned to `planned`/`in_progress`/`completed`** (the only values the rollup
produces); `set_log_state` keeps `skipped` (used).

**Rest days stay as explicit rows; `program_days.tag` stays; `program_days.notes` stays;
`programs.owner_user_id` stays; exercise metadata kept (analytics); `muscle` stays an enum (closed)
while equipment is a lookup (open); `set_logs.completed_at` kept + populated.** (Rationale unchanged
from prior revisions.)

**`exercises.slug` — settled keep.** Canonical exercises require a unique slug (§4); it provides
canonical identity and deduplication today, independent of any catalog routes. A future catalog
adds lookup URLs on top — it does not gate the column.

---

## Deferred features (design when built)

- **Program builder — user-defined custom columns.** `extras` was the placeholder; the real design
  needs field *definitions* (name, type, order, target entity) + typed values, not a blob.
- **Conditioning / cardio.** Removed for strength-only V1 (timed/distance columns + enum values);
  re-add when cardio is real.
- **Wellness tracking.** `user_metrics` removed; reintroduce when scheduled.
- **User-created equipment.** V1 equipment is canonical-only; add `is_canonical`/ownership when
  exercise/equipment authoring lands.
- **Exercise catalog/library.** Adds a browseable canonical list, import/export, and slug-based
  lookup URLs (the `slug` column itself is already kept — §4).
- **Historical run views.** Add `runId` to session routes when surfacing past runs.

---

## Additional items (to be added during review)

<!-- Add new items here before implementation starts. -->
