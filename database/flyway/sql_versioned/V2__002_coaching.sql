-- fitlytics — coaching links (V2)
--
-- Introduces the product's first cross-user read path. Until now every table was
-- owned by exactly one user and every repository pushed that ownership into the
-- SQL WHERE clause, so "may another user read this row?" had no representation.
--
-- `coach_athletes` is that representation: a consented, directional link from a
-- coach to an athlete. The backend's authorization guard asserts an *active* row
-- here before it will read an athlete's programs or sessions on a coach's behalf.
--
-- Conventions baked in here:
--   * This table holds RELATIONSHIPS, not roles. Whether a user may act as a
--     coach at all is answered by the `role` claim on their WorkOS token and is
--     deliberately not mirrored here (see the note at the bottom of V1). This
--     table answers the separate question a role cannot: which athletes has
--     this coach been granted access to.
--   * Consent is mandatory: an invite lands as 'pending' and only the athlete
--     can move it to 'active'. A coach can never self-serve access.
--   * Self-coaching is permitted (coach_user_id = athlete_user_id) — useful for
--     testing and for athletes who program for themselves. Multiple coaches per
--     athlete falls out for free: the live-link index is on the (coach, athlete)
--     pair, not on the athlete alone.
--   * athlete_user_id is nullable because an invite may be sent to an email that
--     has not signed up yet; it is filled in at accept time.
--   * The raw invite token is never stored — only its sha-256 hex digest.

set search_path to fitlytics, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- `create type` has no IF NOT EXISTS, so guard it the standard way to keep the
-- migration idempotent on re-run.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  create type coach_link_status as enum (
    'pending',   -- invite sent, awaiting the athlete's decision
    'active',    -- athlete accepted; the coach may read their training data
    'declined',  -- athlete refused the invite
    'ended'      -- link terminated by either party after having been active
  );
exception
  when duplicate_object then null;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Coach ↔ athlete links
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists coach_athletes (
  id                uuid primary key default gen_random_uuid(),
  coach_user_id     uuid not null references users (id) on delete cascade,
  -- Null until the invite is accepted: the invitee may not have an account yet.
  athlete_user_id   uuid references users (id) on delete cascade,
  -- The address the invite was sent to. Kept even after acceptance so a coach
  -- can see who they invited when the athlete's account email later changes.
  invited_email     text not null,
  -- sha-256 hex digest of the invite token. The raw token exists only in the
  -- invite link handed to the coach; a database leak must not grant access.
  invite_token_hash text,
  status            coach_link_status not null default 'pending',
  invited_at        timestamptz not null default now(),
  responded_at      timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  -- An accepted link must record who accepted it and when.
  constraint coach_athletes_active_has_athlete check (
    status <> 'active' or (athlete_user_id is not null and responded_at is not null)
  )
);

-- A coach may hold at most one live link per athlete. Declined and ended rows
-- are excluded so a relationship can be re-established later.
create unique index if not exists coach_athletes_live_link_uq
  on coach_athletes (coach_user_id, athlete_user_id)
  where athlete_user_id is not null
    and status in ('pending', 'active')
    and deleted_at is null;

-- ...and at most one outstanding invite per email address, case-insensitively.
create unique index if not exists coach_athletes_pending_email_uq
  on coach_athletes (coach_user_id, lower(invited_email))
  where status = 'pending' and deleted_at is null;

-- The athlete's "who coaches me / who invited me" lookup.
create index if not exists coach_athletes_athlete_idx
  on coach_athletes (athlete_user_id, status)
  where deleted_at is null;

-- The coach's roster lookup.
create index if not exists coach_athletes_coach_idx
  on coach_athletes (coach_user_id, status)
  where deleted_at is null;

-- Invite redemption looks the row up by token digest alone.
create unique index if not exists coach_athletes_token_uq
  on coach_athletes (invite_token_hash)
  where invite_token_hash is not null and deleted_at is null;

-- `create trigger` has no IF NOT EXISTS; OR REPLACE (pg14+) is the idempotent form.
create or replace trigger coach_athletes_updated_at before update on coach_athletes
  for each row execute function set_updated_at();

alter table set_videos add column if not exists reviewed_at timestamptz;

-- Drives the per-athlete unreviewed count on the coach roster.
create index if not exists set_videos_unreviewed_idx
  on set_videos (user_id)
  where reviewed_at is null and deleted_at is null and status = 'ready';
