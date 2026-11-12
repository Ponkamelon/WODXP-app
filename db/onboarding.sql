-- ============================================================================
-- Onboarding carousel (backlog 14): remembers on the account that the intro has been seen,
-- so it follows the user to a new phone. Existing users see it once too (the column starts empty).
-- Run once in the Supabase SQL Editor. Safe to re-run.
--   mark_onboarding_seen()   logged-in users only, sets onboarding_seen_at once for the caller
-- Follow up: select count(*) filter (where onboarding_seen_at is not null) as seen, count(*) as users from public.user_stats;
-- ============================================================================

alter table public.user_stats add column if not exists onboarding_seen_at timestamptz;

create or replace function public.mark_onboarding_seen()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.user_stats
     set onboarding_seen_at = coalesce(onboarding_seen_at, now())
   where user_id = auth.uid();
end
$$;

revoke all on function public.mark_onboarding_seen() from public, anon;
grant execute on function public.mark_onboarding_seen() to authenticated;
