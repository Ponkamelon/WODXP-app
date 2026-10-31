-- 24 new bodyweight exercises (batch 97/98), inspired by the INSANITY workout series,
-- with our own generic names. Version 2: one DO block, no subquery alias.
-- Safe to re-run: a row is only inserted when no exercise with the same name AND
-- bodyweight equipment already exists. Run once in the Supabase SQL Editor
-- (paste everything into an empty tab, do not select part of it).
-- Hold exercise: Seated Core Hold (default_reps = 1, gets the hold timer in the app).

do $do$
declare
  inserted_count integer;
begin
  insert into public.exercises
    (name, category, difficulty, equipment, focus_area, primary_attribute, unlock_level, xp_value, default_sets, default_reps, default_weight_kg, instructions)
  select x.name, x.category::exercise_category, x.difficulty::difficulty_level, array['bodyweight']::equipment_type[],
         x.focus_area, x.attr::attribute_type, x.unlock_level, x.xp_value, x.sets, x.reps, 0, x.instructions
  from jsonb_to_recordset('[
 {
  "name": "Knee Hug Stretch",
  "category": "mobility",
  "difficulty": "beginner",
  "focus_area": "Hips/Glutes",
  "attr": "mobility",
  "unlock_level": 5,
  "xp_value": 10,
  "sets": 2,
  "reps": 10,
  "instructions": "Lie on your back with your legs straight. Pull one knee toward your chest with both hands, hold briefly, then lower it and change legs."
 },
 {
  "name": "Cross Jack",
  "category": "conditioning",
  "difficulty": "beginner",
  "focus_area": "Full Body",
  "attr": "conditioning",
  "unlock_level": 5,
  "xp_value": 12,
  "sets": 3,
  "reps": 30,
  "instructions": "Jump your feet apart while raising your arms overhead. Jump back together, crossing one foot in front of the other and your arms in front of your chest. Change which foot is in front each time."
 },
 {
  "name": "Standing Oblique Crunch",
  "category": "core",
  "difficulty": "beginner",
  "focus_area": "Obliques",
  "attr": "strength",
  "unlock_level": 5,
  "xp_value": 11,
  "sets": 3,
  "reps": 16,
  "instructions": "Stand tall with your hands behind your head. Lift one knee out to the side while bending your upper body sideways to bring your elbow toward it. Lower and change sides."
 },
 {
  "name": "Seated Twist",
  "category": "core",
  "difficulty": "beginner",
  "focus_area": "Obliques/Core",
  "attr": "strength",
  "unlock_level": 6,
  "xp_value": 12,
  "sets": 3,
  "reps": 16,
  "instructions": "Sit with your knees bent and lean back slightly with a straight back. Lift your heels just off the floor and rotate your upper body to bring your hands to one side, then the other."
 },
 {
  "name": "Seated Core Hold",
  "category": "core",
  "difficulty": "beginner",
  "focus_area": "Abdominals",
  "attr": "strength",
  "unlock_level": 6,
  "xp_value": 12,
  "sets": 3,
  "reps": 1,
  "instructions": "Sit with your knees bent and lean back until you feel your abs working, keeping your back straight. Lift your feet slightly and hold the position while breathing normally."
 },
 {
  "name": "In-and-Out Crunch",
  "category": "core",
  "difficulty": "beginner",
  "focus_area": "Abdominals",
  "attr": "strength",
  "unlock_level": 7,
  "xp_value": 12,
  "sets": 3,
  "reps": 12,
  "instructions": "Sit leaning back with your hands on the floor behind you. Stretch your legs out while leaning further back, then pull your knees in toward your chest while bringing your upper body forward. Repeat."
 },
 {
  "name": "Seated Knee Tuck",
  "category": "core",
  "difficulty": "beginner",
  "focus_area": "Abdominals",
  "attr": "strength",
  "unlock_level": 7,
  "xp_value": 12,
  "sets": 3,
  "reps": 12,
  "instructions": "Sit leaning back with your legs straight and slightly off the floor. Pull your knees toward your chest, then extend them again without letting your feet touch the floor."
 },
 {
  "name": "Pogo Hop",
  "category": "conditioning",
  "difficulty": "beginner",
  "focus_area": "Calves/Cardio",
  "attr": "conditioning",
  "unlock_level": 8,
  "xp_value": 13,
  "sets": 3,
  "reps": 30,
  "instructions": "Stand tall with your legs almost straight and hop continuously using only your ankles. Stay light on the balls of your feet and keep each hop small and quick."
 },
 {
  "name": "Front Kick",
  "category": "conditioning",
  "difficulty": "beginner",
  "focus_area": "Legs/Cardio",
  "attr": "conditioning",
  "unlock_level": 8,
  "xp_value": 13,
  "sets": 3,
  "reps": 20,
  "instructions": "Stand tall with your fists up. Kick one leg forward and up to about waist height, bring it back with control and alternate legs."
 },
 {
  "name": "Kick and Step Back",
  "category": "conditioning",
  "difficulty": "intermediate",
  "focus_area": "Legs/Cardio",
  "attr": "conditioning",
  "unlock_level": 10,
  "xp_value": 15,
  "sets": 3,
  "reps": 16,
  "instructions": "Kick one leg forward, then swing that foot back and step it behind you into a small lunge. Stand up and repeat with the other leg."
 },
 {
  "name": "Kickstand Floor Touch",
  "category": "hinge",
  "difficulty": "intermediate",
  "focus_area": "Hamstrings/Glutes",
  "attr": "strength",
  "unlock_level": 10,
  "xp_value": 15,
  "sets": 3,
  "reps": 10,
  "instructions": "Stand on one leg with the other foot resting lightly behind you on its toes, like a kickstand. Hinge forward at the hips and reach toward the floor, then stand back up. Do all reps, then change legs."
 },
 {
  "name": "Twisting High Knees",
  "category": "conditioning",
  "difficulty": "intermediate",
  "focus_area": "Cardio/Core",
  "attr": "conditioning",
  "unlock_level": 11,
  "xp_value": 16,
  "sets": 3,
  "reps": 30,
  "instructions": "Run in place and lift your knees high. As each knee comes up, rotate your upper body to bring the opposite elbow toward it."
 },
 {
  "name": "Oblique Hip Dip",
  "category": "core",
  "difficulty": "intermediate",
  "focus_area": "Obliques/Core",
  "attr": "strength",
  "unlock_level": 11,
  "xp_value": 16,
  "sets": 3,
  "reps": 16,
  "instructions": "Start in a forearm plank. Rotate your hips to lower one side toward the floor, return to the middle and dip the other side."
 },
 {
  "name": "V-Sit Twist",
  "category": "core",
  "difficulty": "intermediate",
  "focus_area": "Abdominals/Obliques",
  "attr": "strength",
  "unlock_level": 12,
  "xp_value": 17,
  "sets": 3,
  "reps": 16,
  "instructions": "Balance on your bottom with your legs lifted into a V shape and your back straight. Rotate your upper body from side to side, bringing your hands next to each hip."
 },
 {
  "name": "Jumping Switch Kick",
  "category": "conditioning",
  "difficulty": "intermediate",
  "focus_area": "Legs/Cardio",
  "attr": "conditioning",
  "unlock_level": 12,
  "xp_value": 17,
  "sets": 3,
  "reps": 20,
  "instructions": "Start in a staggered stance. Jump and swing your back leg forward in a kick while your front leg goes back, and land in the opposite stance. Keep alternating."
 },
 {
  "name": "Push-Up Jack",
  "category": "conditioning",
  "difficulty": "intermediate",
  "focus_area": "Full Body/Chest",
  "attr": "conditioning",
  "unlock_level": 13,
  "xp_value": 18,
  "sets": 3,
  "reps": 12,
  "instructions": "Start in a push-up position. Jump your feet apart and back together like a jumping jack, then lower into a push-up and press back up. Repeat."
 },
 {
  "name": "Side-to-Side Push-Up",
  "category": "push",
  "difficulty": "intermediate",
  "focus_area": "Chest/Shoulders",
  "attr": "strength",
  "unlock_level": 13,
  "xp_value": 18,
  "sets": 3,
  "reps": 10,
  "instructions": "Do a push-up, then walk both hands one step to the side. Do the next push-up there, then walk back the other way."
 },
 {
  "name": "Explosive Push-Up",
  "category": "push",
  "difficulty": "intermediate",
  "focus_area": "Chest/Power",
  "attr": "strength",
  "unlock_level": 14,
  "xp_value": 19,
  "sets": 3,
  "reps": 8,
  "instructions": "Lower into a push-up, then press up so hard that your hands briefly leave the floor. Land softly with bent elbows and go straight into the next rep."
 },
 {
  "name": "Push-Up to Knee Tuck",
  "category": "core",
  "difficulty": "intermediate",
  "focus_area": "Chest/Core",
  "attr": "strength",
  "unlock_level": 15,
  "xp_value": 20,
  "sets": 3,
  "reps": 10,
  "instructions": "Do a push-up. At the top, bring one knee toward your chest, return the foot and alternate legs with each rep."
 },
 {
  "name": "Frog Jump",
  "category": "conditioning",
  "difficulty": "intermediate",
  "focus_area": "Legs/Power",
  "attr": "conditioning",
  "unlock_level": 15,
  "xp_value": 20,
  "sets": 3,
  "reps": 12,
  "instructions": "Squat deep with your hands on the floor between your feet. Jump forward as far as you can, land softly back in the deep squat and repeat."
 },
 {
  "name": "Squat Reach Jump",
  "category": "conditioning",
  "difficulty": "advanced",
  "focus_area": "Legs/Power",
  "attr": "conditioning",
  "unlock_level": 17,
  "xp_value": 21,
  "sets": 3,
  "reps": 12,
  "instructions": "Squat down and touch the floor with your hands. Explode up into a jump while reaching your arms overhead. Land softly and go straight into the next squat."
 },
 {
  "name": "Diamond Hop",
  "category": "conditioning",
  "difficulty": "advanced",
  "focus_area": "Legs/Agility",
  "attr": "conditioning",
  "unlock_level": 18,
  "xp_value": 22,
  "sets": 3,
  "reps": 12,
  "instructions": "Imagine a diamond on the floor. Hop forward, to the side, backward and to the other side on both feet, tracing the diamond. Land softly and stay balanced."
 },
 {
  "name": "Single-Leg Push-Up",
  "category": "push",
  "difficulty": "advanced",
  "focus_area": "Chest/Core",
  "attr": "strength",
  "unlock_level": 19,
  "xp_value": 23,
  "sets": 3,
  "reps": 6,
  "instructions": "Start in a push-up position with one foot lifted slightly off the floor. Lower your chest and push back up without letting your hips twist. Change the lifted leg each set."
 },
 {
  "name": "Single-Leg Pike Push-Up",
  "category": "push",
  "difficulty": "advanced",
  "focus_area": "Shoulders/Triceps",
  "attr": "strength",
  "unlock_level": 21,
  "xp_value": 25,
  "sets": 3,
  "reps": 6,
  "instructions": "Start in an upside-down V with one foot lifted off the floor. Bend your elbows to lower your head toward the floor, then press back up. Change the lifted leg each set."
 }
]'::jsonb)
       as x(name text, category text, difficulty text, focus_area text, attr text,
            unlock_level integer, xp_value integer, sets integer, reps integer, instructions text)
  where not exists (
    select 1 from public.exercises e
     where lower(e.name) = lower(x.name) and 'bodyweight' = any (e.equipment)
  );
  get diagnostics inserted_count = row_count;
  raise notice 'Inserted % new exercises', inserted_count;
end
$do$;
