-- ============================================================================
-- One-time backfill for db/boss_attribute_xp.sql (item 11): gives the attributes the XP from Boss battles and
-- Level Challenges that were cleared BEFORE that change (2026-11-09 14:25 UTC). From that moment new clears
-- already add attribute XP, so only older clears are counted here.
-- Run once in the Supabase SQL Editor ("Run without RLS"). It marks itself as done (one_time_jobs) and does
-- nothing if run again, so it can never count the same XP twice.
--
-- For each cleared level in user_level_progress, the reward is the Boss reward if the level has a boss,
-- otherwise the Level Challenge reward. It is split 40% Strength / 20% Mobility / 40% Conditioning, like
-- a workout. xp_total is NOT changed (it already includes these rewards). Attribute levels are updated.
-- Levels without a recorded clear in user_level_progress are not counted.
-- ============================================================================

create table if not exists public.one_time_jobs (
  name   text primary key,
  ran_at timestamptz not null default now()
);
alter table public.one_time_jobs enable row level security;
revoke all on public.one_time_jobs from anon, authenticated, public;

do $job$
declare
  v_rows int;
begin
  if exists (select 1 from public.one_time_jobs where name = 'boss_attribute_backfill_2026_11') then
    raise notice 'Backfill already run: nothing done.';
    return;
  end if;

  with r as (
    select p.user_id, sum(coalesce(b.xp_reward, c.xp_reward)) as reward
    from public.user_level_progress p
    left join public.boss_battles b on b.level = p.level
    left join public.level_challenges c on c.level = p.level
    where p.cleared and p.cleared_at < '2026-11-09 14:25:00+00'
    group by p.user_id
  ), add_xp as (
    select user_id, round(reward * 0.4)::int as s, round(reward * 0.2)::int as m, round(reward * 0.4)::int as c
    from r where reward > 0
  )
  update public.user_stats us set
    xp_strength        = us.xp_strength + a.s,
    xp_mobility        = us.xp_mobility + a.m,
    xp_conditioning    = us.xp_conditioning + a.c,
    level_strength     = greatest(us.level_strength,     public.xp_curve_level(us.xp_strength + a.s)),
    level_mobility     = greatest(us.level_mobility,     public.xp_curve_level(us.xp_mobility + a.m)),
    level_conditioning = greatest(us.level_conditioning, public.xp_curve_level(us.xp_conditioning + a.c)),
    updated_at = now()
  from add_xp a
  where us.user_id = a.user_id;
  get diagnostics v_rows = row_count;

  insert into public.one_time_jobs (name) values ('boss_attribute_backfill_2026_11');
  raise notice 'Backfill done for % user(s).', v_rows;
end
$job$;
