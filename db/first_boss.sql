-- First free boss at level 2 ("Gym Goblin"), replacing the level-2 plank challenge.
-- Bosses are now data-driven: a level is a boss level if it has a row in boss_battles
-- (previously hard-coded to every 5th level). Safe to run more than once.

-- 1. Allow boss rows on any level 1..50 (was: multiples of 5 only).
alter table public.boss_battles drop constraint if exists boss_battles_level_check;
alter table public.boss_battles add constraint boss_battles_level_check check (level >= 1 and level <= 50);

-- 2. The first boss. Bodyweight only, one round, 4 minute cap.
insert into public.boss_battles
  (level, name, description, rounds, structure, scaled_structure, time_cap_seconds,
   medal_silver_seconds, medal_gold_seconds, xp_reward,
   required_level_strength, required_level_mobility, required_level_conditioning)
values
  (2, 'Gym Goblin', 'Complete both exercises in 4 min. Rest only when needed.', 1,
   '[{"reps":20,"exercise_name":"Bodyweight Squat"},{"reps":20,"exercise_name":"Push-Up"}]'::jsonb,
   null, 240, null, null, 80, 1, 1, 1)
on conflict (level) do update set
  name = excluded.name, description = excluded.description, rounds = excluded.rounds,
  structure = excluded.structure, time_cap_seconds = excluded.time_cap_seconds,
  xp_reward = excluded.xp_reward;

-- 3. award_xp: XP freeze while a boss is pending now follows boss_battles instead of "% 5".
--    Only line changed vs. the previous version: v_is_boss_pending.
create or replace function public.award_xp(p_user_id uuid, p_xp integer)
returns integer
language plpgsql
security definer
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
  v_new_xp_strength := v_stats.xp_strength + round(v_xp_to_add * 0.4);
  v_new_xp_mobility := v_stats.xp_mobility + round(v_xp_to_add * 0.2);
  v_new_xp_conditioning := v_stats.xp_conditioning + round(v_xp_to_add * 0.4);

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

-- Check: select level, name, xp_reward from public.boss_battles order by level;
