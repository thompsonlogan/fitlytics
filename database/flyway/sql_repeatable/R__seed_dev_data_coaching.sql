-- Repeatable migration: coaching fixtures for local development.
--
-- Gives the seeded Dev User a coached athlete with a program and attendance
-- history, so the coach view has something to render. Without this the roster
-- is empty and every coach screen is a blank state.
--
-- Idempotency model matches R__seed_dev_data.sql: deterministic UUIDs (here
-- derived with md5() of a stable key) and `on conflict (id) do nothing`, so
-- re-running is a no-op.
--
-- One deliberate exception: dates are relative to current_date, so a freshly
-- seeded database always shows the athlete mid-block rather than drifting
-- further into the past as the fixture ages. Because inserts are
-- conflict-skipped, refreshing those dates needs a destructive reseed
-- (`docker compose down -v`, or `make db-reset`).
--
-- Shape: a 4-week block, 3 training days + 4 rest days a week, started 15 days
-- ago. That makes 8 sessions due so far; the athlete completed 6, left one in
-- progress, and skipped one outright — so the roster reads 6/8 = 75%, which is
-- below the attention threshold. The skipped session writes no rows at all,
-- which is exactly the case a set-based compliance metric cannot see.

set search_path to fitlytics, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The coached athlete
-- ─────────────────────────────────────────────────────────────────────────────

insert into users (id, workos_user_id, display_name, email, unit_preference, timezone) values
  ('f69f8e5a-9800-4665-9739-2f5b52687902', 'user_00000000000000000000000001', 'Marcus Webb', 'marcus@example.invalid', 'imperial', 'UTC')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The coaching link, the athlete's program, and the sessions they did
