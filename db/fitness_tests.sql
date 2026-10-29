-- ============================================================
-- FITNESS TESTS  (WODXP)
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
-- Tests are unlocked by Quest Level (user_stats.level) in the app.
-- Results never award XP and never touch streaks.
-- ============================================================

create table if not exists public.fitness_tests (
  id               text primary key,
  name             text not null,
  challenge        text not null,            -- one-line competition description
  description      text,                     -- how to perform it
  metric           text not null check (metric in ('reps', 'time')),
  duration_seconds int,                      -- for "max reps in N seconds" tests; null otherwise
  uses_weight      boolean not null default false,
  unlock_level     int not null default 1,
  sort_order       int not null default 0
);

create table if not exists public.fitness_test_results (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  test_id          text not null references public.fitness_tests(id),
  value            numeric not null check (value >= 0),   -- reps, or seconds for time tests
  weight_kg        numeric check (weight_kg is null or weight_kg >= 0),
  workouts_at_test int not null default 0,                -- total workouts when taken (drives "time to retest")
  created_at       timestamptz not null default now()
);

create index if not exists fitness_test_results_user_test_idx
  on public.fitness_test_results (user_id, test_id, created_at);

alter table public.fitness_tests enable row level security;
alter table public.fitness_test_results enable row level security;

drop policy if exists "fitness_tests_read" on public.fitness_tests;
create policy "fitness_tests_read" on public.fitness_tests
  for select to authenticated using (true);

drop policy if exists "own_fitness_test_results" on public.fitness_test_results;
create policy "own_fitness_test_results" on public.fitness_test_results
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Seed / update the test catalogue (re-running updates text and unlock levels).
insert into public.fitness_tests (id, name, challenge, description, metric, duration_seconds, uses_weight, unlock_level, sort_order) values
 ('pushup',          'Push-up Challenge',          'Most push-ups in a row',
  'Hands shoulder-width apart, body in a straight line from head to heels. Chest to about a fist from the floor, full lock-out at the top. Stop when your form breaks or you rest.',
  'reps', null, false, 1, 1),
 ('airsquat',        'Air Squat Challenge',        'Most air squats in 60 seconds',
  'Feet shoulder-width apart. Hip crease below the knee at the bottom, stand fully up at the top. Count every clean rep.',
  'reps', 60, false, 2, 2),
 ('situp',           'Sit-up Challenge',           'Most sit-ups in 60 seconds',
  'Lie on your back with knees bent and feet anchored. Shoulder blades touch the floor at the bottom, hands touch your thighs at the top.',
  'reps', 60, false, 3, 3),
 ('plank',           'Plank Challenge',            'Hold a plank as long as possible',
  'Forearms on the floor, body in a straight line from head to heels. Stop the clock when your hips sag or rise.',
  'time', null, false, 4, 4),
 ('wallsit',         'Wall Sit Challenge',         'Hold 90° against the wall as long as possible',
  'Back flat against the wall, thighs parallel to the floor, knees at 90°. Stop when you slide up or take your hands to your legs.',
  'time', null, false, 6, 5),
 ('burpee',          'Burpee Challenge',           'Most burpees in 3 minutes',
  'Chest to the floor, jump up and clap overhead at the top. Pace yourself — three minutes is long.',
  'reps', 180, false, 8, 6),
 ('deadhang',        'Dead Hang Challenge',        'Hang from a bar as long as possible',
  'Hang from a bar with straight arms and an overhand grip, feet off the floor. Stop when your grip lets go.',
  'time', null, false, 10, 7),
 ('pullup',          'Pull-up Challenge',          'Most strict pull-ups in a row',
  'Start from a dead hang, chin over the bar, full extension at the bottom. No kipping, no swinging.',
  'reps', null, false, 12, 8),
 ('mountainclimber', 'Mountain Climber Challenge', 'Most mountain climbers in 60 seconds',
  'High plank position. Drive your knees to your chest — count every knee drive (left and right each count as one).',
  'reps', 60, false, 14, 9),
 ('kbswing',         'Kettlebell Swing Challenge', 'Most kettlebell swings in 2 minutes',
  'Hip hinge, swing the kettlebell to chest height, stand tall at the top. Log the weight you used — heavier counts as a better result.',
  'reps', 120, true, 16, 10),
 ('lunge',           'Walking Lunge Challenge',    'Most alternating lunges in 60 seconds',
  'Alternate legs, back knee touches the floor each rep, stand fully up between reps. Count every step.',
  'reps', 60, false, 18, 11),
 ('farmerhold',      'Farmer Hold Challenge',      'Hold two heavy weights as long as possible',
  'Stand tall holding a kettlebell or dumbbell in each hand at your sides. Stop when you put them down. Log the weight per hand.',
  'time', null, true, 20, 12)
on conflict (id) do update set
  name = excluded.name, challenge = excluded.challenge, description = excluded.description,
  metric = excluded.metric, duration_seconds = excluded.duration_seconds,
  uses_weight = excluded.uses_weight, unlock_level = excluded.unlock_level, sort_order = excluded.sort_order;
