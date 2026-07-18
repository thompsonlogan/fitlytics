-- fitlytics — coaching links (V2)
--
-- Introduces the product's first cross-user read path. Until now every table was
-- owned by exactly one user and every repository pushed that ownership into the
-- SQL WHERE clause, so "may another user read this row?" had no representation.
--
-- `coach_athletes` is that representation: a directional link from a coach to an
-- athlete. The backend's authorization guard asserts an *active* row here before
-- it will read an athlete's programs or sessions on a coach's behalf.
--
-- Conventions baked in here:
--   * This table holds RELATIONSHIPS, not roles. Whether a user may act as a
--     coach at all is answered by the `role` claim on their WorkOS token and is
--     deliberately not mirrored here (see the note at the bottom of V1). This
--     table answers the separate question a role cannot: which athletes has
--     this coach been granted access to.
--   * Links are managed out of band — created by hand or by seed data — and
--     the API only reads them. Columns for a self-service flow are deliberately
--     absent: shipping them now would mean guessing at a design that does not
--     exist yet, and a nullable unused column is harder to remove than to add.
--   * Self-coaching is permitted (coach_user_id = athlete_user_id) — useful for
--     testing and for athletes who program for themselves. Multiple coaches per
--     athlete falls out for free: the live-link index is on the (coach, athlete)
--     pair, not on the athlete alone.

set search_path to fitlytics, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- `create type` has no IF NOT EXISTS, so guard it the standard way to keep the
-- migration idempotent on re-run.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  create type coach_link_status as enum (
    'active',  -- the coach may read this athlete's training data
    'ended'    -- link terminated by either party
  );
exception
  when duplicate_object then null;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Coach ↔ athlete links
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists coach_athletes (
  id              uuid primary key default gen_random_uuid(),
  coach_user_id   uuid not null references users (id) on delete cascade,
  athlete_user_id uuid not null references users (id) on delete cascade,
  status          coach_link_status not null default 'active',
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  -- An ended link must record when, so "since when did this coach lose access"
  -- is answerable without an audit table.
  constraint coach_athletes_ended_has_timestamp check (
    status <> 'ended' or ended_at is not null
  )
);

-- A coach may hold at most one live link per athlete. Ended rows are excluded
-- so a relationship can be re-established later.
create unique index if not exists coach_athletes_live_link_uq
  on coach_athletes (coach_user_id, athlete_user_id)
  where status = 'active' and deleted_at is null;

-- The athlete's "who coaches me" lookup.
create index if not exists coach_athletes_athlete_idx
  on coach_athletes (athlete_user_id, status)
  where deleted_at is null;

-- The coach's roster lookup, and the authorization guard's index.
create index if not exists coach_athletes_coach_idx
  on coach_athletes (coach_user_id, status)
  where deleted_at is null;

-- `create trigger` has no IF NOT EXISTS; OR REPLACE (pg14+) is the idempotent form.
create or replace trigger coach_athletes_updated_at before update on coach_athletes
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Video review bookkeeping
-- The coach-side review UI is not built yet, but the roster's "videos waiting"
-- count needs somewhere to read from, and backfilling this column later would
-- mean every pre-existing video counting as unreviewed forever.
-- ─────────────────────────────────────────────────────────────────────────────

alter table set_videos add column if not exists reviewed_at timestamptz;

-- Drives the per-athlete unreviewed count on the coach roster.
create index if not exists set_videos_unreviewed_idx
  on set_videos (user_id)
  where reviewed_at is null and deleted_at is null and status = 'ready';
