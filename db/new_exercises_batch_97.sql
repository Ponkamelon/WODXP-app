-- 24 new bodyweight exercises (batch 97/98), inspired by the INSANITY workout series,
-- with our own generic names. Safe to re-run: a row is only inserted when no
-- exercise with the same name AND bodyweight equipment exists. Run once in the
-- Supabase SQL Editor. Images are added later through the normal image batches.
-- Hold exercise: Seated Core Hold (default_reps = 1, gets the hold timer in the app).

insert into public.exercises
  (name, category, difficulty, equipment, focus_area, primary_attribute, unlock_level, xp_value, default_sets, default_reps, default_weight_kg, instructions)
select v.name, v.category::exercise_category, v.difficulty::difficulty_level, array['bodyweight']::equipment_type[],
       v.focus_area, v.attr::attribute_type, v.unlock_level, v.xp_value, v.sets, v.reps, 0, v.instructions
from (values
  ('Knee Hug Stretch', 'mobility', 'beginner', 'Hips/Glutes', 'mobility', 5, 10, 2, 10, 'Lie on your back with your legs straight. Pull one knee toward your chest with both hands, hold briefly, then lower it and change legs.'),
  ('Cross Jack', 'conditioning', 'beginner', 'Full Body', 'conditioning', 5, 12, 3, 30, 'Jump your feet apart while raising your arms overhead. Jump back together, crossing one foot in front of the other and your arms in front of your chest. Change which foot is in front each time.'),
  ('Standing Oblique Crunch', 'core', 'beginner', 'Obliques', 'strength', 5, 11, 3, 16, 'Stand tall with your hands behind your head. Lift one knee out to the side while bending your upper body sideways to bring your elbow toward it. Lower and change sides.'),
  ('Seated Twist', 'core', 'beginner', 'Obliques/Core', 'strength', 6, 12, 3, 16, 'Sit with your knees bent and lean back slightly with a straight back. Lift your heels just off the floor and rotate your upper body to bring your hands to one side, then the other.'),
  ('Seated Core Hold', 'core', 'beginner', 'Abdominals', 'strength', 6, 12, 3, 1, 'Sit with your knees bent and lean back until you feel your abs working, keeping your back straight. Lift your feet slightly and hold the position while breathing normally.'),
  ('In-and-Out Crunch', 'core', 'beginner', 'Abdominals', 'strength', 7, 12, 3, 12, 'Sit leaning back with your hands on the floor behind you. Stretch your legs out while leaning further back, then pull your knees in toward your chest while bringing your upper body forward. Repeat.'),
  ('Seated Knee Tuck', 'core', 'beginner', 'Abdominals', 'strength', 7, 12, 3, 12, 'Sit leaning back with your legs straight and slightly off the floor. Pull your knees toward your chest, then extend them again without letting your feet touch the floor.'),
  ('Pogo Hop', 'conditioning', 'beginner', 'Calves/Cardio', 'conditioning', 8, 13, 3, 30, 'Stand tall with your legs almost straight and hop continuously using only your ankles. Stay light on the balls of your feet and keep each hop small and quick.'),
  ('Front Kick', 'conditioning', 'beginner', 'Legs/Cardio', 'conditioning', 8, 13, 3, 20, 'Stand tall with your fists up. Kick one leg forward and up to about waist height, bring it back with control and alternate legs.'),
  ('Kick and Step Back', 'conditioning', 'intermediate', 'Legs/Cardio', 'conditioning', 10, 15, 3, 16, 'Kick one leg forward, then swing that foot back and step it behind you into a small lunge. Stand up and repeat with the other leg.'),
  ('Kickstand Floor Touch', 'hinge', 'intermediate', 'Hamstrings/Glutes', 'strength', 10, 15, 3, 10, 'Stand on one leg with the other foot resting lightly behind you on its toes, like a kickstand. Hinge forward at the hips and reach toward the floor, then stand back up. Do all reps, then change legs.'),
  ('Twisting High Knees', 'conditioning', 'intermediate', 'Cardio/Core', 'conditioning', 11, 16, 3, 30, 'Run in place and lift your knees high. As each knee comes up, rotate your upper body to bring the opposite elbow toward it.'),
  ('Oblique Hip Dip', 'core', 'intermediate', 'Obliques/Core', 'strength', 11, 16, 3, 16, 'Start in a forearm plank. Rotate your hips to lower one side toward the floor, return to the middle and dip the other side.'),
  ('V-Sit Twist', 'core', 'intermediate', 'Abdominals/Obliques', 'strength', 12, 17, 3, 16, 'Balance on your bottom with your legs lifted into a V shape and your back straight. Rotate your upper body from side to side, bringing your hands next to each hip.'),
  ('Jumping Switch Kick', 'conditioning', 'intermediate', 'Legs/Cardio', 'conditioning', 12, 17, 3, 20, 'Start in a staggered stance. Jump and swing your back leg forward in a kick while your front leg goes back, and land in the opposite stance. Keep alternating.'),
  ('Push-Up Jack', 'conditioning', 'intermediate', 'Full Body/Chest', 'conditioning', 13, 18, 3, 12, 'Start in a push-up position. Jump your feet apart and back together like a jumping jack, then lower into a push-up and press back up. Repeat.'),
  ('Side-to-Side Push-Up', 'push', 'intermediate', 'Chest/Shoulders', 'strength', 13, 18, 3, 10, 'Do a push-up, then walk both hands one step to the side. Do the next push-up there, then walk back the other way.'),
  ('Explosive Push-Up', 'push', 'intermediate', 'Chest/Power', 'strength', 14, 19, 3, 8, 'Lower into a push-up, then press up so hard that your hands briefly leave the floor. Land softly with bent elbows and go straight into the next rep.'),
  ('Push-Up to Knee Tuck', 'core', 'intermediate', 'Chest/Core', 'strength', 15, 20, 3, 10, 'Do a push-up. At the top, bring one knee toward your chest, return the foot and alternate legs with each rep.'),
  ('Frog Jump', 'conditioning', 'intermediate', 'Legs/Power', 'conditioning', 15, 20, 3, 12, 'Squat deep with your hands on the floor between your feet. Jump forward as far as you can, land softly back in the deep squat and repeat.'),
  ('Squat Reach Jump', 'conditioning', 'advanced', 'Legs/Power', 'conditioning', 17, 21, 3, 12, 'Squat down and touch the floor with your hands. Explode up into a jump while reaching your arms overhead. Land softly and go straight into the next squat.'),
  ('Diamond Hop', 'conditioning', 'advanced', 'Legs/Agility', 'conditioning', 18, 22, 3, 12, 'Imagine a diamond on the floor. Hop forward, to the side, backward and to the other side on both feet, tracing the diamond. Land softly and stay balanced.'),
  ('Single-Leg Push-Up', 'push', 'advanced', 'Chest/Core', 'strength', 19, 23, 3, 6, 'Start in a push-up position with one foot lifted slightly off the floor. Lower your chest and push back up without letting your hips twist. Change the lifted leg each set.'),
  ('Single-Leg Pike Push-Up', 'push', 'advanced', 'Shoulders/Triceps', 'strength', 21, 25, 3, 6, 'Start in an upside-down V with one foot lifted off the floor. Bend your elbows to lower your head toward the floor, then press back up. Change the lifted leg each set.')
) as v(name, category, difficulty, focus_area, attr, unlock_level, xp_value, sets, reps, instructions)
where not exists (
  select 1 from public.exercises e
   where lower(e.name) = lower(v.name) and 'bodyweight' = any (e.equipment)
);

-- Check (should return 24 rows after the insert):
-- select name, category, difficulty, unlock_level, xp_value from public.exercises
--  where created_at > now() - interval '1 hour' and 'bodyweight' = any (equipment) order by unlock_level, name;
