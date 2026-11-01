-- ============================================================================
-- Access codes (founder pass, family & friends): a user types a code under
-- Profile -> Access code and gets Premium for N months, or for as long as the
-- service runs. Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Tables
--   access_codes          one row per code. Not readable or writable from the app.
--   user_premium          one row per user with Premium: premium_until, or lifetime.
--                         Users can only READ their own row. Only the server writes it.
--   access_code_attempts  failed redeem attempts (rate limit: 5 per 15 minutes).
--
-- Functions
--   generate_access_codes(months, count, note, valid_days)   YOU run this in the SQL Editor.
--                         Not callable from the app. months NULL = for as long as the service runs.
--   redeem_access_code(code)   app: redeems a code (one use per code), returns jsonb.
--   get_my_premium()           app: returns {active, lifetime, premium_until}.
--   is_premium(user_id)        internal helper for later Premium checks (not callable from the app).
--
-- Create codes (SQL Editor):
--   select * from public.generate_access_codes(6, 10, 'founder pass');            -- 6 months
--   select * from public.generate_access_codes(12, 5, 'paid via Swish');          -- 12 months
--   select * from public.generate_access_codes(null, 5, 'family and friends');    -- for as long as the service runs
--   select * from public.generate_access_codes(6, 10, 'gym', 90);                 -- unused codes expire after 90 days
-- Months count from the day the code is redeemed. A new code extends from the current end date
-- if Premium is still active. Changing the length only affects codes created afterwards.
--
-- Look at codes:
--   select code, months, note, created_at, expires_at, redeemed_at, revoked_at,
--          (select username from public.users u where u.id = c.redeemed_by) as redeemed_by
--     from public.access_codes c order by created_at desc;
-- Revoke an unused code:
--   update public.access_codes set revoked_at = now() where code = 'WODXP-XXXX-XXXX' and redeemed_at is null;
-- Remove Premium from a user (rarely needed):
--   delete from public.user_premium where user_id = '<user id>';
--
-- Deleting an account removes its user_premium row. The code stays marked as used
-- (redeemed_by becomes empty), so it cannot be reused.
-- ============================================================================

create table if not exists public.access_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  months      int check (months is null or months between 1 and 120),   -- NULL = for as long as the service runs
  note        text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                                              -- optional last day to redeem
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  revoked_at  timestamptz
);
create index if not exists access_codes_redeemed_by_idx on public.access_codes (redeemed_by);
alter table public.access_codes enable row level security;
revoke all on public.access_codes from anon, authenticated;

create table if not exists public.user_premium (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  lifetime      boolean not null default false,
  premium_until timestamptz,
  updated_at    timestamptz not null default now(),
  check (lifetime or premium_until is not null)
);
alter table public.user_premium enable row level security;
drop policy if exists "premium_select_own" on public.user_premium;
create policy "premium_select_own" on public.user_premium
  for select to authenticated using (user_id = auth.uid());
revoke all on public.user_premium from anon, authenticated;
grant select on public.user_premium to authenticated;

create table if not exists public.access_code_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists access_code_attempts_user_idx on public.access_code_attempts (user_id, attempted_at desc);
alter table public.access_code_attempts enable row level security;
revoke all on public.access_code_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Create codes. Format WODXP-XXXX-XXXX from 31 characters without look-alikes (no I, L, O, 0, 1).
-- ---------------------------------------------------------------------------
create or replace function public.generate_access_codes(
  p_months int, p_count int, p_note text default null, p_valid_days int default null
)
returns table (access_code text, months_granted int, note_text text, valid_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes    bytea;
  v_code     text;
  v_i        int;
  v_n        int := 0;
  v_exp      timestamptz;
begin
  if p_count is null or p_count < 1 or p_count > 500 then
    raise exception 'count must be between 1 and 500';
  end if;
  if p_months is not null and (p_months < 1 or p_months > 120) then
    raise exception 'months must be between 1 and 120, or null for as long as the service runs';
  end if;
  v_exp := case when p_valid_days is null then null else now() + make_interval(days => p_valid_days) end;

  while v_n < p_count loop
    v_bytes := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
    v_code := 'WODXP-';
    for v_i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_i) % 31) + 1, 1);
      if v_i = 3 then v_code := v_code || '-'; end if;
    end loop;
    begin
      insert into public.access_codes (code, months, note, expires_at)
      values (v_code, p_months, p_note, v_exp);
      v_n := v_n + 1;
      access_code := v_code; months_granted := p_months; note_text := p_note; valid_until := v_exp;
      return next;
    exception when unique_violation then
      null;  -- extremely unlikely: try another code
    end;
  end loop;
end;
$$;
revoke all on function public.generate_access_codes(int, int, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Redeem a code. Expected problems come back as {ok:false, error:...} (not as exceptions) so that
-- failed attempts are saved and can be rate limited.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_access_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_norm  text;
  v_code  text;
  v_row   public.access_codes%rowtype;
  v_prem  public.user_premium%rowtype;
  v_base  timestamptz;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext('redeem:' || v_uid::text));
  delete from public.access_code_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from public.access_code_attempts
       where user_id = v_uid and attempted_at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  -- Accept any case, spaces, missing hyphens and a missing WODXP prefix.
  v_norm := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  if left(v_norm, 5) = 'WODXP' then v_norm := substr(v_norm, 6); end if;
  if length(v_norm) = 8 then
    v_code := 'WODXP-' || substr(v_norm, 1, 4) || '-' || substr(v_norm, 5, 4);
  end if;

  if v_code is not null then
    select * into v_row from public.access_codes where code = v_code for update;
  end if;
  if v_code is null or v_row.id is null
     or v_row.revoked_at is not null or v_row.redeemed_at is not null
     or (v_row.expires_at is not null and v_row.expires_at < now()) then
    insert into public.access_code_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select * into v_prem from public.user_premium where user_id = v_uid for update;
  if v_prem.user_id is not null and v_prem.lifetime then
    return jsonb_build_object('ok', false, 'error', 'already_lifetime');   -- the code is not used up
  end if;

  if v_row.months is null then
    insert into public.user_premium (user_id, lifetime, premium_until)
    values (v_uid, true, null)
    on conflict (user_id) do update set lifetime = true, premium_until = null, updated_at = now();
    v_until := null;
  else
    v_base  := greatest(now(), coalesce(v_prem.premium_until, now()));
    v_until := v_base + make_interval(months => v_row.months);
    insert into public.user_premium (user_id, lifetime, premium_until)
    values (v_uid, false, v_until)
    on conflict (user_id) do update set premium_until = v_until, updated_at = now();
  end if;

  update public.access_codes set redeemed_by = v_uid, redeemed_at = now() where id = v_row.id;

  return jsonb_build_object('ok', true, 'lifetime', v_row.months is null, 'premium_until', v_until);
end;
$$;
revoke all on function public.redeem_access_code(text) from public, anon;
grant execute on function public.redeem_access_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Status for the app and a helper for later Premium checks.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_premium()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_prem public.user_premium%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_prem from public.user_premium where user_id = v_uid;
  return jsonb_build_object(
    'active',        coalesce(v_prem.lifetime or v_prem.premium_until > now(), false),
    'lifetime',      coalesce(v_prem.lifetime, false),
    'premium_until', v_prem.premium_until
  );
end;
$$;
revoke all on function public.get_my_premium() from public, anon;
grant execute on function public.get_my_premium() to authenticated;

create or replace function public.is_premium(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select lifetime or premium_until > now() from public.user_premium where user_id = p_user), false);
$$;
revoke all on function public.is_premium(uuid) from public, anon, authenticated;
