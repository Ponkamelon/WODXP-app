-- ============================================================================
-- WODXP Friends - "Duels": max reps in a fixed time with a fixed weight
-- First template: Biceps Curl 5 min (10 kg, 5:00 are examples; the challenger
-- picks the weight, the time is 300 s).
--
-- Flow: the challenger does the 5:00 attempt in the app, enters the reps he or
-- she counted, picks a friend and sends it. The friend accepts by doing the
-- same attempt (same weight, same time) and entering the reps. Both results are
-- then shown side by side. Results are self-reported (no proof check) and give
-- no XP in this first version, so none of the Friends XP caps are touched.
--
-- Safe to re-run: table IF NOT EXISTS, functions CREATE OR REPLACE.
-- All client access goes through SECURITY DEFINER functions. RLS is enabled
-- with NO policies, so direct table access is denied (same as the other Friends
-- tables).
-- ============================================================================

create table if not exists public.friend_duels (
  id               uuid primary key default gen_random_uuid(),
  friendship_id    uuid not null references public.friendships(id) on delete cascade,
  sender_id        uuid not null references public.users(id) on delete cascade,
  receiver_id      uuid not null references public.users(id) on delete cascade,
  exercise_name    text not null default 'Biceps Curl',
  weight_kg        numeric not null check (weight_kg > 0 and weight_kg <= 100),
  duration_seconds integer not null default 300 check (duration_seconds between 30 and 3600),
  sender_reps      integer not null check (sender_reps between 0 and 1000),
  receiver_reps    integer check (receiver_reps between 0 and 1000),
  message          text,
  status           text not null default 'pending'
                     check (status in ('pending','completed','declined','revoked','expired')),
  created_at       timestamptz not null default now(),
  respond_by       timestamptz not null,
  completed_at     timestamptz
);

-- One waiting duel per friendship and direction.
create unique index if not exists friend_duels_one_open
  on public.friend_duels (friendship_id, sender_id) where status = 'pending';
create index if not exists friend_duels_receiver on public.friend_duels (receiver_id, status);
create index if not exists friend_duels_sender   on public.friend_duels (sender_id, status);

alter table public.friend_duels enable row level security;

-- ---------- Send ---------------------------------------------------------------
create or replace function public.send_duel(
  p_friendship uuid, p_weight numeric, p_reps integer, p_message text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  f public.friendships%rowtype;
  v_to uuid;
  v_msg text := nullif(trim(coalesce(p_message, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('duel_send:' || v_uid::text));

  if p_weight is null or p_weight <= 0 or p_weight > 100 then raise exception 'invalid_weight'; end if;
  if p_reps is null or p_reps < 0 or p_reps > 1000 then raise exception 'invalid_reps'; end if;

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

  if v_msg is not null and char_length(v_msg) > public.friends_cfg('challenge_message_max') then
    raise exception 'message_too_long';
  end if;

  -- Waiting duels that ran out of time are closed first so they do not block a new one.
  update public.friend_duels set status = 'expired'
   where status = 'pending' and respond_by < now();

  begin
    insert into public.friend_duels (friendship_id, sender_id, receiver_id, weight_kg, sender_reps, message, respond_by)
    values (f.id, v_uid, v_to, p_weight, p_reps, v_msg,
            now() + make_interval(days => public.friends_cfg('challenge_respond_days')))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_sent';
  end;

  return jsonb_build_object('id', v_id);
end;
$$;

-- ---------- Answer: decline, or accept by submitting your own result -------------
create or replace function public.respond_duel(p_id uuid, p_accept boolean, p_reps integer default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  d public.friend_duels%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('duel_resp:' || v_uid::text));

  select * into d from public.friend_duels where id = p_id and receiver_id = v_uid for update;
  if not found then raise exception 'not_found'; end if;
  if d.status <> 'pending' then raise exception 'not_pending'; end if;

  -- Returned (not raised) so the status change is kept instead of rolled back.
  if d.respond_by < now() then
    update public.friend_duels set status = 'expired' where id = d.id;
    return jsonb_build_object('status', 'expired');
  end if;

  if not p_accept then
    update public.friend_duels set status = 'declined' where id = d.id;
    return jsonb_build_object('status', 'declined');
  end if;

  if p_reps is null or p_reps < 0 or p_reps > 1000 then raise exception 'invalid_reps'; end if;
  if not exists (select 1 from public.friendships where id = d.friendship_id and status = 'active')
     or public.friends_is_blocked(d.sender_id, v_uid)
     or not public.friends_is_enabled(v_uid) or not public.friends_is_enabled(d.sender_id) then
    raise exception 'not_friends';
  end if;

  update public.friend_duels
     set status = 'completed', receiver_reps = p_reps, completed_at = now()
   where id = d.id;

  return jsonb_build_object('status', 'completed', 'sender_reps', d.sender_reps, 'receiver_reps', p_reps);
end;
$$;

-- ---------- Sender cancels a waiting duel ----------------------------------------
create or replace function public.revoke_duel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.friend_duels set status = 'revoked'
   where id = p_id and sender_id = auth.uid() and status = 'pending';
end;
$$;

-- ---------- Overview for the Friends tab ------------------------------------------
create or replace function public.get_duels_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_in jsonb;
  v_out jsonb;
  v_recent jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.friend_duels set status = 'expired'
   where status = 'pending' and respond_by < now()
     and (sender_id = v_uid or receiver_id = v_uid);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'from_username', u.username, 'exercise_name', d.exercise_name,
           'weight_kg', d.weight_kg, 'duration_seconds', d.duration_seconds,
           'sender_reps', d.sender_reps, 'message', d.message, 'respond_by', d.respond_by)
         order by d.created_at desc), '[]'::jsonb)
    into v_in
    from public.friend_duels d
    join public.users u on u.id = d.sender_id
    join public.friendships f on f.id = d.friendship_id and f.status = 'active'
   where d.receiver_id = v_uid and d.status = 'pending'
     and not public.friends_is_blocked(d.sender_id, v_uid);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'to_username', u.username, 'exercise_name', d.exercise_name,
           'weight_kg', d.weight_kg, 'duration_seconds', d.duration_seconds,
           'sender_reps', d.sender_reps, 'respond_by', d.respond_by)
         order by d.created_at desc), '[]'::jsonb)
    into v_out
    from public.friend_duels d
    join public.users u on u.id = d.receiver_id
    join public.friendships f on f.id = d.friendship_id and f.status = 'active'
   where d.sender_id = v_uid and d.status = 'pending';

  select coalesce(jsonb_agg(r order by (r->>'at') desc), '[]'::jsonb) into v_recent from (
    select jsonb_build_object(
             'id', d.id, 'exercise_name', d.exercise_name, 'weight_kg', d.weight_kg,
             'duration_seconds', d.duration_seconds,
             'other_username', u.username, 'i_sent', (d.sender_id = v_uid),
             'my_reps', case when d.sender_id = v_uid then d.sender_reps else d.receiver_reps end,
             'their_reps', case when d.sender_id = v_uid then d.receiver_reps else d.sender_reps end,
             'at', d.completed_at) as r
      from public.friend_duels d
      join public.users u on u.id = case when d.sender_id = v_uid then d.receiver_id else d.sender_id end
     where d.status = 'completed' and (d.sender_id = v_uid or d.receiver_id = v_uid)
     order by d.completed_at desc
     limit 8
  ) x;

  return jsonb_build_object('incoming', v_in, 'outgoing', v_out, 'recent', v_recent);
end;
$$;
