-- ============================================================================
-- Blocked exercises: a user can block an exercise ("don't show this again").
-- Blocked exercises are left out of generated workouts and swaps. The user can
-- unblock under Exercises -> Blocked. Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Users can only read, add and remove THEIR OWN blocks. No reason is stored
-- (a reason such as an injury would be health data).
-- Deleting an account removes its blocks.
--
-- Follow up (SQL Editor): which exercises are blocked most?
--   select e.name, e.id, count(*) as blocks, min(b.created_at) as first_block, max(b.created_at) as last_block
--     from public.user_blocked_exercises b join public.exercises e on e.id = b.exercise_id
--    group by e.id, e.name order by blocks desc, e.name limit 50;
-- Blocks per user (to spot someone blocking almost everything):
--   select user_id, count(*) from public.user_blocked_exercises group by 1 order by 2 desc;
-- Share of users that blocked something:
--   select count(distinct user_id) as users_blocking, (select count(*) from auth.users) as users from public.user_blocked_exercises;
-- ============================================================================

create table if not exists public.user_blocked_exercises (
  user_id     uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create index if not exists user_blocked_exercises_exercise_idx on public.user_blocked_exercises (exercise_id);

alter table public.user_blocked_exercises enable row level security;

drop policy if exists blocked_select_own on public.user_blocked_exercises;
drop policy if exists blocked_insert_own on public.user_blocked_exercises;
drop policy if exists blocked_delete_own on public.user_blocked_exercises;
create policy blocked_select_own on public.user_blocked_exercises for select using (auth.uid() = user_id);
create policy blocked_insert_own on public.user_blocked_exercises for insert with check (auth.uid() = user_id);
create policy blocked_delete_own on public.user_blocked_exercises for delete using (auth.uid() = user_id);

revoke all on public.user_blocked_exercises from anon, public;
grant select, insert, delete on public.user_blocked_exercises to authenticated;

-- Safety net: at most 300 blocks per user (stops a runaway client from filling the table).
create or replace function public.limit_blocked_exercises()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.user_blocked_exercises where user_id = new.user_id) >= 300 then
    raise exception 'too_many_blocked_exercises';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_blocked_exercises_trg on public.user_blocked_exercises;
create trigger limit_blocked_exercises_trg before insert on public.user_blocked_exercises
  for each row execute function public.limit_blocked_exercises();