--    (or didn't) log.
--
-- Everything below depends on rows from R__seed_dev_data. Flyway runs
-- repeatable migrations in alphabetical order by description, which is why this
-- file is named to sort after it — and why the guards below exist anyway, so a
-- partial database produces a notice rather than a foreign key error.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_coach    uuid := '265f6d7d-c361-4189-ac41-3f053b2b217d';
  v_link     uuid := 'a1c0ac11-0000-4000-8000-000000000001';
  v_self     uuid := 'a1c0ac11-0000-4000-8000-000000000002';
  v_athlete  uuid := 'f69f8e5a-9800-4665-9739-2f5b52687902';
  v_program  uuid := md5('coach-seed:program')::uuid;
  v_start    date := (current_date - interval '15 days')::date;
  v_squat    uuid := '704b039d-895c-476b-80ed-991010629bb2';  -- from R__seed_dev_data
  v_bench    uuid := 'eacd9689-6804-4bb6-96db-c50a46157746';  -- from R__seed_dev_data
  v_week     uuid;
  v_day      uuid;
  v_pex      uuid;
  v_group    uuid;
  v_session  uuid;
  v_sex      uuid;
  v_sex2     uuid;
  v_bench_kg numeric;
  w          int;
  d          int;
  v_offset   int;
  v_due      int := 0;
begin
  -- Bail out rather than half-seed if the base dev data has not been applied.
  if not exists (select 1 from users where id = v_coach)
     or not exists (select 1 from exercises where id = v_squat) then
    raise notice 'coaching seed skipped: R__seed_dev_data has not been applied';
    return;
  end if;

  insert into coach_athletes (id, coach_user_id, athlete_user_id, status)
  values (v_link, v_coach, v_athlete, 'active')
  on conflict (id) do nothing;

  insert into coach_athletes (id, coach_user_id, athlete_user_id, status)
  values (v_self, v_coach, v_coach, 'active')
  on conflict do nothing;

  if exists (select 1 from programs where id = v_program) then
    return;  -- already seeded
  end if;

  insert into programs (id, owner_user_id, name, description, start_date)
  values (v_program, v_athlete, 'Hypertrophy Block v3',
          'Coach view fixture: 4 weeks, 3 training days a week.', v_start);

  for w in 1..4 loop
    v_week := md5('coach-seed:week:' || w)::uuid;
    insert into program_weeks (id, program_id, sequence, name)
    values (v_week, v_program, w, 'Week ' || w);

    for d in 1..7 loop
      v_day := md5('coach-seed:day:' || w || ':' || d)::uuid;
      insert into program_days (id, program_week_id, sequence, name, tag, is_rest_day)
      values (v_day, v_week, d,
              case when d <= 3 then 'Training ' || d else 'Rest' end,
              'Day ' || d,
              d > 3);

      continue when d > 3;

      v_pex := md5('coach-seed:pex:' || w || ':' || d)::uuid;
      insert into program_exercises (id, program_day_id, sequence, exercise_id, rest_seconds)
      values (v_pex, v_day, 1, v_squat, 180);

      v_group := md5('coach-seed:group:' || w || ':' || d)::uuid;
      insert into program_set_groups (id, program_exercise_id, sequence)
      values (v_group, v_pex, 1);

      insert into program_sets (id, group_id, sequence, set_type, reps_min, reps_max,
                                prescribed_load_kg, prescribed_rpe)
      select md5('coach-seed:set:' || w || ':' || d || ':' || s)::uuid,
             v_group, s, 'working', 5, 5, 136.0, 8.0
        from generate_series(1, 4) s;

      -- A second exercise so a day exercises the multi-exercise layout, and so
      -- the actuals below can drift off the prescription — with one squat block
      -- alone every row sat at +1% and the deviation flagging never showed.
      v_pex := md5('coach-seed:pex2:' || w || ':' || d)::uuid;
      insert into program_exercises (id, program_day_id, sequence, exercise_id, rest_seconds)
      values (v_pex, v_day, 2, v_bench, 120);

      v_group := md5('coach-seed:group2:' || w || ':' || d)::uuid;
      insert into program_set_groups (id, program_exercise_id, sequence)
      values (v_group, v_pex, 1);

      insert into program_sets (id, group_id, sequence, set_type, reps_min, reps_max,
                                prescribed_load_kg, prescribed_rpe)
      select md5('coach-seed:set2:' || w || ':' || d || ':' || s)::uuid,
             v_group, s, 'working', 8, 10, 90.0, 7.0
        from generate_series(1, 3) s;

      -- Only days that have already come due get a session.
      v_offset := (w - 1) * 7 + (d - 1);
      continue when v_start + v_offset > current_date;

      v_due := v_due + 1;

      -- Six completed, one left in progress, then nothing: the eighth due day
      -- onwards are missed sessions with no rows anywhere. Skipped with a
      -- conditional rather than `exit`, which would also abandon the remaining
      -- program days for that week and leave the block with holes in it.
      continue when v_due > 7;

      v_session := md5('coach-seed:session:' || w || ':' || d)::uuid;
      insert into sessions (id, user_id, program_day_id, program_name_snapshot,
                            day_name_snapshot, state, started_at, completed_at)
      values (v_session, v_athlete, v_day, 'Hypertrophy Block v3', 'Training ' || d,
              case when v_due <= 6 then 'completed' else 'in_progress' end::session_state,
              (v_start + v_offset)::timestamptz + interval '18 hours',
              case when v_due <= 6
                   then (v_start + v_offset)::timestamptz + interval '19 hours' end);

      v_sex := md5('coach-seed:sex:' || w || ':' || d)::uuid;
      insert into session_exercises (id, session_id, sequence, exercise_id,
                                     exercise_name_snapshot, rest_seconds_snapshot)
      values (v_sex, v_session, 1, v_squat, 'Competition Squat', 180);

      -- group_id snapshots the program block the set came from. The API sets it
      -- on every real session; without it the frontend treats each set as its
      -- own block and a block's collapsed state can never be read.
      insert into set_logs (id, session_exercise_id, user_id, exercise_id, sequence,
                            group_id, set_type, reps_target_min, reps_target_max,
                            prescribed_load_kg, prescribed_rpe,
                            reps_actual, actual_load_kg, actual_rpe,
                            state, completed_at)
      select md5('coach-seed:setlog:' || w || ':' || d || ':' || s)::uuid,
             v_sex, v_athlete, v_squat, s,
             md5('coach-seed:group:' || w || ':' || d)::uuid,
             'working', 5, 5, 136.0, 8.0,
             case when v_due <= 6 or s <= 3 then 5 end,
             case when v_due <= 6 or s <= 3 then 138.0 end,
             case when v_due <= 6 or s <= 3 then 8.5 end,
             case when v_due <= 6 or s <= 3 then 'completed' else 'pending' end::set_log_state,
             case when v_due <= 6 or s <= 3
                  then (v_start + v_offset)::timestamptz + interval '19 hours' end
        from generate_series(1, 4) s;

      continue when v_due > 6;

      -- Bench drifts further under the prescription each week, so the coach
      -- view has a deviation worth flagging (and a skipped set) to render.
      v_bench_kg := 90.0 - (w - 1) * 4;

      v_sex2 := md5('coach-seed:sex2:' || w || ':' || d)::uuid;
      insert into session_exercises (id, session_id, sequence, exercise_id,
                                     exercise_name_snapshot, rest_seconds_snapshot)
      values (v_sex2, v_session, 2, v_bench, 'Competition Bench Press', 120);

      insert into set_logs (id, session_exercise_id, user_id, exercise_id, sequence,
                            group_id, set_type, reps_target_min, reps_target_max,
                            prescribed_load_kg, prescribed_rpe,
                            reps_actual, actual_load_kg, actual_rpe,
                            state, completed_at)
      select md5('coach-seed:setlog2:' || w || ':' || d || ':' || s)::uuid,
             v_sex2, v_athlete, v_bench, s,
             md5('coach-seed:group2:' || w || ':' || d)::uuid,
             'working', 8, 10, 90.0, 7.0,
             case when s < 3 then 8 end,
             case when s < 3 then v_bench_kg end,
             case when s < 3 then 8.5 end,
             -- The last bench set of the final training day each week is
             -- abandoned: a skipped set reads differently from one never logged.
             case when s < 3 then 'completed' else 'skipped' end::set_log_state,
             case when s < 3
                  then (v_start + v_offset)::timestamptz + interval '19 hours' end
        from generate_series(1, 3) s;
    end loop;
  end loop;
end
$$;
