-- ============================================================
-- WODXP: Monthly summary (backlog item 13)
--
-- Reconstructed 2026-11-04 from the production database
-- (pg_get_functiondef, column definitions and function ACLs), so
-- this file matches what is actually deployed. Safe to re-run.
--
-- Adds:
--   user_stats.last_summary_month  last month whose recap was seen
--   user_stats.summary_level       level when that recap was seen
--                                  (gives "level from -> to" next month)
-- Functions:
--   get_monthly_summary(p_month, p_tz)  logged-in users only
--   mark_monthly_summary_seen(p_month)  logged-in users only
--   _monthly_summary_for(...)           internal, not callable from the app
-- ============================================================

alter table public.user_stats
  add column if not exists last_summary_month date,
  add column if not exists summary_level integer;

-- ------------------------------------------------------------
-- Internal: builds the summary for one user and month.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._monthly_summary_for(p_user uuid, p_month date, p_tz text DEFAULT 'Europe/Stockholm'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tz text := coalesce((select name from pg_timezone_names where name = p_tz limit 1), 'UTC');
  v_m date := date_trunc('month', p_month)::date;
  v_start timestamptz;
  v_end timestamptz;
  v_prev_start timestamptz;
  v_out jsonb;
begin
  v_start := v_m::timestamp at time zone v_tz;
  v_end := (v_m + interval '1 month')::timestamp at time zone v_tz;
  v_prev_start := (v_m - interval '1 month')::timestamp at time zone v_tz;

  with sess as (
    select s.id, coalesce(s.completed_at, s.started_at) as ts, s.duration_minutes as mins
    from workout_sessions s
    where s.user_id = p_user and s.status = 'completed'
  ),
  m_sess as (select * from sess where ts >= v_start and ts < v_end),
  days as (select distinct (ts at time zone v_tz)::date as d from m_sess),
  islands as (select d, d - (row_number() over (order by d))::int as grp from days),
  sets as (
    select we.exercise_id, s.id as session_id, s.ts,
           coalesce(we.weight, 0) as w, coalesce(we.reps, 0) as r, coalesce(we.sets, 1) as st
    from workout_exercises we
    join sess s on s.id = we.session_id
    where we.completed is not false
  ),
  m_sets as (select * from sets where ts >= v_start and ts < v_end),
  top3 as (
    select e.name, e.equipment[1] as equipment,
           count(distinct m.session_id) as sessions,
           round(sum(m.w * m.r * m.st)) as volume_kg
    from m_sets m
    join exercises e on e.id = m.exercise_id
    group by e.id, e.name, e.equipment
    order by sessions desc, volume_kg desc, e.name
    limit 3
  ),
  best_m as (
    select exercise_id, max(w) as mw, max(r) filter (where w = 0) as mr
    from m_sets group by 1
  ),
  best_p as (
    select exercise_id, max(w) as pw, max(r) filter (where w = 0) as pr
    from sets where ts < v_start group by 1
  ),
  pbs as (
    select e.name, e.equipment[1] as equipment,
           case when bm.mw > 0 then 'weight' else 'reps' end as kind,
           case when bm.mw > 0 then bm.mw else bm.mr end as value,
           case when bm.mw > 0 then bp.pw else bp.pr end as previous
    from best_m bm
    join best_p bp using (exercise_id)
    join exercises e on e.id = bm.exercise_id
    where (bm.mw > 0 and bp.pw > 0 and bm.mw > bp.pw)
       or (bm.mw = 0 and bp.pr > 0 and bm.mr > bp.pr)
  ),
  attr_m as (
    select e.primary_attribute::text as a, count(*) as n
    from m_sets m join exercises e on e.id = m.exercise_id
    group by 1
  ),
  attr_h as (
    select e.primary_attribute::text as a,
           date_trunc('month', s.ts at time zone v_tz) as mon,
           count(*) as n
    from sets s join exercises e on e.id = s.exercise_id
    where s.ts < v_start and s.ts >= v_start - interval '6 months'
    group by 1, 2
  ),
  attr_avg as (
    select a, sum(n)::numeric / nullif((select count(distinct mon) from attr_h), 0) as avg_n
    from attr_h group by a
  ),
  tests_m as (
    select r.test_id, max(r.value) as best
    from fitness_test_results r
    where r.user_id = p_user and r.created_at >= v_start and r.created_at < v_end
    group by 1
  ),
  tests_p as (
    select r.test_id, max(r.value) as best
    from fitness_test_results r
    where r.user_id = p_user and r.created_at < v_start
    group by 1
  ),
  wods_m as (
    select a.wod_slot, count(*) as attempts,
           max(case a.medal when 'gold' then 3 when 'silver' then 2 when 'bronze' then 1 else 0 end) as medal_rank,
           min(a.duration_seconds) as best_seconds,
           max(a.score_value) as best_score
    from user_wod_attempts a
    where a.user_id = p_user and a.attempted_at >= v_start and a.attempted_at < v_end
    group by 1
  )
  select jsonb_build_object(
    'month', v_m,
    'timezone', v_tz,
    'workouts', (select count(*) from m_sess),
    'workouts_prev_month', (select count(*) from sess where ts >= v_prev_start and ts < v_start),
    'training_days', (select count(*) from days),
    'minutes', (select coalesce(sum(mins), 0) from m_sess),
    'longest_streak', (select coalesce(max(c), 0) from (select count(*) as c from islands group by grp) x),
    'favourite_weekday', (select mode() within group (order by extract(isodow from d)::int) from days),
    'volume_kg', (select coalesce(round(sum(w * r * st)), 0) from m_sets),
    'top_exercises', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from top3 t),
    'new_exercises', (select count(distinct m.exercise_id) from m_sets m
                      where not exists (select 1 from sets s
                                        where s.exercise_id = m.exercise_id and s.ts < v_start)),
    'personal_bests', (select coalesce(jsonb_agg(to_jsonb(p) order by p.value desc), '[]'::jsonb) from pbs p),
    'attributes', (select coalesce(jsonb_object_agg(am.a, jsonb_build_object('month', am.n, 'avg', round(av.avg_n, 1))), '{}'::jsonb)
                   from attr_m am left join attr_avg av using (a)),
    'fitness_tests', (select coalesce(jsonb_agg(jsonb_build_object(
                        'test_id', tm.test_id, 'name', ft.name, 'metric', ft.metric,
                        'best', tm.best, 'previous_best', tp.best,
                        'is_record', tp.best is null or tm.best > tp.best)), '[]'::jsonb)
                      from tests_m tm
                      join fitness_tests ft on ft.id = tm.test_id
                      left join tests_p tp using (test_id)),
    'wods', (select coalesce(jsonb_agg(jsonb_build_object(
               'slot', w.wod_slot, 'name', cw.name, 'scoring_type', cw.scoring_type,
               'attempts', w.attempts,
               'medal', case w.medal_rank when 3 then 'gold' when 2 then 'silver' when 1 then 'bronze' end,
               'best_seconds', w.best_seconds, 'best_score', w.best_score)
               order by w.medal_rank desc), '[]'::jsonb)
             from wods_m w join classic_wods cw on cw.slot = w.wod_slot),
    'bosses_defeated', (select coalesce(jsonb_agg(distinct b.name), '[]'::jsonb)
                        from user_boss_attempts a
                        join boss_battles b on b.level = a.boss_level
                        where a.user_id = p_user and a.passed
                          and a.attempted_at >= v_start and a.attempted_at < v_end),
    'challenges_cleared', (select coalesce(jsonb_agg(c.name order by c.level), '[]'::jsonb)
                           from user_level_progress p
                           join level_challenges c on c.level = p.level
                           where p.user_id = p_user and p.cleared
                             and p.cleared_at >= v_start and p.cleared_at < v_end),
    'level_now', (select level from user_stats where user_id = p_user)
  ) into v_out;

  return v_out;
