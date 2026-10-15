-- ============================================================================
-- WODXP Friends - Step 2 (challenges, spec v2.0 of 2026-10-15)
-- Scope of this migration: the whole one-session challenge flow, with
-- "Burpee Century" as the only seeded template (rep-based). Weight-volume
-- templates (Biceps Curl 500 etc.) are supported by the schema (metric
-- 'volume_kg') but NOT computed yet: workout_exercises has no "weights per rep"
-- or "reps per arm" fields, so the result function refuses them instead of
-- guessing.
-- Safe to re-run: tables IF NOT EXISTS, functions CREATE OR REPLACE (all new),
-- seed rows ON CONFLICT DO NOTHING.
-- All client access goes through SECURITY DEFINER functions. RLS is enabled on
-- every new table with NO policies, so direct table access is denied.
-- ============================================================================

-- ---------- Configuration ----------------------------------------------------
insert into public.friends_config (key, value) values
  ('challenge_respond_days', 7),
  ('challenge_complete_days', 7),
  ('challenge_proof_days', 30),
  ('challenge_pair_gap_days', 7),
  ('challenge_recipient_cap_week', 3),
  ('challenge_sender_cap_week', 3),
  ('challenge_message_max', 140)
on conflict (key) do nothing;
-- Spec v2.0: invite links are valid 48 hours (was 7 days).
update public.friends_config set value = 2 where key = 'invite_expiry_days' and value = 7;

-- ---------- Templates (immutable per version) --------------------------------
create table if not exists public.challenge_templates (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  version      integer not null default 1,
  name         text not null,
  description  text not null,
  rules        text not null,
  metric       text not null check (metric in ('reps', 'volume_kg')),
  exercise_ids uuid[] not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (slug, version)
);

create table if not exists public.challenge_levels (
  template_id uuid not null references public.challenge_templates(id) on delete cascade,
  level_key   text not null,
  label       text not null,
  target      numeric not null check (target > 0),
  is_original boolean not null default false,
  sort_order  integer not null default 0,
  xp_recipient integer not null default 25,
  xp_sender    integer not null default 10,
  xp_friends   integer not null default 20,
  primary key (template_id, level_key)
);

-- ---------- Invites -----------------------------------------------------------
create table if not exists public.challenge_invites (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid not null references public.challenge_templates(id),
  template_name       text not null,
  template_rules      text not null,
  metric              text not null,
  exercise_ids        uuid[] not null,
  friendship_id       uuid not null references public.friendships(id) on delete cascade,
  sender_id           uuid not null references public.users(id) on delete cascade,
  receiver_id         uuid not null references public.users(id) on delete cascade,
  sent_level_key      text not null,
  sent_target         numeric not null,
  sender_session_id   uuid references public.workout_sessions(id) on delete set null,
  sender_result       numeric not null,
  bonus_eligible      boolean not null default true,
  message             text,
  status              text not null default 'pending'
                        check (status in ('pending','active','completed','declined','revoked','expired','cancelled')),
  created_at          timestamptz not null default now(),
  respond_by          timestamptz not null,
  accepted_at         timestamptz,
  recipient_level_key text,
  recipient_target    numeric,
  complete_by         timestamptz,
  completed_at        timestamptz,
  completed_session_id uuid references public.workout_sessions(id) on delete set null,
  xp_recipient        integer not null,
  xp_sender           integer not null,
  xp_friends          integer not null,
  check (sender_id <> receiver_id)
);
-- At most one waiting or running challenge per template + level + pair + direction.
create unique index if not exists challenge_invites_one_open
  on public.challenge_invites (template_id, sent_level_key, sender_id, receiver_id)
  where status in ('pending', 'active');
create index if not exists challenge_invites_receiver on public.challenge_invites (receiver_id, status);
create index if not exists challenge_invites_sender   on public.challenge_invites (sender_id, status);

-- ---------- XP ledger + bonus reservations -------------------------------------
create table if not exists public.challenge_xp_events (
  id            uuid primary key default gen_random_uuid(),
  invite_id     uuid not null references public.challenge_invites(id) on delete cascade,
  kind          text not null check (kind in ('recipient', 'sender', 'friends')),
  user_id       uuid references public.users(id) on delete set null,
  friendship_id uuid references public.friendships(id) on delete set null,
  points        integer not null,
  granted       integer not null default 0,
  event_key     text not null unique,
  week_start    date not null,
  created_at    timestamptz not null default now()
);
create index if not exists challenge_xp_events_user on public.challenge_xp_events (user_id, kind, week_start);
create index if not exists challenge_xp_events_pair on public.challenge_xp_events (friendship_id, kind, week_start);

