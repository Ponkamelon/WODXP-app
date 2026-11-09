-- ============================================================================
-- Boss and Level Challenge XP also feed the attributes (item 11, decision 2026-11-09), and a
-- security fix for the two functions that award it.
-- Run once in the Supabase SQL Editor ("Run without RLS"). Safe to re-run.
--
-- 1. Attribute XP. A cleared Boss battle or Level Challenge used to add its reward to xp_total only, so
--    beating a boss never unlocked new exercises (exercises follow the highest attribute level). The reward
--    is now split like a normal workout: 40% Strength, 20% Mobility, 40% Conditioning, and the attribute
--    levels are updated. xp_total is unchanged by this. It applies from now on; rewards already collected
--    are NOT recalculated.
--
-- 2. Security. attempt_boss_battle and clear_level_challenge took a user id from the caller without
--    checking who the caller was, and could be called by anyone (even without being logged in). Anyone who
--    knew a user id could have cleared bosses and collected XP in that account. They now require
--    auth.uid() = p_user_id, have a fixed search_path, and cannot be called by anon.
--    (Same fix as for award_xp in db/mix_attribute_xp.sql.)
--
-- Replaces: attempt_boss_battle(uuid, int, boolean, int, boolean), clear_level_challenge(uuid, int, boolean)
-- ============================================================================

create or replace function public.attempt_boss_battle(
  p_user_id uuid,
  p_level integer,
  p_passed boolean,
  p_duration_seconds integer default null,
  p_used_scaled boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_current_level int;
  v_boss boss_battles%rowtype;
  v_medal text := null;
  v_str int;
  v_mob int;
  v_cond int;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not allowed';
  end if;

  select level into v_current_level from user_stats where user_id = p_user_id for update;

  if p_level != v_current_level + 1 then
    raise exception 'Boss level % is not the next available level (current: %)', p_level, v_current_level;
  end if;

  select * into v_boss from boss_battles where level = p_level;
  if v_boss.level is null then
    raise exception 'No boss battle found for level %', p_level;
  end if;

  if p_passed then
    if p_duration_seconds is not null and v_boss.medal_gold_seconds is not null and p_duration_seconds <= v_boss.medal_gold_seconds then
      v_medal := 'gold';
    elsif p_duration_seconds is not null and v_boss.medal_silver_seconds is not null and p_duration_seconds <= v_boss.medal_silver_seconds then
      v_medal := 'silver';
    else
      v_medal := 'bronze';
    end if;
  end if;

  insert into user_boss_attempts (user_id, boss_level, passed, duration_seconds, used_scaled, medal)
  values (p_user_id, p_level, p_passed, p_duration_seconds, p_used_scaled, v_medal);

  -- Failing never removes XP, levels, attributes or streaks (spec section 23): we simply don't advance
  -- `level`, and the user can try again anytime.
  if p_passed then
    insert into user_level_progress (user_id, level, cleared, cleared_at, used_scaled)
    values (p_user_id, p_level, true, now(), p_used_scaled)
    on conflict (user_id, level) do update set cleared = true, cleared_at = now(), used_scaled = p_used_scaled;

    v_str  := round(v_boss.xp_reward * 0.4);
    v_mob  := round(v_boss.xp_reward * 0.2);
    v_cond := round(v_boss.xp_reward * 0.4);

    update user_stats set
      level = p_level,
      xp_total = xp_total + v_boss.xp_reward,
      xp_strength = xp_strength + v_str,
      xp_mobility = xp_mobility + v_mob,
      xp_conditioning = xp_conditioning + v_cond,
      level_strength = greatest(level_strength, xp_curve_level(xp_strength + v_str)),
      level_mobility = greatest(level_mobility, xp_curve_level(xp_mobility + v_mob)),
      level_conditioning = greatest(level_conditioning, xp_curve_level(xp_conditioning + v_cond)),
      updated_at = now()
    where user_id = p_user_id;
  end if;

  return v_medal;
end;
$function$;

create or replace function public.clear_level_challenge(
  p_user_id uuid,
  p_level integer,
  p_used_scaled boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_current_level int;
  v_xp_reward int;
  v_str int;
  v_mob int;
  v_cond int;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not allowed';
  end if;

  select level into v_current_level from user_stats where user_id = p_user_id for update;

  if p_level != v_current_level + 1 then
    raise exception 'Level % is not the next available level (current: %)', p_level, v_current_level;
  end if;

  select xp_reward into v_xp_reward from level_challenges where level = p_level;
  if v_xp_reward is null then
    raise exception 'No level challenge found for level %', p_level;
  end if;

  insert into user_level_progress (user_id, level, cleared, cleared_at, used_scaled)
  values (p_user_id, p_level, true, now(), p_used_scaled)
  on conflict (user_id, level) do update set cleared = true, cleared_at = now(), used_scaled = p_used_scaled;

  v_str  := round(v_xp_reward * 0.4);
  v_mob  := round(v_xp_reward * 0.2);
  v_cond := round(v_xp_reward * 0.4);

  update user_stats set
    level = p_level,
    xp_total = xp_total + v_xp_reward,
    xp_strength = xp_strength + v_str,
    xp_mobility = xp_mobility + v_mob,
    xp_conditioning = xp_conditioning + v_cond,
    level_strength = greatest(level_strength, xp_curve_level(xp_strength + v_str)),
    level_mobility = greatest(level_mobility, xp_curve_level(xp_mobility + v_mob)),
    level_conditioning = greatest(level_conditioning, xp_curve_level(xp_conditioning + v_cond)),
    updated_at = now()
  where user_id = p_user_id;
end;
$function$;

-- Only logged-in users (and the server) may call them; anon may not.
revoke all on function public.attempt_boss_battle(uuid, integer, boolean, integer, boolean) from public, anon, authenticated;
grant execute on function public.attempt_boss_battle(uuid, integer, boolean, integer, boolean) to authenticated, service_role;
revoke all on function public.clear_level_challenge(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.clear_level_challenge(uuid, integer, boolean) to authenticated, service_role;
