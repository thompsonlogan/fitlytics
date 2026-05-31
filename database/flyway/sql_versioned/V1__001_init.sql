-- fitlytics — initial database schema (V1)
--
-- Target: PostgreSQL 15+. Applied by Flyway from database/docker-compose.yml.
-- All objects live in the `fitlytics` schema; pgcrypto is installed to public
-- so gen_random_uuid() resolves via search_path. The trailing ALTER DATABASE
-- pins search_path for every future connection (app, gen, psql).
--
-- Conventions baked in here:
--   * All loads stored canonically in kg. Distances in meters. Durations in
--     seconds. Display-convert per users.unit_pref.
--   * timestamptz everywhere, never timestamp.
--   * Client-generated UUIDs (gen_random_uuid()) for offline-friendly sync.
--   * Prescriptions are SNAPSHOTTED onto sessions at start time. Editing a
--     program never rewrites history.
--   * set_logs are edited in place. Soft-delete via deleted_at is the only
--     audit trail; deeper history can be added later if/when needed.
--   * Single `exercises` table holds both curated canonical lifts and
--     user-contributed entries. Group by coalesce(canonical_id, id) to roll
--     analytics up to "the same lift."
--   * Auth is external (WorkOS). `users` is a local profile mirror linked by
--     workos_user_id; authorization is enforced in the app layer, not RLS.

create extension if not exists pgcrypto;

create schema if not exists fitlytics;
set search_path to fitlytics, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

create type movement_pattern as enum (
  'squat', 'hinge', 'horizontal_push', 'vertical_push',
  'horizontal_pull', 'vertical_pull', 'carry', 'lunge',
  'rotation', 'isolation', 'cardio', 'other'
);

-- Curated muscle list. Kept as an enum (not free text) so muscle-level
-- analytics don't fragment across spelling variants. New values are added
-- with ALTER TYPE ... ADD VALUE; values cannot be removed.
create type muscle as enum (
  'chest',
  'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'forearms',
  'lats', 'traps', 'rhomboids', 'lower_back',
  'abs', 'obliques',
  'glutes', 'quads', 'hamstrings', 'calves',
  'adductors', 'abductors', 'hip_flexors',
  'neck'
);

create type load_modifier as enum (
  'absolute',          -- external load only (barbell + plates, dumbbell)
  'bodyweight',        -- bodyweight only
  'bodyweight_plus',   -- BW + external load_kg
  'bodyweight_minus',  -- BW with assistance worth load_kg
  'band',              -- nonlinear; load_kg is the best-effort approximation
  'chain',             -- progressive; load_kg is the peak added load
  'stack',             -- selectorized machine; load_kg is the pin weight
  'none'               -- timed / distance / reps-only sets
);

create type load_type as enum (
  'weighted', 'bodyweight', 'timed', 'distance'
);

create type set_type as enum (
  'warmup', 'working', 'amrap', 'drop', 'timed', 'distance'
);

create type session_state as enum (
  'planned', 'in_progress', 'completed', 'skipped', 'partial'
);

-- Per-set lifecycle. The backend's auto-rollup writes sessions.state based on
-- the distribution of child set_logs: all-pending → planned, any non-pending
-- → in_progress, all completed-or-skipped → completed.
create type set_log_state as enum ('pending', 'completed', 'skipped');

create type unit_system as enum ('metric', 'imperial');

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared updated_at trigger
-- Lives in V1 because the triggers below reference it at CREATE TRIGGER time.
-- Future tweaks: ship a new V_ migration with CREATE OR REPLACE FUNCTION.
-- ─────────────────────────────────────────────────────────────────────────────

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Users
-- Local profile mirror. WorkOS is the source of truth for identity, auth, and
-- roles/permissions — this table only holds app-specific profile data plus the
-- workos_user_id link. On provisioning (WorkOS webhook or first login), upsert
-- a row keyed by workos_user_id. Do NOT store roles/permissions here; read them
-- from the verified WorkOS session token at request time.
-- ─────────────────────────────────────────────────────────────────────────────

