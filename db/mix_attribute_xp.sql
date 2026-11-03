-- ============================================================================
-- Mixed workouts give double attribute XP.
-- Until now every workout split its XP 40/20/40 over Strength/Mobility/Endurance,
-- so the three attributes grew far slower than the Quest level (which counts all XP).
-- Now a workout started with Goal = "Mixed" gives 2x to the attributes:
--   Strength 80 %, Mobility 40 %, Endurance 80 % of the workout XP.
-- Quest XP (xp_total) is NOT changed. Other goals keep 40/20/40.
-- Applies from now on; existing attribute XP is not recalculated.
-- ALSO closes a hole: award_xp could be called by anyone (even signed-out) for ANY user id.
--   * award_xp_core = the XP logic (identical to production apart from the Mixed bonus:
--     daily limit of 2, boss freeze, streak). NOT callable by clients.
--   * award_xp (what the app calls) now requires that you are signed in as p_user_id and
--     that p_xp is between 0 and 400 (the most a workout can give is 6 exercises x 49 XP).
--   * friends_grant_bonus (server only) now calls award_xp_core.
-- Run once in the Supabase SQL Editor ("Run without RLS"). Safe to re-run.
-- ============================================================================

drop function if exists public.award_xp(uuid, integer);

create or replace function public.award_xp_core(p_user_id uuid, p_xp integer, p_mixed boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_stats user_stats%rowtype;
  v_pending_level int;
  v_is_boss_pending boolean;
  v_xp_derived_level_before int;
  v_xp_to_add int := p_xp;
  v_new_xp_total int;
  v_new_xp_strength int;
  v_new_xp_mobility int;
  v_new_xp_conditioning int;
  v_attr_mult numeric := case when coalesce(p_mixed, false) then 2 else 1 end;
  v_today date := current_date;
  v_new_streak int;
  v_workouts_today int;
begin
  select * into v_stats from user_stats where user_id = p_user_id for update;

  if v_stats.xp_workouts_date is distinct from v_today then
    v_workouts_today := 0;
  else
    v_workouts_today := v_stats.xp_workouts_today;
  end if;

  if v_workouts_today >= 2 then
    v_xp_to_add := 0;
  else
    v_workouts_today := v_workouts_today + 1;
  end if;

  v_pending_level := v_stats.level + 1;
  v_is_boss_pending := exists (select 1 from boss_battles where level = v_pending_level);
  v_xp_derived_level_before := xp_curve_level(v_stats.xp_total);

  if v_is_boss_pending and v_pending_level <= 50 and v_xp_derived_level_before >= v_pending_level then
    v_xp_to_add := 0;
  end if;

  v_new_xp_total := v_stats.xp_total + v_xp_to_add;
  v_new_xp_strength := v_stats.xp_strength + round(v_xp_to_add * 0.4 * v_attr_mult);
  v_new_xp_mobility := v_stats.xp_mobility + round(v_xp_to_add * 0.2 * v_attr_mult);
  v_new_xp_conditioning := v_stats.xp_conditioning + round(v_xp_to_add * 0.4 * v_attr_mult);

  if v_stats.last_workout_date = v_today then
    v_new_streak := v_stats.current_streak;
  elsif v_stats.last_workout_date = v_today - 1 then
    v_new_streak := v_stats.current_streak + 1;
  else
    v_new_streak := 1;
  end if;

  update user_stats set
    xp_total = v_new_xp_total,
    xp_strength = v_new_xp_strength,
    xp_mobility = v_new_xp_mobility,
    xp_conditioning = v_new_xp_conditioning,
    level_strength = greatest(v_stats.level_strength, xp_curve_level(v_new_xp_strength)),
    level_mobility = greatest(v_stats.level_mobility, xp_curve_level(v_new_xp_mobility)),
    level_conditioning = greatest(v_stats.level_conditioning, xp_curve_level(v_new_xp_conditioning)),
    xp_workouts_today = v_workouts_today,
    xp_workouts_date = v_today,
    current_streak = v_new_streak,
    longest_streak = greatest(v_stats.longest_streak, v_new_streak),
    last_workout_date = v_today,
    updated_at = now()
  where user_id = p_user_id;

  return v_xp_to_add;
end;
$function$;

revoke all on function public.award_xp_core(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.award_xp_core(uuid, integer, boolean) to service_role;

-- What the app calls. Only for yourself, and with a sane XP amount.
create or replace function public.award_xp(p_user_id uuid, p_xp integer, p_mixed boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not_authorized';
  end if;
  if p_xp is null or p_xp < 0 or p_xp > 400 then
    raise exception 'invalid_xp';
  end if;
  return public.award_xp_core(p_user_id, p_xp, coalesce(p_mixed, false));
end;
$function$;

revoke all on function public.award_xp(uuid, integer, boolean) from public, anon;
grant execute on function public.award_xp(uuid, integer, boolean) to authenticated, service_role;

-- Friends bonuses are booked for the RECEIVER by the server, so they use the core.
create or replace function public.friends_grant_bonus(p_uid uuid, p_xp integer) returns integer
language sql security definer set search_path = public as $$
  select public.award_xp_core(p_uid, p_xp, false);
$$;
