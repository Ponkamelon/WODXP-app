-- Rest-day "welcome back" bonus: after a streak of 5+ days and at least one full rest day,
-- the next time the app opens the user gets +25 XP, once per streak.
-- (A new streak of 5+ days is needed to earn it again.) Safe to run more than once.

alter table public.user_stats add column if not exists rest_bonus_for date;
-- rest_bonus_for = last_workout_date of the streak that already paid out.

create or replace function public.claim_rest_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s user_stats%rowtype;
  c_bonus constant int := 25;
  c_min_streak constant int := 5;
begin
  if v_uid is null then
    return jsonb_build_object('granted', false);
  end if;

  select * into v_s from user_stats where user_id = v_uid for update;
  if not found then
    return jsonb_build_object('granted', false);
  end if;

  -- Needs: a finished streak of 5+ days, at least one full day since the last workout,
  -- and no bonus paid yet for this streak (tracked by its last workout date).
  if v_s.last_workout_date is null
     or v_s.last_workout_date >= current_date - 1
     or coalesce(v_s.current_streak, 0) < c_min_streak
     or v_s.rest_bonus_for is not distinct from v_s.last_workout_date then
    return jsonb_build_object('granted', false);
  end if;

  update user_stats
     set xp_total = xp_total + c_bonus,
         rest_bonus_for = v_s.last_workout_date,
         updated_at = now()
   where user_id = v_uid;

  return jsonb_build_object('granted', true, 'xp', c_bonus, 'streak', v_s.current_streak);
end;
$$;

revoke all on function public.claim_rest_bonus() from public, anon;
grant execute on function public.claim_rest_bonus() to authenticated;