create table if not exists public.challenge_reservations (
  invite_id  uuid primary key references public.challenge_invites(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now()
);
create index if not exists challenge_reservations_user on public.challenge_reservations (user_id, week_start);

alter table public.challenge_templates    enable row level security;
alter table public.challenge_levels       enable row level security;
alter table public.challenge_invites      enable row level security;
alter table public.challenge_xp_events    enable row level security;
alter table public.challenge_reservations enable row level security;
revoke all on public.challenge_templates, public.challenge_levels, public.challenge_invites,
              public.challenge_xp_events, public.challenge_reservations
  from public, anon, authenticated;

-- ---------- Seed: Burpee Century ---------------------------------------------
-- Allowed exercises: the two plain "Burpee" library entries only (no variants yet).
insert into public.challenge_templates (slug, version, name, description, rules, metric, exercise_ids)
values (
  'burpee-century', 1, 'Burpee Century',
  'Do 100 burpees in one workout.',
  'One saved workout. Any number of sets and rests. Only the exercises Burpee and Burpees count. The workout must start after you accept and finish before the deadline.',
  'reps',
  array['f1a2d130-472b-42a8-b461-a32476e71af6'::uuid, '74350699-622a-4ea3-ba64-34cdd156d88a'::uuid]
) on conflict (slug, version) do nothing;

insert into public.challenge_levels (template_id, level_key, label, target, is_original, sort_order)
select t.id, v.level_key, v.label, v.target, v.is_original, v.sort_order
  from public.challenge_templates t,
       (values ('original',  'Original: 100 burpees', 100::numeric, true,  1),
               ('scaled_50', 'Adapted: 50 burpees',    50::numeric, false, 2)) as v(level_key, label, target, is_original, sort_order)
 where t.slug = 'burpee-century' and t.version = 1
on conflict (template_id, level_key) do nothing;

-- ---------- Helpers ------------------------------------------------------------
-- The accounts have no saved time zone yet, so individual weekly caps use a fixed zone.
create or replace function public.challenge_user_tz(p_uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select 'Europe/Stockholm'::text;
$$;

create or replace function public.challenge_week_start(p_ts timestamptz, p_tz text) returns date
language sql stable as $$
  select date_trunc('week', p_ts at time zone p_tz)::date;
$$;

-- Result of ONE workout for a template: sum of sets x reps for the allowed exercises.
-- Weight-volume templates are refused on purpose (data is not logged yet).
create or replace function public.challenge_result(p_session uuid, p_exercise_ids uuid[], p_metric text)
returns numeric
language plpgsql stable security definer set search_path = public as $$
begin
  if p_metric <> 'reps' then raise exception 'metric_not_supported'; end if;
  return coalesce((
    select sum(coalesce(we.sets, 0) * coalesce(we.reps, 0))
      from public.workout_exercises we
      join public.workout_sessions ws on ws.id = we.session_id
     where we.session_id = p_session and ws.status = 'completed'
       and we.completed is true and we.exercise_id = any (p_exercise_ids)
  ), 0);
end;
$$;

-- XP bonuses are booked through award_xp as ordinary XP (decision of 2026-10-15).
-- NOTE: award_xp also uses one of the receiver's 2 daily XP workouts and updates
-- the streak date. If that is not wanted, change ONLY this function.
create or replace function public.friends_grant_bonus(p_uid uuid, p_xp integer) returns integer
language sql security definer set search_path = public as $$
  select public.award_xp(p_uid, p_xp);
$$;

-- Marks waiting / running challenges as expired (no XP loss, reservations freed).
create or replace function public.challenge_expire() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.challenge_invites set status = 'expired'
   where (status = 'pending' and respond_by < now()) or (status = 'active' and complete_by < now());
  delete from public.challenge_reservations r
   using public.challenge_invites i
   where i.id = r.invite_id and i.status not in ('pending', 'active');
end;
$$;

create or replace function public.challenge_recipient_used(p_uid uuid, p_week date, p_exclude uuid default null) returns integer
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.challenge_xp_events
           where kind = 'recipient' and user_id = p_uid and week_start = p_week and points > 0)::int
       + (select count(*) from public.challenge_reservations
           where user_id = p_uid and week_start = p_week and invite_id is distinct from p_exclude)::int;
$$;

create or replace function public.challenge_sender_used(p_uid uuid, p_week date) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.challenge_xp_events
   where kind = 'sender' and user_id = p_uid and week_start = p_week and points > 0;
$$;

create or replace function public.challenge_pair_used(p_friendship uuid, p_week date) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.challenge_xp_events
   where kind = 'friends' and friendship_id = p_friendship and week_start = p_week and points > 0;
$$;

-- Best saved workout of the last N days that reaches a target (optionally one given workout).
create or replace function public.challenge_find_proof(
  p_uid uuid, p_template uuid, p_target numeric, p_session uuid default null)
returns table (session_id uuid, result numeric, completed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare t public.challenge_templates%rowtype;
begin
  select * into t from public.challenge_templates where id = p_template;
  return query
    select s.id, s.r, s.done_at
      from (select ws.id, ws.completed_at as done_at,
                   public.challenge_result(ws.id, t.exercise_ids, t.metric) as r
              from public.workout_sessions ws
             where ws.user_id = p_uid and ws.status = 'completed' and ws.completed_at is not null
               and ws.completed_at >= now() - make_interval(days => public.friends_cfg('challenge_proof_days'))
               and (p_session is null or ws.id = p_session)) s
     where s.r >= p_target
     order by s.done_at desc
     limit 1;
end;
$$;

-- ---------- Cancel running challenges when a relationship stops ----------------
create or replace function public.challenge_cancel_pair(p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.challenge_invites
     set status = case when status = 'pending' then 'revoked' else 'cancelled' end
   where status in ('pending', 'active')
     and ((sender_id = p_a and receiver_id = p_b) or (sender_id = p_b and receiver_id = p_a));
  delete from public.challenge_reservations r using public.challenge_invites i
   where i.id = r.invite_id and i.status not in ('pending', 'active');
end;
$$;

create or replace function public.challenge_trg_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' then
    perform public.challenge_cancel_pair(new.user_a, new.user_b);
  end if;
  return new;
end;
$$;
drop trigger if exists challenge_on_friendship_end on public.friendships;
create trigger challenge_on_friendship_end after update of status on public.friendships
  for each row execute function public.challenge_trg_friendship();

create or replace function public.challenge_trg_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.challenge_cancel_pair(new.blocker_id, new.blocked_id);
  return new;
end;
$$;
drop trigger if exists challenge_on_block on public.friend_blocks;
create trigger challenge_on_block after insert on public.friend_blocks
  for each row execute function public.challenge_trg_block();

create or replace function public.challenge_trg_disabled() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.friends_enabled is false and old.friends_enabled is distinct from false then
    update public.challenge_invites
       set status = case when status = 'pending' then 'revoked' else 'cancelled' end
     where status in ('pending', 'active') and (sender_id = new.user_id or receiver_id = new.user_id);
    delete from public.challenge_reservations r using public.challenge_invites i
     where i.id = r.invite_id and i.status not in ('pending', 'active');
  end if;
  return new;
end;
$$;
drop trigger if exists challenge_on_friends_off on public.friend_settings;
create trigger challenge_on_friends_off after update of friends_enabled on public.friend_settings
  for each row execute function public.challenge_trg_disabled();

-- ---------- Send ----------------------------------------------------------------
create or replace function public.send_challenge(
  p_friendship uuid, p_template uuid, p_level_key text,
  p_session uuid default null, p_message text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  f public.friendships%rowtype;
  t public.challenge_templates%rowtype;
  l public.challenge_levels%rowtype;
  v_to uuid;
  v_proof record;
  v_msg text := nullif(trim(coalesce(p_message, '')), '');
  v_bonus boolean := true;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('challenge_send:' || v_uid::text));
  perform public.challenge_expire();

  select * into f from public.friendships
   where id = p_friendship and status = 'active' and (user_a = v_uid or user_b = v_uid);
  if not found then raise exception 'not_friends'; end if;
  v_to := case when f.user_a = v_uid then f.user_b else f.user_a end;

  if public.friends_is_blocked(v_uid, v_to) then raise exception 'blocked'; end if;
  if not public.friends_is_enabled(v_uid) then raise exception 'friends_disabled'; end if;
  if not public.friends_is_enabled(v_to) then raise exception 'friend_paused'; end if;
  if not coalesce((select allow_challenges from public.friend_settings where user_id = v_to), true) then
    raise exception 'challenges_off';
  end if;

  select * into t from public.challenge_templates where id = p_template and is_active;
  if not found then raise exception 'template_not_found'; end if;
  select * into l from public.challenge_levels where template_id = t.id and level_key = p_level_key;
  if not found then raise exception 'level_not_found'; end if;

  if v_msg is not null and char_length(v_msg) > public.friends_cfg('challenge_message_max') then
    raise exception 'message_too_long';
  end if;

  select * into v_proof from public.challenge_find_proof(v_uid, t.id, l.target, p_session);
  if v_proof.session_id is null then raise exception 'no_qualifying_session'; end if;

  -- Bonus rules: new performance + gap between rounds + no direct return to the original sender.
  if exists (select 1 from public.challenge_invites i
              where i.template_id = t.id and i.bonus_eligible
                and i.status in ('pending', 'active', 'completed')
                and ((i.sender_id = v_uid and i.receiver_id = v_to) or (i.sender_id = v_to and i.receiver_id = v_uid))
                and i.created_at > now() - make_interval(days => public.friends_cfg('challenge_pair_gap_days'))) then
    v_bonus := false;
  end if;
  if exists (select 1 from public.challenge_invites i
              where i.template_id = t.id and i.sender_session_id = v_proof.session_id
                and ((i.sender_id = v_uid and i.receiver_id = v_to) or (i.sender_id = v_to and i.receiver_id = v_uid))) then
    v_bonus := false;
  end if;
  if exists (select 1 from public.challenge_invites i
              where i.template_id = t.id and i.status = 'completed'
                and i.sender_id = v_to and i.receiver_id = v_uid
                and i.completed_session_id = v_proof.session_id) then
    v_bonus := false;
  end if;

  begin
    insert into public.challenge_invites (
      template_id, template_name, template_rules, metric, exercise_ids,
      friendship_id, sender_id, receiver_id, sent_level_key, sent_target,
      sender_session_id, sender_result, bonus_eligible, message, respond_by,
      xp_recipient, xp_sender, xp_friends)
    values (
      t.id, t.name, t.rules, t.metric, t.exercise_ids,
      f.id, v_uid, v_to, l.level_key, l.target,
      v_proof.session_id, v_proof.result, v_bonus, v_msg,
      now() + make_interval(days => public.friends_cfg('challenge_respond_days')),
      l.xp_recipient, l.xp_sender, l.xp_friends)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_sent';
  end;

  return jsonb_build_object('id', v_id, 'bonus_eligible', v_bonus);
end;
$$;

create or replace function public.revoke_challenge(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.challenge_invites set status = 'revoked'
   where id = p_id and sender_id = auth.uid() and status = 'pending';
end;
$$;

create or replace function public.cancel_challenge(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.challenge_invites set status = 'cancelled'
   where id = p_id and status = 'active' and (sender_id = auth.uid() or receiver_id = auth.uid());
  delete from public.challenge_reservations where invite_id = p_id;
end;
$$;

-- ---------- Accept / decline -----------------------------------------------------
create or replace function public.respond_challenge(p_id uuid, p_accept boolean, p_level_key text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.challenge_invites%rowtype;
  l public.challenge_levels%rowtype;
  v_week date;
  v_reserved boolean := false;
  v_tz text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('challenge_resp:' || v_uid::text));
  perform public.challenge_expire();

  select * into i from public.challenge_invites where id = p_id and receiver_id = v_uid for update;
  if not found then raise exception 'not_found'; end if;
  if i.status <> 'pending' then raise exception 'not_pending'; end if;

  if not p_accept then
    update public.challenge_invites set status = 'declined' where id = i.id;
    return jsonb_build_object('status', 'declined');
  end if;

  if not exists (select 1 from public.friendships where id = i.friendship_id and status = 'active')
     or public.friends_is_blocked(i.sender_id, v_uid)
     or not public.friends_is_enabled(v_uid) or not public.friends_is_enabled(i.sender_id) then
    raise exception 'not_friends';
  end if;

  -- Receiver may take the sent level or an adaptation that is not harder.
  select * into l from public.challenge_levels
   where template_id = i.template_id and level_key = coalesce(p_level_key, i.sent_level_key);
  if not found or l.target > i.sent_target then raise exception 'level_not_allowed'; end if;

  v_tz := public.challenge_user_tz(v_uid);
  v_week := public.challenge_week_start(now(), v_tz);

  update public.challenge_invites
     set status = 'active', accepted_at = now(),
         recipient_level_key = l.level_key, recipient_target = l.target,
         complete_by = now() + make_interval(days => public.friends_cfg('challenge_complete_days')),
         xp_recipient = l.xp_recipient, xp_sender = l.xp_sender, xp_friends = l.xp_friends
   where id = i.id;

  if i.bonus_eligible
     and public.challenge_recipient_used(v_uid, v_week, i.id) < public.friends_cfg('challenge_recipient_cap_week') then
    insert into public.challenge_reservations (invite_id, user_id, week_start)
    values (i.id, v_uid, v_week) on conflict do nothing;
    v_reserved := true;
  end if;

  return jsonb_build_object('status', 'active', 'bonus_reserved', v_reserved);
end;
$$;

-- ---------- Evaluate a just-saved workout --------------------------------------
-- Called by the client after every saved workout. The server decides everything.
create or replace function public.challenge_evaluate(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.workout_sessions%rowtype;
  i public.challenge_invites%rowtype;
  l public.challenge_levels%rowtype;
  f public.friendships%rowtype;
  v_result numeric;
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_week date;
  v_sweek date;
  v_ins uuid;
  v_granted integer;
  v_fx integer;
  v_recip jsonb;
  v_sender jsonb;
  v_friends jsonb;
  v_sproof_ok boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('challenge_eval:' || v_uid::text));
  perform public.challenge_expire();

  select * into s from public.workout_sessions
   where id = p_session and user_id = v_uid and status = 'completed' and completed_at is not null;
  if not found then return v_out; end if;

  for i in
    select * from public.challenge_invites
     where receiver_id = v_uid and status = 'active'
       and s.started_at >= accepted_at and s.completed_at <= complete_by
     order by accepted_at
     for update
  loop
    v_result := public.challenge_result(s.id, i.exercise_ids, i.metric);
    if v_result < i.recipient_target then continue; end if;

    select * into f from public.friendships where id = i.friendship_id and status = 'active';
    if not found or public.friends_is_blocked(i.sender_id, v_uid)
       or not public.friends_is_enabled(v_uid) or not public.friends_is_enabled(i.sender_id) then
      continue;
    end if;

    update public.challenge_invites
       set status = 'completed', completed_at = now(), completed_session_id = s.id
     where id = i.id;
    delete from public.challenge_reservations where invite_id = i.id;

    v_recip := null; v_sender := null; v_friends := null;

    if i.bonus_eligible then
      v_week := public.challenge_week_start(s.completed_at, public.challenge_user_tz(v_uid));

      -- Receiver bonus: once per source workout, weekly cap (reservation counted separately).
      if public.challenge_recipient_used(v_uid, v_week, i.id) < public.friends_cfg('challenge_recipient_cap_week') then
        insert into public.challenge_xp_events (invite_id, kind, user_id, friendship_id, points, granted, event_key, week_start)
        values (i.id, 'recipient', v_uid, f.id, i.xp_recipient, 0, 'recipient:' || v_uid || ':' || s.id, v_week)
        on conflict (event_key) do nothing returning id into v_ins;
        if v_ins is not null then
          v_granted := public.friends_grant_bonus(v_uid, i.xp_recipient);
          update public.challenge_xp_events set granted = coalesce(v_granted, 0) where id = v_ins;
          v_recip := jsonb_build_object('points', i.xp_recipient, 'granted', coalesce(v_granted, 0));
        end if;
      end if;

      -- Friends XP: once per source workout, weekly cap per pair (week of the pair's time zone).
      v_week := public.challenge_week_start(s.completed_at, f.timezone);
      if public.challenge_pair_used(f.id, v_week) < public.friends_cfg('max_xp_challenges_per_week') then
        v_ins := null;
        insert into public.challenge_xp_events (invite_id, kind, user_id, friendship_id, points, granted, event_key, week_start)
        values (i.id, 'friends', null, f.id, i.xp_friends, i.xp_friends, 'friends:' || f.id || ':' || s.id, v_week)
        on conflict (event_key) do nothing returning id into v_ins;
        if v_ins is not null then
          insert into public.friends_xp_events (friendship_id, event_key, reason, points)
          values (f.id, 'chal:' || f.id || ':' || s.id, 'challenge', i.xp_friends)
          on conflict (friendship_id, event_key) do nothing;
          perform public.friends_recompute(f.id);
          v_friends := jsonb_build_object('points', i.xp_friends);
        end if;
      end if;

      -- Sender bonus: only while the sender's own proof still qualifies; once per original performance.
      select exists (select 1 from public.workout_sessions ws
                      where ws.id = i.sender_session_id and ws.status = 'completed'
                        and public.challenge_result(ws.id, i.exercise_ids, i.metric) >= i.sent_target)
        into v_sproof_ok;
      if v_sproof_ok and i.sender_session_id is not null then
        v_sweek := public.challenge_week_start(s.completed_at, public.challenge_user_tz(i.sender_id));
        if public.challenge_sender_used(i.sender_id, v_sweek) < public.friends_cfg('challenge_sender_cap_week') then
          v_ins := null;
          insert into public.challenge_xp_events (invite_id, kind, user_id, friendship_id, points, granted, event_key, week_start)
          values (i.id, 'sender', i.sender_id, f.id, i.xp_sender, 0,
                  'sender:' || i.sender_id || ':' || i.sender_session_id || ':' || i.template_id, v_sweek)
          on conflict (event_key) do nothing returning id into v_ins;
          if v_ins is not null then
            v_granted := public.friends_grant_bonus(i.sender_id, i.xp_sender);
            update public.challenge_xp_events set granted = coalesce(v_granted, 0) where id = v_ins;
            v_sender := jsonb_build_object('points', i.xp_sender);
          end if;
        end if;
      end if;
    end if;

    v_item := jsonb_build_object('invite_id', i.id, 'name', i.template_name,
                                 'result', v_result, 'target', i.recipient_target,
                                 'recipient_bonus', v_recip, 'friends_xp', v_friends,
                                 'sender_bonus_given', v_sender is not null);
    v_out := v_out || jsonb_build_array(v_item);
  end loop;

  return v_out;
end;
$$;

-- ---------- Overview for the Friends tab -----------------------------------------
create or replace function public.get_challenges_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_week date;
  v_templates jsonb;
  v_incoming jsonb;
  v_outgoing jsonb;
  v_recent jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public.challenge_expire();
  v_tz := public.challenge_user_tz(v_uid);
  v_week := public.challenge_week_start(now(), v_tz);

  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into v_templates from (
    select jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'name', t.name, 'description', t.description,
      'rules', t.rules, 'metric', t.metric,
      'levels', (select coalesce(jsonb_agg(jsonb_build_object(
                   'key', l.level_key, 'label', l.label, 'target', l.target, 'is_original', l.is_original,
                   'xp_recipient', l.xp_recipient, 'xp_sender', l.xp_sender, 'xp_friends', l.xp_friends,
                   'proof', (select jsonb_build_object('session_id', p.session_id, 'result', p.result,
                                                        'completed_at', p.completed_at)
                               from public.challenge_find_proof(v_uid, t.id, l.target, null) p))
                   order by l.sort_order), '[]'::jsonb)
                   from public.challenge_levels l where l.template_id = t.id)
    ) as x
    from public.challenge_templates t
   where t.is_active and t.metric = 'reps'
  ) q;

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_incoming from (
    select jsonb_build_object(
      'id', i.id, 'status', i.status, 'name', i.template_name, 'rules', i.template_rules,
      'from_username', u.username, 'message', i.message, 'created_at', i.created_at,
      'respond_by', i.respond_by, 'complete_by', i.complete_by,
      'sent_level_key', i.sent_level_key, 'sent_target', i.sent_target, 'sender_result', i.sender_result,
      'recipient_level_key', i.recipient_level_key, 'recipient_target', i.recipient_target,
      'xp_recipient', i.xp_recipient, 'xp_friends', i.xp_friends,
      'bonus_eligible', i.bonus_eligible,
      'bonus_available', i.bonus_eligible and (
          exists (select 1 from public.challenge_reservations r where r.invite_id = i.id)
          or public.challenge_recipient_used(v_uid, v_week, i.id) < public.friends_cfg('challenge_recipient_cap_week')),
      'levels', (select coalesce(jsonb_agg(jsonb_build_object('key', l.level_key, 'label', l.label,
                   'target', l.target) order by l.sort_order), '[]'::jsonb)
                   from public.challenge_levels l
                  where l.template_id = i.template_id and l.target <= i.sent_target),
      'progress', case when i.status = 'active' then coalesce((
          select max(public.challenge_result(ws.id, i.exercise_ids, i.metric))
            from public.workout_sessions ws
           where ws.user_id = v_uid and ws.status = 'completed'
             and ws.started_at >= i.accepted_at and ws.completed_at <= i.complete_by), 0) end
    ) as x
    from public.challenge_invites i join public.users u on u.id = i.sender_id
   where i.receiver_id = v_uid and i.status in ('pending', 'active')
  ) q;

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_outgoing from (
    select jsonb_build_object(
      'id', i.id, 'status', i.status, 'name', i.template_name, 'to_username', u.username,
      'created_at', i.created_at, 'respond_by', i.respond_by, 'complete_by', i.complete_by,
      'sent_level_key', i.sent_level_key, 'sent_target', i.sent_target,
      'recipient_target', i.recipient_target, 'bonus_eligible', i.bonus_eligible,
      'progress', case when i.status = 'active' then (
          select max(public.challenge_result(ws.id, i.exercise_ids, i.metric))
            from public.workout_sessions ws
           where ws.user_id = i.receiver_id and ws.status = 'completed'
             and ws.started_at >= i.accepted_at and ws.completed_at <= i.complete_by) end
    ) as x
    from public.challenge_invites i join public.users u on u.id = i.receiver_id
   where i.sender_id = v_uid and i.status in ('pending', 'active')
  ) q;

  -- Finished or ended challenges of the last 14 days. No winners or losers are shown.
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) into v_recent from (
    select jsonb_build_object(
      'id', i.id, 'status', i.status, 'name', i.template_name,
      'other_username', u.username, 'i_sent', i.sender_id = v_uid,
      'at', coalesce(i.completed_at, i.created_at)
    ) as x
    from public.challenge_invites i
    join public.users u on u.id = case when i.sender_id = v_uid then i.receiver_id else i.sender_id end
   where (i.sender_id = v_uid or i.receiver_id = v_uid)
     and i.status in ('completed', 'declined', 'expired', 'cancelled', 'revoked')
     and coalesce(i.completed_at, i.created_at) > now() - interval '14 days'
   limit 20
  ) q;

  return jsonb_build_object(
    'templates', v_templates, 'incoming', v_incoming, 'outgoing', v_outgoing, 'recent', v_recent,
    'caps', jsonb_build_object(
      'recipient_used', public.challenge_recipient_used(v_uid, v_week),
      'recipient_cap', public.friends_cfg('challenge_recipient_cap_week'),
      'sender_used', public.challenge_sender_used(v_uid, v_week),
      'sender_cap', public.friends_cfg('challenge_sender_cap_week')));
end;
$$;

-- ---------- Permissions -----------------------------------------------------------
revoke all on function
  public.challenge_user_tz(uuid), public.challenge_week_start(timestamptz, text),
  public.challenge_result(uuid, uuid[], text), public.friends_grant_bonus(uuid, integer),
  public.challenge_expire(), public.challenge_recipient_used(uuid, date, uuid),
  public.challenge_sender_used(uuid, date), public.challenge_pair_used(uuid, date),
  public.challenge_find_proof(uuid, uuid, numeric, uuid), public.challenge_cancel_pair(uuid, uuid),
  public.challenge_trg_friendship(), public.challenge_trg_block(), public.challenge_trg_disabled()
  from public, anon, authenticated;

revoke all on function
  public.send_challenge(uuid, uuid, text, uuid, text), public.revoke_challenge(uuid),
  public.cancel_challenge(uuid), public.respond_challenge(uuid, boolean, text),
  public.challenge_evaluate(uuid), public.get_challenges_overview()
  from public, anon;
grant execute on function
  public.send_challenge(uuid, uuid, text, uuid, text), public.revoke_challenge(uuid),
  public.cancel_challenge(uuid), public.respond_challenge(uuid, boolean, text),
  public.challenge_evaluate(uuid), public.get_challenges_overview()
  to authenticated;
