-- ============================================================================
-- "Run" becomes a run-in-place exercise (bodyweight) with timer-based
-- instructions. The name stays "Run" on purpose: the classic WODs Helen and
-- Murph and the exercise illustration refer to it by that name.
-- Safe to re-run: only touches the row while it still has the old outdoor text.
-- ============================================================================
update public.exercises
   set instructions = 'Stand tall and run on the spot. Swing your arms, land softly on the balls of your feet and keep a quick, steady rhythm with your knees lifting to a comfortable height. Keep your chest up and your core braced. Set the time with the timer and keep going until it ends.'
 where name = 'Run'
   and 'bodyweight' = any (equipment)
   and instructions like '%outdoors or on a treadmill%';
