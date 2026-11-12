-- ============================================================================
-- Body region per exercise, for the generator setting "Focus: Full body / Upper body / Lower body".
-- Adds exercises.body_region = 'upper' | 'lower' | 'core' | 'full' and fills it from category + name.
--   upper = mainly arms/shoulders/back/chest      lower = mainly legs/glutes/hamstrings (incl. deadlifts, swings)
--   core  = trunk work                             full  = compound / whole-body moves (cleans, snatches, thrusters,
--                                                  carries, burpees, rows with hip hinge ...)
-- In the app: Upper body = upper + core, Lower body = lower + core, Full body = everything.
-- Run once in the Supabase SQL Editor. Safe to re-run: it only classifies exercises that have no region yet,
-- so manual corrections are never overwritten.
--
-- Correct a single exercise afterwards:
--   update public.exercises set body_region = 'upper' where name = 'Some Exercise';
-- Follow up: select body_region, count(*) from public.exercises group by 1 order by 1;
-- ============================================================================

alter table public.exercises add column if not exists body_region text;

update public.exercises e set body_region = k.reg
from (
  select id, case
      when c = 'carry' and n ~ '(lunge|walkout|knee march|fast march)' then 'lower'
      when c = 'carry' then 'full'
      when c = 'push' and n ~ '(clean|jerk|thruster|push press|devil|man maker|get-up|windmill|inchworm|bridge|snatch|burpee|bent press|single-leg)' then 'full'
      when c = 'push' then 'upper'
      when c = 'pull' and n ~ '(nordic)' then 'lower'
      when c = 'pull' and n ~ '(clean|snatch|jerk|bear crawl|bent-over|gorilla|rear delt|burpee|knee drive|windmill|get-up|get-down|muscle-up|jumping|preparation|rotation)' then 'full'
      when c = 'pull' then 'upper'
      when c = 'squat' and n ~ '(burpee|clean|snatch|jerk|thruster|press|devil|man maker|get-up|windmill|mountain|jack|complex|row|curl|swing|wall ball|high knee)' then 'full'
      when c = 'squat' then 'lower'
      when c = 'hinge' and n ~ '(high pull|shrug|row|curl)' then 'full'
      when c = 'hinge' then 'lower'
      when c = 'core' and n ~ '(glute|hip thrust|donkey|fire hydrant|calf|squat|lunge|step-up|deadlift|crab bridge|single-leg rdl)' then 'lower'
      when c = 'core' and n ~ '(superman|windmill|turkish|gorilla|clean)' then 'full'
      when c = 'core' and n ~ '(front raise|lateral raise|kickback|wall handstand|bottom-up)' then 'upper'
      when c = 'core' then 'core'
      when c = 'conditioning' and n ~ '(burpee|bear crawl|man maker|clean|snatch|thruster|press|devil|mountain|sprawl|crab walk|jack|row|flow|complex|renegade|push-up|punch|high pull|long cycle|master|full-body|plyometric|deadlift|curl)' then 'full'
      when c = 'conditioning' and n ~ '(swing)' and n ~ '(squat|high pull)' then 'full'
      when c = 'conditioning' and n ~ '(swing)' then 'lower'
      when c = 'conditioning' and n ~ '(jump|hop|knee|kick|lunge|squat|skater|shuffle|step|run|march|frogger|diamond|double under|fast feet|pogo|calf)' then 'lower'
      when c = 'conditioning' then 'full'
      when c = 'mobility' and n ~ '(turkish|windmill|flow|crab|beast|world|inchworm|downward dog|get-up|bridge|master|complex|ground|full hip|advanced|stability position|boss|single-arm overhead squat|overhead cossack|dumbbell overhead)' then 'full'
      when c = 'mobility' and n ~ '(hip|cossack|squat|lunge|ankle|hamstring|quad|glute|pancake|90/90|shin box|scorpion|figure four|figure 8|knee hug|knee-to-wall|deadlift|thigh|adductor)' then 'lower'
      when c = 'mobility' and n ~ '(arm|shoulder|halo|neck|thoracic|chest opener|open book|thread the needle|snow angel|around the world|around the body)' then 'upper'
      when c = 'mobility' and n ~ '(cat-cow|child|backbend|side reach|spine)' then 'core'
      when c = 'mobility' then 'full'
      else 'full' end as reg
  from (select id, category::text as c, lower(name) as n from public.exercises where body_region is null) s
) k
where e.id = k.id and e.body_region is null;

alter table public.exercises drop constraint if exists exercises_body_region_check;
alter table public.exercises add constraint exercises_body_region_check
  check (body_region in ('upper','lower','core','full'));
alter table public.exercises alter column body_region set default 'full';
alter table public.exercises alter column body_region set not null;
