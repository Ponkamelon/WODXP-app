-- Premium lock: Fitness Tests and WODXP (classic WODs) require Premium to SAVE new results.
-- Existing results stay readable (history is never locked). Friends, XP, levels, bosses,
-- level challenges and normal workouts are NOT affected.
-- Safe to run more than once.
--
-- BEFORE running: make sure the testers who should keep access have a code
-- (see db/access_codes.sql), and that your own account has Premium, otherwise
-- you lock yourself out of these two features until you redeem a code.

-- 1. WODXP: attempt_classic_wod now requires Premium and your own user id.
create or replace function public.attempt_classic_wod(p_user_id uuid, p_slot integer, p_score_value integer)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_wod classic_wods%rowtype;
  v_medal text := null;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'not_authorized';
  end if;
  if not public.is_premium(auth.uid()) then
    raise exception 'premium_required';
  end if;

  select * into v_wod from classic_wods where slot = p_slot;
  if v_wod.slot is null then
    raise exception 'No WOD found for slot %', p_slot;
  end if;

  if v_wod.scoring_type = 'time' then
    -- Lower is better: lowest thresholds unlock the best medals.
    if p_score_value <= v_wod.medal_gold_value then v_medal := 'gold';
    elsif p_score_value <= v_wod.medal_silver_value then v_medal := 'silver';
    elsif p_score_value <= v_wod.medal_bronze_value then v_medal := 'bronze';
    end if;
  else
    -- rounds / points: higher is better.
    if p_score_value >= v_wod.medal_gold_value then v_medal := 'gold';
    elsif p_score_value >= v_wod.medal_silver_value then v_medal := 'silver';
    elsif p_score_value >= v_wod.medal_bronze_value then v_medal := 'bronze';
    end if;
  end if;

  insert into user_wod_attempts (user_id, wod_slot, duration_seconds, score_value, medal)
  values (p_user_id, p_slot, case when v_wod.scoring_type = 'time' then p_score_value else null end, p_score_value, v_medal);

  return v_medal;
end;
$function$;

-- 2. Fitness Tests: the single "ALL" policy is split so that only INSERT needs Premium.
drop policy if exists own_fitness_test_results on public.fitness_test_results;
drop policy if exists fitness_test_results_select_own on public.fitness_test_results;
drop policy if exists fitness_test_results_insert_premium on public.fitness_test_results;
drop policy if exists fitness_test_results_update_own on public.fitness_test_results;
drop policy if exists fitness_test_results_delete_own on public.fitness_test_results;

create policy fitness_test_results_select_own on public.fitness_test_results
  for select using (auth.uid() = user_id);
create policy fitness_test_results_insert_premium on public.fitness_test_results
  for insert with check (auth.uid() = user_id and public.is_premium(auth.uid()));
create policy fitness_test_results_update_own on public.fitness_test_results
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy fitness_test_results_delete_own on public.fitness_test_results
  for delete using (auth.uid() = user_id);

-- Check afterwards:
--   select polname, polcmd from pg_policy where polrelid = 'public.fitness_test_results'::regclass;
