-- ============================================================================
-- Starred exercises: from Quest level 4 a user can star exercises they like. Starred exercises are
-- picked more often in generated workouts (1-3 per workout, at most a third of it).
-- Run once in the Supabase SQL Editor ("Run without RLS"). Safe to re-run.
--
-- Users can only read, add and remove THEIR OWN stars. Deleting an account removes its stars.
-- The level 4 limit is checked in the app (the feature is free, so it is not a security matter).
--
-- Follow up (SQL Editor): which exercises are starred most?
--   select e.name, count(*) as stars from public.user_starred_exercises s
--     join public.exercises e on e.id = s.exercise_id group by e.id, e.name order by stars desc, e.name limit 50;
-- ============================================================================

create table if not exists public.user_starred_exercises (
  user_id     uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create index if not exists user_starred_exercises_exercise_idx on public.user_starred_exercises (exercise_id);

alter table public.user_starred_exercises enable row level security;

drop policy if exists starred_select_own on public.user_starred_exercises;
drop policy if exists starred_insert_own on public.user_starred_exercises;
drop policy if exists starred_delete_own on public.user_starred_exercises;
create policy starred_select_own on public.user_starred_exercises for select using (auth.uid() = user_id);
create policy starred_insert_own on public.user_starred_exercises for insert with check (auth.uid() = user_id);
create policy starred_delete_own on public.user_starred_exercises for delete using (auth.uid() = user_id);

revoke all on public.user_starred_exercises from anon, public;
grant select, insert, delete on public.user_starred_exercises to authenticated;

-- Safety net: at most 100 stars per user.
create or replace function public.limit_starred_exercises()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.user_starred_exercises where user_id = new.user_id) >= 100 then
    raise exception 'too_many_starred_exercises';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_starred_exercises_trg on public.user_starred_exercises;
create trigger limit_starred_exercises_trg before insert on public.user_starred_exercises
  for each row execute function public.limit_starred_exercises();
