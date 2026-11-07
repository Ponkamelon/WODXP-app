-- ============================================================================
-- Stripe payments -> Premium. The Stripe webhook (app/api/stripe-webhook) calls
-- grant_premium_from_payment() with the service role after it has verified Stripe's signature.
-- Run once in the Supabase SQL Editor ("Run without RLS"). Safe to re-run.
--
-- Needs db/access_codes.sql to be in place first (user_premium).
--
-- stripe_payments   one row per Checkout Session (the session id is the primary key, so the same
--                   payment can never be counted twice, even if Stripe sends the event again).
--                   Not readable or writable from the app.
--
-- grant_premium_from_payment(session_id, user_id, months, amount_total, currency, email, livemode)
--                   Records the payment and adds `months` of Premium for the user. Months count from
--                   today, or from the current end date if Premium is still active (same as codes).
--                   Callable by service_role only (the webhook), never from the app.
--                   Returns {ok, granted, duplicate, premium_until, reason}.
--
-- Payments that could not be matched to an account (no user id on the payment, or the account is
-- gone) are saved with granted_at empty and a note. Look at them with:
--   select created_at, stripe_session_id, customer_email, amount_total, currency, livemode, note
--     from public.stripe_payments where granted_at is null order by created_at desc;
-- Give Premium by hand afterwards with an access code (db/access_codes.sql), then:
--   update public.stripe_payments set granted_at = now(), note = 'granted by code' where stripe_session_id = '...';
--
-- All payments:
--   select p.created_at, p.livemode, p.amount_total / 100.0 as amount, p.currency, p.customer_email,
--          (select username from public.users u where u.id = p.user_id) as username, p.granted_at, p.note
--     from public.stripe_payments p order by p.created_at desc;
-- ============================================================================

create table if not exists public.stripe_payments (
  stripe_session_id text primary key,
  user_id           uuid references auth.users (id) on delete set null,
  months            int,
  amount_total      int,                       -- in the smallest unit (49 SEK = 4900)
  currency          text,
  customer_email    text,
  livemode          boolean not null default false,
  granted_at        timestamptz,
  note              text,
  created_at        timestamptz not null default now()
);
create index if not exists stripe_payments_user_idx on public.stripe_payments (user_id);
alter table public.stripe_payments enable row level security;
revoke all on public.stripe_payments from anon, authenticated;

create or replace function public.grant_premium_from_payment(
  p_session_id text,
  p_user_id    uuid,
  p_months     int,
  p_amount     int,
  p_currency   text,
  p_email      text,
  p_livemode   boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
  v_user_ok  boolean;
  v_prem     public.user_premium%rowtype;
  v_base     timestamptz;
  v_until    timestamptz;
begin
  if coalesce(p_session_id, '') = '' then
    raise exception 'session id required';
  end if;
  if p_months is null or p_months < 1 or p_months > 120 then
    raise exception 'months must be between 1 and 120';
  end if;

  -- The payment is recorded first. A second delivery of the same event inserts nothing.
  insert into public.stripe_payments (stripe_session_id, user_id, months, amount_total, currency, customer_email, livemode)
  values (p_session_id, null, p_months, p_amount, p_currency, p_email, coalesce(p_livemode, false))
  on conflict (stripe_session_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'granted', false, 'duplicate', true);
  end if;

  select exists (select 1 from auth.users where id = p_user_id) into v_user_ok;
  if p_user_id is null or not v_user_ok then
    update public.stripe_payments
       set note = case when p_user_id is null then 'no user id on the payment: give Premium by hand'
                       else 'user not found: give Premium by hand' end
     where stripe_session_id = p_session_id;
    return jsonb_build_object('ok', true, 'granted', false, 'reason', 'no_matching_user');
  end if;

  update public.stripe_payments set user_id = p_user_id where stripe_session_id = p_session_id;

  perform pg_advisory_xact_lock(hashtext('premium:' || p_user_id::text));
  select * into v_prem from public.user_premium where user_id = p_user_id for update;

  if v_prem.user_id is not null and v_prem.lifetime then
    update public.stripe_payments
       set granted_at = now(), note = 'user already has lifetime Premium: consider a refund'
     where stripe_session_id = p_session_id;
    return jsonb_build_object('ok', true, 'granted', false, 'reason', 'already_lifetime');
  end if;

  v_base  := greatest(now(), coalesce(v_prem.premium_until, now()));
  v_until := v_base + make_interval(months => p_months);
  insert into public.user_premium (user_id, lifetime, premium_until)
  values (p_user_id, false, v_until)
  on conflict (user_id) do update set premium_until = v_until, updated_at = now();

  update public.stripe_payments set granted_at = now() where stripe_session_id = p_session_id;
  return jsonb_build_object('ok', true, 'granted', true, 'premium_until', v_until);
end;
$$;
revoke all on function public.grant_premium_from_payment(text, uuid, int, int, text, text, boolean) from public, anon, authenticated;
grant execute on function public.grant_premium_from_payment(text, uuid, int, int, text, text, boolean) to service_role;
