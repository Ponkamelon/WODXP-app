-- Delete Account: lets a signed-in user permanently delete their own account.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- What it removes: the auth user (login, sessions, identities) and, through
-- ON DELETE CASCADE, public.users and all history: workout_sessions and
-- workout_exercises, personal_bests, user_stats, user_level_progress, boss and
-- WOD attempts, fitness_test_results, friendships (and with them the shared
-- challenge invites and XP events), friend invitations the user sent, friend
-- settings, blocks and challenge reservations.
-- Also removed here: friend invitations that other users sent to this user's
-- email address, so the address does not stay behind in someone else's invite.
-- challenge_xp_events rows that only point at the user are anonymised by the
-- existing ON DELETE SET NULL on user_id.
--
-- Also records one anonymous row (time only) in public.account_deletions.
--
-- Security: SECURITY DEFINER, but it only ever acts on auth.uid(), so a user can
-- delete nobody but themselves. Not callable by anon.

-- Anonymous deletion counter: one row per deleted account with ONLY the time.
-- No user id, email, username or anything else, so it holds no personal data.
-- Nobody can read it from the app (RLS on, no policies); query it in the SQL Editor:
--   select date_trunc('week', deleted_at) as week, count(*) from public.account_deletions group by 1 order by 1;
create table if not exists public.account_deletions (
  id         bigint generated always as identity primary key,
  deleted_at timestamptz not null default now()
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon, authenticated;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if not found then
    return;  -- already deleted (e.g. a double tap): do nothing, count nothing
  end if;

  if v_email is not null then
    delete from public.friend_invitations
     where lower(invited_email) = lower(v_email);
  end if;

  -- Count the deletion (time only) in the same transaction as the delete itself.
  insert into public.account_deletions default values;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
