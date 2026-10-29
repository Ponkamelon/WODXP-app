import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AppClient from '@/components/AppClient';

export default async function HomePage() {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch user profile + stats + all-time totals in parallel
  const [{ data: profile }, { data: stats }, { data: allTimeStatsRows }, { data: levelChallenges }, { data: bossBattles }, { count: totalExerciseCount }, { data: classicWods }, { data: wodSummaryRows }, { data: wodMedalRows }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('user_stats').select('*').eq('user_id', user.id).single(),
    supabase.rpc('get_alltime_stats', { p_user_id: user.id }),
    supabase.from('level_challenges').select('*').order('level', { ascending: true }),
    supabase.from('boss_battles').select('*').order('level', { ascending: true }),
    supabase.from('exercises').select('*', { count: 'exact', head: true }),
    supabase.from('classic_wods').select('*').order('slot', { ascending: true }),
    supabase.rpc('get_wod_summary', { p_user_id: user.id }),
    supabase.rpc('get_user_wod_medals', { p_user_id: user.id }),
  ]);

  const wodSummary = wodSummaryRows?.[0] ?? { completed: 0, gold: 0, silver: 0, bronze: 0 };
  const wodMedals: Record<number, string> = Object.fromEntries(
    (wodMedalRows ?? []).map((row: { wod_slot: number; medal: string }) => [row.wod_slot, row.medal])
  );

  const allTimeStats = allTimeStatsRows?.[0] ?? { total_workouts: 0, total_kg: 0, total_seconds: 0 };

  // Fetch unlocked exercises for this user's levels
  const maxLevel = Math.max(
    stats?.level_strength ?? 1,
    stats?.level_mobility ?? 1,
    stats?.level_conditioning ?? 1
  );
  const { data: exercises } = await supabase
    .from('exercises')
    .select('*')
    .lte('unlock_level', maxLevel)
    .order('unlock_level', { ascending: true });

  // Level challenges, boss battles and WODs unlock by TOTAL level, but the
  // list above is capped by the highest per-category level — so a movement
  // used by an unlocked challenge can be missing (no tap-through, no image).
  // Fetch every movement those screens reference, regardless of level.
  type NamedStep = { exercise_name?: string | null };
  const challengeNames = new Set<string>();
  const addNames = (steps: NamedStep[] | null | undefined) => {
    for (const st of steps ?? []) if (st?.exercise_name) challengeNames.add(st.exercise_name);
  };
  for (const lc of levelChallenges ?? []) {
    if (lc.exercise_name) challengeNames.add(lc.exercise_name);
    addNames(lc.structure);
  }
  for (const bb of bossBattles ?? []) {
    addNames(bb.structure);
    addNames(bb.scaled_structure);
  }
  for (const w of classicWods ?? []) addNames(w.structure);
  const { data: challengeExercises } = challengeNames.size > 0
    ? await supabase
        .from('exercises')
        .select('*')
        .in('name', Array.from(challengeNames))
        .order('unlock_level', { ascending: true })
    : { data: [] };

  return (
    <AppClient
      user={{ id: user.id, email: user.email ?? '', username: profile?.username ?? '' }}
      stats={stats ?? {
        level: 1, xp_total: 0,
        xp_strength: 0, xp_mobility: 0, xp_conditioning: 0,
        level_strength: 1, level_mobility: 1, level_conditioning: 1,
        current_streak: 0, longest_streak: 0, streak_freeze_count: 1,
      }}
      exercises={exercises ?? []}
      challengeExercises={challengeExercises ?? []}
      allTimeStats={{
        totalWorkouts: allTimeStats.total_workouts ?? 0,
        totalKg: allTimeStats.total_kg ?? 0,
        totalSeconds: allTimeStats.total_seconds ?? 0,
      }}
      levelChallenges={levelChallenges ?? []}
      bossBattles={bossBattles ?? []}
      totalExerciseCount={totalExerciseCount ?? 0}
      classicWods={classicWods ?? []}
      wodSummary={{
        completed: wodSummary.completed ?? 0,
        gold: wodSummary.gold ?? 0,
        silver: wodSummary.silver ?? 0,
        bronze: wodSummary.bronze ?? 0,
      }}
      wodMedals={wodMedals}
    />
  );
}
