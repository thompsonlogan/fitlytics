-- Resolves any exercise row to its canonical id, so analytics can roll
-- variants up to "the same lift". Repeatable: edit and Flyway re-applies
-- the next time it runs (checksum-tracked).

create or replace view exercises_resolved as
select
  e.id,
  coalesce(e.canonical_id, e.id) as canonical_id,
  e.created_by_user_id,
  e.name
from exercises e
where e.deleted_at is null;