create table users (
  id              uuid primary key default gen_random_uuid(),
  workos_user_id  text not null unique,   -- WorkOS identity, e.g. 'user_01H...'
  display_name    text not null,
  email           text unique,            -- mirrored from WorkOS; WorkOS stays authoritative
  unit_pref       unit_system not null default 'imperial',
  timezone        text not null default 'UTC',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create trigger users_updated_at before update on users
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Exercises (canonical + user-contributed in one table)
--   Canonical:  created_by_user_id IS NULL, canonical_id IS NULL, slug set
--   User-made:  created_by_user_id = <user>, canonical_id either null
--               (unmapped) or pointing at the canonical row.
--   Analytics rollup key: coalesce(canonical_id, id)
-- ─────────────────────────────────────────────────────────────────────────────

create table exercises (
  id                     uuid primary key default gen_random_uuid(),
  canonical_id           uuid references exercises(id) on delete set null,
  created_by_user_id     uuid references users(id) on delete set null,
  name                   text not null,
  slug                   text,
  primary_muscles        muscle[] not null default '{}',
  secondary_muscles      muscle[] not null default '{}',
  movement_pattern       movement_pattern,
  equipment              text[] not null default '{}',
  is_compound            boolean not null default false,
  load_type              load_type not null default 'weighted',
  default_load_modifier  load_modifier not null default 'absolute',
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  constraint exercises_no_self_canonical check (canonical_id is null or canonical_id <> id),
  constraint exercises_canonical_has_slug check (
    created_by_user_id is not null or slug is not null
  )
);

-- Canonical entries (created_by_user_id IS NULL) get a globally unique slug.
-- User entries are unconstrained by slug.
create unique index exercises_slug_canonical_uq
  on exercises (slug)
  where created_by_user_id is null;

create index exercises_canonical_id_idx on exercises (canonical_id);
create index exercises_created_by_idx on exercises (created_by_user_id);
create index exercises_movement_pattern_idx on exercises (movement_pattern);

create trigger exercises_updated_at before update on exercises
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Programs (reusable templates)
-- Hierarchy: program → week → day → exercise → set target
-- A program runs as an ordered list of weeks; each week is an ordered list of
-- days. A block/mesocycle layer can be added above `week` later if multi-phase
-- periodization is needed.
-- ─────────────────────────────────────────────────────────────────────────────

create table programs (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references users(id) on delete cascade,
  name           text not null,
  description    text,
  -- The anchor calendar date the program is meant to start on. The day
  -- selector uses it to align week 1 day 1 with a real date; the user can
  -- still reorder workouts within a week without re-anchoring.
  start_date     date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index programs_owner_idx on programs (owner_user_id) where deleted_at is null;
create trigger programs_updated_at before update on programs
  for each row execute function set_updated_at();

create table program_weeks (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs(id) on delete cascade,
  sequence    int not null,                   -- week order within the program
  name        text,                           -- optional label, e.g. "Deload"
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (program_id, sequence)
);
create trigger program_weeks_updated_at before update on program_weeks
  for each row execute function set_updated_at();

create table program_days (
  id           uuid primary key default gen_random_uuid(),
  week_id      uuid not null references program_weeks(id) on delete cascade,
  sequence     int not null,                   -- day order within the week
  name         text not null,                  -- e.g. "Lower · Heavy"
  tag          text,                           -- e.g. "Day 1"
  is_rest_day  boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (week_id, sequence)
);
create trigger program_days_updated_at before update on program_days
  for each row execute function set_updated_at();

create table program_exercises (
  id            uuid primary key default gen_random_uuid(),
  day_id        uuid not null references program_days(id) on delete cascade,
  sequence      int not null,
  exercise_id   uuid not null references exercises(id) on delete restrict,
  sub_text      text,                          -- "Belt + sleeves", "Conventional"
  rest_seconds  int check (rest_seconds is null or rest_seconds >= 0),
  notes         text,
  extras        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (day_id, sequence)
);
create index program_exercises_exercise_idx on program_exercises (exercise_id);
create trigger program_exercises_updated_at before update on program_exercises
  for each row execute function set_updated_at();

-- A program_set_target represents one "block" of prescribed sets that share
-- the same target params (e.g. "2 sets of 5 @ 285lb RPE 8"). When the user
-- starts a session, expand each target into sets_count individual set_logs.
create table program_set_targets (
  id                        uuid primary key default gen_random_uuid(),
  program_exercise_id       uuid not null references program_exercises(id) on delete cascade,
  sequence                  int not null,
  set_type                  set_type not null default 'working',
  sets_count                int not null default 1 check (sets_count > 0),
  reps_min                  int check (reps_min is null or reps_min >= 0),
  reps_max                  int check (reps_max is null or reps_max >= 0),
  duration_target_sec       int check (duration_target_sec is null or duration_target_sec >= 0),
  distance_target_m         numeric(10,2) check (distance_target_m is null or distance_target_m >= 0),
  intensity_text            text,             -- free-form display: "0–1 RIR", "285lb (0.95)"
  prescribed_load_kg        numeric(7,2) check (prescribed_load_kg is null or prescribed_load_kg >= 0),
  prescribed_load_modifier  load_modifier not null default 'absolute',
  cap_load_kg               numeric(7,2) check (cap_load_kg is null or cap_load_kg >= 0),
  prescribed_rpe            numeric(3,1) check (prescribed_rpe is null or (prescribed_rpe >= 0 and prescribed_rpe <= 10)),
  notes                     text,
  extras                    jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (program_exercise_id, sequence),
  constraint reps_range_ok check (reps_min is null or reps_max is null or reps_max >= reps_min)
);
create trigger program_set_targets_updated_at before update on program_set_targets
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Sessions (logged workouts)
-- The session and its children snapshot the program prescription so editing
-- the program later does not rewrite history.
-- ─────────────────────────────────────────────────────────────────────────────

create table sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  program_day_id      uuid references program_days(id) on delete set null,  -- nullable for ad-hoc sessions
  program_name_snap   text,
  day_name_snap       text,
  state               session_state not null default 'planned',
  scheduled_for       date,
  started_at          timestamptz,
  completed_at        timestamptz,
  notes               text,
  extras              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index sessions_user_recent_idx
  on sessions (user_id, coalesce(started_at, created_at) desc)
  where deleted_at is null;
create index sessions_user_scheduled_idx
  on sessions (user_id, scheduled_for)
  where deleted_at is null;
create trigger sessions_updated_at before update on sessions
  for each row execute function set_updated_at();

create table session_exercises (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references sessions(id) on delete cascade,
  sequence            int not null,
  exercise_id         uuid not null references exercises(id) on delete restrict,
  exercise_name_snap  text not null,           -- snapshot at session start
  sub_snap            text,
  rest_seconds_snap   int,
  notes               text,
  extras              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (session_id, sequence)
);
create index session_exercises_exercise_idx on session_exercises (exercise_id);
create trigger session_exercises_updated_at before update on session_exercises
  for each row execute function set_updated_at();

-- set_logs are edited in place. Soft-delete via deleted_at; no audit chain.
create table set_logs (
  id                        uuid primary key default gen_random_uuid(),
  session_exercise_id       uuid not null references session_exercises(id) on delete cascade,
  sequence                  int not null,
  set_type                  set_type not null default 'working',
  -- prescription snapshot
  reps_target_min           int,
  reps_target_max           int,
  duration_target_sec       int,
  distance_target_m         numeric(10,2),
  prescribed_load_kg        numeric(7,2),
  prescribed_load_modifier  load_modifier not null default 'absolute',
  prescribed_rpe            numeric(3,1),
  intensity_text            text,
  -- actuals
  reps_actual               int check (reps_actual is null or reps_actual >= 0),
  duration_actual_sec       int check (duration_actual_sec is null or duration_actual_sec >= 0),
  distance_actual_m         numeric(10,2) check (distance_actual_m is null or distance_actual_m >= 0),
  actual_load_kg            numeric(7,2) check (actual_load_kg is null or actual_load_kg >= 0),
  actual_load_modifier      load_modifier not null default 'absolute',
  actual_rpe                numeric(3,1) check (actual_rpe is null or (actual_rpe >= 0 and actual_rpe <= 10)),
  -- timing & status
  started_at                timestamptz,
  completed_at              timestamptz,
  state                     set_log_state not null default 'pending',
  notes                     text,
  extras                    jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz
);
create index set_logs_active_seq_idx
  on set_logs (session_exercise_id, sequence)
  where deleted_at is null;
create trigger set_logs_updated_at before update on set_logs
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- User metrics sidecar (bodyweight, sleep, subjective wellness)
-- Allocated v1 even if you don't populate it; backfilling joins later is
-- much worse than carrying empty rows now.
-- ─────────────────────────────────────────────────────────────────────────────

create table user_metrics (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  recorded_at    timestamptz not null default now(),
  bodyweight_kg  numeric(5,2) check (bodyweight_kg is null or bodyweight_kg > 0),
  sleep_hours    numeric(4,2) check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)),
  sleep_score    int check (sleep_score is null or sleep_score between 0 and 100),
  soreness       int check (soreness is null or soreness between 0 and 10),
  fatigue        int check (fatigue is null or fatigue between 0 and 10),
  notes          text,
  extras         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index user_metrics_user_time_idx on user_metrics (user_id, recorded_at desc);
create trigger user_metrics_updated_at before update on user_metrics
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Pin search_path for every future connection (app, gen, psql) so unqualified
-- references resolve to `fitlytics` first, with `public` available for pgcrypto.
-- ─────────────────────────────────────────────────────────────────────────────

alter database fitlytics set search_path = fitlytics, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- Authorization model — application layer (no Postgres RLS)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Auth is handled by WorkOS. The API verifies the WorkOS session on every
-- request, resolves the WorkOS user id to a local users.id (lookup by
-- workos_user_id), and scopes every query to that id. This database has no RLS
-- policies — enforcement lives entirely in the app layer.
--
-- Ownership rules the app layer MUST enforce on every query:
--   * programs, sessions, user_metrics       -> filter by owner_user_id / user_id
--   * program_weeks/days/exercises/targets    -> reachable only via a program the
--                                                caller owns (join up to programs)
--   * session_exercises, set_logs             -> reachable only via a session the
--                                                caller owns (join up to sessions)
--   * exercises  SELECT -> canonical rows (created_by_user_id IS NULL) are
--                          readable by everyone; user rows only by their creator
--                exercises  WRITE  -> only the caller's own user rows
--
-- Roles/permissions (e.g. an app-wide 'admin') live in WorkOS — read them from
-- the verified session token. Do NOT mirror them into this database.
--
-- Defense-in-depth option for later: add RLS keyed on a per-connection GUC
-- (SET LOCAL app.current_user_id = '<users.id>') that the API sets after
-- session verification. Deliberately not enabled now.
