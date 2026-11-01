-- ============================================================================
-- Feedback: optional star rating (1-5). Run once in the Supabase SQL Editor
-- after db/feedback.sql. Safe to re-run.
--
-- * New column public.user_feedback.rating (1-5, optional).
-- * Text is now optional when a rating is given (stars alone are enough),
--   but a submission needs at least a rating or some text. Max 1000 characters.
-- * submit_feedback() gets a p_rating argument (the old 3-argument version is
--   replaced) and now allows ONE feedback per user per level (replaces the
--   5-per-24-hours limit). A second try at the same level raises
--   'already_sent_for_level'.
-- * has_feedback_for_level(level): lets the app show "already sent" up front.
-- * Users can no longer read or delete feedback from the app (policies and
--   grants removed). Deletion on request is done by the owner in the SQL Editor:
--     delete from public.user_feedback where user_id = '<user id>';
--   Feedback is still deleted automatically with the account.
--
-- Read feedback with stars:
--   select f.created_at, f.user_level, f.rating, u.username, f.feedback_text
--     from public.user_feedback f
--     left join public.users u on u.id = f.user_id
--    order by f.created_at desc;
-- Average rating:
--   select round(avg(rating), 2) as avg_rating, count(rating) as rated from public.user_feedback;
-- ============================================================================

alter table public.user_feedback add column if not exists rating smallint;

alter table public.user_feedback drop constraint if exists user_feedback_rating_check;
alter table public.user_feedback add constraint user_feedback_rating_check
  check (rating is null or rating between 1 and 5);

alter table public.user_feedback drop constraint if exists user_feedback_feedback_text_check;
alter table public.user_feedback drop constraint if exists user_feedback_content_check;
alter table public.user_feedback add constraint user_feedback_content_check
  check (char_length(feedback_text) <= 1000 and (rating is not null or char_length(feedback_text) >= 1));

drop function if exists public.submit_feedback(text, int, text);

create or replace function public.submit_feedback(
  p_text text, p_level int default null, p_source text default 'profile', p_rating int default null
)
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
  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'invalid_rating';
  end if;
  if char_length(v_text) > 1000 or (p_rating is null and char_length(v_text) < 1) then
    raise exception 'invalid_text';
  end if;
  if p_level is null or p_level < 1 then
    raise exception 'invalid_level';
  end if;
  -- Serialise a user's submissions so two quick taps cannot both pass the check.
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if exists (select 1 from public.user_feedback where user_id = v_uid and user_level = p_level) then
    raise exception 'already_sent_for_level';
  end if;

  insert into public.user_feedback (user_id, user_level, source, feedback_text, rating)
  values (v_uid, least(p_level, 1000), 'profile', v_text, p_rating);
end;
$$;

revoke all on function public.submit_feedback(text, int, text, int) from public, anon;
grant execute on function public.submit_feedback(text, int, text, int) to authenticated;

create or replace function public.has_feedback_for_level(p_level int)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_feedback where user_id = auth.uid() and user_level = p_level
  );
$$;

revoke all on function public.has_feedback_for_level(int) from public, anon;
grant execute on function public.has_feedback_for_level(int) to authenticated;

-- Users no longer read or delete their own feedback from the app.
drop policy if exists "feedback_select_own" on public.user_feedback;
drop policy if exists "feedback_delete_own" on public.user_feedback;
revoke all on public.user_feedback from anon, authenticated;
