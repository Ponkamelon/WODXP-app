-- Gym Goblin (level 2 boss): 30 Jumping Jacks -> 20 Push-Ups (closer to the level 5 boss in spirit
-- and builds upper body). Everything else (20 squats, 4 min cap, 80 XP) is unchanged.
-- Safe to run more than once.
update public.boss_battles
   set structure = '[{"reps":20,"exercise_name":"Bodyweight Squat"},{"reps":20,"exercise_name":"Push-Up"}]'::jsonb
 where level = 2 and name = 'Gym Goblin';

-- Check: select level, name, structure from public.boss_battles where level = 2;
