-- ============================================================================
-- "Run" becomes a run-in-place exercise (bodyweight) with timer-based
-- instructions. The name stays "Run" on purpose: the classic WODs Helen and
-- Murph and the exercise illustration refer to it by that name.
-- March in Place gets clearer text so it is easy to tell apart from Run:
-- March = walking pace, one foot always on the ground; Run = both feet leave it.
-- Safe to re-run.
-- ============================================================================
update public.exercises
   set instructions = 'Stand tall and run on the spot. Swing your arms, land softly on the balls of your feet and keep a quick, steady rhythm with your knees lifting to a comfortable height. Both feet leave the ground between steps. Keep your chest up and your core braced. Set the time with the timer and keep going until it ends.'
 where name = 'Run'
   and 'bodyweight' = any (equipment)
   and (instructions like '%outdoors or on a treadmill%'
        or instructions like 'Stand tall and run on the spot.%');

update public.exercises
   set instructions = 'Stand tall and walk on the spot at an easy pace. One foot is always on the ground. Lift each knee to a comfortable height and swing your arms naturally.'
 where name = 'March in Place'
   and 'bodyweight' = any (equipment);
