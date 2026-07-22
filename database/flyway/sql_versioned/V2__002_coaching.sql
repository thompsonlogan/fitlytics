-- fitlytics — coaching (V2)
--
-- Introduces the product's first cross-user read path. Until now every table was
-- owned by exactly one user and every repository pushed that ownership into the
-- SQL WHERE clause, so "may another user read this row?" had no representation.
--
-- `coach_athletes` is that representation: a directional link from a coach to an
-- athlete. The backend's authorization guard asserts an *active* row here before
-- it will read an athlete's programs or sessions on a coach's behalf. On top of
-- that this adds the two things the coach view needs beyond reading: video
-- review bookkeeping, and a shared thread for the two of them to talk.
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
--     testing and for athletes who program for themselves. An athlete has at
--     most one active coach: review state lives globally on the video, so a
--     second coach would race the first over it. The single-coach rule is the
--     live-link unique index on athlete_user_id alone.
--   * Marking a video reviewed is the coach's annotation on the athlete's row,
--     not a mutation of the athlete's training data. It is the only write a
--     coach may make; everything else about a video stays owner-only.
--   * The notes thread hangs off the LINK, not off a (coach, athlete) pair, so
--     it cascades with the relationship and cannot outlive it. Re-establishing
--     an ended relationship therefore starts a fresh thread rather than
--     resurrecting the old one.

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

-- An athlete has at most one active coach. Keyed on the athlete alone (not the
-- coach/athlete pair) so a second coach cannot open a live link while one
-- exists — review state is global on the video, so two coaches would collide
-- over it. Ended rows are excluded so a relationship can be re-established, and
-- a coach can be swapped by ending one link before opening the next.
create unique index if not exists coach_athletes_live_link_uq
  on coach_athletes (athlete_user_id)
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
-- reviewed_at records "when", reviewed_by_user_id records "who". They are set
-- together by the review endpoint.
alter table set_videos
  add column if not exists reviewed_by_user_id uuid references users (id) on delete set null;

-- One-directional rather than a strict pair: a reviewer implies a review time,
-- but a review time may stand without a reviewer. That second case is exactly
-- what `on delete set null` produces when the reviewing coach is later deleted
-- — the video stays reviewed, only the attribution is lost. A strict both-or-
-- neither check would instead make that FK action violate the constraint and
-- abort the user deletion.
do $$
begin
  alter table set_videos add constraint set_videos_review_pair check (
    reviewed_by_user_id is null or reviewed_at is not null
  );
exception
  when duplicate_object then null;
end
$$;

-- Drives the per-athlete unreviewed count on the coach roster.
create index if not exists set_videos_unreviewed_idx
  on set_videos (user_id)
  where reviewed_at is null and deleted_at is null and status = 'ready';

-- "What has this coach cleared" — the review history lookup.
create index if not exists set_videos_reviewed_by_idx
  on set_videos (reviewed_by_user_id, reviewed_at desc)
  where reviewed_by_user_id is not null and deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Coach ↔ athlete notes
-- A single thread per link, written by either party. The design interleaves
-- both sides, so authorship is a column rather than two tables.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists coach_notes (
  id               uuid primary key default gen_random_uuid(),
  coach_athlete_id uuid not null references coach_athletes (id) on delete cascade,
  -- Either side of the link. Not constrained to the link's two users here —
  -- the app enforces that, and a FK cannot express "one of these two columns
  -- on the parent row".
  author_user_id   uuid not null references users (id) on delete cascade,
  body             text not null check (length(btrim(body)) > 0),
  -- Set when the note came from the video review dialog, so coach feedback
  -- keeps its context. Nulled rather than cascaded if the video is removed:
  -- the conversation outlives the clip it was about.
  set_video_id     uuid references set_videos (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- The thread read: one link's notes in order.
create index if not exists coach_notes_thread_idx
  on coach_notes (coach_athlete_id, created_at)
  where deleted_at is null;

-- "Which notes are about this video" — drives the review dialog's history.
create index if not exists coach_notes_video_idx
  on coach_notes (set_video_id)
  where set_video_id is not null and deleted_at is null;

create or replace trigger coach_notes_updated_at before update on coach_notes
  for each row execute function set_updated_at();
