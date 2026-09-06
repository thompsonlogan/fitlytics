-- fitlytics — program blocks (V3)
--
-- Adds the mesocycle layer the V1 program hierarchy comment reserved:
--
--     program → block → week → day → exercise → set target
--
-- A block is a contiguous run of weeks (a training block / mesocycle — e.g. a
-- 4-week accumulation phase, its deload folded in). Blocks are purely a
-- grouping above `week`: `program_weeks.sequence` stays GLOBAL (1..N across the
-- whole program), so every calendar calculation that keys off the global week
-- number is untouched. A block simply owns a contiguous slice of those weeks.
--
-- Conventions baked in here:
--   * `program_weeks` keeps its `program_id` and its `unique(program_id,
--     sequence)` — that global-sequence guarantee is what preserves the
--     existing week ordering and calendar math. `program_block_id` is added
--     alongside it, not in place of it.
--   * Backfill groups existing weeks into blocks of 4 by global sequence, and
--     folds a short trailing remainder (< 4 weeks, e.g. a lone deload) UP into
--     the final block rather than leaving a runt block. "Blocks are typically 4
--     weeks" is the intent; the fold-up keeps a 13-week program at 4/4/5 rather
--     than 4/4/4/1.
-- ─────────────────────────────────────────────────────────────────────────────

set search_path to fitlytics, public;

-- ── program_blocks ──────────────────────────────────────────────────────────
create table if not exists program_blocks (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs(id) on delete cascade,
  sequence    int not null check (sequence > 0),  -- block order within the program
  name        text,                               -- optional label, e.g. "Accumulation"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (program_id, sequence)
);

drop trigger if exists program_blocks_updated_at on program_blocks;
create trigger program_blocks_updated_at before update on program_blocks
  for each row execute function set_updated_at();

-- ── program_weeks.program_block_id ──────────────────────────────────────────
-- Nullable during backfill; set NOT NULL once every existing week is assigned.
alter table program_weeks
  add column if not exists program_block_id uuid references program_blocks(id) on delete cascade;

create index if not exists program_weeks_block_idx
  on program_weeks (program_block_id);

-- ── Backfill: blocks of 4 weeks, short trailing remainder folded up ──────────
-- Runs against whatever weeks already exist (populated prod databases). On a
-- clean dev database the seed inserts weeks WITH program_block_id already set,
-- so there is nothing here to backfill.
do $$
declare
  r record;
begin
  -- One block row per (program, block rank). ranked.n is the per-program week
  -- count; nblocks caps the rank so the trailing remainder folds into the last
  -- block instead of forming a runt.
  for r in
    with ranked as (
      select
        w.id                                                    as week_id,
        w.program_id,
        row_number() over (partition by w.program_id order by w.sequence) as rk,
        count(*)      over (partition by w.program_id)          as n
      from program_weeks w
      where w.program_block_id is null
    )
    select
      week_id,
      program_id,
      least(((rk - 1) / 4) + 1, greatest(1, n / 4)) as block_rank
    from ranked
  loop
    -- Create the owning block on first sighting of its (program, rank).
    insert into program_blocks (program_id, sequence, name)
    values (r.program_id, r.block_rank, 'Block ' || r.block_rank)
    on conflict (program_id, sequence) do nothing;

    update program_weeks
    set program_block_id = (
      select b.id from program_blocks b
      where b.program_id = r.program_id and b.sequence = r.block_rank
    )
    where id = r.week_id;
  end loop;
end $$;

alter table program_weeks
  alter column program_block_id set not null;
