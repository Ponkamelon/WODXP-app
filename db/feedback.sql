-- ============================================================================
-- Feedback v1: users send free-text feedback from Profile -> Give Feedback.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- * Table public.user_feedback, one row per submission, linked to the user and
--   removed automatically when the account is deleted (ON DELETE CASCADE).
-- * Users can only READ and DELETE their own rows (RLS). They cannot insert,
--   edit or read anyone else's feedback. Inserts go through submit_feedback().
-- * submit_feedback(): checks login, 1-1000 characters, max 5 per 24 hours.
-- * purge_old_feedback(): deletes feedback older than 12 months. Not callable
--   from the app. Run it by hand now and then, or schedule it (see bottom).
--
-- Read the feedback (SQL Editor runs as admin, so RLS does not apply):
--   select f.created_at, f.user_level, f.source, u.username, f.feedback_text
--     from public.user_feedback f
--     left join public.users u on u.id = f.user_id
--    order by f.created_at desc;
-- ============================================================================

create table if not exists public.user_feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  user_level    int,
  source        text not null default 'profile',
  feedback_text text not null check (char_length(feedback_text) between 1 and 1000)
);

create index if not exists user_feedback_user_idx    on public.user_feedback (user_id, created_at desc);
create index if not exists user_feedback_created_idx on public.user_feedback (created_at desc);

alter table public.user_feedback enable row level security;

drop policy if exists "feedback_select_own" on public.user_feedback;
create policy "feedback_select_own" on public.user_feedback
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "feedback_delete_own" on public.user_feedback;
create policy "feedback_delete_own" on public.user_feedback
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.user_feedback from anon, authenticated;
grant select, delete on public.user_feedback to authenticated;

create or replace function public.submit_feedback(p_text text, p_level int default null, p_source text default 'profile')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(v_text) < 1 or char_length(v_text) > 1000 then
    raise exception 'invalid_text';
  end if;
  if (select count(*) from public.user_feedback
       where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limited';
  end if;

  insert into public.user_feedback (user_id, user_level, source, feedback_text)
  values (
    v_uid,
    case when p_level between 1 and 1000 then p_level else null end,
    case when p_source = 'profile' then 'profile' else 'profile' end,
    v_text
  );
end;
$$;

revoke all on function public.submit_feedback(text, int, text) from public, anon;
grant execute on function public.submit_feedback(text, int, text) to authenticated;

create or replace function public.purge_old_feedback()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.user_feedback where created_at < now() - interval '12 months';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_old_feedback() from public, anon, authenticated;

-- Optional: schedule the purge monthly if the pg_cron extension is enabled
-- (Database -> Extensions -> pg_cron). Otherwise run `select public.purge_old_feedback();` by hand.
--   select cron.schedule('purge-old-feedback', '0 3 1 * *', $$select public.purge_old_feedback();$$);