end
$function$;

-- ------------------------------------------------------------
-- App: summary for the logged-in user (default: previous month).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monthly_summary(p_month date DEFAULT NULL::date, p_tz text DEFAULT 'Europe/Stockholm'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_tz text := coalesce((select name from pg_timezone_names where name = p_tz limit 1), 'UTC');
  v_current date;
  v_month date;
  v_last date;
  v_level integer;
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_current := date_trunc('month', now() at time zone v_tz)::date;
  v_month := coalesce(date_trunc('month', p_month)::date, (v_current - interval '1 month')::date);
  if v_month > v_current then
    raise exception 'Month is in the future';
  end if;

  select last_summary_month, summary_level into v_last, v_level
  from user_stats where user_id = v_uid;

  v_out := public._monthly_summary_for(v_uid, v_month, v_tz);

  return v_out || jsonb_build_object(
    'level_from', case when v_last = (v_month - interval '1 month')::date then v_level end,
    'already_seen', coalesce(v_last >= v_month, false),
    'is_complete', v_month < v_current,
    'has_data', (v_out->>'workouts')::int > 0
                or jsonb_array_length(v_out->'fitness_tests') > 0
                or jsonb_array_length(v_out->'wods') > 0
                or jsonb_array_length(v_out->'bosses_defeated') > 0
  );
end
$function$;

-- ------------------------------------------------------------
-- App: mark a month's recap as seen and remember the current level.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_monthly_summary_seen(p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update user_stats
     set last_summary_month = greatest(coalesce(last_summary_month, date '1900-01-01'),
                                       date_trunc('month', p_month)::date),
         summary_level = level
   where user_id = auth.uid();
end
$function$;

-- ------------------------------------------------------------
-- Permissions (match production): the two app functions are for
-- logged-in users only; the internal one is not callable from the app.
-- ------------------------------------------------------------
revoke all on function public._monthly_summary_for(uuid, date, text) from public, anon, authenticated;
revoke all on function public.get_monthly_summary(date, text) from public, anon;
revoke all on function public.mark_monthly_summary_seen(date) from public, anon;
grant execute on function public.get_monthly_summary(date, text) to authenticated;
grant execute on function public.mark_monthly_summary_seen(date) to authenticated;
