'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, useMotionValue, animate } from 'motion/react';
import {
  Flame, ChevronRight, Search, Lock, Trophy, Swords, Plus, Crown,
  TrendingUp, Award, Sparkles, Target, Clock, Gauge,
  Minus, Check, ArrowLeft,
} from 'lucide-react';
import {
  CATEGORY_ICONS, CATEGORY_LABELS, EQUIPMENT_LABELS, EQUIPMENT_COLORS,
  pickPrimaryEquipment, NEON, neonIconStyles, type ExerciseCategory, type Equipment,
} from './MovementIcons';
import { ExerciseIllustration, illustrationStyles } from './ExerciseIllustrations';

// ─── Types ───────────────────────────────────────────────────────────────────
interface User { id: string; email: string; username: string; }
interface UserStats {
  level: number; xp_total: number;
  xp_strength: number; xp_mobility: number; xp_conditioning: number;
  level_strength: number; level_mobility: number; level_conditioning: number;
  current_streak: number; longest_streak: number; streak_freeze_count: number;
}
interface Exercise {
  id: string; name: string; category: ExerciseCategory; difficulty: string;
  equipment: string[]; primary_attribute: string; unlock_level: number;
  xp_value: number; default_sets: number; default_reps: number;
  default_weight_kg: number; illustration_url?: string; instructions?: string;
}
interface BossExercise { exercise_name: string; reps?: number; duration_seconds?: number; }
interface LevelChallenge {
  level: number; name: string; description: string; exercise_name: string | null;
  target_reps: number | null; target_duration_seconds: number | null;
  structure: BossExercise[] | null; time_cap_seconds: number | null;
  equipment: string[]; scaled_description: string | null; xp_reward: number;
}
interface BossBattle {
  level: number; name: string; description: string; rounds: number;
  structure: BossExercise[]; scaled_structure: BossExercise[] | null;
  time_cap_seconds: number | null; medal_silver_seconds: number | null; medal_gold_seconds: number | null;
  xp_reward: number;
}
interface AllTimeStats { totalWorkouts: number; totalKg: number; totalSeconds: number; }
interface ClassicWod {
  slot: number; name: string; unlock_level: number; description: string | null;
  structure: BossExercise[] | null; time_cap_seconds: number | null;
  wod_type: string | null; difficulty_tier: string | null;
  scoring_type: 'time' | 'rounds' | 'points'; format_label: string | null;
  amrap_duration_seconds: number | null;
  medal_bronze_value: number | null; medal_silver_value: number | null; medal_gold_value: number | null;
  is_ready: boolean;
}
interface WodSummary { completed: number; gold: number; silver: number; bronze: number; }
interface Props {
  user: User; stats: UserStats; exercises: Exercise[]; allTimeStats: AllTimeStats;
  levelChallenges: LevelChallenge[]; bossBattles: BossBattle[]; totalExerciseCount: number;
  classicWods: ClassicWod[]; wodSummary: WodSummary; wodMedals: Record<number, string>;
}

// ─── Design tokens (neon-on-dark) ─────────────────────────────────────────────
const C = {
  bg: NEON.bg, surface: NEON.surface, raised: NEON.surfaceRaised, border: NEON.border,
  text: NEON.textPrimary, muted: NEON.textSecondary, xp: NEON.xp, boss: NEON.boss,
  strength: NEON.xp, mobility: NEON.mobility, conditioning: NEON.conditioning,
  kettlebell: NEON.kettlebell, dumbbell: NEON.dumbbell, bodyweight: NEON.bodyweight,
};

// ─── XP helpers ──────────────────────────────────────────────────────────────
function xpForLevel(level: number) { return Math.round(60 * Math.pow(level, 2.1)); }
function progressToNext(xp: number, level: number) {
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { progress: Math.min(1, (xp - current) / (next - current)), xpLeft: next - xp };
}
function xpDerivedLevel(xpTotal: number): number {
  let lvl = 1;
  for (let i = 1; i <= 50; i++) if (xpTotal >= xpForLevel(i)) lvl = i;
  return lvl;
}

/** Computes the current Level Challenge / Boss Battle gating state.
 *  `level` (cleared level) only advances via completing a challenge or
 *  boss — see clear_level_challenge / attempt_boss_battle in the DB. */
function getLevelProgress(stats: UserStats, levelChallenges: LevelChallenge[], bossBattles: BossBattle[]) {
  const pendingLevel = stats.level + 1;
  const isBossPending = pendingLevel % 5 === 0;
  const isComplete = pendingLevel > 50;
  const derivedLevel = xpDerivedLevel(stats.xp_total);
  const isUnlocked = !isComplete && derivedLevel >= pendingLevel;
  const isXpFrozen = isUnlocked && isBossPending; // matches award_xp's freeze logic
  const challenge = !isComplete && !isBossPending ? levelChallenges.find((c) => c.level === pendingLevel) ?? null : null;
  const boss = !isComplete && isBossPending ? bossBattles.find((b) => b.level === pendingLevel) ?? null : null;
  return { pendingLevel, isBossPending, isComplete, isUnlocked, isXpFrozen, challenge, boss };
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
const SG = { fontFamily: "'Oswald', sans-serif" };
const MO = { fontFamily: "'JetBrains Mono', monospace" };

/**
 * Wraps a screen's content with a soft fade + slide-up entrance whenever it
 * mounts. This is a first, low-risk pass at "page transitions" — it doesn't
 * yet animate the OUTGOING screen (that needs AnimatePresence around a
 * single conditional render point, which is a bigger structural change to
 * revisit in the broader animation pass).
 */
/**
 * Direction-aware page slide, per the Motion & Visual Design spec section 11:
 * forward navigation slides in from the right (x: 16 -> 0), back navigation
 * slides in from the left (x: -16 -> 0). Direction is inferred from a simple
 * depth ranking per screen — deeper screens are "forward", shallower ones
 * (like returning to the tab bar) are "back" — so call sites don't each need
 * to declare direction explicitly.
 */
function PageTransition({ children, screenKey }: { children: React.ReactNode; screenKey: string }) {
  const prevDepthRef = React.useRef(0);
  const depth = SCREEN_DEPTH[screenKey] ?? 0;
  const direction = depth >= prevDepthRef.current ? 1 : -1;
  prevDepthRef.current = depth;

  return (
    <motion.div
      key={screenKey}
      initial={{ opacity: 0, x: 16 * direction }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animates a numeric value smoothly counting from its previous value to the
 * new one, per spec section 14/17 ("NumberRoll rather than instant
 * replacement"). Used for XP, attribute levels, stats, and workout counters.
 */
function NumberRoll({ value, className, style, duration = 0.6 }: {
  value: number; className?: string; style?: React.CSSProperties; duration?: number;
}) {
  const motionValue = useMotionValue(value);
  const [display, setDisplay] = useState(value);
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      motionValue.set(value);
      setDisplay(value);
      return;
    }
    const controls = animate(motionValue, value, { duration, ease: 'easeOut' });
    const unsubscribe = motionValue.on('change', (v) => setDisplay(Math.round(v)));
    return () => { controls.stop(); unsubscribe(); };
  }, [value]);

  return <span className={className} style={style}>{display}</span>;
}

/**
 * Shared press/release feedback for interactive buttons, per spec section 9:
 * scale 1 -> 0.96 on press, spring release back to 1 (stiffness 450,
 * damping 28). The static Lime glow on primary CTAs is already handled via
 * `boxShadow` in each button's own style — an animated "glow pulse on
 * release" is a nice P1/P2 polish item to revisit once this base motion is
 * confirmed feeling right, rather than risk an unreliable first pass.
 */

/**
 * TEST — one LED-streak border effect, applied to a single flagship button
 * first so it can be evaluated before rolling out to every CTA.
 *
 * On press: a short (~13% of the perimeter) light streak travels once
 * around the rounded border. The streak's OWN color continuously cycles
 * Lime -> Orange -> Blue -> Lime as it moves (not three separate dots) —
 * done by rotating a repeating gradient underneath a moving dashed stroke,
 * so the visible dash samples a different point in the color cycle every
 * frame. A blur filter behind the stroke gives the glow/trail. Runs once
 * per press (~700ms), then unmounts itself; button scale (1 -> 0.97 -> 1)
 * is the standard tap spring, layered underneath.
 *
 * `radius` should match the button's actual Tailwind rounding in px
 * (rounded-2xl = 16, rounded-xl = 12, etc.) so the streak traces the real
 * corners rather than cutting across them.
 */
function LedBorderButton({ children, onClick, className, style, disabled, radius = 16 }: {
  children: React.ReactNode; onClick?: () => void; className?: string; style?: React.CSSProperties;
  disabled?: boolean; radius?: number;
}) {
  const [playing, setPlaying] = useState(false);
  const reactId = React.useId().replace(/[:]/g, '');

  // The whole point of this effect is to be SEEN before anything else
  // happens — for CTAs that navigate or change screens on click (Generate
  // Workout, Finish & Save, etc.), calling onClick immediately would unmount
  // this button mid-animation, so the streak never gets a chance to render.
  // Delaying the actual action by the animation's own duration guarantees
  // it plays out first, on every button this is used on.
  const ANIMATION_MS = 560;
  const handleClick = () => {
    if (disabled) return;
    setPlaying(true);
    window.setTimeout(() => {
      setPlaying(false);
      onClick?.();
    }, ANIMATION_MS);
  };

  return (
    <motion.button
      onClick={handleClick}
      disabled={disabled}
      className={className}
      style={{ position: 'relative', ...style }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
    >
      {children}
      {playing && (
        <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs>
            {/* Each stop cycles through the WODXP colors on its own, phase-
                offset from the others — this makes the color flow smoothly
                across the gradient over time, independent of the button's
                exact geometry (much more robust than rotating/translating
                the gradient shape to try to track a rect's stroke path). */}
            <linearGradient id={`led-grad-${reactId}`} gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#A8FF00">
                <animate attributeName="stop-color" values="#A8FF00;#FF6A00;#007BFF;#A8FF00" dur="0.525s" repeatCount="1" fill="freeze" />
              </stop>
              <stop offset="50%" stopColor="#FF6A00">
                <animate attributeName="stop-color" values="#FF6A00;#007BFF;#A8FF00;#FF6A00" dur="0.525s" repeatCount="1" fill="freeze" />
              </stop>
              <stop offset="100%" stopColor="#007BFF">
                <animate attributeName="stop-color" values="#007BFF;#A8FF00;#FF6A00;#007BFF" dur="0.525s" repeatCount="1" fill="freeze" />
              </stop>
            </linearGradient>
            <filter id={`led-glow-${reactId}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect
            x="0" y="0"
            width="100%" height="100%"
            rx={radius} ry={radius}
            fill="none"
            stroke={`url(#led-grad-${reactId})`}
            strokeWidth={2.9}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="13 87"
            filter={`url(#led-glow-${reactId})`}
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="0.525s" repeatCount="1" fill="freeze" />
          </rect>
        </svg>
      )}
    </motion.button>
  );
}

/**
 * Shared modal shell for centered-card modals, per spec section 12: backdrop
 * fades to 65% opacity, card springs in with a slight scale + rise. Used for
 * Quit Workout and future reward modals (Level Up, Boss Unlock, Medal, PR).
 */
function ModalTransition({ children, onBackdropClick }: { children: React.ReactNode; onBackdropClick?: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      initial={{ backgroundColor: 'rgba(0,0,0,0)' }}
      animate={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
      transition={{ duration: 0.2 }}
      onClick={onBackdropClick}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/**
 * Keeps the screen from sleeping/dimming while `active` is true, using the
 * standard Screen Wake Lock API. Used during running timers (Boss Battles,
 * Classic WODs, timed Level Challenges) so the phone doesn't lock mid-set.
 * Fails silently on browsers without support — the timer itself still
 * works fine, the screen just might dim on its own timeout there.
 */
function useWakeLock(active: boolean) {
  const wakeLockRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!active) {
      wakeLockRef.current?.release?.().catch(() => {});
      wakeLockRef.current = null;
      return;
    }

    let cancelled = false;
    const requestLock = async () => {
      try {
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
          const lock = await (navigator as any).wakeLock.request('screen');
          if (cancelled) {
            lock.release().catch(() => {});
          } else {
            wakeLockRef.current = lock;
          }
        }
      } catch {
        // Wake Lock not available/permitted here — ignore, timer still works.
      }
    };
    requestLock();

    // The OS releases the lock automatically when the tab is backgrounded
    // (e.g. switching apps) — re-acquire it once the page is visible again.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) requestLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLockRef.current?.release?.().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [active]);
}

/**
 * Real illustrated exercise images (from the WODXP Exercise Image Production
 * Pack). Falls back to the programmatic pose illustration for anything not
 * yet generated. Keyed by "Exercise Name|equipment" to disambiguate
 * exercises available in more than one equipment version.
 */
const EXERCISE_ILLUSTRATION_IMAGES: Record<string, string> = {
  'Alternating Curl|dumbbell': '/exercise-images/dumbbell/alternating_curl.png',
  'Forward Lunge|dumbbell': '/exercise-images/dumbbell/forward_lunge__dumbbell.png',
  'Alternating Swing|kettlebell': '/exercise-images/kettlebell/alternating_swing.png',
  'Arnold Press|dumbbell': '/exercise-images/dumbbell/arnold_press.png',
  'Bear Crawl|bodyweight': '/exercise-images/bodyweight/bear_crawl.png',
  'Bulgarian Split Squat|kettlebell': '/exercise-images/kettlebell/bulgarian_split_squat__kettlebell.png',
  'Burpee|bodyweight': '/exercise-images/bodyweight/burpee.png',
  'Dumbbell Chest Press|dumbbell': '/exercise-images/dumbbell/dumbbell_chest_press.png',
  'Clean|kettlebell': '/exercise-images/kettlebell/clean.png',
  'Kettlebell Deadlift|kettlebell': '/exercise-images/kettlebell/kettlebell_deadlift.png',
  'Decline Push-Up|bodyweight': '/exercise-images/bodyweight/decline_push_up.png',
  'Diamond Push-Up|bodyweight': '/exercise-images/bodyweight/diamond_push_up.png',
  'Farmer Carry|kettlebell': '/exercise-images/kettlebell/farmer_carry.png',
  'Hammer Curl|dumbbell': '/exercise-images/dumbbell/hammer_curl.png',
  'Goblet Squat|kettlebell': '/exercise-images/kettlebell/goblet_squat__kettlebell.png',
  'Hip Thrust|bodyweight': '/exercise-images/bodyweight/hip_thrust__bodyweight.png',
  'Incline Dumbbell Press|dumbbell': '/exercise-images/dumbbell/incline_dumbbell_press.png',
  'Inchworm|bodyweight': '/exercise-images/bodyweight/inchworm.png',
  'Snatch|kettlebell': '/exercise-images/kettlebell/snatch.png',
  'Lateral Raise|dumbbell': '/exercise-images/dumbbell/lateral_raise.png',
  'Mountain Climber|bodyweight': '/exercise-images/bodyweight/mountain_climber.png',
  'Romanian Deadlift|kettlebell': '/exercise-images/kettlebell/romanian_deadlift__kettlebell.png',
  // Batch 2 + 3 additions:
  'Reverse Lunge|bodyweight': '/exercise-images/bodyweight/reverse_lunge__bodyweight.png',
  'Bent-Over Row|dumbbell': '/exercise-images/dumbbell/bent_over_row.png',
  'Plank|bodyweight': '/exercise-images/bodyweight/plank.png',
  'Side Plank|bodyweight': '/exercise-images/bodyweight/side_plank.png',
  'Upright Row|dumbbell': '/exercise-images/dumbbell/upright_row__dumbbell.png',
  'High Pull|kettlebell': '/exercise-images/kettlebell/high_pull.png',
  'Triceps Extension|dumbbell': '/exercise-images/dumbbell/triceps_extension__dumbbell.png',
  'Bodyweight Squat|bodyweight': '/exercise-images/bodyweight/bodyweight_squat.png',
  'Dumbbell Bench Press|dumbbell': '/exercise-images/dumbbell/dumbbell_bench_press.png',
  'V-Up|bodyweight': '/exercise-images/bodyweight/v_up.png',
  'Lateral Lunge|dumbbell': '/exercise-images/dumbbell/lateral_lunge__dumbbell.png',
  'Thruster|kettlebell': '/exercise-images/kettlebell/thruster__kettlebell.png',
  'Jumping Jacks|bodyweight': '/exercise-images/bodyweight/jumping_jacks.png',
  'Renegade Row|dumbbell': '/exercise-images/dumbbell/renegade_row__dumbbell.png',
  'Sumo Deadlift|kettlebell': '/exercise-images/kettlebell/sumo_deadlift.png',
  'Dumbbell Seated Shoulder Press|dumbbell': '/exercise-images/dumbbell/dumbbell_seated_shoulder_press.png',
  'Glute Bridge|bodyweight': '/exercise-images/bodyweight/glute_bridge__bodyweight.png',
  'Step-Up|dumbbell': '/exercise-images/dumbbell/step_up__dumbbell.png',
  'Kettlebell Halo|kettlebell': '/exercise-images/kettlebell/kettlebell_halo.png',
  'Plank Shoulder Tap|bodyweight': '/exercise-images/bodyweight/plank_shoulder_tap.png',
  'KB Clean and Press|kettlebell': '/exercise-images/kettlebell/kb_clean_and_press.png',
  'Biceps Curl|dumbbell': '/exercise-images/dumbbell/biceps_curl__dumbbell.png',
  'Dumbbell Romanian Deadlift|dumbbell': '/exercise-images/dumbbell/dumbbell_romanian_deadlift.png',
  'Donkey Kick|bodyweight': '/exercise-images/bodyweight/donkey_kick.png',
  'Kettlebell Swing|kettlebell': '/exercise-images/kettlebell/kettlebell_swing.png',
  'Forearm Plank|bodyweight': '/exercise-images/bodyweight/forearm_plank.png',
  'Windmill|kettlebell': '/exercise-images/kettlebell/windmill.png',
  // Batch 4 + 5 additions (individually cropped, not grid-sliced):
  'One-Arm Swing|kettlebell': '/exercise-images/kettlebell/one_arm_swing.png',
  'Turkish Get-Up|kettlebell': '/exercise-images/kettlebell/turkish_get_up__kettlebell.png',
  'Two-Hand Swing|kettlebell': '/exercise-images/kettlebell/two_hand_swing.png',
  'Clean and Press|dumbbell': '/exercise-images/dumbbell/clean_and_press.png',
  'Concentration Curl|dumbbell': '/exercise-images/dumbbell/concentration_curl.png',
  'Reverse Fly|dumbbell': '/exercise-images/dumbbell/reverse_fly.png',
  'Shrugs|dumbbell': '/exercise-images/dumbbell/shrugs.png',
  'Skull Crusher|dumbbell': '/exercise-images/dumbbell/skull_crusher.png',
  'Dumbbell Snatch|dumbbell': '/exercise-images/dumbbell/dumbbell_snatch.png',
  'Dumbbell Dead Bug Hold|dumbbell': '/exercise-images/dumbbell/dumbbell_dead_bug_hold.png',
  // Batch 50 additions:
  // Batch 55 additions:
  'Kneeling Backbend|bodyweight': '/exercise-images/bodyweight/kneeling_backbend.png',
  'Pancake Forward Fold|bodyweight': '/exercise-images/bodyweight/pancake_forward_fold.png',
  'Side Lunge Stretch|bodyweight': '/exercise-images/bodyweight/side_lunge_stretch.png',
  'Dumbbell Windmill|dumbbell': '/exercise-images/dumbbell/dumbbell_windmill.png',
  'Get-Up Stability Position|dumbbell': '/exercise-images/dumbbell/get_up_stability_position.png',
  'Hang Clean|dumbbell': '/exercise-images/dumbbell/hang_clean.png',
  'Clean + Push Press|kettlebell': '/exercise-images/kettlebell/clean_push_press.png',
  'Double Kettlebell Clean|kettlebell': '/exercise-images/kettlebell/double_kettlebell_clean.png',
  'Half Snatch|kettlebell': '/exercise-images/kettlebell/half_snatch.png',
  'KB Suitcase Reverse Lunge|kettlebell': '/exercise-images/kettlebell/kb_suitcase_reverse_lunge.png',
  // Batch 54 additions:
  'Fast Mountain Climbers|bodyweight': '/exercise-images/bodyweight/fast_mountain_climbers.png',
  'Hindu Push-Up|bodyweight': '/exercise-images/bodyweight/hindu_push_up.png',
  'Hip Airplane|bodyweight': '/exercise-images/bodyweight/hip_airplane.png',
  'Dumbbell Incline Fly|dumbbell': '/exercise-images/dumbbell/dumbbell_incline_fly.png',
  'Dumbbell Single-Arm Shoulder Press|dumbbell': '/exercise-images/dumbbell/dumbbell_single_arm_shoulder_press.png',
  'Dumbbell Suitcase March|dumbbell': '/exercise-images/dumbbell/dumbbell_suitcase_march.png',
  'Clean + Front Squat + Press|kettlebell': '/exercise-images/kettlebell/clean_front_squat_press.png',
  'Double Clean + Press|kettlebell': '/exercise-images/kettlebell/double_clean_press.png',
  'Double Front-Rack Lunge|kettlebell': '/exercise-images/kettlebell/double_front_rack_lunge.png',
  'Double Strict Press|kettlebell': '/exercise-images/kettlebell/double_strict_press.png',
  // Batch 53 additions:
  'Crow/Frog Stand|bodyweight': '/exercise-images/bodyweight/crow_frog_stand.png',
  'Deep Lunge Reach|bodyweight': '/exercise-images/bodyweight/deep_lunge_reach.png',
  'Burpee + Deadlift|dumbbell': '/exercise-images/dumbbell/burpee_deadlift.png',
  'Dumbbell Burpee|dumbbell': '/exercise-images/dumbbell/dumbbell_burpee.png',
  'Dumbbell Clean|dumbbell': '/exercise-images/dumbbell/dumbbell_clean.png',
  'Bottom-Up Half-Kneeling Hold|kettlebell': '/exercise-images/kettlebell/bottom_up_half_kneeling_hold.png',
  'Clean + Press|kettlebell': '/exercise-images/kettlebell/clean_press.png',
  'Clean to Squat|kettlebell': '/exercise-images/kettlebell/clean_to_squat.png',
  'Double Front Squat|kettlebell': '/exercise-images/kettlebell/double_front_squat.png',
  'Double Kettlebell Swing|kettlebell': '/exercise-images/kettlebell/double_kettlebell_swing.png',
  // Batch 52 additions:
  '180-Degree Squat Jump|bodyweight': '/exercise-images/bodyweight/180_degree_squat_jump.png',
  'Beast to Kick-Through|bodyweight': '/exercise-images/bodyweight/beast_to_kick_through.png',
  'Standing Hip Airplane Preparation|bodyweight': '/exercise-images/bodyweight/standing_hip_airplane_preparation.png',
  'Alternating Dumbbell Clean|dumbbell': '/exercise-images/dumbbell/alternating_dumbbell_clean.png',
  'Alternating Dumbbell Snatch|dumbbell': '/exercise-images/dumbbell/alternating_dumbbell_snatch.png',
  'Dumbbell Chest-Supported Row|dumbbell': '/exercise-images/dumbbell/dumbbell_chest_supported_row.png',
  'Dumbbell Single-Leg Deadlift Supported|dumbbell': '/exercise-images/dumbbell/dumbbell_single_leg_deadlift_supported.png',
  'Alternating Snatch|kettlebell': '/exercise-images/kettlebell/alternating_snatch.png',
  'Bottom-Up Carry|kettlebell': '/exercise-images/kettlebell/bottom_up_carry.png',
  'KB Single-Leg Deadlift Supported|kettlebell': '/exercise-images/kettlebell/kb_single_leg_deadlift_supported.png',
  // Batch 51 additions:
  'Lunge with Rotation|bodyweight': '/exercise-images/bodyweight/lunge_with_rotation.png',
  'Shin Box Rotation|bodyweight': '/exercise-images/bodyweight/shin_box_rotation.png',
  'Jumping Lunges Preparation|bodyweight': '/exercise-images/bodyweight/jumping_lunges_preparation.png',
  'Dumbbell Incline Row|dumbbell': '/exercise-images/dumbbell/dumbbell_incline_row.png',
  'Dumbbell Plank Drag|dumbbell': '/exercise-images/dumbbell/dumbbell_plank_drag.png',
  'Dumbbell Push Press|dumbbell': '/exercise-images/dumbbell/dumbbell_push_press.png',
  'Dumbbell Bear-Hug Squat|dumbbell': '/exercise-images/dumbbell/dumbbell_bear_hug_squat.png',
  'KB Dead Bug Hold|kettlebell': '/exercise-images/kettlebell/kb_dead_bug_hold.png',
  'KB Goblet Cossack Squat|kettlebell': '/exercise-images/kettlebell/kb_goblet_cossack_squat.png',
  'KB Clean to Front Rack|kettlebell': '/exercise-images/kettlebell/kb_clean_to_front_rack.png',
  'KB Goblet Good Morning|kettlebell': '/exercise-images/kettlebell/kb_goblet_good_morning.png',
  'KB Kneeling Press|kettlebell': '/exercise-images/kettlebell/kb_kneeling_press.png',
  'KB Single-Arm Swing|kettlebell': '/exercise-images/kettlebell/kb_single_arm_swing.png',
  'KB Plank Drag|kettlebell': '/exercise-images/kettlebell/kb_plank_drag.png',
  'Knee-to-Wall Ankle Mobility|bodyweight': '/exercise-images/bodyweight/knee_to_wall_ankle_mobility.png',
  'Scorpion Stretch|bodyweight': '/exercise-images/bodyweight/scorpion_stretch.png',
  'Dumbbell Romanian Deadlift to Row|dumbbell': '/exercise-images/dumbbell/dumbbell_romanian_deadlift_to_row.png',
  'Thruster|dumbbell': '/exercise-images/dumbbell/thruster__dumbbell.png',
  'Triceps Kickback|dumbbell': '/exercise-images/dumbbell/triceps_kickback.png',
  'Bear Plank|bodyweight': '/exercise-images/bodyweight/bear_plank.png',
  'Bicycle Crunch|bodyweight': '/exercise-images/bodyweight/bicycle_crunch.png',
  'Butt Kicks|bodyweight': '/exercise-images/bodyweight/butt_kicks.png',
  'High Knees|bodyweight': '/exercise-images/bodyweight/high_knees.png',
  'Hollow-Body Hold|bodyweight': '/exercise-images/bodyweight/hollow_body_hold.png',
  'Leg Raise|bodyweight': '/exercise-images/bodyweight/leg_raise.png',
  'Plank Up-Down|bodyweight': '/exercise-images/bodyweight/plank_up_down.png',
  'Push-Up|bodyweight': '/exercise-images/bodyweight/push_up.png',
  'Squat Jump|bodyweight': '/exercise-images/bodyweight/squat_jump.png',
  // Batch 6 additions — the top-20 highest-visibility gap-fillers
  // (appear in Classic WODs / Level Challenges / Boss Battles):
  'Clean & Jerk|kettlebell': '/exercise-images/kettlebell/clean_and_jerk.png',
  'Push Press|kettlebell': '/exercise-images/kettlebell/push_press.png',
  'Sumo Deadlift High Pull|kettlebell': '/exercise-images/kettlebell/sumo_deadlift_high_pull.png',
  'Standing Shoulder Press|dumbbell': '/exercise-images/dumbbell/standing_shoulder_press.png',
  'Wall Ball|dumbbell': '/exercise-images/dumbbell/wall_ball.png',
  'Box Jump|bodyweight': '/exercise-images/bodyweight/box_jump.png',
  'Double Under|bodyweight': '/exercise-images/bodyweight/double_under.png',
  'Jumping Lunges|bodyweight': '/exercise-images/bodyweight/jumping_lunges.png',
  'Jumping Pull-Up|bodyweight': '/exercise-images/bodyweight/jumping_pull_up.png',
  'Knees-to-Elbows|bodyweight': '/exercise-images/bodyweight/knees_to_elbows.png',
  'Muscle-Up|bodyweight': '/exercise-images/bodyweight/muscle_up.png',
  'Pull-Up|bodyweight': '/exercise-images/bodyweight/pull_up.png',
  'Row (Machine)|bodyweight': '/exercise-images/bodyweight/row_machine.png',
  'Run|bodyweight': '/exercise-images/bodyweight/run.png',
  'Sit-Up|bodyweight': '/exercise-images/bodyweight/sit_up.png',
  'Step Jacks|bodyweight': '/exercise-images/bodyweight/step_jacks.png',
  'Superman Hold|bodyweight': '/exercise-images/bodyweight/superman_hold.png',
  'Tuck Jump|bodyweight': '/exercise-images/bodyweight/tuck_jump.png',
  'Walking Lunge|bodyweight': '/exercise-images/bodyweight/walking_lunge.png',
  'Wall Handstand Push-Up|bodyweight': '/exercise-images/bodyweight/wall_handstand_push_up.png',
  // Batch 7 additions (all 10 verified content-matched against filename
  // after the first batch 7 attempt had ~20/24 mismatched images):
  'Two-Hand Row|kettlebell': '/exercise-images/kettlebell/two_hand_row.png',
  'Goblet Box Squat|kettlebell': '/exercise-images/kettlebell/goblet_box_squat.png',
  'Two-Hand Floor Press|kettlebell': '/exercise-images/kettlebell/two_hand_floor_press.png',
  'Knee Push-Up|bodyweight': '/exercise-images/bodyweight/knee_push_up.png',
  'Incline Push-Up|bodyweight': '/exercise-images/bodyweight/incline_push_up.png',
  'Dumbbell Floor Press|dumbbell': '/exercise-images/dumbbell/dumbbell_floor_press.png',
  'Floor Press|dumbbell': '/exercise-images/dumbbell/floor_press.png',
  'Dumbbell Bent-Over Row|dumbbell': '/exercise-images/dumbbell/dumbbell_bent_over_row.png',
  'Dumbbell Seated Curl|dumbbell': '/exercise-images/dumbbell/dumbbell_seated_curl.png',
  // Batch 8 additions (all 10 verified content-matched):
  'Calf Raise|kettlebell': '/exercise-images/kettlebell/calf_raise__kettlebell.png',
  'Farmers Carry|kettlebell': '/exercise-images/kettlebell/farmers_carry.png',
  'Dead Bug|bodyweight': '/exercise-images/bodyweight/dead_bug.png',
  'Bird Dog|bodyweight': '/exercise-images/bodyweight/bird_dog.png',
  'Wall Squat|bodyweight': '/exercise-images/bodyweight/wall_squat.png',
  'Calf Raise|bodyweight': '/exercise-images/bodyweight/calf_raise__bodyweight.png',
  'Dumbbell Deadlift|dumbbell': '/exercise-images/dumbbell/dumbbell_deadlift.png',
  'Dumbbell Farmer Hold|dumbbell': '/exercise-images/dumbbell/dumbbell_farmer_hold.png',
  'Goblet Squat|dumbbell': '/exercise-images/dumbbell/goblet_squat__dumbbell.png',
  'Calf Raise|dumbbell': '/exercise-images/dumbbell/calf_raise__dumbbell.png',
  // Batch 9 additions (9 of 10 verified new; "Dead Bug" skipped as an
  // already-covered duplicate from Batch 8):
  'KB Goblet Hold|kettlebell': '/exercise-images/kettlebell/kb_goblet_hold.png',
  'Glute Bridge|kettlebell': '/exercise-images/kettlebell/glute_bridge__kettlebell.png',
  'KB Seated Hold|kettlebell': '/exercise-images/kettlebell/kb_seated_hold.png',
  'Dumbbell Glute Bridge|dumbbell': '/exercise-images/dumbbell/dumbbell_glute_bridge.png',
  'Ankle Rock|bodyweight': '/exercise-images/bodyweight/ankle_rock.png',
  'Arm Circles|bodyweight': '/exercise-images/bodyweight/arm_circles.png',
  'Cat-Cow Stretch|bodyweight': '/exercise-images/bodyweight/cat_cow_stretch.png',
  'Superman|bodyweight': '/exercise-images/bodyweight/superman.png',
  'Cat-Cow|bodyweight': '/exercise-images/bodyweight/cat_cow.png',
  // Batch 10 additions (all 10 verified content-matched; needed a re-export
  // after the first attempt had systematic mismatches, same as Batch 7):
  'Goblet Squat Hold|dumbbell': '/exercise-images/dumbbell/goblet_squat_hold__dumbbell.png',
  'Goblet Squat Hold|kettlebell': '/exercise-images/kettlebell/goblet_squat_hold__kettlebell.png',
  'KB Around the Body|kettlebell': '/exercise-images/kettlebell/kb_around_the_body.png',
  'Seated Hamstring Reach|bodyweight': '/exercise-images/bodyweight/seated_hamstring_reach.png',
  'Reverse Snow Angel|bodyweight': '/exercise-images/bodyweight/reverse_snow_angel.png',
  'Hip Hinge Drill|bodyweight': '/exercise-images/bodyweight/hip_hinge_drill.png',
  'Neck Side Stretch|bodyweight': '/exercise-images/bodyweight/neck_side_stretch.png',
  'Hip Flexor Stretch|bodyweight': '/exercise-images/bodyweight/hip_flexor_stretch.png',
  "Child's Pose|bodyweight": '/exercise-images/bodyweight/childs_pose.png',
  "Child's Pose + Side Reach|bodyweight": '/exercise-images/bodyweight/childs_pose_side_reach.png',
  // Batch 11 additions (7 new; Superman, Wall Squat, and Step Jacks
  // skipped as already-covered duplicates from earlier batches):
  'Standing Quad Stretch|bodyweight': '/exercise-images/bodyweight/standing_quad_stretch.png',
  'Standing Chest Opener|bodyweight': '/exercise-images/bodyweight/standing_chest_opener.png',
  'Standing Side Reach|bodyweight': '/exercise-images/bodyweight/standing_side_reach.png',
  'Shoulder Rolls|bodyweight': '/exercise-images/bodyweight/shoulder_rolls.png',
  'Standing Mountain Climber|bodyweight': '/exercise-images/bodyweight/standing_mountain_climber.png',
  "World's Greatest Stretch|bodyweight": '/exercise-images/bodyweight/worlds_greatest_stretch.png',
  'KB Farmer Hold|kettlebell': '/exercise-images/kettlebell/kb_farmer_hold.png',
  // Batch 12 additions (6 of 10 verified correct; Forearm Plank skipped as
  // an already-covered duplicate; Double KB Clean and Jerk, Double KB Floor
  // Press, and Bottom-Up Press still show mismatched content pending a
  // further-corrected re-export):
  'Chest Fly|dumbbell': '/exercise-images/dumbbell/chest_fly.png',
  'Close-Grip Floor Press|dumbbell': '/exercise-images/dumbbell/close_grip_floor_press.png',
  'Archer Push-Up|bodyweight': '/exercise-images/bodyweight/archer_push_up.png',
  'Dive-Bomber Push-Up|bodyweight': '/exercise-images/bodyweight/dive_bomber_push_up.png',
  'Double KB Clean and Press|kettlebell': '/exercise-images/kettlebell/double_kb_clean_and_press.png',
  'Bent Press|kettlebell': '/exercise-images/kettlebell/bent_press.png',
  // Batch 13-new15 additions (7 of 15 approved after logo correction; 3
  // still have issues — Broad Jump content regressed, Pike Push-Up logo
  // mirrored, Hand-Release Push-Up logo missing — and 5 exercises weren't
  // resent yet: Flutter Kicks, Man Maker, Curtsy Lunge, Zottman Curl,
  // Devil Press):
  'Good Morning|kettlebell': '/exercise-images/kettlebell/good_morning.png',
  'Single-Arm Row|dumbbell': '/exercise-images/dumbbell/single_arm_row.png',
  'Russian Twist|dumbbell': '/exercise-images/dumbbell/russian_twist.png',
  'Face Pull|dumbbell': '/exercise-images/dumbbell/face_pull.png',
  'Chin-Up|bodyweight': '/exercise-images/bodyweight/chin_up.png',
  'Dip|bodyweight': '/exercise-images/bodyweight/dip.png',
  'Inverted Row|bodyweight': '/exercise-images/bodyweight/inverted_row.png',
  // Batch 13A fixes (2 of 3 now approved — logo issues resolved; Broad
  // Jump still needs another pass, content doesn't show an actual jump
  // with distance yet):
  'Hand-Release Push-Up|bodyweight': '/exercise-images/bodyweight/hand_release_push_up.png',
  'Pike Push-Up|bodyweight': '/exercise-images/bodyweight/pike_push_up.png',
  // Batch 13B additions (final 5 from the original batch 13-new15 list,
  // all verified correct on first delivery):
  'Flutter Kicks|bodyweight': '/exercise-images/bodyweight/flutter_kicks.png',
  'Curtsy Lunge|bodyweight': '/exercise-images/bodyweight/curtsy_lunge__bodyweight.png',
  'Man Maker|dumbbell': '/exercise-images/dumbbell/man_maker.png',
  'Devil Press|dumbbell': '/exercise-images/dumbbell/devil_press.png',
  'Zottman Curl|dumbbell': '/exercise-images/dumbbell/zottman_curl.png',
  // Batch 14 additions (first 10 of 15; 8 fully confirmed, 2 weak but
  // included — Plank Jack and Spiderman Push-Up show the correct base
  // position but not the exercise's defining motion detail clearly):
  'Incline Dumbbell Curl|dumbbell': '/exercise-images/dumbbell/incline_dumbbell_curl.png',
  'Burpee with Push-Up|bodyweight': '/exercise-images/bodyweight/burpee_with_push_up.png',
  'Lunge to Knee Drive|bodyweight': '/exercise-images/bodyweight/lunge_to_knee_drive.png',
  'Pistol Squat|bodyweight': '/exercise-images/bodyweight/pistol_squat.png',
  'Plank Jack|bodyweight': '/exercise-images/bodyweight/plank_jack.png',
  'Reverse Plank|bodyweight': '/exercise-images/bodyweight/reverse_plank.png',
  'Spiderman Push-Up|bodyweight': '/exercise-images/bodyweight/spiderman_push_up.png',
  'Cossack Squat|kettlebell': '/exercise-images/kettlebell/cossack_squat.png',
  'Kettlebell Front Squat|kettlebell': '/exercise-images/kettlebell/kettlebell_front_squat.png',
  'Kettlebell Woodchop|kettlebell': '/exercise-images/kettlebell/kettlebell_woodchop.png',
  // Batch 14B additions (final 5 from the batch 14 list, all verified
  // correct on first delivery):
  'Single-Leg Romanian Deadlift|dumbbell': '/exercise-images/dumbbell/single_leg_romanian_deadlift.png',
  'Suitcase Carry|dumbbell': '/exercise-images/dumbbell/suitcase_carry.png',
  'Box Step-Down|bodyweight': '/exercise-images/bodyweight/box_step_down.png',
  'Reverse Crunch|bodyweight': '/exercise-images/bodyweight/reverse_crunch.png',
  'Toe Touches|bodyweight': '/exercise-images/bodyweight/toe_touches.png',
  // Batch 15 additions (6 of 8 confirmed correct; Skater Hops and Skater
  // Jump both showed a generic running pose instead of the distinctive
  // lateral skating bound — held back pending a correction):
  'Overhead Carry|kettlebell': '/exercise-images/kettlebell/overhead_carry__kettlebell.png',
  'Overhead Carry|dumbbell': '/exercise-images/dumbbell/overhead_carry__dumbbell.png',
  '90/90 Hip Switch|bodyweight': '/exercise-images/bodyweight/90_90_hip_switch.png',
  'Bulgarian Split Squat|bodyweight': '/exercise-images/bodyweight/bulgarian_split_squat__bodyweight.png',
  'Bulgarian Split Squat|dumbbell': '/exercise-images/dumbbell/bulgarian_split_squat__dumbbell.png',
  'Sumo Squat|dumbbell': '/exercise-images/dumbbell/sumo_squat.png',
  // Batch 16 additions (first 10 of 15, all verified content-matched;
  // built from a direct database export, not guessed names, so no
  // mismatches this round):
  'KB Goblet March|kettlebell': '/exercise-images/kettlebell/kb_goblet_march.png',
  'Kettlebell Single-Arm Row|kettlebell': '/exercise-images/kettlebell/kettlebell_single_arm_row.png',
  'One-Arm Row|kettlebell': '/exercise-images/kettlebell/one_arm_row.png',
  'Tall-Kneeling Press|kettlebell': '/exercise-images/kettlebell/tall_kneeling_press.png',
  'March in Place|bodyweight': '/exercise-images/bodyweight/march_in_place.png',
  'Side Steps|bodyweight': '/exercise-images/bodyweight/side_steps.png',
  'Dumbbell Farmer Carry|dumbbell': '/exercise-images/dumbbell/dumbbell_farmer_carry.png',
  'Dumbbell Front Hold|dumbbell': '/exercise-images/dumbbell/dumbbell_front_hold.png',
  'Hip Hinge Drill|dumbbell': '/exercise-images/dumbbell/hip_hinge_drill__dumbbell.png',
  'Squeeze Press|dumbbell': '/exercise-images/dumbbell/squeeze_press.png',
  // Batch 17A additions (10 of 15, all verified content-matched against the
  // database-driven gap list; direct carry-over from Batch 16 plus the next
  // items in the sorted waitlist):
  'Pullover|dumbbell': '/exercise-images/dumbbell/pullover__dumbbell.png',
  'Static Split Squat|bodyweight': '/exercise-images/bodyweight/static_split_squat__bodyweight.png',
  'Double Kettlebell Deadlift|kettlebell': '/exercise-images/kettlebell/double_kettlebell_deadlift.png',
  'Staggered-Stance Deadlift|kettlebell': '/exercise-images/kettlebell/staggered_stance_deadlift.png',
  'Dumbbell Crunch|dumbbell': '/exercise-images/dumbbell/dumbbell_crunch.png',
  'Fast March|bodyweight': '/exercise-images/bodyweight/fast_march.png',
  'Low Step Touch|bodyweight': '/exercise-images/bodyweight/low_step_touch.png',
  'Standing Knee Drives|bodyweight': '/exercise-images/bodyweight/standing_knee_drives.png',
  'Floor Press|kettlebell': '/exercise-images/kettlebell/floor_press__kettlebell.png',
  'Triceps Extension|kettlebell': '/exercise-images/kettlebell/triceps_extension__kettlebell.png',
  // Batch 17B additions (final 5 of 15, completing Batch 17; all verified
  // content-matched — Biceps Curl and Forward Lunge show two kettlebells
  // rather than one, but neither exercise name specifies "Double"/"Single"
  // and the equipment type/color coding is correct, so kept):
  'Biceps Curl|kettlebell': '/exercise-images/kettlebell/biceps_curl__kettlebell.png',
  'Pullover|kettlebell': '/exercise-images/kettlebell/pullover__kettlebell.png',
  'Upright Row|kettlebell': '/exercise-images/kettlebell/upright_row__kettlebell.png',
  'Dumbbell Box Squat|dumbbell': '/exercise-images/dumbbell/dumbbell_box_squat.png',
  'Forward Lunge|kettlebell': '/exercise-images/kettlebell/forward_lunge__kettlebell.png',
  // Batch 18A additions (8 of 10; "Child's Pose + Side Reach" held back —
  // showed a raised-hip all-fours reach rather than sitting back onto the
  // heels with a side reach, and didn't show a side component at all —
  // and "Child's Pose" dropped as an already-covered duplicate (Batch 10).
  // Note: this batch introduced a new circular WODXP badge logo instead of
  // the flat wordmark used in batches 1-17 — approved as the new standard,
  // see updated MASTER_STYLE_PROMPT):
  'Dumbbell Shoulder Press|dumbbell': '/exercise-images/dumbbell/dumbbell_shoulder_press.png',
  'Around the World|kettlebell': '/exercise-images/kettlebell/around_the_world.png',
  'Dead-Stop Swing|kettlebell': '/exercise-images/kettlebell/dead_stop_swing.png',
  'Deep Squat Hold|bodyweight': '/exercise-images/bodyweight/deep_squat_hold.png',
  'Downward Dog|bodyweight': '/exercise-images/bodyweight/downward_dog.png',
  'Downward Dog to Cobra|bodyweight': '/exercise-images/bodyweight/downward_dog_to_cobra.png',
  'Dumbbell Goblet Hold|dumbbell': '/exercise-images/dumbbell/dumbbell_goblet_hold.png',
  'Dumbbell High-Knee March|dumbbell': '/exercise-images/dumbbell/dumbbell_high_knee_march.png',
  // Batch 18B additions (4 of 5; "Fire Hydrant" held back — shows a
  // straight-leg rear kick rather than a bent-knee lift out to the side,
  // so it reads as a donkey kick / kickback rather than a fire hydrant.
  // One-Arm Row is the missing dumbbell variant (kettlebell variant already
  // covered since Batch 16), tagged __dumbbell to disambiguate. Logo in
  // this batch is inconsistent (missing or a generic mark, not the new
  // circular WODXP badge) — accepted for now per instruction, should be
  // correct in the next batch per the updated MASTER_STYLE_PROMPT):
  'One-Arm Row|dumbbell': '/exercise-images/dumbbell/one_arm_row__dumbbell.png',
  'Dumbbell Hip Thrust|dumbbell': '/exercise-images/dumbbell/dumbbell_hip_thrust.png',
  'Farmer Carry March|dumbbell': '/exercise-images/dumbbell/farmer_carry_march.png',
  'Front Raise|dumbbell': '/exercise-images/dumbbell/front_raise.png',
  // Batch 19A additions (10 of 15, all verified content-matched; new
  // circular WODXP badge logo now correctly and consistently applied.
  // Forward Lunge tagged __bodyweight since dumbbell/kettlebell variants
  // already exist):
  'Fast Feet|bodyweight': '/exercise-images/bodyweight/fast_feet.png',
  'Fast Goblet Squats|dumbbell': '/exercise-images/dumbbell/fast_goblet_squats.png',
  'Figure Four Stretch|bodyweight': '/exercise-images/bodyweight/figure_four_stretch.png',
  'Forward Lunge|bodyweight': '/exercise-images/bodyweight/forward_lunge__bodyweight.png',
  'Goblet Reverse Lunge|kettlebell': '/exercise-images/kettlebell/goblet_reverse_lunge.png',
  'Goblet Squat Pry|kettlebell': '/exercise-images/kettlebell/goblet_squat_pry.png',
  'Half-Kneeling Halo|kettlebell': '/exercise-images/kettlebell/half_kneeling_halo.png',
  'Half-Kneeling Overhead Reach|dumbbell': '/exercise-images/dumbbell/half_kneeling_overhead_reach.png',
  'Halo|kettlebell': '/exercise-images/kettlebell/halo.png',
  'Heel Touches|bodyweight': '/exercise-images/bodyweight/heel_touches.png',
  // Batch 19B additions (5 of 5, completing Batch 19; all verified
  // content-matched, new circular WODXP badge logo consistent throughout.
  // Hip Thrust tagged __kettlebell since the bodyweight variant already
  // exists):
  'High Plank|bodyweight': '/exercise-images/bodyweight/high_plank.png',
  'Hip Thrust|kettlebell': '/exercise-images/kettlebell/hip_thrust__kettlebell.png',
  'KB Front Hold|kettlebell': '/exercise-images/kettlebell/kb_front_hold.png',
  'KB Glute Bridge Hold|kettlebell': '/exercise-images/kettlebell/kb_glute_bridge_hold.png',
  'Knee Side Plank|bodyweight': '/exercise-images/bodyweight/knee_side_plank.png',
  // Batch 20 additions (10 of 10, all verified content-matched, logo
  // consistent. Reverse Lunge tagged __dumbbell/__kettlebell since the
  // bodyweight variant already exists; Romanian Deadlift tagged __dumbbell
  // since the kettlebell variant already exists):
  'Lateral Lunge Stretch|dumbbell': '/exercise-images/dumbbell/lateral_lunge_stretch.png',
  'Lateral Shuffle|bodyweight': '/exercise-images/bodyweight/lateral_shuffle.png',
  'Lunge with Side Reach|bodyweight': '/exercise-images/bodyweight/lunge_with_side_reach.png',
  'Open Book Rotation|bodyweight': '/exercise-images/bodyweight/open_book_rotation.png',
  'Reverse Lunge|dumbbell': '/exercise-images/dumbbell/reverse_lunge__dumbbell.png',
  'Reverse Lunge|kettlebell': '/exercise-images/kettlebell/reverse_lunge__kettlebell.png',
  'Romanian Deadlift|dumbbell': '/exercise-images/dumbbell/romanian_deadlift__dumbbell.png',
  'Romanian Deadlift Stretch|dumbbell': '/exercise-images/dumbbell/romanian_deadlift_stretch.png',
  'Russian Swing|kettlebell': '/exercise-images/kettlebell/russian_swing.png',
  'Scorpion|bodyweight': '/exercise-images/bodyweight/scorpion.png',
  // Batch 21 additions (10 of 10, all verified content-matched, single
  // athlete per image, logo consistent. Filenames follow manifest.csv:
  // Static Split Squat, Step-Up, Suitcase Carry and Suitcase Deadlift are
  // tagged with a double-underscore equipment suffix because other
  // equipment variants exist):
  'Single-Leg Calf Raise|bodyweight': '/exercise-images/bodyweight/single_leg_calf_raise.png',
  'Skater Steps|bodyweight': '/exercise-images/bodyweight/skater_steps.png',
  'Squat + Knee Drive|bodyweight': '/exercise-images/bodyweight/squat_knee_drive.png',
  'Squat to Press|dumbbell': '/exercise-images/dumbbell/squat_to_press.png',
  'Static Split Squat|dumbbell': '/exercise-images/dumbbell/static_split_squat__dumbbell.png',
  'Static Split Squat|kettlebell': '/exercise-images/kettlebell/static_split_squat__kettlebell.png',
  'Step-Up|kettlebell': '/exercise-images/kettlebell/step_up__kettlebell.png',
  'Suitcase Carry|kettlebell': '/exercise-images/kettlebell/suitcase_carry__kettlebell.png',
  'Suitcase Deadlift|dumbbell': '/exercise-images/dumbbell/suitcase_deadlift__dumbbell.png',
  'Suitcase Deadlift|kettlebell': '/exercise-images/kettlebell/suitcase_deadlift__kettlebell.png',
  // Batch 22 additions (10 of 10, all verified content-matched, single
  // athlete per image. Wall Shoulder Reach is shown from behind, so the chest
  // logo is not visible. Filenames follow manifest.csv; Turkish Get-Up to
  // Elbow carries a double-underscore kettlebell suffix because a dumbbell
  // variant exists in the manifest):
  'Thread the Needle|bodyweight': '/exercise-images/bodyweight/thread_the_needle.png',
  'Wall Sit|bodyweight': '/exercise-images/bodyweight/wall_sit.png',
  'Wall Shoulder Reach|bodyweight': '/exercise-images/bodyweight/wall_shoulder_reach.png',
  'Squat to Reach|bodyweight': '/exercise-images/bodyweight/squat_to_reach.png',
  'Hip Circles|bodyweight': '/exercise-images/bodyweight/hip_circles.png',
  'Weighted Deep Squat Pry|dumbbell': '/exercise-images/dumbbell/weighted_deep_squat_pry.png',
  'Dumbbell Goblet Reverse Lunge|dumbbell': '/exercise-images/dumbbell/dumbbell_goblet_reverse_lunge.png',
  'Weighted Sit-Up|dumbbell': '/exercise-images/dumbbell/weighted_sit_up.png',
  'Turkish Get-Up to Elbow|kettlebell': '/exercise-images/kettlebell/turkish_get_up_to_elbow__kettlebell.png',
  'KB Seated Press|kettlebell': '/exercise-images/kettlebell/kb_seated_press.png',
  // Batch 23 additions (10 of 10, all verified content-matched, single
  // athlete per image, logo consistent. KB Tall-Kneeling Hold shows the same
  // pose twice since it is a static hold. Filenames follow manifest.csv):
  'Dumbbell Goblet Forward Lunge|dumbbell': '/exercise-images/dumbbell/dumbbell_goblet_forward_lunge.png',
  'Dumbbell Overhead Hold|dumbbell': '/exercise-images/dumbbell/dumbbell_overhead_hold.png',
  'Dumbbell Goblet March|dumbbell': '/exercise-images/dumbbell/dumbbell_goblet_march.png',
  'Fast Side Steps|bodyweight': '/exercise-images/bodyweight/fast_side_steps.png',
  'High Knee March|bodyweight': '/exercise-images/bodyweight/high_knee_march.png',
  'KB Bent-Over Row|kettlebell': '/exercise-images/kettlebell/kb_bent_over_row.png',
  'KB Deadlift to Goblet Hold|kettlebell': '/exercise-images/kettlebell/kb_deadlift_to_goblet_hold.png',
  'KB Goblet Forward Lunge|kettlebell': '/exercise-images/kettlebell/kb_goblet_forward_lunge.png',
  'KB Tall-Kneeling Hold|kettlebell': '/exercise-images/kettlebell/kb_tall_kneeling_hold.png',
  'KB Seated Halo|kettlebell': '/exercise-images/kettlebell/kb_seated_halo.png',
  // Batch 24 additions (13 verified content-matched, single athlete per image,
  // circular logo. Broad Jump, Skater Jump and Skater Hops still missing.
  // Filenames follow manifest.csv):
  'Dumbbell Split Squat|dumbbell': '/exercise-images/dumbbell/dumbbell_split_squat.png',
  'Dumbbell Front Rack Hold|dumbbell': '/exercise-images/dumbbell/dumbbell_front_rack_hold.png',
  'Clean & Jerk|dumbbell': '/exercise-images/dumbbell/clean_and_jerk__dumbbell.png',
  'Cossack Squat|bodyweight': '/exercise-images/bodyweight/cossack_squat__bodyweight.png',
  'Deep Squat + Rotation|bodyweight': '/exercise-images/bodyweight/deep_squat_rotation.png',
  'KB Front Rack Hold|kettlebell': '/exercise-images/kettlebell/kb_front_rack_hold.png',
  'KB Goblet Split Squat|kettlebell': '/exercise-images/kettlebell/kb_goblet_split_squat.png',
  'KB Goblet Lateral Lunge|kettlebell': '/exercise-images/kettlebell/kb_goblet_lateral_lunge.png',
  'KB Deadlift March|kettlebell': '/exercise-images/kettlebell/kb_deadlift_march.png',
  'Fire Hydrant|bodyweight': '/exercise-images/bodyweight/fire_hydrant.png',
  'Bottom-Up Press|kettlebell': '/exercise-images/kettlebell/bottom_up_press.png',
  'Double KB Floor Press|kettlebell': '/exercise-images/kettlebell/double_kb_floor_press.png',
  'Double KB Clean and Jerk|kettlebell': '/exercise-images/kettlebell/double_kb_clean_and_jerk.png',
  // Batch 24b: Skater Jump and Skater Hops added (lateral bound with double arrow).
  // Push-Up and Bodyweight Squat keep their entries, the image files are replaced.
  'Skater Jump|bodyweight': '/exercise-images/bodyweight/skater_jump.png',
  'Skater Hops|bodyweight': '/exercise-images/bodyweight/skater_hops.png',
  // Batch 25: Sit-Up, Double Under, Jumping Jacks and Goblet Box Squat keep their
  // entries (image files replaced). New entries below. Curtsy Lunge dumbbell and
  // Crab Walk rejected, still missing.
  'Alternating Clean|kettlebell': '/exercise-images/kettlebell/alternating_clean.png',
  'Bent-Over Double Row|kettlebell': '/exercise-images/kettlebell/bent_over_double_row.png',
  'Bottom-Up Hold|kettlebell': '/exercise-images/kettlebell/bottom_up_hold.png',
  'Burpee without Push-Up|bodyweight': '/exercise-images/bodyweight/burpee_without_push_up.png',
  // Batch 26 additions (8 verified content-matched, single athlete per image,
  // circular logo. Dumbbell Swing (orange kettlebell shown) and Curtsy Lunge
  // dumbbell (reads as reverse lunge) rejected, still missing):
  'Crab Walk|bodyweight': '/exercise-images/bodyweight/crab_walk.png',
  'Deadlift + High Pull|dumbbell': '/exercise-images/dumbbell/deadlift_high_pull.png',
  'Fast Bodyweight Squats|bodyweight': '/exercise-images/bodyweight/fast_bodyweight_squats.png',
  'Double Kettlebell RDL|kettlebell': '/exercise-images/kettlebell/double_kettlebell_rdl.png',
  'Double Kettlebell Squat|kettlebell': '/exercise-images/kettlebell/double_kettlebell_squat.png',
  'Arm Bar|kettlebell': '/exercise-images/kettlebell/arm_bar.png',
  'Dumbbell Skater Lunge|dumbbell': '/exercise-images/dumbbell/dumbbell_skater_lunge.png',
  'Clean + Squat|kettlebell': '/exercise-images/kettlebell/clean_squat.png',
  // Batch 26b: Dumbbell Swing redone (single dumbbell). Curtsy Lunge dumbbell still missing.
  'Dumbbell Swing|dumbbell': '/exercise-images/dumbbell/dumbbell_swing.png',
  // Batch 28 additions (9 verified content-matched, single athlete per image,
  // circular logo. Fast Alternating Lunges rejected, both poses identical):
  'Crab Bridge|bodyweight': '/exercise-images/bodyweight/crab_bridge.png',
  'Crab Reach|bodyweight': '/exercise-images/bodyweight/crab_reach.png',
  'Frogger|bodyweight': '/exercise-images/bodyweight/frogger.png',
  'Front-Rack Squat|kettlebell': '/exercise-images/kettlebell/front_rack_squat.png',
  'Gorilla Row|kettlebell': '/exercise-images/kettlebell/gorilla_row.png',
  'Half-Kneeling Press|kettlebell': '/exercise-images/kettlebell/half_kneeling_press__kettlebell.png',
  'Hand-to-Hand Swing|kettlebell': '/exercise-images/kettlebell/hand_to_hand_swing.png',
  'Front-Foot Elevated Split Squat|dumbbell': '/exercise-images/dumbbell/front_foot_elevated_split_squat.png',
  'Goblet Squat + Rotation|dumbbell': '/exercise-images/dumbbell/goblet_squat_rotation__dumbbell.png',
  // Batch 27 addition (edited: right figure mirrored so the lead leg alternates)
  'Fast Alternating Lunges|bodyweight': '/exercise-images/bodyweight/fast_alternating_lunges.png',
  // Batch 29 additions (17 new keys from 22 verified content-matched, single athlete, circular logo).
  // Replacements of existing images keep their filenames and need no new keys.
  'Figure 8|kettlebell': '/exercise-images/kettlebell/figure_8.png',
  'Front-Rack Carry|kettlebell': '/exercise-images/kettlebell/front_rack_carry__kettlebell.png',
  'Front-Rack Carry|dumbbell': '/exercise-images/dumbbell/front_rack_carry__dumbbell.png',
  'Front-Rack Reverse Lunge|kettlebell': '/exercise-images/kettlebell/front_rack_reverse_lunge.png',
  'Front-Rack Step-Up|kettlebell': '/exercise-images/kettlebell/front_rack_step_up.png',
  'Half-Kneeling Press|dumbbell': '/exercise-images/dumbbell/half_kneeling_press__dumbbell.png',
  'Half-Kneeling Windmill|dumbbell': '/exercise-images/dumbbell/half_kneeling_windmill.png',
  'Hamstring Walkout|bodyweight': '/exercise-images/bodyweight/hamstring_walkout.png',
  'Heel-Elevated Goblet Squat|dumbbell': '/exercise-images/dumbbell/heel_elevated_goblet_squat.png',
  'Worlds Greatest Stretch|bodyweight': '/exercise-images/bodyweight/worlds_greatest_stretch.png',
  'Dumbbell Arm Bar|dumbbell': '/exercise-images/dumbbell/dumbbell_arm_bar.png',
  'Goblet Squat + Rotation|kettlebell': '/exercise-images/kettlebell/goblet_squat_rotation__kettlebell.png',
  'Inchworm to Cobra|bodyweight': '/exercise-images/bodyweight/inchworm_to_cobra.png',
  'KB Box Squat|kettlebell': '/exercise-images/kettlebell/kb_box_squat.png',
  'Lateral Lunge|bodyweight': '/exercise-images/bodyweight/lateral_lunge__bodyweight.png',
  'Lateral Lunge|kettlebell': '/exercise-images/kettlebell/lateral_lunge__kettlebell.png',
  'One-Arm Floor Press|kettlebell': '/exercise-images/kettlebell/one_arm_floor_press.png',
  // Batch 34 additions (10 verified content-matched, single athlete, circular logo).
  'Single-Leg Deadlift|kettlebell': '/exercise-images/kettlebell/single_leg_deadlift.png',
  'Single-Leg Glute Bridge|bodyweight': '/exercise-images/bodyweight/single_leg_glute_bridge.png',
  'Single-Leg Hip Thrust|dumbbell': '/exercise-images/dumbbell/single_leg_hip_thrust.png',
  'Single-Leg Squat to Chair|bodyweight': '/exercise-images/bodyweight/single_leg_squat_to_chair.png',
  'Spider Curl|dumbbell': '/exercise-images/dumbbell/spider_curl.png',
  'Sprawl|bodyweight': '/exercise-images/bodyweight/sprawl.png',
  'Squat + Alternating Punch|dumbbell': '/exercise-images/dumbbell/squat_alternating_punch.png',
  'Step-Up + Knee Drive|dumbbell': '/exercise-images/dumbbell/step_up_knee_drive.png',
  'Strict Press|kettlebell': '/exercise-images/kettlebell/strict_press.png',
  'Swing + Goblet Squat|kettlebell': '/exercise-images/kettlebell/swing_goblet_squat.png',
  // Batch 35 additions (10 verified content-matched, single athlete, circular logo).
  'Swing + High Pull|kettlebell': '/exercise-images/kettlebell/swing_high_pull.png',
  'Reverse Lunge + Press|dumbbell': '/exercise-images/dumbbell/reverse_lunge_press.png',
  'Shin Box Get-Up|bodyweight': '/exercise-images/bodyweight/shin_box_get_up.png',
  'Turkish Get-Up to Elbow|dumbbell': '/exercise-images/dumbbell/turkish_get_up_to_elbow__dumbbell.png',
  'Turkish Get-Up to Half-Kneeling|kettlebell': '/exercise-images/kettlebell/turkish_get_up_to_half_kneeling.png',
  'Burpee Step-Back|bodyweight': '/exercise-images/bodyweight/burpee_step_back.png',
  'Dumbbell Deadlift to Shrug|dumbbell': '/exercise-images/dumbbell/dumbbell_deadlift_to_shrug.png',
  'Dumbbell Squat|dumbbell': '/exercise-images/dumbbell/dumbbell_squat.png',
  'KB Deadlift High Pull|kettlebell': '/exercise-images/kettlebell/kb_deadlift_high_pull.png',
  'KB Goblet Step-Up|kettlebell': '/exercise-images/kettlebell/kb_goblet_step_up.png',
  // Batch 37 additions (7 verified content-matched, single athlete, circular logo).
  'KB Overhead Hold|kettlebell': '/exercise-images/kettlebell/kb_overhead_hold.png',
  'Cossack Shift|bodyweight': '/exercise-images/bodyweight/cossack_shift.png',
  'Dumbbell Front Squat|dumbbell': '/exercise-images/dumbbell/dumbbell_front_squat.png',
  'Dumbbell Incline Press|dumbbell': '/exercise-images/dumbbell/dumbbell_incline_press.png',
  'KB Goblet Walking Lunge|kettlebell': '/exercise-images/kettlebell/kb_goblet_walking_lunge.png',
  'KB Single-Arm Deadlift|kettlebell': '/exercise-images/kettlebell/kb_single_arm_deadlift.png',
  'Jumping Jack to Squat|bodyweight': '/exercise-images/bodyweight/jumping_jack_to_squat.png',
  // Batch 38 additions (reworked lying single-arm presses from batch 37).
  'KB Floor Press Bridge|kettlebell': '/exercise-images/kettlebell/kb_floor_press_bridge.png',
  'Dumbbell Single-Arm Floor Press|dumbbell': '/exercise-images/dumbbell/dumbbell_single_arm_floor_press.png',
  // Batch 41 additions (8 verified: single athlete, correct equipment, readable logo).
  'Walking Lunge|dumbbell': '/exercise-images/dumbbell/walking_lunge__dumbbell.png',
  'Walking Lunge|kettlebell': '/exercise-images/kettlebell/walking_lunge__kettlebell.png',
  'Walking Lunge + Curl|dumbbell': '/exercise-images/dumbbell/walking_lunge_curl.png',
  'Curtsy Lunge|dumbbell': '/exercise-images/dumbbell/curtsy_lunge__dumbbell.png',
  'Dumbbell Front Rack March|dumbbell': '/exercise-images/dumbbell/dumbbell_front_rack_march.png',
  'KB Front Rack March|kettlebell': '/exercise-images/kettlebell/kb_front_rack_march.png',
  'KB Standing Side Bend|kettlebell': '/exercise-images/kettlebell/kb_standing_side_bend.png',
  'One-Arm Shoulder Press|dumbbell': '/exercise-images/dumbbell/one_arm_shoulder_press.png',
  // Batch 42 additions (7 verified: single athlete, correct equipment, readable logo).
  'Plank Dumbbell Drag|dumbbell': '/exercise-images/dumbbell/plank_dumbbell_drag.png',
  'Plank Kettlebell Drag|kettlebell': '/exercise-images/kettlebell/plank_kettlebell_drag.png',
  'Shoulder-Tap Push-Up|bodyweight': '/exercise-images/bodyweight/shoulder_tap_push_up.png',
  'Turkish Get-Up to Hand|kettlebell': '/exercise-images/kettlebell/turkish_get_up_to_hand__kettlebell.png',
  "Waiter's Carry|kettlebell": '/exercise-images/kettlebell/waiters_carry.png',
  'Broad Jump|bodyweight': '/exercise-images/bodyweight/broad_jump.png',
  'Wide Push-Up|bodyweight': '/exercise-images/bodyweight/wide_push_up.png',
  // Name-variant aliases (same image as the canonical key; names differ in the exercises table).
  'Mountain Climbers|bodyweight': '/exercise-images/bodyweight/mountain_climber.png',
  'Standing Mountain Climbers|bodyweight': '/exercise-images/bodyweight/standing_mountain_climber.png',
  'Burpees|bodyweight': '/exercise-images/bodyweight/burpee.png',
  '90/90 Hip Switches|bodyweight': '/exercise-images/bodyweight/90_90_hip_switch.png',
  'Farmers Carry|dumbbell': '/exercise-images/dumbbell/dumbbell_farmer_carry.png',
  "Farmer's Carry|dumbbell": '/exercise-images/dumbbell/dumbbell_farmer_carry.png',
};

/** The three fixed equipment-type logos — NOT exercise-specific, just one
 *  of three icons chosen by which equipment the exercise uses. */
const EQUIPMENT_ICON_IMAGES: Record<'kettlebell' | 'dumbbell' | 'bodyweight', string> = {
  kettlebell: '/equipment-icons/kettlebell.png',
  dumbbell: '/equipment-icons/dumbbell.png',
  bodyweight: '/equipment-icons/bodyweight.png',
};

/** Renders the real illustrated image for an exercise when one exists in the
 *  production batch, falling back to the programmatic pose SVG otherwise. */
function ExerciseVisual({ exercise, size = 90 }: { exercise: Exercise; size?: number }) {
  const equipment = pickPrimaryEquipment(exercise.equipment);
  const imageSrc = EXERCISE_ILLUSTRATION_IMAGES[`${exercise.name}|${equipment}`];
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={exercise.name}
        className="w-full max-w-xs rounded-2xl"
        style={{ boxShadow: `0 0 24px ${EQUIPMENT_COLORS[equipment]}33` }}
      />
    );
  }
  return <ExerciseIllustration category={exercise.category} equipment={equipment} name={exercise.name} size={size} />;
}

/** Renders the exercise's equipment-type icon (kettlebell/dumbbell/
 *  bodyweight) — NOT a per-exercise illustration, just one of three fixed
 *  logos, shown next to each exercise in a generated workout. */
function ExerciseIcon({ exercise, size = 40 }: { exercise: Exercise; size?: number }) {
  const equipment = pickPrimaryEquipment(exercise.equipment);
  return (
    <img
      src={EQUIPMENT_ICON_IMAGES[equipment]}
      alt={equipment}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}

function AttributeRing({ label, level, xp, color }: { label: string; level: number; xp: number; color: string }) {
  const { progress } = progressToNext(xp, level);
  const size = 88; const stroke = 6;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size, filter: `drop-shadow(0 0 6px ${color}66)` }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={C.raised} strokeWidth={stroke} />
          <motion.circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeLinecap="round"
            initial={false}
            animate={{ strokeDashoffset: circ * (1 - progress) }}
            transition={{ duration: 0.6, ease: 'easeOut' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <NumberRoll value={level} className="text-2xl font-bold" style={{ color: C.text, ...MO }} />
          <span className="text-[9px] uppercase tracking-wider" style={{ color: C.muted, ...MO }}>LV</span>
        </div>
      </div>
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: C.muted, ...SG }}>{label}</span>
    </div>
  );
}

function Stepper({ label, value, onChange, step = 1, unit, min = 0 }: { label: string; value: number; onChange: (v: number) => void; step?: number; unit?: string; min?: number }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <span className="truncate text-[10px] font-medium uppercase tracking-wider" style={{ color: C.muted, ...SG }}>{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(min, value - step))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: C.border, color: C.text }}><Minus size={12} /></button>
        <div className="flex flex-col items-center" style={{ minWidth: 26 }}>
          <span className="text-lg font-bold leading-none" style={{ color: C.text, ...MO }}>{value}</span>
          {unit && <span className="mt-0.5 text-[9px] leading-none" style={{ color: C.muted, ...MO }}>{unit}</span>}
        </div>
        <button onClick={() => onChange(value + step)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: C.border, color: C.text }}><Plus size={12} /></button>
      </div>
    </div>
  );
}

// ─── Screens ─────────────────────────────────────────────────────────────────

function HomeScreen({ user, stats, onGenerate, onChallenge, onBoss, levelChallenges, bossBattles, unlockedCount, totalCount }: {
  user: User; stats: UserStats; onGenerate: () => void; onChallenge: () => void; onBoss: () => void;
  levelChallenges: LevelChallenge[]; bossBattles: BossBattle[]; unlockedCount: number; totalCount: number;
}) {
  const progress = getLevelProgress(stats, levelChallenges, bossBattles);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: C.bg }}>
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <div>
          <p className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>Welcome back</p>
          <h1 className="text-xl font-bold" style={SG}>{user.username}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.xp }}>Quest Lv</span>
            <span className="text-sm font-semibold" style={MO}>{stats.level}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <Flame size={16} color="#FF9D4D" fill="#FF9D4D" style={{ filter: 'drop-shadow(0 0 4px #FF9D4D)' }} />
            <span className="text-sm font-semibold" style={MO}>{stats.current_streak}</span>
          </div>
        </div>
      </header>

      <section className="px-5 pt-4">
        <div className="flex items-center justify-around rounded-2xl border px-4 py-5" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <AttributeRing label="Strength" level={stats.level_strength} xp={stats.xp_strength} color={C.strength} />
          <AttributeRing label="Mobility" level={stats.level_mobility} xp={stats.xp_mobility} color={C.mobility} />
          <AttributeRing label="Conditioning" level={stats.level_conditioning} xp={stats.xp_conditioning} color={C.conditioning} />
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs" style={{ color: C.muted }}>
          <Sparkles size={12} style={{ color: C.mobility }} />
          <span style={MO}>{unlockedCount}</span> of <span style={MO}>{totalCount}</span> movements unlocked
        </div>
      </section>

      <section className="px-5 pt-5">
        <LedBorderButton onClick={onGenerate} className="flex w-full items-center justify-between rounded-2xl px-5 py-4"
          style={{ backgroundColor: C.xp, color: '#04140A', boxShadow: `0 0 20px ${C.xp}55` }} radius={16}>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider opacity-70">Ready to train?</p>
            <p className="text-lg font-bold" style={SG}>Generate Workout</p>
          </div>
          <ChevronRight size={22} strokeWidth={2.5} />
        </LedBorderButton>
      </section>

      <section className="px-5 pt-4">
        {progress.isComplete ? (
          <div className="rounded-2xl border px-4 py-3.5 text-center" style={{ borderColor: C.xp, backgroundColor: `${C.xp}15` }}>
            <p className="text-sm font-bold" style={{ color: C.xp, ...SG }}>🏆 WODXP Legend — Level 50 Complete!</p>
          </div>
        ) : !progress.isUnlocked ? (
          <div className="rounded-2xl border px-4 py-3.5" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: C.muted }}>
              {progress.isBossPending ? `🔒 Boss Locked — Level ${progress.pendingLevel}` : `Next: Level ${progress.pendingLevel} Challenge`}
            </p>
            <p className="mt-1 text-sm" style={{ color: C.text }}>Keep training to unlock it.</p>
          </div>
        ) : progress.isBossPending && progress.boss ? (
          <button onClick={onBoss} className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left" style={{ borderColor: `${C.boss}55`, backgroundColor: `${C.boss}0F` }}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${C.boss}22` }}>
              <Swords size={22} color={C.boss} style={{ filter: `drop-shadow(0 0 5px ${C.boss})` }} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: C.boss }}>Boss Battle — {progress.boss.name}</p>
              <p className="text-sm" style={{ color: C.text }}>Defeat this to unlock Level {progress.pendingLevel}</p>
              {progress.isXpFrozen && <p className="mt-0.5 text-[11px]" style={{ color: C.boss }}>⏸ XP is paused until you defeat this boss</p>}
            </div>
            <ChevronRight size={18} style={{ color: C.muted }} />
          </button>
        ) : progress.challenge ? (
          <button onClick={onChallenge} className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left" style={{ borderColor: `${C.xp}55`, backgroundColor: `${C.xp}0F` }}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${C.xp}22` }}>
              <Trophy size={22} color={C.xp} style={{ filter: `drop-shadow(0 0 5px ${C.xp})` }} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: C.xp }}>Level Challenge — {progress.challenge.name}</p>
              <p className="text-sm" style={{ color: C.text }}>Complete this to unlock Level {progress.pendingLevel}</p>
            </div>
            <ChevronRight size={18} style={{ color: C.muted }} />
          </button>
        ) : null}
      </section>

      <section className="px-5 pt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={SG}>Your Progress</h2>
        <div className="rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: C.muted }}>Total XP</span>
            <span className="font-bold" style={{ color: C.xp, ...MO }}>{stats.xp_total.toLocaleString()}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm" style={{ color: C.muted }}>Longest streak</span>
            <span className="font-bold" style={{ color: C.text, ...MO }}>{stats.longest_streak} days</span>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Picks a varied set of exercises for a generated workout, cycling through
 * distinct categories (squat, push, pull, hinge, carry, core, mobility,
 * conditioning) before ever repeating one — so a generated session doesn't
 * end up as e.g. three squat variants back to back just because they all
 * matched the equipment filter.
 */
function pickVariedExercises(pool: Exercise[], count: number): Exercise[] {
  if (pool.length <= count) return [...pool].sort(() => Math.random() - 0.5);

  const byCategory = new Map<string, Exercise[]>();
  for (const ex of pool) {
    if (!byCategory.has(ex.category)) byCategory.set(ex.category, []);
    byCategory.get(ex.category)!.push(ex);
  }
  // Shuffle within each category so repeated generations still vary
  for (const group of byCategory.values()) {
    group.sort(() => Math.random() - 0.5);
  }

  // Shuffle the category order itself each time too
  const categories = [...byCategory.keys()].sort(() => Math.random() - 0.5);

  const selected: Exercise[] = [];
  const usedIds = new Set<string>();
  let round = 0;

  // Round-robin across categories: take one from each category per round
  // before allowing any category to contribute a second exercise.
  while (selected.length < count && round < 10) {
    let addedThisRound = false;
    for (const cat of categories) {
      if (selected.length >= count) break;
      const group = byCategory.get(cat)!;
      const next = group[round];
      if (next && !usedIds.has(next.id)) {
        selected.push(next);
        usedIds.add(next.id);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break; // pool exhausted
    round++;
  }

  return selected;
}

/** Finds the full Exercise record matching a boss/challenge's exercise_name,
 *  so its illustration + step-by-step instructions can be shown on demand. */
function findExerciseByName(exercises: Exercise[], name: string | null | undefined): Exercise | null {
  if (!name) return null;
  return exercises.find((e) => e.name === name) ?? null;
}

function LevelChallengeScreen({ challenge, exercises, userId, onBack, onComplete, onFail }: {
  challenge: LevelChallenge; exercises: Exercise[]; userId: string; onBack: () => void;
  onComplete: (xpReward: number) => void; onFail: () => void;
}) {
  const [usedScaled, setUsedScaled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewing, setViewing] = useState<Exercise | null>(null);

  // Countdown timer: used for timed holds (target_duration_seconds, e.g. a
  // Plank) or as a "finish within" reference clock (time_cap_seconds) for
  // rep-based or combo challenges.
  const countdownFrom = challenge.target_duration_seconds ?? challenge.time_cap_seconds ?? null;
  const [timeLeft, setTimeLeft] = useState(countdownFrom ?? 0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  useWakeLock(timerRunning);

  React.useEffect(() => {
    if (!timerRunning || timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [timerRunning, timeLeft]);

  const isCombo = challenge.structure != null && challenge.structure.length > 0;
  const linkedExercise = !isCombo ? findExerciseByName(exercises, challenge.exercise_name) : null;

  const handlePass = async () => {
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('clear_level_challenge', {
      p_user_id: userId, p_level: challenge.level, p_used_scaled: usedScaled,
    });
    setSubmitting(false);
    if (!error) onComplete(challenge.xp_reward);
  };

  return (
    <div className="flex min-h-screen flex-col px-5 pb-8 pt-6" style={{ backgroundColor: C.bg }}>
      <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
        <ArrowLeft size={16} style={{ color: C.text }} />
      </button>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${C.xp}1A`, border: `2px solid ${C.xp}` }}>
          <Trophy size={28} style={{ color: C.xp }} />
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider" style={{ color: C.xp }}>Level {challenge.level} Challenge</p>
        <h1 className="mt-1 text-2xl font-bold" style={SG}>{challenge.name}</h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed" style={{ color: C.text }}>{challenge.description}</p>

        {isCombo && (
          <div className="mt-4 w-full max-w-sm rounded-2xl border p-4 text-left" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <ul className="flex flex-col gap-1.5">
              {challenge.structure!.map((ex, i) => {
                const linked = findExerciseByName(exercises, ex.exercise_name);
                return (
                  <li key={i}>
                    <button onClick={() => linked && setViewing(linked)} disabled={!linked}
                      className="flex w-full items-center justify-between text-left text-sm" style={{ color: C.text }}>
                      <span>{formatBossExercise(ex)}</span>
                      {linked && <ChevronRight size={14} style={{ color: C.mobility }} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {linkedExercise && (
          <button onClick={() => setViewing(linkedExercise)} className="mt-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.mobility }}>
            <ChevronRight size={14} /> How do I do this?
          </button>
        )}

        {countdownFrom != null && (
          <div className="mt-6 flex flex-col items-center">
            <p className="text-5xl font-bold" style={{ color: timeLeft === 0 && timerStarted ? C.boss : C.text, ...MO }}>{formatTimer(timeLeft)}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>
              {challenge.target_duration_seconds != null ? 'Hold time' : 'Time cap'}
            </p>
            {!timerStarted ? (
              <button onClick={() => { setTimerStarted(true); setTimerRunning(true); }}
                className="mt-3 rounded-full px-6 py-2 text-sm font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>
                Start Exercise
              </button>
            ) : (
              <button onClick={() => setTimerRunning((r) => !r)} className="mt-3 rounded-full border px-6 py-2 text-sm font-bold" style={{ borderColor: C.border, color: C.text, ...SG }}>
                {timerRunning ? 'Pause' : 'Resume'}
              </button>
            )}
          </div>
        )}

        {challenge.scaled_description && (
          <label className="mt-6 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.border, backgroundColor: C.surface, color: C.text }}>
            <input type="checkbox" checked={usedScaled} onChange={(e) => setUsedScaled(e.target.checked)} className="h-4 w-4 rounded" style={{ accentColor: C.xp }} />
            Use scaled version: {challenge.scaled_description}
          </label>
        )}

        <p className="mt-4 text-xs" style={{ color: C.muted }}>Reward: <span style={{ color: C.xp, ...MO }}>+{challenge.xp_reward} XP</span></p>
      </div>

      <div className="flex flex-col gap-2">
        <LedBorderButton onClick={handlePass} disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold disabled:opacity-60"
          style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>
          {submitting ? 'Saving…' : 'Pass'}
        </LedBorderButton>
        <button onClick={onFail} disabled={submitting} className="w-full rounded-2xl border py-3 text-sm font-bold disabled:opacity-60" style={{ borderColor: C.border, color: C.muted, ...SG }}>
          Fail — Try Again Later
        </button>
      </div>
      {viewing && <ExerciseDetailModal exercise={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Formats one line of a combo/boss structure, whichever unit it uses. */
function formatBossExercise(ex: BossExercise): string {
  if (ex.reps != null) return `${ex.reps} ${ex.exercise_name}`;
  if (ex.duration_seconds != null) return `${ex.duration_seconds} sec ${ex.exercise_name}`;
  return ex.exercise_name;
}

function BossBattleScreen({ boss, exercises, userId, onBack, onComplete }: {
  boss: BossBattle; exercises: Exercise[]; userId: string; onBack: () => void; onComplete: (result: { passed: boolean; medal: string | null; xpReward: number }) => void;
}) {
  const [phase, setPhase] = useState<'ready' | 'active' | 'submitting'>('ready');
  const [usedScaled, setUsedScaled] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [roundsDone, setRoundsDone] = useState(0);
  const [viewing, setViewing] = useState<Exercise | null>(null);
  useWakeLock(running);

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const structure = usedScaled && boss.scaled_structure ? boss.scaled_structure : boss.structure;

  const submitAttempt = async (passed: boolean) => {
    setRunning(false);
    setPhase('submitting');
    const supabase = createClient();
    const { data: medal } = await supabase.rpc('attempt_boss_battle', {
      p_user_id: userId, p_level: boss.level, p_passed: passed,
      p_duration_seconds: passed ? elapsed : null, p_used_scaled: usedScaled,
    });
    onComplete({ passed, medal: medal ?? null, xpReward: passed ? boss.xp_reward : 0 });
  };

  if (phase === 'ready') {
    return (
      <div className="flex min-h-screen flex-col px-5 pb-8 pt-6" style={{ backgroundColor: C.bg }}>
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <ArrowLeft size={16} style={{ color: C.text }} />
        </button>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Swords size={40} color={C.boss} style={{ filter: `drop-shadow(0 0 8px ${C.boss})` }} />
          <p className="mt-3 text-xs font-medium uppercase tracking-wider" style={{ color: C.boss }}>Level {boss.level} Boss</p>
          <h1 className="mt-1 text-3xl font-bold" style={SG}>{boss.name}</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: C.text }}>{boss.description}</p>

          <div className="mt-6 w-full max-w-sm rounded-2xl border p-4 text-left" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>{boss.rounds} Rounds</p>
            <ul className="mt-2 flex flex-col gap-1">
              {structure.map((ex, i) => {
                const linked = findExerciseByName(exercises, ex.exercise_name);
                return (
                  <li key={i}>
                    <button
                      onClick={() => linked && setViewing(linked)}
                      disabled={!linked}
                      className="flex w-full items-center justify-between text-left text-sm"
                      style={{ color: C.text }}
                    >
                      <span>{formatBossExercise(ex)}</span>
                      {linked && <ChevronRight size={14} style={{ color: C.mobility }} />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {boss.time_cap_seconds && (
              <p className="mt-2 text-xs" style={{ color: C.muted }}>Recommended time cap: {formatTimer(boss.time_cap_seconds)}</p>
            )}
          </div>

          {boss.scaled_structure && (
            <label className="mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: C.border, backgroundColor: C.surface, color: C.text }}>
              <input type="checkbox" checked={usedScaled} onChange={(e) => setUsedScaled(e.target.checked)} className="h-4 w-4 rounded" style={{ accentColor: C.xp }} />
              Use scaled movements
            </label>
          )}

          <div className="mt-6 w-full max-w-sm rounded-2xl border p-4" style={{ borderColor: C.boss, backgroundColor: `${C.boss}0F` }}>
            <p className="text-sm font-bold" style={{ color: C.boss, ...SG }}>BOSS READY?</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: C.text }}>
              Train smart. Listen to your body and choose movements and weights that feel right for you. Good form beats speed.
            </p>
          </div>
        </div>
        <LedBorderButton onClick={() => { setPhase('active'); setRunning(true); }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold"
          style={{ backgroundColor: C.boss, color: '#1A0E0C', ...SG }}>
          <Swords size={20} /> Start Boss
        </LedBorderButton>
        {viewing && <ExerciseDetailModal exercise={viewing} onClose={() => setViewing(null)} />}
      </div>
    );
  }

  if (phase === 'submitting') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-5" style={{ backgroundColor: C.bg }}>
        <p className="text-sm" style={{ color: C.muted }}>Saving your result…</p>
      </div>
    );
  }

  // phase === 'active'
  return (
    <div className="flex min-h-screen flex-col px-5 pb-8 pt-6" style={{ backgroundColor: C.bg }}>
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <ArrowLeft size={16} style={{ color: C.text }} />
        </button>
        <p className="text-sm font-bold" style={{ color: C.boss, ...SG }}>{boss.name}</p>
        <div style={{ width: 36 }} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-6xl font-bold" style={{ color: C.text, ...MO }}>{formatTimer(elapsed)}</p>
        <p className="mt-1 text-xs uppercase tracking-wider" style={{ color: C.muted }}>
          {running ? 'Running' : 'Paused'}{boss.time_cap_seconds ? ` · cap ${formatTimer(boss.time_cap_seconds)}` : ''}
        </p>

        <div className="mt-6 w-full max-w-sm rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <ul className="flex flex-col gap-1 text-left">
            {structure.map((ex, i) => {
              const linked = findExerciseByName(exercises, ex.exercise_name);
              return (
                <li key={i}>
                  <button
                    onClick={() => linked && setViewing(linked)}
                    disabled={!linked}
                    className="flex w-full items-center justify-between text-left text-sm"
                    style={{ color: C.text }}
                  >
                    <span>{formatBossExercise(ex)}</span>
                    {linked && <ChevronRight size={14} style={{ color: C.mobility }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button onClick={() => setRoundsDone((r) => Math.max(0, r - 1))} className="flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: C.border, color: C.text }}><Minus size={16} /></button>
          <div className="text-center">
            <p className="text-3xl font-bold" style={{ color: C.xp, ...MO }}>{roundsDone} / {boss.rounds}</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Rounds</p>
          </div>
          <button onClick={() => setRoundsDone((r) => Math.min(boss.rounds, r + 1))} className="flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: C.border, color: C.text }}><Plus size={16} /></button>
        </div>

        <button onClick={() => setRunning((r) => !r)} className="mt-4 rounded-full border px-6 py-2 text-sm font-bold" style={{ borderColor: C.border, color: C.text, ...SG }}>
          {running ? 'Pause' : 'Resume'}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <button onClick={() => submitAttempt(true)} disabled={roundsDone < boss.rounds}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold disabled:opacity-40"
          style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>
          <Check size={20} strokeWidth={3} /> Boss Defeated
        </button>
        <button onClick={() => submitAttempt(false)} className="w-full rounded-2xl border py-3 text-sm font-bold" style={{ borderColor: C.border, color: C.muted, ...SG }}>
          Stop — Try Again Later
        </button>
      </div>
      {viewing && <ExerciseDetailModal exercise={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ChallengeResultScreen({ xpEarned, onHome }: { xpEarned: number; onHome: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center" style={{ backgroundColor: C.bg }}>
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: `${C.xp}1F`, border: `2px solid ${C.xp}`, boxShadow: `0 0 24px ${C.xp}66` }}>
        <Trophy size={44} style={{ color: C.xp }} />
      </div>
      <h1 className="text-3xl font-bold" style={SG}>Challenge Complete!</h1>
      <p className="mt-2" style={{ color: C.muted }}>Level unlocked.</p>
      <div className="mt-8 w-full rounded-2xl border p-5" style={{ borderColor: C.border, backgroundColor: C.surface }}>
        <p className="text-sm" style={{ color: C.muted }}>XP earned</p>
        <p className="mt-1 text-4xl font-bold" style={{ color: C.xp, ...MO }}>+<NumberRoll value={xpEarned} duration={0.8} /></p>
      </div>
      <button onClick={onHome} className="mt-8 w-full rounded-2xl py-4 text-lg font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>
        Back to Home
      </button>
    </div>
  );
}

/**
 * Wraps content that should reveal `delayMs` after the parent screen
 * mounts — the building block behind every staged reward sequence
 * (Boss Defeated, Level Up, etc.), per spec section 21's shared
 * "RewardReveal" architecture. Each stage fades + rises into place.
 */
function RevealStage({ children, delayMs, className }: { children: React.ReactNode; delayMs: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delayMs / 1000, duration: 0.4, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function BossResultScreen({ result, bossName, onHome }: {
  result: { passed: boolean; medal: string | null; xpReward: number }; bossName: string; onHome: () => void;
}) {
  const medalEmoji = result.medal === 'gold' ? '🥇' : result.medal === 'silver' ? '🥈' : result.medal === 'bronze' ? '🥉' : null;

  if (!result.passed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center" style={{ backgroundColor: C.bg }}>
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: `${C.border}66`, border: `2px solid ${C.border}` }}>
          <Swords size={44} style={{ color: C.muted }} />
        </div>
        <h1 className="text-3xl font-bold" style={SG}>Boss Survived</h1>
        <p className="mt-2" style={{ color: C.muted }}>{bossName}</p>
        <p className="mt-8 max-w-sm text-sm leading-relaxed" style={{ color: C.text }}>
          No XP lost, no progress removed. You'll get it next time — try again whenever you're ready.
        </p>
        <button onClick={onHome} className="mt-8 w-full rounded-2xl py-4 text-lg font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>
          Back to Home
        </button>
      </div>
    );
  }

  // Boss Defeated — WODXP's flagship reward moment, staged per spec
  // section 23: icon -> "BOSS" -> "DEFEATED" scale-pop -> medal rotateY
  // reveal -> XP count-up -> CTA. ~1.5s total, darker backdrop throughout.
  return (
    <motion.div
      className="flex min-h-screen flex-col items-center justify-center px-5 text-center"
      initial={{ backgroundColor: '#0D0D0D' }}
      animate={{ backgroundColor: '#050505' }}
      transition={{ duration: 0.3 }}
    >
      <RevealStage delayMs={0}>
        <div className="flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: `${C.boss}1F`, border: `2px solid ${C.boss}`, boxShadow: `0 0 24px ${C.boss}66` }}>
          <Swords size={44} style={{ color: C.boss }} />
        </div>
      </RevealStage>

      <RevealStage delayMs={150}>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.3em]" style={{ color: C.boss }}>{bossName}</p>
      </RevealStage>

      <motion.h1
        className="mt-1 text-4xl font-bold"
        style={{ ...SG, color: C.text }}
        initial={{ scale: 0.75, opacity: 0 }}
        animate={{ scale: [0.75, 1.06, 1], opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
      >
        DEFEATED
      </motion.h1>

      {medalEmoji && (
        <motion.div
          className="mt-6 text-6xl"
          initial={{ rotateY: -90, scale: 0.6, opacity: 0 }}
          animate={{ rotateY: 0, scale: 1, opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.5, ease: 'easeOut' }}
          style={{ perspective: 400 }}
        >
          {medalEmoji}
        </motion.div>
      )}

      <RevealStage delayMs={800}>
        <div className="mt-6 w-full rounded-2xl border p-5" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <p className="text-sm" style={{ color: C.muted }}>XP earned</p>
          <p className="mt-1 text-4xl font-bold" style={{ color: C.xp, ...MO }}>+<NumberRoll value={result.xpReward} duration={0.8} /></p>
          <p className="mt-2 text-sm font-bold" style={{ color: C.xp, ...SG }}>LEVEL UNLOCKED</p>
        </div>
      </RevealStage>

      <RevealStage delayMs={1100} className="mt-8 w-full">
        <LedBorderButton onClick={onHome} className="w-full rounded-2xl py-4 text-lg font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>
          Continue
        </LedBorderButton>
      </RevealStage>
    </motion.div>
  );
}

/**
 * WOD XP tab — 15 classic CrossFit benchmark WODs as an optional side
 * track, separate from the main Level/Boss progression. Locked slots
 * (overall level hasn't reached their unlock_level yet) render dimmed
 * with a dark overlay; unlocked ones render clearly and are tappable.
 */
function WodXpScreen({ stats, classicWods, summary, wodMedals, onOpenWod }: {
  stats: UserStats; classicWods: ClassicWod[]; summary: { completed: number; gold: number; silver: number; bronze: number };
  wodMedals: Record<number, string>; onOpenWod: (wod: ClassicWod) => void;
}) {
  // Title tiers by gold-medal count — "WOD Master" and "Legend of the Box"
  // are the two named tiers from the spec; the ones in between are a
  // reasonable interpolation to fill the gap.
  const title =
    summary.gold >= 15 ? 'Legend of the Box' :
    summary.gold >= 10 ? 'Elite Athlete' :
    summary.gold >= 5 ? 'WOD Master' :
    summary.gold >= 1 ? 'Challenger' : null;

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: C.bg }}>
      <header className="px-5 pt-6 pb-4">
        <p className="text-xs uppercase tracking-wider" style={{ color: C.conditioning }}>Side Track</p>
        <h1 className="text-2xl font-bold" style={SG}>WOD XP</h1>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>
          15 classic benchmark workouts. Optional — clearing these never blocks your main progression.
        </p>
      </header>

      <div className="px-5">
        <div className="rounded-2xl border p-4" style={{ borderColor: `${C.conditioning}55`, backgroundColor: `${C.conditioning}0F` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>Completed</p>
              <p className="text-lg font-bold" style={{ color: C.text, ...MO }}>{summary.completed} / 15</p>
            </div>
            <div className="flex gap-3 text-center">
              <div><p className="text-lg font-bold" style={{ color: '#FFD700', ...MO }}>{summary.gold}</p><p className="text-[9px] uppercase" style={{ color: C.muted }}>Gold</p></div>
              <div><p className="text-lg font-bold" style={{ color: '#C0C0C0', ...MO }}>{summary.silver}</p><p className="text-[9px] uppercase" style={{ color: C.muted }}>Silver</p></div>
              <div><p className="text-lg font-bold" style={{ color: '#CD7F32', ...MO }}>{summary.bronze}</p><p className="text-[9px] uppercase" style={{ color: C.muted }}>Bronze</p></div>
            </div>
          </div>
          {title && (
            <p className="mt-3 border-t pt-3 text-center text-sm font-bold" style={{ borderColor: `${C.conditioning}33`, color: C.conditioning, ...SG }}>
              🏆 {title}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 px-5">
        {classicWods.map((wod) => {
          const isUnlocked = stats.level >= wod.unlock_level;
          const medal = wodMedals[wod.slot]; // 'gold' | 'silver' | 'bronze' | undefined
          const medalColor = medal === 'gold' ? '#FFD700' : medal === 'silver' ? '#C0C0C0' : medal === 'bronze' ? '#CD7F32' : null;
          const medalEmoji = medal === 'gold' ? '🥇' : medal === 'silver' ? '🥈' : medal === 'bronze' ? '🥉' : null;
          return (
            <motion.button
              key={wod.slot}
              onClick={() => isUnlocked && wod.is_ready && onOpenWod(wod)}
              disabled={!isUnlocked || !wod.is_ready}
              className="relative flex items-center gap-3 overflow-hidden rounded-2xl border p-4 text-left"
              style={{
                borderColor: medalColor ? `${medalColor}66` : isUnlocked ? `${C.conditioning}55` : C.border,
                backgroundColor: medalColor ? `${medalColor}12` : isUnlocked ? `${C.conditioning}0F` : C.surface,
              }}
              animate={{ y: isUnlocked ? 0 : 0, scale: 1 }}
              whileTap={isUnlocked && wod.is_ready ? { scale: 0.98 } : undefined}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <motion.div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: medalColor ? `${medalColor}22` : isUnlocked ? `${C.conditioning}22` : C.raised }}
                animate={{ rotate: isUnlocked ? 0 : 0 }}>
                {medalEmoji ? (
                  <motion.span key="medal" className="text-2xl" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
                    {medalEmoji}
                  </motion.span>
                ) : isUnlocked ? (
                  <motion.span key="unlocked" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
                    <Award size={22} color={C.conditioning} style={{ filter: `drop-shadow(0 0 5px ${C.conditioning})` }} />
                  </motion.span>
                ) : (
                  <Lock size={20} style={{ color: C.muted }} />
                )}
              </motion.div>
              <div className="flex-1">
                <p className="font-bold" style={{ color: isUnlocked ? C.text : C.muted, ...SG }}>
                  {isUnlocked ? wod.name : `Unlocks at Lv ${wod.unlock_level}`}
                </p>
                <p className="text-xs" style={{ color: C.muted }}>
                  {isUnlocked
                    ? (wod.is_ready
                        ? (medal ? `${medal.charAt(0).toUpperCase() + medal.slice(1)} medal earned` : (wod.format_label ?? 'Tap to view'))
                        : 'Coming soon')
                    : `Reach Quest Lv ${wod.unlock_level} to unlock`}
                </p>
              </div>
              {isUnlocked && wod.is_ready && <ChevronRight size={18} style={{ color: C.muted }} />}

              {/* Dim overlay for locked slots — retracts/fades on unlock
                  instead of just disappearing, per spec section 26. */}
              <motion.div
                className="pointer-events-none absolute inset-0"
                initial={false}
                animate={{ opacity: isUnlocked ? 0 : 1 }}
                transition={{ duration: 0.5 }}
                style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
              />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function formatScoreLabel(scoringType: 'time' | 'rounds' | 'points'): string {
  return scoringType === 'time' ? 'Time' : scoringType === 'rounds' ? 'Rounds' : 'Points';
}

function WodDetailScreen({ wod, exercises, userId, onBack, onComplete }: {
  wod: ClassicWod; exercises: Exercise[]; userId: string; onBack: () => void;
  onComplete: (result: { medal: string | null; scoreValue: number }) => void;
}) {
  const [phase, setPhase] = useState<'ready' | 'active' | 'submitting'>('ready');
  const [viewing, setViewing] = useState<Exercise | null>(null);

  // Time-scored: count UP (lower final time = better medal).
  // Rounds/points-scored: count DOWN from the fixed work window.
  const isCountUp = wod.scoring_type === 'time';
  const startValue = isCountUp ? 0 : (wod.amrap_duration_seconds ?? 0);
  const [elapsed, setElapsed] = useState(startValue);
  const [running, setRunning] = useState(false);
  const [scoreCount, setScoreCount] = useState(0); // rounds or points, manually tracked
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  useWakeLock(running);

  // Backing out mid-WOD needs a courtesy check — unlike the regular workout
  // flow, there's no XP at stake here (WODs are medal-only), so the message
  // is about losing this attempt's chance at a medal, not XP.
  const handleWodBackPress = () => {
    if (phase === 'active') {
      setRunning(false);
      setShowAbortConfirm(true);
    } else {
      onBack();
    }
  };

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed((t) => (isCountUp ? t + 1 : Math.max(0, t - 1)));
    }, 1000);
    return () => clearInterval(id);
  }, [running, isCountUp]);

  const submitAttempt = async (finalScore: number) => {
    setRunning(false);
    setPhase('submitting');
    const supabase = createClient();
    const { data: medal } = await supabase.rpc('attempt_classic_wod', {
      p_user_id: userId, p_slot: wod.slot, p_score_value: finalScore,
    });
    onComplete({ medal: medal ?? null, scoreValue: finalScore });
  };

  const medalColor = { gold: '#FFD700', silver: '#C0C0C0', bronze: '#CD7F32' };
  const typeColor = wod.wod_type === 'Hero' ? C.boss : wod.wod_type === 'Benchmark' ? C.mobility : C.conditioning;

  if (phase === 'ready') {
    return (
      <div className="flex min-h-screen flex-col px-5 pb-8 pt-6" style={{ backgroundColor: C.bg }}>
        <button onClick={handleWodBackPress} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <ArrowLeft size={16} style={{ color: C.text }} />
        </button>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Award size={40} color={C.conditioning} style={{ filter: `drop-shadow(0 0 8px ${C.conditioning})` }} />
          <div className="mt-3 flex items-center gap-2">
            {wod.wod_type && <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: `${typeColor}22`, color: typeColor }}>{wod.wod_type}</span>}
            {wod.difficulty_tier && <span className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>{wod.difficulty_tier}</span>}
          </div>
          <h1 className="mt-1 text-3xl font-bold" style={SG}>{wod.name}</h1>
          <p className="mt-1 text-sm font-semibold" style={{ color: C.conditioning }}>{wod.format_label}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: C.text }}>{wod.description}</p>

          <div className="mt-6 w-full max-w-sm rounded-2xl border p-4 text-left" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <ul className="flex flex-col gap-1.5">
              {(wod.structure ?? []).map((ex, i) => {
                const linked = findExerciseByName(exercises, ex.exercise_name);
                return (
                  <li key={i}>
                    <button onClick={() => linked && setViewing(linked)} disabled={!linked}
                      className="flex w-full items-center justify-between text-left text-sm" style={{ color: C.text }}>
                      <span>{formatBossExercise(ex)}</span>
                      {linked && <ChevronRight size={14} style={{ color: C.mobility }} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4 w-full max-w-sm rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>Medals</p>
            <div className="mt-2 flex justify-around text-center text-xs">
              <div><p style={{ color: medalColor.gold }}>🥇 Gold</p><p style={{ color: C.muted, ...MO }}>{wod.scoring_type === 'time' ? `< ${formatTimer(wod.medal_gold_value ?? 0)}` : `${wod.medal_gold_value}+`}</p></div>
              <div><p style={{ color: medalColor.silver }}>🥈 Silver</p><p style={{ color: C.muted, ...MO }}>{wod.scoring_type === 'time' ? `< ${formatTimer(wod.medal_silver_value ?? 0)}` : `${wod.medal_silver_value}+`}</p></div>
              <div><p style={{ color: medalColor.bronze }}>🥉 Bronze</p><p style={{ color: C.muted, ...MO }}>{wod.scoring_type === 'time' ? `< ${formatTimer(wod.medal_bronze_value ?? 0)}` : `${wod.medal_bronze_value}+`}</p></div>
            </div>
          </div>

          <div className="mt-4 w-full max-w-sm rounded-2xl border p-4" style={{ borderColor: C.conditioning, backgroundColor: `${C.conditioning}0F` }}>
            <p className="text-sm font-bold" style={{ color: C.conditioning, ...SG }}>Optional & harder than Boss Challenges</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: C.text }}>Train smart. Scale movements or weight as needed — earning any medal is a real achievement.</p>
          </div>
        </div>
        <LedBorderButton onClick={() => { setPhase('active'); setRunning(true); }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold"
          style={{ backgroundColor: C.conditioning, color: '#1A0E0C', ...SG }}>
          <Award size={20} /> Start {wod.name}
        </LedBorderButton>
        {viewing && <ExerciseDetailModal exercise={viewing} onClose={() => setViewing(null)} />}
      </div>
    );
  }

  if (phase === 'submitting') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-5" style={{ backgroundColor: C.bg }}>
        <p className="text-sm" style={{ color: C.muted }}>Saving your result…</p>
      </div>
    );
  }

  // phase === 'active'
  return (
    <div className="flex min-h-screen flex-col px-5 pb-8 pt-6" style={{ backgroundColor: C.bg }}>
      <div className="flex items-center justify-between">
        <button onClick={handleWodBackPress} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <ArrowLeft size={16} style={{ color: C.text }} />
        </button>
        <p className="text-sm font-bold" style={{ color: C.conditioning, ...SG }}>{wod.name}</p>
        <div style={{ width: 36 }} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-6xl font-bold" style={{ color: C.text, ...MO }}>{formatTimer(elapsed)}</p>
        <p className="mt-1 text-xs uppercase tracking-wider" style={{ color: C.muted }}>
          {isCountUp ? 'Elapsed' : 'Time remaining'}
        </p>

        {!isCountUp && (
          <div className="mt-6 flex items-center gap-4">
            <button onClick={() => setScoreCount((r) => Math.max(0, r - 1))} className="flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: C.border, color: C.text }}><Minus size={16} /></button>
            <div className="text-center">
              <p className="text-3xl font-bold" style={{ color: C.conditioning, ...MO }}>{scoreCount}</p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>{formatScoreLabel(wod.scoring_type)}</p>
            </div>
            <button onClick={() => setScoreCount((r) => r + 1)} className="flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: C.border, color: C.text }}><Plus size={16} /></button>
          </div>
        )}

        <button onClick={() => setRunning((r) => !r)} className="mt-4 rounded-full border px-6 py-2 text-sm font-bold" style={{ borderColor: C.border, color: C.text, ...SG }}>
          {running ? 'Pause' : 'Resume'}
        </button>
      </div>

      <button onClick={() => submitAttempt(isCountUp ? elapsed : scoreCount)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold"
        style={{ backgroundColor: C.conditioning, color: '#1A0E0C', ...SG }}>
        <Check size={20} strokeWidth={3} /> Finish & Submit
      </button>
      {showAbortConfirm && (
        <SafeModalShell>
          <div className="w-full max-w-sm rounded-3xl border p-6 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <img src="/icon-512.png" alt="WODXP" className="mx-auto h-16 w-16 rounded-2xl" />
            <h2 className="mt-4 text-lg font-bold" style={SG}>Give up already?</h2>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>
              You're mid-WOD — leaving now means no medal for this attempt. Your best time stays whatever you've already earned.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <LedBorderButton onClick={() => { setShowAbortConfirm(false); setRunning(true); }}
                className="rounded-2xl py-3.5 text-sm font-bold" style={{ backgroundColor: C.conditioning, color: '#1A0E0C', ...SG }}>
                Keep Going
              </LedBorderButton>
              <button onClick={onBack} className="rounded-2xl border py-3.5 text-sm font-bold" style={{ borderColor: C.border, color: C.muted, ...SG }}>
                I&apos;m tired, maybe next time
              </button>
            </div>
          </div>
        </SafeModalShell>
      )}
    </div>
  );
}

function WodResultScreen({ result, wod, onHome }: {
  result: { medal: string | null; scoreValue: number }; wod: ClassicWod; onHome: () => void;
}) {
  const medalEmoji = result.medal === 'gold' ? '🥇' : result.medal === 'silver' ? '🥈' : result.medal === 'bronze' ? '🥉' : null;
  const scoreDisplay = wod.scoring_type === 'time' ? formatTimer(result.scoreValue) : `${result.scoreValue} ${formatScoreLabel(wod.scoring_type).toLowerCase()}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center" style={{ backgroundColor: C.bg }}>
      <motion.div
        className="mb-6 flex h-24 w-24 items-center justify-center rounded-full"
        style={{ backgroundColor: result.medal ? `${C.conditioning}1F` : `${C.border}66`, border: `2px solid ${result.medal ? C.conditioning : C.border}`, perspective: 400 }}
        initial={{ rotateY: medalEmoji ? -90 : 0, scale: medalEmoji ? 0.6 : 1, opacity: 0 }}
        animate={{ rotateY: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {medalEmoji ? <span className="text-5xl">{medalEmoji}</span> : <Award size={44} style={{ color: C.muted }} />}
      </motion.div>
      <h1 className="text-3xl font-bold" style={SG}>{result.medal ? `${wod.name} Complete!` : `${wod.name} Logged`}</h1>
      <p className="mt-2" style={{ color: C.muted }}>Your score: <span style={MO}>{scoreDisplay}</span></p>

      {!result.medal && (
        <p className="mt-4 max-w-sm text-sm leading-relaxed" style={{ color: C.text }}>
          No medal this time — but your attempt is saved. Come back and try to beat it whenever you're ready.
        </p>
      )}

      <button onClick={onHome} className="mt-8 w-full rounded-2xl py-4 text-lg font-bold" style={{ backgroundColor: C.conditioning, color: '#1A0E0C', ...SG }}>
        Back to WOD XP
      </button>
    </div>
  );
}

function GeneratorScreen({ exercises, totalExerciseCount, onBack, onStart }: { exercises: Exercise[]; totalExerciseCount: number; onBack: () => void; onStart: (exs: Exercise[], durationMinutes: number) => void }) {
  const [equipment, setEquipment] = useState<Set<'kettlebell' | 'dumbbell' | 'bodyweight'>>(
    new Set(['kettlebell', 'dumbbell', 'bodyweight'])
  );
  const [goal, setGoal] = useState<'strength' | 'conditioning' | 'mobility' | 'mixed'>('mixed');
  const [duration, setDuration] = useState<10 | 20 | 30 | 45>(20);
  const [building, setBuilding] = useState(false);

  const toggleEquipment = (eq: 'kettlebell' | 'dumbbell' | 'bodyweight') => {
    setEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(eq)) {
        if (next.size > 1) next.delete(eq); // always keep at least one selected
      } else {
        next.add(eq);
      }
      return next;
    });
  };

  const handleGenerate = () => {
    // Brief "BUILDING YOUR WOD..." beat per spec section 13 — the pool is
    // computed immediately, but onStart is deferred ~750ms so the pulse
    // sequence has time to play instead of instantly jumping to Safety.
    setBuilding(true);
    const equipmentPool = exercises.filter((ex) => ex.equipment.some((e) => equipment.has(e as 'kettlebell' | 'dumbbell' | 'bodyweight')));
    const pool = goal === 'mixed' ? equipmentPool : equipmentPool.filter((ex) => ex.primary_attribute === goal);
    const count = duration <= 10 ? 3 : duration <= 20 ? 4 : duration <= 30 ? 5 : 6;
    const picked = pickVariedExercises(pool.length > 0 ? pool : equipmentPool, count);
    setTimeout(() => onStart(picked, duration), 750);
  };

  const Opt = <T extends string | number>({ label, val, cur, set }: { label: string; val: T; cur: T; set: (v: T) => void }) => (
    <button onClick={() => set(val)} className="flex-1 rounded-xl border py-3 text-sm font-semibold"
      style={{ borderColor: cur === val ? C.xp : C.border, backgroundColor: cur === val ? `${C.xp}1A` : C.surface, color: cur === val ? C.xp : C.text, ...SG }}>
      {label}
    </button>
  );

  const ToggleOpt = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button onClick={onClick} className="flex-1 rounded-xl border py-3 text-sm font-semibold"
      style={{ borderColor: active ? C.xp : C.border, backgroundColor: active ? `${C.xp}1A` : C.surface, color: active ? C.xp : C.text, ...SG }}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen px-5 pb-28 pt-6" style={{ backgroundColor: C.bg }}>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.border, backgroundColor: C.surface }}><ArrowLeft size={16} style={{ color: C.text }} /></button>
        <div>
          <h1 className="text-2xl font-bold" style={SG}>Generate Workout</h1>
          <p className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
            <Sparkles size={11} style={{ color: C.mobility }} />
            <span style={MO}>{exercises.length}</span> of <span style={MO}>{totalExerciseCount}</span> movements unlocked
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider" style={{ color: C.muted }}>
            <span style={{ color: C.kettlebell }}>●</span> Equipment <span className="normal-case" style={{ color: C.muted }}>(tap to select any combination)</span>
          </p>
          <div className="flex gap-2">
            <ToggleOpt label="Kettlebell" active={equipment.has('kettlebell')} onClick={() => toggleEquipment('kettlebell')} />
            <ToggleOpt label="Dumbbell" active={equipment.has('dumbbell')} onClick={() => toggleEquipment('dumbbell')} />
            <ToggleOpt label="Bodyweight" active={equipment.has('bodyweight')} onClick={() => toggleEquipment('bodyweight')} />
          </div>
        </div>
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider" style={{ color: C.muted }}><Target size={14} /> Goal</p>
          <div className="flex gap-2">
            <Opt label="Strength" val="strength" cur={goal} set={setGoal} />
            <Opt label="Endurance" val="conditioning" cur={goal} set={setGoal} />
            <Opt label="Mobility" val="mobility" cur={goal} set={setGoal} />
            <Opt label="Mixed" val="mixed" cur={goal} set={setGoal} />
          </div>
        </div>
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider" style={{ color: C.muted }}><Clock size={14} /> Duration</p>
          <div className="flex gap-2">
            <Opt label="10 min" val={10} cur={duration} set={setDuration} />
            <Opt label="20 min" val={20} cur={duration} set={setDuration} />
            <Opt label="30 min" val={30} cur={duration} set={setDuration} />
            <Opt label="45 min" val={45} cur={duration} set={setDuration} />
          </div>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 border-t px-5 py-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
        <LedBorderButton onClick={handleGenerate} disabled={building} className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold"
          style={{ backgroundColor: C.xp, color: '#04140A', ...SG, boxShadow: `0 0 20px ${C.xp}55` }}>
          <Sparkles size={20} /> Generate
        </LedBorderButton>
      </div>
      {building && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: 'rgba(13,13,13,0.92)' }}>
          <motion.p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: C.text, ...SG }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            Building your WOD...
          </motion.p>
          <div className="mt-6 flex gap-3">
            {[{ label: 'Strength', color: C.strength }, { label: 'Mobility', color: C.mobility }, { label: 'Conditioning', color: C.conditioning }].map((a, i) => (
              <motion.span
                key={a.label}
                className="rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider"
                style={{ backgroundColor: `${a.color}22`, color: a.color }}
                initial={{ opacity: 0.3, scale: 0.9 }}
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.06, 0.9] }}
                transition={{ duration: 0.75, delay: i * 0.2, repeat: Infinity, repeatDelay: 0.15 }}
              >
                {a.label}
              </motion.span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SafetyNoticeScreen({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleContinue = () => {
    if (dontShowAgain && typeof window !== 'undefined') {
      window.localStorage.setItem('wodxp_skip_safety_notice', '1');
    }
    onContinue();
  };

  return (
    <div className="flex min-h-screen flex-col px-5 pb-8 pt-6" style={{ backgroundColor: C.bg }}>
      <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
        <ArrowLeft size={16} style={{ color: C.text }} />
      </button>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${C.xp}1A`, border: `2px solid ${C.xp}` }}>
          <span style={{ color: C.xp, fontSize: 28, fontWeight: 700 }}>!</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold" style={SG}>Before you start</h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed" style={{ color: C.text }}>
          Listen to your body. Choose weights and movements that feel right for you. Focus on good form,
          stay in control, and adjust or stop an exercise if you feel pain or discomfort.
        </p>
        <p className="mt-4 text-lg font-bold" style={{ color: C.xp, ...SG }}>
          Your workout. Your pace.
        </p>
      </div>

      <label className="mb-4 flex items-center justify-center gap-2 text-sm" style={{ color: C.muted }}>
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          className="h-4 w-4 rounded"
          style={{ accentColor: C.xp }}
        />
        Don&apos;t show this again
      </label>

      <LedBorderButton
        onClick={handleContinue}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold"
        style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}
      >
        Got it — Let&apos;s train
      </LedBorderButton>
    </div>
  );
}

/**
 * Per-exercise XP for a logged set of weight/reps/sets, compared against
 * the exercise's defaults. Lowering ANY of the three from default costs
 * -2 XP (once, not per-parameter, to discourage picking an easier version
 * for full credit). Raising ANY of them earns +1 XP (also once — raising
 * all three isn't +3). Unchanged from default = no adjustment. There is
 * no other scaling with reps/sets/weight — that uncapped bonus is exactly
 * what let XP be farmed by just cranking the sets stepper.
 */
function computeExerciseXp(ex: Exercise, log: { weight: number; reps: number; sets: number }): number {
  const loweredAny = log.weight < ex.default_weight_kg || log.reps < ex.default_reps || log.sets < ex.default_sets;
  const raisedAny = log.weight > ex.default_weight_kg || log.reps > ex.default_reps || log.sets > ex.default_sets;
  const adjustment = loweredAny ? -2 : raisedAny ? 1 : 0;
  return Math.max(0, ex.xp_value + adjustment);
}

function WorkoutScreen({ exercises, userId, durationMinutes, onBack, onFinish }: { exercises: Exercise[]; userId: string; durationMinutes: number; onBack: () => void; onFinish: (requestedXp: number, grantedXp: number) => void }) {
  // Captured once, when the workout screen first mounts — i.e. when the
  // user actually starts training. Without this, the session row would
  // only get a started_at/completed_at pair at save time (both ~identical),
  // making "time trained" always compute to ~0 seconds.
  const [startedAt] = useState(() => new Date().toISOString());
  const [logs, setLogs] = useState<Record<string, { weight: number; reps: number; sets: number }>>(
    Object.fromEntries(exercises.map((ex) => [ex.id, { weight: ex.default_weight_kg, reps: ex.default_reps, sets: ex.default_sets }]))
  );
  const [done, setDone] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Exercise | null>(null);
  const allDone = done.size === exercises.length;

  // Live elapsed-time tracking, used only to detect an early quit (leaving
  // before 30% of the selected workout duration has passed) — separate
  // from `startedAt`, which is the fixed timestamp saved to the database.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [quitConfirmIndex, setQuitConfirmIndex] = useState<number | null>(null);
  React.useEffect(() => {
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const earlyQuitThreshold = durationMinutes * 60 * 0.3;

  // The back arrow always leaves immediately — nothing is saved, so there's
  // no XP to gate here. The confirmation instead belongs on the action that
  // actually CLAIMS a reward: pressing Finish & Save suspiciously fast is
  // the real "gaming the system" signal, not simply backing out.
  const handleBackPress = () => onBack();

  const handleFinish = async () => {
    setSaving(true);
    const supabase = createClient();

    const { data: session } = await supabase
      .from('workout_sessions')
      .insert({ user_id: userId, format: 'circuit', status: 'completed', started_at: startedAt, completed_at: new Date().toISOString(), duration_minutes: durationMinutes })
      .select()
      .single();

    if (session) {
      const rows = exercises.map((ex, i) => ({
        session_id: session.id,
        exercise_id: ex.id,
        order_index: i,
        weight: logs[ex.id].weight,
        reps: logs[ex.id].reps,
        sets: logs[ex.id].sets,
        completed: done.has(ex.id),
      }));
      await supabase.from('workout_exercises').insert(rows);

      // Per-exercise XP adjustment: see computeExerciseXp() above.
      const totalXP = exercises.reduce((sum, ex) => {
        if (!done.has(ex.id)) return sum;
        return sum + computeExerciseXp(ex, logs[ex.id]);
      }, 0);

      const { data: grantedXp } = await supabase.rpc('award_xp', { p_user_id: userId, p_xp: totalXP });

      onFinish(totalXP, grantedXp ?? totalXP);
    }
    setSaving(false);
  };

  // Pressing Finish & Save with less than 30% of the selected duration
  // elapsed shows the confirmation instead of saving immediately — this is
  // the moment someone is actually claiming the XP reward, so it's the
  // right place to check, not the back button.
  const handleFinishClick = () => {
    if (elapsedSeconds < earlyQuitThreshold) {
      setQuitConfirmIndex(Math.floor(Math.random() * QUIT_CONFIRM_PAIRS.length));
    } else {
      handleFinish();
    }
  };

  return (
    <div className="min-h-screen px-5 pb-28 pt-6" style={{ backgroundColor: C.bg }}>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={handleBackPress} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.border, backgroundColor: C.surface }}><ArrowLeft size={16} style={{ color: C.text }} /></button>
        <div>
          <p className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>Workout</p>
          <h1 className="text-2xl font-bold" style={SG}><NumberRoll value={done.size} duration={0.3} /> / {exercises.length}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {exercises.map((ex, exIndex) => {
          const log = logs[ex.id];
          const isDone = done.has(ex.id);
          const equipment = pickPrimaryEquipment(ex.equipment);
          return (
            <motion.div key={ex.id} className="rounded-2xl border p-4" style={{ backgroundColor: C.surface, borderColor: isDone ? `${C.xp}66` : C.border }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, scale: isDone ? [1, 1.015, 1] : 1 }}
              transition={{ delay: exIndex * 0.06, duration: 0.3, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setViewing(ex)} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl transition-transform active:scale-95" style={{ backgroundColor: C.raised }}>
                  <ExerciseIcon exercise={ex} size={40} />
                </button>
                <div>
                  <p className="font-bold" style={{ color: C.text, ...SG }}>{ex.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs capitalize" style={{ color: C.muted }}>{CATEGORY_LABELS[ex.category]}</span>
                    <span className="text-xs" style={{ color: C.muted }}>·</span>
                    <span className="text-xs font-medium" style={{ color: EQUIPMENT_COLORS[equipment] }}>{EQUIPMENT_LABELS[equipment]}</span>
                    <span className="text-xs" style={{ color: C.muted }}>· +{computeExerciseXp(ex, log)} XP</span>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>Tap the icon to see how it's done</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl border px-1 py-3" style={{ borderColor: C.border }}>
                <Stepper label="Weight" value={log.weight} onChange={(v) => setLogs((p) => ({ ...p, [ex.id]: { ...p[ex.id], weight: v } }))} step={1} unit="kg" />
                <Stepper label="Reps" value={log.reps} onChange={(v) => setLogs((p) => ({ ...p, [ex.id]: { ...p[ex.id], reps: v } }))} step={1} unit="reps" min={1} />
                <Stepper label="Sets" value={log.sets} onChange={(v) => setLogs((p) => ({ ...p, [ex.id]: { ...p[ex.id], sets: v } }))} step={1} unit="sets" min={1} />
              </div>
              <LedBorderButton onClick={() => setDone((p) => new Set(p).add(ex.id))} disabled={isDone} radius={12}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold"
                style={{ backgroundColor: isDone ? C.raised : C.xp, color: isDone ? C.xp : '#04140A', ...SG }}>
                {isDone ? (<><Check size={18} strokeWidth={3} /> Done</>) : 'Mark Complete'}
              </LedBorderButton>
            </motion.div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t px-5 py-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
        <LedBorderButton onClick={handleFinishClick} disabled={!allDone || saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold disabled:opacity-50"
          style={{ backgroundColor: allDone ? C.xp : C.raised, color: allDone ? '#04140A' : C.muted, ...SG }}>
          {saving ? 'Saving…' : allDone ? 'Finish & Save' : (
            <>Complete all (<NumberRoll value={done.size} duration={0.3} />/{exercises.length})</>
          )}
        </LedBorderButton>
      </div>
      {viewing && <ExerciseDetailModal exercise={viewing} onClose={() => setViewing(null)} />}
      {quitConfirmIndex !== null && (
        <QuitConfirmModal
          pair={QUIT_CONFIRM_PAIRS[quitConfirmIndex]}
          onKeepTraining={() => setQuitConfirmIndex(null)}
          onQuit={onBack}
        />
      )}
    </div>
  );
}

/** Shown when the user tries to leave a workout before 30% of the selected
 *  duration has passed. Quitting from here abandons the session entirely —
 *  nothing is saved, matching "End Workout, No XP". */
/**
 * Plain-CSS modal shell (no Motion dependency) for functionally-critical
 * dialogs like the quit-workout confirmation — this MUST reliably appear
 * and be dismissible even if the Motion library has a runtime issue, since
 * its job (stopping an accidental early quit) matters more than how it
 * looks. Uses a mount-triggered class toggle for a simple fade + scale-in.
 */
function SafeModalShell({ children, onBackdropClick }: { children: React.ReactNode; onBackdropClick?: () => void }) {
  const [visible, setVisible] = useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5 transition-colors duration-200"
      style={{ backgroundColor: visible ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0)' }}
      onClick={onBackdropClick}
    >
      <div
        className="w-full max-w-sm transition-all duration-200 ease-out"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(12px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function QuitConfirmModal({ pair, onKeepTraining, onQuit }: {
  pair: { keepTraining: string; quit: string }; onKeepTraining: () => void; onQuit: () => void;
}) {
  return (
    <SafeModalShell>
      <div className="w-full max-w-sm rounded-3xl border p-6 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
        <img src="/icon-512.png" alt="WODXP" className="mx-auto h-16 w-16 rounded-2xl" />
        <h2 className="mt-4 text-lg font-bold" style={SG}>Leaving already?</h2>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>
          You're not far into this one yet — quitting now means no XP for the session.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button onClick={onKeepTraining} className="rounded-2xl py-3.5 text-sm font-bold transition-transform active:scale-[0.96]" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>
            {pair.keepTraining}
          </button>
          {/* Deliberately plain per spec: "The End Workout button must not use attention-seeking animation." */}
          <button onClick={onQuit} className="rounded-2xl border py-3.5 text-sm font-bold" style={{ borderColor: C.border, color: C.muted, ...SG }}>
            {pair.quit}
          </button>
        </div>
      </div>
    </SafeModalShell>
  );
}

// ─── Streak & Level-up messages ────────────────────────────────────────────────
const STREAK_MESSAGES: Record<3 | 5 | 7, string[]> = {
  3: [
    'Great streak! Remember to fuel your body well.',
    'Stay strong. Eat well, sleep well, train smart.',
    'Keep moving — but listen to your body.',
  ],
  5: [
    'Five days strong! Recovery is part of training.',
    "Don't forget to rest. That's when you get stronger.",
    'Train hard. Recover harder.',
  ],
  7: [
    "7-day streak! You've earned a recovery day.",
    'Take a break. Come back stronger.',
    "Rest isn't quitting. It's part of the plan.",
    'Great work! Hydrate, refuel and recharge.',
  ],
};

const LEVEL_UP_MESSAGES: string[] = [
  'LEVEL UP! Great work — you earned it!',
  'New level unlocked! Keep it going!',
  "You did it! Another level conquered.",
  'Stronger. Better. Level up!',
  'Great job! Your hard work is paying off.',
  'Boom! New level reached!',
  "Nice work! You're getting stronger.",
  'Progress unlocked! Keep pushing!',
  'Another level down. Great job!',
  'You showed up. You trained. You leveled up!',
  "Well earned! Welcome to the next level.",
  'That effort paid off. LEVEL UP!',
  "You're on fire! New level unlocked.",
  'Hard work = progress. Great job!',
  "Level complete. You're stronger than yesterday!",
];

// Paired continue/quit button texts for the early-quit confirmation dialog —
// kept as matched pairs (not independently randomized) so the joke/tone in
// each row lands correctly (e.g. "The family is watching" <-> "Family, forgive me").
const QUIT_CONFIRM_PAIRS: { keepTraining: string; quit: string }[] = [
  { keepTraining: 'No way, José — keep going!', quit: 'Not my day — end workout.' },
  { keepTraining: 'Back in the box — keep training!', quit: "I need more rest — I'm done." },
  { keepTraining: "The XP is waiting — continue!", quit: 'No XP today — end workout.' },
  { keepTraining: 'Not finished yet — keep going!', quit: "I'm calling it — finish now." },
  { keepTraining: "One more round — let's go!", quit: "Save it for tomorrow — I'm done." },
  { keepTraining: 'Back to work — continue workout!', quit: 'My battery is empty — end workout.' },
  { keepTraining: 'You almost escaped — get back in!', quit: "I'm out — no XP for me." },
  { keepTraining: 'The family is watching — keep going!', quit: 'Family, forgive me — I\'m done!' },
  { keepTraining: "XP isn't free — earn it!", quit: 'Rest mode activated — finish workout.' },
  { keepTraining: 'Get back in there — finish strong!', quit: 'Okay body, you win — end workout.' },
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Compares stats before/after a workout and returns any popups earned this session. */
function detectSessionPopups(prev: UserStats, next: UserStats): { levelUps: { attribute: string; level: number }[]; streakMessage: string | null } {
  const levelUps: { attribute: string; level: number }[] = [];
  const attrs: { key: keyof UserStats; label: string }[] = [
    { key: 'level_strength', label: 'Strength' },
    { key: 'level_mobility', label: 'Mobility' },
    { key: 'level_conditioning', label: 'Conditioning' },
  ];
  for (const { key, label } of attrs) {
    if ((next[key] as number) > (prev[key] as number)) {
      levelUps.push({ attribute: label, level: next[key] as number });
    }
  }

  let streakMessage: string | null = null;
  if ([3, 5, 7].includes(next.current_streak) && next.current_streak !== prev.current_streak) {
    streakMessage = randomFrom(STREAK_MESSAGES[next.current_streak as 3 | 5 | 7]);
  }

  return { levelUps, streakMessage };
}

function CompleteScreen({ xpEarned, levelUps, streakMessage, newlyUnlocked, unlockedChallenge, xpCapped, onHome }: {
  xpEarned: number;
  levelUps: { attribute: string; level: number }[];
  streakMessage: string | null;
  newlyUnlocked: number;
  unlockedChallenge: { name: string; isBoss: boolean } | null;
  xpCapped: boolean;
  onHome: () => void;
}) {
  const levelUpMessage = levelUps.length > 0 ? randomFrom(LEVEL_UP_MESSAGES) : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center" style={{ backgroundColor: C.bg }}>
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: `${C.xp}1F`, border: `2px solid ${C.xp}`, boxShadow: `0 0 24px ${C.xp}66` }}>
        <Check size={48} strokeWidth={3} style={{ color: C.xp }} />
      </div>
      <h1 className="text-3xl font-bold" style={SG}>Workout Saved!</h1>
      <p className="mt-2" style={{ color: C.muted }}>Your progress has been recorded.</p>

      {levelUpMessage && (
        <motion.div
          className="mt-6 w-full rounded-2xl border p-5"
          style={{ borderColor: C.xp, backgroundColor: `${C.xp}15`, boxShadow: `0 0 20px ${C.xp}33` }}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: [0.85, 1.04, 1], opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <p className="text-lg font-bold" style={{ color: C.xp, ...SG }}>{levelUpMessage}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {levelUps.map((lu, i) => (
              <motion.span key={lu.attribute} className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: `${C.xp}22`, color: C.xp, ...MO }}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}>
                {lu.attribute} → Lv <NumberRoll value={lu.level} duration={0.5} />
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}

      {newlyUnlocked > 0 && (
        <div className="mt-4 w-full rounded-2xl border p-5" style={{ borderColor: C.mobility, backgroundColor: `${C.mobility}15`, boxShadow: `0 0 20px ${C.mobility}33` }}>
          <p className="flex items-center justify-center gap-2 text-lg font-bold" style={{ color: C.mobility, ...SG }}>
            <Sparkles size={20} /> You unlocked new movements!
          </p>
          <p className="mt-1 text-sm" style={{ color: C.text }}>
            {newlyUnlocked} new {newlyUnlocked === 1 ? 'exercise is' : 'exercises are'} now available to train.
          </p>
        </div>
      )}

      {unlockedChallenge && (
        <div className="mt-4 w-full rounded-2xl border p-5" style={{ borderColor: unlockedChallenge.isBoss ? C.boss : C.xp, backgroundColor: `${unlockedChallenge.isBoss ? C.boss : C.xp}15`, boxShadow: `0 0 20px ${unlockedChallenge.isBoss ? C.boss : C.xp}33` }}>
          <p className="flex items-center justify-center gap-2 text-lg font-bold" style={{ color: unlockedChallenge.isBoss ? C.boss : C.xp, ...SG }}>
            {unlockedChallenge.isBoss ? <Swords size={20} /> : <Trophy size={20} />}
            {unlockedChallenge.isBoss ? 'Boss Battle unlocked!' : 'Level Challenge unlocked!'}
          </p>
          <p className="mt-1 text-sm" style={{ color: C.text }}>{unlockedChallenge.name} is now available on Home.</p>
        </div>
      )}

      {streakMessage && (
        <div className="mt-4 w-full rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <p className="flex items-center justify-center gap-2 text-sm font-medium" style={{ color: C.text }}>
            <Flame size={16} color="#FF9D4D" fill="#FF9D4D" /> {streakMessage}
          </p>
        </div>
      )}

      <div className="mt-6 w-full rounded-2xl border p-5" style={{ borderColor: C.border, backgroundColor: C.surface }}>
        <p className="text-sm" style={{ color: C.muted }}>XP earned this session</p>
        <p className="mt-1 text-4xl font-bold" style={{ color: C.xp, ...MO }}>+<NumberRoll value={xpEarned} duration={0.8} /></p>
      </div>
      {xpCapped && (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: C.muted }}>
          You've hit today's XP limit (2 workouts/day) — this session was still saved, but XP resumes tomorrow.
        </p>
      )}
      <button onClick={onHome} className="mt-8 w-full rounded-2xl py-4 text-lg font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>
        Back to Home
      </button>
    </div>
  );
}

/** Full-screen overlay showing the two-pose illustration + movement info for one exercise. */
/** Splits a flowing instruction paragraph into beginner-friendly numbered steps. */
function splitIntoSteps(text?: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ExerciseDetailModal({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const equipment = pickPrimaryEquipment(exercise.equipment);
  const steps = splitIntoSteps(exercise.instructions);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto" style={{ backgroundColor: C.bg }}>
      <div className="flex items-center px-5 pt-6 pb-2">
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <ArrowLeft size={16} style={{ color: C.text }} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center px-5 py-4">
        <div className="flex items-center justify-center" style={{ minHeight: 200 }}>
          <ExerciseVisual exercise={exercise} size={90} />
        </div>

        <div className="mt-6 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center" style={SG}>{exercise.name}</h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider rounded-full px-2.5 py-1" style={{ border: `1px solid ${C.border}`, color: C.muted }}>
              {CATEGORY_LABELS[exercise.category]}
            </span>
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: EQUIPMENT_COLORS[equipment] }}>
              {EQUIPMENT_LABELS[equipment]}
            </span>
            <span className="text-xs font-medium uppercase tracking-wider capitalize" style={{ color: C.muted }}>
              {exercise.difficulty}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <div className="rounded-xl border p-3 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Unlocks at</p>
              <p className="mt-1 font-bold" style={{ color: C.text, ...MO }}>Lv {exercise.unlock_level}</p>
            </div>
            <div className="rounded-xl border p-3 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Base XP</p>
              <p className="mt-1 font-bold" style={{ color: C.xp, ...MO }}>+{exercise.xp_value}</p>
            </div>
            <div className="rounded-xl border p-3 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Default</p>
              <p className="mt-1 font-bold" style={{ color: C.text, ...MO }}>{exercise.default_sets}×{exercise.default_reps}</p>
            </div>
          </div>

          {steps.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide" style={SG}>How to do it</h2>
              <ol className="mt-3 flex flex-col gap-3">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{ backgroundColor: `${C.xp}22`, color: C.xp, ...MO }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed pt-0.5" style={{ color: C.text }}>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          </div>
        </div>
      </div>
  );
}

function ExercisesScreen({ exercises }: { exercises: Exercise[] }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [equipFilter, setEquipFilter] = useState<'all' | Equipment>('all');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const cats = ['all', ...Array.from(new Set(exercises.map((e) => e.category)))];
  const filtered = exercises.filter((e) => {
    const matchesCat = cat === 'all' || e.category === cat;
    const matchesEquip = equipFilter === 'all' || e.equipment.includes(equipFilter);
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesEquip && matchesSearch;
  });

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: C.bg }}>
      <header className="px-5 pt-6 pb-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>Exercise Library</p>
        <h1 className="text-2xl font-bold" style={SG}>{exercises.length} Movements</h1>
        <div className="mt-2 flex items-center gap-4">
          {(['kettlebell', 'dumbbell', 'bodyweight'] as Equipment[]).map((eq) => (
            <button key={eq} onClick={() => setEquipFilter(equipFilter === eq ? 'all' : eq)}
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: equipFilter === eq ? EQUIPMENT_COLORS[eq] : C.muted }}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: EQUIPMENT_COLORS[eq], boxShadow: equipFilter === eq ? `0 0 6px ${EQUIPMENT_COLORS[eq]}` : 'none' }} />
              {EQUIPMENT_LABELS[eq]}
            </button>
          ))}
        </div>
      </header>

      <div className="px-5">
        <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <Search size={16} style={{ color: C.muted }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exercises"
            className="w-full bg-transparent text-sm outline-none" style={{ color: C.text }} />
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: 'none' }}>
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className="shrink-0 rounded-full border px-4 py-2 text-xs font-semibold capitalize"
            style={{ borderColor: cat === c ? C.xp : C.border, backgroundColor: cat === c ? `${C.xp}1A` : 'transparent', color: cat === c ? C.xp : C.muted, ...SG }}>
            {c === 'all' ? 'All' : CATEGORY_LABELS[c as ExerciseCategory]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 px-5">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: C.muted }}>No exercises found.</p>
        ) : (
          filtered.map((ex) => {
            return (
              <button key={ex.id} onClick={() => setSelected(ex)}
                className="flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors active:bg-white/5"
                style={{ borderColor: C.border, backgroundColor: C.surface }}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate" style={{ color: C.text, ...SG }}>{ex.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider rounded-full px-2 py-0.5" style={{ color: C.muted, border: `1px solid ${C.border}` }}>
                      {CATEGORY_LABELS[ex.category]}
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wider capitalize" style={{ color: C.muted }}>{ex.difficulty}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {ex.equipment.map((eq) => (
                      <span key={eq} className="flex items-center gap-1 text-[11px] font-medium capitalize" style={{ color: EQUIPMENT_COLORS[eq as Equipment] }}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: EQUIPMENT_COLORS[eq as Equipment] }} />
                        {eq}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="font-mono text-xs shrink-0" style={{ color: C.xp }}>+{ex.xp_value}</span>
              </button>
            );
          })
        )}
      </div>
      {selected && <ExerciseDetailModal exercise={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatsScreen({ stats }: { stats: UserStats }) {
  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: C.bg }}>
      <header className="px-5 pt-6 pb-4">
        <p className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>Your Progress</p>
        <h1 className="text-2xl font-bold" style={SG}>Stats</h1>
      </header>
      <div className="grid grid-cols-3 gap-2 px-5">
        {[
          { label: 'Total XP', value: stats.xp_total.toLocaleString(), color: C.xp },
          { label: 'Streak', value: `${stats.current_streak}d`, color: '#FF9D4D' },
          { label: 'Best Streak', value: `${stats.longest_streak}d`, color: C.text },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: C.muted }}>{label}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color, ...MO }}>{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 px-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={SG}>Attributes</h2>
        <div className="flex flex-col gap-4 rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          {[
            { label: 'Strength', level: stats.level_strength, xp: stats.xp_strength, color: C.strength },
            { label: 'Mobility', level: stats.level_mobility, xp: stats.xp_mobility, color: C.mobility },
            { label: 'Conditioning', level: stats.level_conditioning, xp: stats.xp_conditioning, color: C.conditioning },
          ].map(({ label, level, xp, color }) => {
            const { progress, xpLeft } = progressToNext(xp, level);
            return (
              <div key={label}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm font-bold" style={{ ...SG, color: C.text }}>{label}</span>
                  <span className="text-xs" style={{ color, ...MO }}>Lv {level} · {xpLeft.toLocaleString()} XP to next</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.raised }}>
                  <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: color, transition: 'width 0.5s ease', boxShadow: `0 0 8px ${color}` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Formats total seconds trained as "Xh Ym" for the all-time stats card. */
function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function AllTimeStatsCard({ stats }: { stats: AllTimeStats }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={SG}>All-Time Stats</h2>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border p-3 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <p className="text-lg font-bold" style={{ color: C.xp, ...MO }}>{formatDuration(stats.totalSeconds)}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Time Trained</p>
        </div>
        <div className="rounded-2xl border p-3 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <NumberRoll value={stats.totalWorkouts} className="text-lg font-bold" style={{ color: C.xp, ...MO }} />
          <p className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Workouts</p>
        </div>
        <div className="rounded-2xl border p-3 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <NumberRoll value={Math.round(stats.totalKg)} className="text-lg font-bold" style={{ color: C.xp, ...MO }} />
          <p className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>kg Lifted</p>
        </div>
      </div>
    </div>
  );
}

/** BMI categories per WHO standard. */
function bmiCategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: C.mobility };
  if (bmi < 25) return { label: 'Normal range', color: C.xp };
  if (bmi < 30) return { label: 'Overweight', color: C.conditioning };
  return { label: 'Obese', color: C.boss };
}

/**
 * Average BMI by age group and gender, from CDC/NHANES 2015-2016
 * (National Health Statistics Reports No. 122, Table 7 — public domain).
 * Used only as a population reference point, never as an individual
 * target or diagnostic claim.
 */
const AVERAGE_BMI_BY_AGE_GENDER: Record<'male' | 'female', Record<'20-39' | '40-59' | '60+', number>> = {
  male: { '20-39': 28.7, '40-59': 29.4, '60+': 29.2 },
  female: { '20-39': 28.7, '40-59': 30.4, '60+': 29.8 },
};

function ageToBracket(age: number): '20-39' | '40-59' | '60+' {
  if (age < 40) return '20-39';
  if (age < 60) return '40-59';
  return '60+';
}

/** Looks up the reference average BMI for a given age + gender.
 *  For "other", averages the male and female figures for that bracket. */
function getAverageBmi(age: number, gender: 'male' | 'female' | 'other'): number {
  const bracket = ageToBracket(age);
  if (gender === 'other') {
    return (AVERAGE_BMI_BY_AGE_GENDER.male[bracket] + AVERAGE_BMI_BY_AGE_GENDER.female[bracket]) / 2;
  }
  return AVERAGE_BMI_BY_AGE_GENDER[gender][bracket];
}

/**
 * BMI calculator — entirely client-side. Age, gender, height and weight are
 * kept only in local component state and are NEVER sent to Supabase or any
 * server, per GDPR: nothing here is persisted or logged anywhere.
 */
function BMICalculator() {
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'other'>('female');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');

  const h = parseFloat(heightCm);
  const w = parseFloat(weightKg);
  const a = parseFloat(age);
  const bmi = h > 0 && w > 0 ? w / ((h / 100) * (h / 100)) : null;
  const category = bmi ? bmiCategory(bmi) : null;
  const averageBmi = a > 0 ? getAverageBmi(a, gender) : null;

  return (
    <div>
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide" style={SG}>BMI Calculator</h2>
      <p className="mb-3 text-xs" style={{ color: C.muted }}>
        Not saved anywhere — calculated on your device only.
      </p>
      <div className="rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Age</label>
            <input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)}
              placeholder="30" className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: C.border, backgroundColor: C.raised, color: C.text }} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Gender</label>
            <select value={gender} onChange={(e) => setGender(e.target.value as any)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: C.border, backgroundColor: C.raised, color: C.text }}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Height (cm)</label>
            <input type="number" inputMode="numeric" value={heightCm} onChange={(e) => setHeightCm(e.target.value)}
              placeholder="175" className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: C.border, backgroundColor: C.raised, color: C.text }} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Weight (kg)</label>
            <input type="number" inputMode="numeric" value={weightKg} onChange={(e) => setWeightKg(e.target.value)}
              placeholder="75" className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: C.border, backgroundColor: C.raised, color: C.text }} />
          </div>
        </div>

        {bmi !== null && category && (
          <div className="mt-4 rounded-xl border px-4 py-3 text-center" style={{ borderColor: category.color, backgroundColor: `${category.color}15` }}>
            <p className="text-2xl font-bold" style={{ color: category.color, ...MO }}>{bmi.toFixed(1)}</p>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: category.color }}>{category.label}</p>
            <p className="mt-1 text-[11px]" style={{ color: C.muted }}>WHO healthy range is 18.5–24.9</p>
          </div>
        )}

        {bmi !== null && averageBmi !== null && (
          <div className="mt-3 flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: C.border, backgroundColor: C.raised }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>
                Avg. for {gender === 'other' ? 'adults' : gender === 'male' ? 'men' : 'women'} {ageToBracket(a)}
              </p>
              <p className="text-lg font-bold" style={{ color: C.text, ...MO }}>{averageBmi.toFixed(1)}</p>
            </div>
            <p className="max-w-[45%] text-right text-[11px]" style={{ color: C.muted }}>
              {bmi < averageBmi ? 'Below' : bmi > averageBmi ? 'Above' : 'Right at'} this population average
            </p>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: C.muted }}>
          BMI is a rough screening tool and doesn&apos;t account for muscle mass — strength athletes
          often score &quot;overweight&quot; despite being lean and fit. Use it as a general reference, not a verdict.
          Age/gender averages sourced from CDC/NHANES 2015–2016 population data.
        </p>
      </div>
    </div>
  );
}

function ProfileMenu({ username, onLogout, onPrivacy, allTimeStats }: { username: string; onLogout: () => void; onPrivacy: () => void; allTimeStats: AllTimeStats }) {
  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: C.bg }}>
      <header className="px-5 pt-6 pb-4">
        <p className="text-xs uppercase tracking-wider" style={{ color: C.muted }}>Account</p>
        <h1 className="text-2xl font-bold" style={SG}>{username}</h1>
      </header>

      <div className="px-5">
        <AllTimeStatsCard stats={allTimeStats} />
      </div>

      <div className="px-5 pt-6">
        <BMICalculator />
      </div>

      <div className="px-5 pt-6 flex flex-col gap-3">
        <button onClick={onPrivacy} className="flex w-full items-center justify-between rounded-2xl border py-4 px-5 text-sm font-bold" style={{ borderColor: C.border, color: C.text, backgroundColor: C.surface, ...SG }}>
          Privacy Policy
          <ChevronRight size={16} style={{ color: C.muted }} />
        </button>
        <button onClick={onLogout} className="w-full rounded-2xl border py-4 text-sm font-bold" style={{ borderColor: C.border, color: C.boss, backgroundColor: C.surface, ...SG }}>
          Log Out
        </button>
      </div>
    </div>
  );
}

// ─── Friends (step 1: invite codes, friend list, sharing controls, shared streak + level) ──
interface FriendSettingsData {
  friends_enabled: boolean; share_last_workout: boolean; allow_invites: boolean; allow_challenges: boolean;
  notify_invites: boolean; notify_challenges: boolean; notify_progress: boolean;
}
interface FriendEntry {
  friendship_id: string; friend_id: string; username: string; avatar_url: string | null;
  paused: boolean; quest_level: number | null; last_workout_hidden: boolean;
  last_workout: { completed_at: string; format: string; duration_minutes: number } | null;
  friends_level: number; friends_xp: number; level_min_xp: number | null; next_level_xp: number | null;
  current_streak: number; best_streak: number; timezone: string; since: string;
  me_trained_this_week: boolean; friend_trained_this_week: boolean;
}
interface FriendInviteRow { id: string; invited_email: string | null; status: string; created_at: string; expires_at: string; }
interface FriendConfirmRow { id: string; recipient_username: string; responded_at: string; confirm_expires_at: string; }
interface FriendReceivedRow { id: string; sender_username: string; status: string; responded_at: string; }
interface FriendsOverview {
  enabled: boolean; settings: FriendSettingsData; friends: FriendEntry[];
  sent_invites: FriendInviteRow[]; pending_confirmations: FriendConfirmRow[]; received_invites: FriendReceivedRow[];
  blocked: { user_id: string; username: string }[];
}

// All Friends texts in one place so the wording (or language) can be changed in one edit.
const FRIENDS_TEXT = {
  title: 'Friends',
  emptyTitle: 'Train together with a friend.',
  emptyBody: 'Send your first invite.',
  createInvite: 'Create invite code',
  emailLabel: 'Friend’s email (optional)',
  emailHelp: 'No email is sent by the app. If you add an email, only that verified email can accept the code. Send the code yourself.',
  haveCode: 'Have a code?',
  codePlaceholder: 'XXXX-XXXX-XXXX-XXXX',
  accept: 'Accept',
  decline: 'Decline',
  shareInfo: 'Once you accept, your friend can see: display name, avatar, your Quest level, your latest workout summary (if you allow it) and shared challenge data. Never your email, age, height, body weight, BMI or full history.',
  newWeek: 'New week, new shared step.',
  loadError: 'Couldn’t load Friends. Your old data is not shown as current.',
  retry: 'Try again',
} as const;

function friendsErrorText(raw: string | undefined): string {
  const m = raw ?? '';
  if (m.includes('daily_limit')) return 'You’ve reached today’s invite limit. Try again tomorrow.';
  if (m.includes('email_rate_limited')) return 'You already invited this email recently. Try again in a few days.';
  if (m.includes('duplicate_invite')) return 'You already have a pending invite for this email.';
  if (m.includes('invalid_email')) return 'That email address doesn’t look right.';
  if (m.includes('self_invite')) return 'You can’t invite yourself.';
  if (m.includes('friends_disabled')) return 'Friends is switched off. Turn it on in Friends settings first.';
  if (m.includes('invites_off')) return 'You’ve turned off new friend invites in Friends settings.';
  if (m.includes('wrong_account')) return 'This code is locked to a different verified email.';
  if (m.includes('already_friends')) return 'You are already friends.';
  if (m.includes('too_many_attempts')) return 'Too many tries. Please wait an hour and try again.';
  if (m.includes('confirmation_expired')) return 'This request expired. Ask your friend for a new code.';
  if (m.includes('invalid_request')) return 'This request is no longer available.';
  if (m.includes('invalid_code')) return 'That code isn’t valid. It may be wrong, used or expired.';
  return 'Something went wrong. Please try again.';
}

function FriendToggleRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button onClick={() => onChange(!value)} disabled={disabled} className="flex w-full items-center justify-between gap-3 py-3 text-left" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div>
        <p className="text-sm font-medium" style={{ color: C.text }}>{label}</p>
        {hint && <p className="text-xs" style={{ color: C.muted }}>{hint}</p>}
      </div>
      <div className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ backgroundColor: value ? C.xp : C.border }}>
        <div className="absolute top-0.5 h-5 w-5 rounded-full transition-all" style={{ left: value ? 22 : 2, backgroundColor: value ? '#04140A' : C.muted }} />
      </div>
    </button>
  );
}

function FriendCard({ friend, onEnd, onBlock }: { friend: FriendEntry; onEnd: () => void; onBlock: () => void }) {
  const initial = friend.username.slice(0, 1).toUpperCase();
  const isMax = friend.next_level_xp === null;
  const base = friend.level_min_xp ?? 0;
  const pct = isMax ? 100 : Math.max(0, Math.min(100, Math.round(((friend.friends_xp - base) / Math.max(1, (friend.next_level_xp ?? base + 1) - base)) * 100)));
  let weekText: string = FRIENDS_TEXT.newWeek;
  if (friend.me_trained_this_week && friend.friend_trained_this_week) weekText = 'You both trained this week. Nice teamwork!';
  else if (friend.me_trained_this_week) weekText = 'You’ve trained. Waiting for your friend.';
  else if (friend.friend_trained_this_week) weekText = 'Your friend has trained. Your turn!';
  let lastText = 'No workouts yet';
  if (friend.last_workout_hidden) lastText = 'Workout info is not shared';
  else if (friend.last_workout) {
    const d = new Date(friend.last_workout.completed_at);
    lastText = `Last workout: ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${friend.last_workout.format.toUpperCase()} · ${friend.last_workout.duration_minutes} min`;
  }

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
      <div className="flex items-center gap-3">
        {friend.avatar_url ? (
          <img src={friend.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold" style={{ backgroundColor: `${C.xp}22`, color: C.xp, ...SG }}>{initial}</div>
        )}
        <div className="flex-1">
          <p className="text-base font-bold" style={SG}>{friend.username}</p>
          {friend.paused ? (
            <p className="text-xs" style={{ color: C.muted }}>Has paused Friends</p>
          ) : (
            <p className="text-xs" style={{ color: C.muted }}>Quest Lv <span style={MO}>{friend.quest_level ?? '-'}</span></p>
          )}
        </div>
      </div>

      {!friend.paused && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs" style={{ color: C.muted }}>{lastText}</p>

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider" style={{ color: C.mobility }}>Friends Lv {friend.friends_level}</span>
              <span style={{ color: C.muted, ...MO }}>{isMax ? 'Max level' : `${friend.friends_xp} / ${friend.next_level_xp} XP`}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ backgroundColor: C.border }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: C.mobility }} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Flame size={16} color="#FF9D4D" fill="#FF9D4D" />
            <span className="text-sm font-semibold" style={MO}>{friend.current_streak}</span>
            <span className="text-xs" style={{ color: C.muted }}>week streak together · best {friend.best_streak}</span>
          </div>
          <p className="text-xs" style={{ color: C.text }}>{weekText}</p>
          <p className="text-[10px]" style={{ color: C.muted }}>Weeks run Monday to Sunday ({friend.timezone}).</p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button onClick={onEnd} className="flex-1 rounded-xl border py-2 text-xs font-bold" style={{ borderColor: C.border, color: C.muted, ...SG }}>End friendship</button>
        <button onClick={onBlock} className="flex-1 rounded-xl border py-2 text-xs font-bold" style={{ borderColor: C.border, color: C.boss, ...SG }}>Block</button>
      </div>
    </div>
  );
}

function FriendsScreen() {
  const [overview, setOverview] = useState<FriendsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<'main' | 'settings'>('main');
  const [email, setEmail] = useState('');
  const [createdCode, setCreatedCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [preview, setPreview] = useState<{ code: string; sender_username: string; email_bound: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'end' | 'block' | 'disable'; friend?: FriendEntry } | null>(null);
  const [levelUp, setLevelUp] = useState<string | null>(null);
  const levelsRef = React.useRef<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_friends_overview');
    if (error || !data) {
      setOverview(null);
      setLoadError(true);
      setLoading(false);
      return;
    }
    const ov = data as FriendsOverview;
    for (const f of ov.friends) {
      const prev = levelsRef.current[f.friendship_id];
      if (prev !== undefined && f.friends_level > prev) setLevelUp(`Level up! You and ${f.username} reached Friends Lv ${f.friends_level}.`);
      levelsRef.current[f.friendship_id] = f.friends_level;
    }
    setOverview(ov);
    setLoading(false);
  };

  React.useEffect(() => {
    load();
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const c = url.searchParams.get('friend');
      if (c) {
        setCodeInput(c);
        url.searchParams.delete('friend');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        checkCode(c);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, okText?: string) => {
    setBusy(true);
    setMessage(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setMessage({ text: friendsErrorText(error.message), ok: false }); return false; }
    if (okText) setMessage({ text: okText, ok: true });
    await load();
    return true;
  };

  const createInvite = async () => {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('create_friend_invite', { p_email: email.trim() === '' ? null : email.trim() });
    setBusy(false);
    if (error || !data) { setMessage({ text: friendsErrorText(error?.message), ok: false }); return; }
    setCreatedCode({ code: data.code, expires_at: data.expires_at });
    setEmail('');
    await load();
  };

  const inviteMessage = (c: { code: string; expires_at: string }) =>
    `Train with me on WODXP! Open this link and log in: ${typeof window !== 'undefined' ? window.location.origin : ''}/?friend=${encodeURIComponent(c.code)}  If the link doesn't open the invite, go to the Friends tab, tap "${FRIENDS_TEXT.haveCode}" and enter this code: ${c.code} (valid until ${new Date(c.expires_at).toLocaleDateString()}).`;

  const shareCode = async () => {
    if (!createdCode) return;
    const text = inviteMessage(createdCode);
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (!nav) return;
      if (typeof nav.share === 'function') { await nav.share({ text }); return; }
      await nav.clipboard.writeText(text);
      setMessage({ text: 'Invite text copied. Paste it into a message or email.', ok: true });
    } catch { /* share cancelled */ }
  };

  const checkCode = async (codeArg?: string) => {
    const code = codeArg ?? codeInput;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('preview_friend_invite', { p_code: code });
    setBusy(false);
    if (error) { setMessage({ text: friendsErrorText(error.message), ok: false }); return; }
    if (!data || data.error) { setMessage({ text: friendsErrorText(data?.error ?? 'invalid_code'), ok: false }); return; }
    setPreview({ code, sender_username: data.sender_username, email_bound: data.email_bound });
  };

  const respond = async (accept: boolean) => {
    if (!preview) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('respond_friend_invite', { p_code: preview.code, p_accept: accept });
    setBusy(false);
    if (error) { setMessage({ text: friendsErrorText(error.message), ok: false }); return; }
    if (data?.error) { setMessage({ text: friendsErrorText(data.error), ok: false }); setPreview(null); return; }
    setPreview(null);
    setCodeInput('');
    setMessage({ text: accept ? `Accepted. ${preview.sender_username} now needs to confirm before you become friends.` : 'Invite declined.', ok: accept });
    await load();
  };

  const confirmInvite = async (id: string, yes: boolean) => {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('confirm_friend_invite', { p_id: id, p_confirm: yes });
    setBusy(false);
    if (error) { setMessage({ text: friendsErrorText(error.message), ok: false }); await load(); return; }
    if (data?.error) { setMessage({ text: friendsErrorText(data.error), ok: false }); await load(); return; }
    setMessage({ text: yes ? 'You’re now friends!' : 'Request rejected. They will only see “Not accepted”.', ok: yes });
    await load();
  };

  const saveSettings = async (patch: Partial<FriendSettingsData>) => {
    if (!overview) return;
    const s = { ...overview.settings, ...patch };
    const supabase = createClient();
    await run(async () => supabase.rpc('update_friend_settings', {
      p_share_last_workout: s.share_last_workout, p_allow_invites: s.allow_invites, p_allow_challenges: s.allow_challenges,
      p_notify_invites: s.notify_invites, p_notify_challenges: s.notify_challenges, p_notify_progress: s.notify_progress,
    }));
  };

  const doConfirm = async () => {
    if (!confirm) return;
    const supabase = createClient();
    const c = confirm;
    setConfirm(null);
    if (c.kind === 'end' && c.friend) await run(async () => supabase.rpc('end_friendship', { p_friendship: c.friend!.friendship_id }), 'Friendship ended.');
    if (c.kind === 'block' && c.friend) await run(async () => supabase.rpc('block_friend_user', { p_user: c.friend!.friend_id }), `${c.friend.username} is blocked.`);
    if (c.kind === 'disable') await run(async () => supabase.rpc('set_friends_enabled', { p_enabled: false }), 'Friends is switched off.');
  };

  const statusLabel = (s: string) => ({ pending: 'Waiting', awaiting_confirmation: 'Accepted, waiting for your confirmation', accepted: 'Friends', declined: 'Not accepted', rejected: 'Rejected by you', revoked: 'Cancelled', expired: 'Expired', not_accepted: 'Not accepted' } as Record<string, string>)[s] ?? s;

  if (loading && !overview) {
    return (
      <div className="min-h-screen pb-24" style={{ backgroundColor: C.bg }}>
        <header className="px-5 pt-6 pb-4"><h1 className="text-2xl font-bold" style={SG}>{FRIENDS_TEXT.title}</h1></header>
        <p className="px-5 text-sm" style={{ color: C.muted }}>Loading...</p>
      </div>
    );
  }
  if (loadError || !overview) {
    return (
      <div className="min-h-screen pb-24" style={{ backgroundColor: C.bg }}>
        <header className="px-5 pt-6 pb-4"><h1 className="text-2xl font-bold" style={SG}>{FRIENDS_TEXT.title}</h1></header>
        <div className="mx-5 rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <p className="text-sm" style={{ color: C.text }}>{FRIENDS_TEXT.loadError}</p>
          <button onClick={load} className="mt-3 rounded-xl px-4 py-2 text-sm font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>{FRIENDS_TEXT.retry}</button>
        </div>
      </div>
    );
  }

  const confirmModal = confirm ? (
    <SafeModalShell onBackdropClick={() => setConfirm(null)}>
      <div className="w-full max-w-sm rounded-3xl border p-6 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
        <h2 className="text-lg font-bold" style={SG}>
          {confirm.kind === 'end' ? `End friendship with ${confirm.friend?.username}?` : confirm.kind === 'block' ? `Block ${confirm.friend?.username}?` : 'Switch off Friends?'}
        </h2>
        <p className="mt-2 text-sm" style={{ color: C.muted }}>
          {confirm.kind === 'end' && 'Your shared streak and Friends level are archived. Your own workouts and XP are not affected. Becoming friends again needs a new invite and starts at Friends Lv 1.'}
          {confirm.kind === 'block' && 'This ends the friendship and stops any new invites between you. Your own workouts and XP are not affected.'}
          {confirm.kind === 'disable' && 'Friends is paused for everyone. No one can see your Friends info or invite you. When you switch it back on, the shared streak restarts at 0 and your best streak and Friends level are kept.'}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button onClick={doConfirm} className="rounded-2xl py-3 text-sm font-bold" style={{ backgroundColor: C.boss, color: '#1A0A00', ...SG }}>
            {confirm.kind === 'end' ? 'End friendship' : confirm.kind === 'block' ? 'Block' : 'Switch off'}
          </button>
          <button onClick={() => setConfirm(null)} className="rounded-2xl border py-3 text-sm font-bold" style={{ borderColor: C.border, color: C.muted, ...SG }}>Cancel</button>
        </div>
      </div>
    </SafeModalShell>
  ) : null;

  const messageBox = message ? (
    <div className="mx-5 mt-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: message.ok ? C.xp : C.boss, color: C.text, backgroundColor: `${message.ok ? C.xp : C.boss}12` }}>
      {message.text}
    </div>
  ) : null;

  if (view === 'settings') {
    const s = overview.settings;
    return (
      <div className="min-h-screen pb-24" style={{ backgroundColor: C.bg }}>
        <header className="flex items-center gap-3 px-5 pt-6 pb-2">
          <button onClick={() => setView('main')} aria-label="Back" className="rounded-full border p-2" style={{ borderColor: C.border }}><ArrowLeft size={18} /></button>
          <h1 className="text-2xl font-bold" style={SG}>Friends settings</h1>
        </header>
        {messageBox}
        <div className="mx-5 mt-4 rounded-2xl border px-4 divide-y" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <FriendToggleRow label="Show my latest workout" hint="Off: friends see “Workout info is not shared”." value={s.share_last_workout} disabled={busy || !overview.enabled} onChange={(v) => saveSettings({ share_last_workout: v })} />
          <FriendToggleRow label="Allow new friend invites" value={s.allow_invites} disabled={busy || !overview.enabled} onChange={(v) => saveSettings({ allow_invites: v })} />
          <FriendToggleRow label="Allow new challenges from friends" hint="Used when challenges arrive. Accepted challenges are not affected." value={s.allow_challenges} disabled={busy || !overview.enabled} onChange={(v) => saveSettings({ allow_challenges: v })} />
          <FriendToggleRow label="Notify: invites" value={s.notify_invites} disabled={busy || !overview.enabled} onChange={(v) => saveSettings({ notify_invites: v })} />
          <FriendToggleRow label="Notify: challenges" value={s.notify_challenges} disabled={busy || !overview.enabled} onChange={(v) => saveSettings({ notify_challenges: v })} />
          <FriendToggleRow label="Notify: shared progress" value={s.notify_progress} disabled={busy || !overview.enabled} onChange={(v) => saveSettings({ notify_progress: v })} />
        </div>

        <div className="mx-5 mt-4 rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <p className="text-sm font-bold" style={SG}>{overview.enabled ? 'Friends is on' : 'Friends is off'}</p>
          <p className="mt-1 text-xs" style={{ color: C.muted }}>Friends is optional. Switching it off never costs you individual XP or streak.</p>
          {overview.enabled ? (
            <button onClick={() => setConfirm({ kind: 'disable' })} disabled={busy} className="mt-3 w-full rounded-xl border py-2.5 text-sm font-bold" style={{ borderColor: C.boss, color: C.boss, ...SG }}>Switch off Friends</button>
          ) : (
            <button onClick={() => run(async () => createClient().rpc('set_friends_enabled', { p_enabled: true }), 'Friends is switched on.')} disabled={busy} className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>Switch on Friends</button>
          )}
        </div>

        <div className="mx-5 mt-4 rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <p className="text-sm font-bold" style={SG}>Blocked people</p>
          {overview.blocked.length === 0 ? (
            <p className="mt-1 text-xs" style={{ color: C.muted }}>No one is blocked.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {overview.blocked.map((b) => (
                <li key={b.user_id} className="flex items-center justify-between">
                  <span className="text-sm">{b.username}</span>
                  <button onClick={() => run(async () => createClient().rpc('unblock_friend_user', { p_user: b.user_id }), `${b.username} is unblocked.`)} disabled={busy} className="rounded-lg border px-3 py-1 text-xs font-bold" style={{ borderColor: C.border, color: C.muted }}>Unblock</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {confirmModal}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: C.bg }}>
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold" style={SG}>{FRIENDS_TEXT.title}</h1>
        <button onClick={() => setView('settings')} className="rounded-full border px-3 py-1.5 text-xs font-bold" style={{ borderColor: C.border, color: C.muted, ...SG }}>Settings</button>
      </header>
      {messageBox}
      {levelUp && (
        <div className="mx-5 mt-3 flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold" style={{ borderColor: C.mobility, backgroundColor: `${C.mobility}15`, color: C.text, ...SG }}>
          <span>{levelUp}</span>
          <button onClick={() => setLevelUp(null)} aria-label="Dismiss" className="ml-3 text-xs" style={{ color: C.muted }}>OK</button>
        </div>
      )}

      {!overview.enabled ? (
        <div className="mx-5 mt-4 rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
          <p className="text-sm" style={{ color: C.text }}>Friends is switched off. Your friends can’t see anything from you and you can’t see them.</p>
          <button onClick={() => run(async () => createClient().rpc('set_friends_enabled', { p_enabled: true }), 'Friends is switched on.')} disabled={busy} className="mt-3 rounded-xl px-4 py-2 text-sm font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>Switch on Friends</button>
        </div>
      ) : (
        <>
          {overview.pending_confirmations.length > 0 && (
            <section className="px-5 pt-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: C.boss, ...SG }}>Needs your confirmation</h2>
              <div className="flex flex-col gap-3">
                {overview.pending_confirmations.map((c) => (
                  <div key={c.id} className="rounded-2xl border p-4" style={{ borderColor: C.boss, backgroundColor: `${C.boss}0F` }}>
                    <p className="text-sm" style={{ color: C.text }}><span className="font-bold">{c.recipient_username}</span> accepted your invite. Is this the right person?</p>
                    <p className="mt-1 text-xs" style={{ color: C.muted }}>Nothing is shared until you say yes. Valid until {new Date(c.confirm_expires_at).toLocaleDateString()}.</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => confirmInvite(c.id, true)} disabled={busy} className="flex-1 rounded-xl py-2.5 text-sm font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>Yes, right person</button>
                      <button onClick={() => confirmInvite(c.id, false)} disabled={busy} className="flex-1 rounded-xl border py-2.5 text-sm font-bold" style={{ borderColor: C.border, color: C.muted, ...SG }}>No</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="px-5 pt-4">
            {overview.friends.length === 0 ? (
              <div className="rounded-2xl border p-5 text-center" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                <p className="text-base font-bold" style={SG}>{FRIENDS_TEXT.emptyTitle}</p>
                <p className="mt-1 text-sm" style={{ color: C.muted }}>{FRIENDS_TEXT.emptyBody}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {overview.friends.map((f) => (
                  <FriendCard key={f.friendship_id} friend={f} onEnd={() => setConfirm({ kind: 'end', friend: f })} onBlock={() => setConfirm({ kind: 'block', friend: f })} />
                ))}
              </div>
            )}
          </section>

          <section className="px-5 pt-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={SG}>Add a friend</h2>
            <div className="rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
              <label className="text-xs" style={{ color: C.muted }}>{FRIENDS_TEXT.emailLabel}</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="friend@example.com"
                className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: C.border, color: C.text }} />
              <p className="mt-1 text-[11px]" style={{ color: C.muted }}>{FRIENDS_TEXT.emailHelp}</p>
              <button onClick={createInvite} disabled={busy} className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>{FRIENDS_TEXT.createInvite}</button>

              {createdCode && (
                <div className="mt-4 rounded-xl border p-3 text-center" style={{ borderColor: C.xp, backgroundColor: `${C.xp}0F` }}>
                  <p className="text-xs" style={{ color: C.muted }}>Send this code to your friend. It is shown only now.</p>
                  <p className="mt-1 text-xl font-bold tracking-widest" style={{ color: C.xp, ...MO }}>{createdCode.code}</p>
                  <p className="mt-1 text-[11px]" style={{ color: C.muted }}>Valid until {new Date(createdCode.expires_at).toLocaleDateString()}</p>
                  <button onClick={shareCode} className="mt-2 rounded-lg border px-4 py-1.5 text-xs font-bold" style={{ borderColor: C.border, color: C.text, ...SG }}>Share or copy invite text</button>
                </div>
              )}
            </div>

            <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: C.border, backgroundColor: C.surface }}>
              <p className="text-sm font-bold" style={SG}>{FRIENDS_TEXT.haveCode}</p>
              {!preview ? (
                <>
                  <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder={FRIENDS_TEXT.codePlaceholder} autoCapitalize="characters"
                    className="mt-2 w-full rounded-xl border bg-transparent px-3 py-2 text-sm uppercase outline-none" style={{ borderColor: C.border, color: C.text, ...MO }} />
                  <button onClick={() => checkCode()} disabled={busy || codeInput.trim().length < 4} className="mt-2 w-full rounded-xl border py-2.5 text-sm font-bold" style={{ borderColor: C.border, color: C.text, opacity: codeInput.trim().length < 4 ? 0.5 : 1, ...SG }}>Check code</button>
                </>
              ) : (
                <div className="mt-2">
                  <p className="text-sm" style={{ color: C.text }}><span className="font-bold">{preview.sender_username}</span> wants to be your training friend.</p>
                  <p className="mt-2 text-xs" style={{ color: C.muted }}>{FRIENDS_TEXT.shareInfo}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => respond(true)} disabled={busy} className="flex-1 rounded-xl py-2.5 text-sm font-bold" style={{ backgroundColor: C.xp, color: '#04140A', ...SG }}>{FRIENDS_TEXT.accept}</button>
                    <button onClick={() => respond(false)} disabled={busy} className="flex-1 rounded-xl border py-2.5 text-sm font-bold" style={{ borderColor: C.border, color: C.muted, ...SG }}>{FRIENDS_TEXT.decline}</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {overview.sent_invites.length > 0 && (
            <section className="px-5 pt-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={SG}>Sent invites</h2>
              <ul className="flex flex-col gap-2">
                {overview.sent_invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                    <div>
                      <p className="text-sm" style={{ color: C.text }}>{i.invited_email ?? 'Open code'}</p>
                      <p className="text-[11px]" style={{ color: C.muted }}>{statusLabel(i.status)} · {new Date(i.created_at).toLocaleDateString()}</p>
                    </div>
                    {i.status === 'pending' && (
                      <button onClick={() => run(async () => createClient().rpc('revoke_friend_invite', { p_id: i.id }), 'Invite cancelled.')} disabled={busy} className="rounded-lg border px-3 py-1 text-xs font-bold" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {overview.received_invites.length > 0 && (
            <section className="px-5 pt-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={SG}>Invites you answered</h2>
              <ul className="flex flex-col gap-2">
                {overview.received_invites.map((r) => (
                  <li key={r.id} className="rounded-xl border px-4 py-3" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                    <p className="text-sm" style={{ color: C.text }}>{r.sender_username}</p>
                    <p className="text-[11px]" style={{ color: C.muted }}>{r.status === 'awaiting_confirmation' ? `Waiting for ${r.sender_username} to confirm` : statusLabel(r.status)} · {new Date(r.responded_at).toLocaleDateString()}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {confirmModal}
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
type Tab = 'home' | 'exercises' | 'wodxp' | 'friends' | 'stats' | 'profile';
type Screen = 'tab' | 'generator' | 'safety' | 'workout' | 'complete' | 'challenge' | 'boss' | 'challenge-result' | 'boss-result' | 'wod-detail' | 'wod-result';

/** Depth ranking per screen, used by PageTransition to infer forward vs
 *  back navigation direction without touching every setScreen() call site. */
const SCREEN_DEPTH: Record<string, number> = {
  tab: 0,
  generator: 1, challenge: 1, boss: 1, 'wod-detail': 1,
  safety: 2, 'challenge-result': 2, 'boss-result': 2, 'wod-result': 2,
  workout: 3,
  complete: 4,
};

export default function AppClient({ user, stats: initialStats, exercises: initialExercises, allTimeStats: initialAllTimeStats, levelChallenges, bossBattles, totalExerciseCount, classicWods, wodSummary: initialWodSummary, wodMedals }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('home');
  const [screen, setScreen] = useState<Screen>('tab');
  const [sessionExercises, setSessionExercises] = useState<Exercise[]>([]);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(20);
  const [lastXP, setLastXP] = useState(0);
  const [sessionLevelUps, setSessionLevelUps] = useState<{ attribute: string; level: number }[]>([]);
  const [sessionStreakMessage, setSessionStreakMessage] = useState<string | null>(null);
  const [sessionNewlyUnlocked, setSessionNewlyUnlocked] = useState(0);
  const [sessionUnlockedChallenge, setSessionUnlockedChallenge] = useState<{ name: string; isBoss: boolean } | null>(null);
  const [xpCapped, setXpCapped] = useState(false);
  const [challengeXpEarned, setChallengeXpEarned] = useState(0);
  const [bossResult, setBossResult] = useState<{ passed: boolean; medal: string | null; xpReward: number } | null>(null);
  const [stats, setStats] = useState(initialStats);
  const [allTimeStats, setAllTimeStats] = useState(initialAllTimeStats);
  const [exercises, setExercises] = useState(initialExercises);
  const [wodSummary, setWodSummary] = useState(initialWodSummary);
  const [wodMedalsState, setWodMedalsState] = useState(wodMedals);
  const [selectedWod, setSelectedWod] = useState<ClassicWod | null>(null);
  const [wodResult, setWodResult] = useState<{ medal: string | null; scoreValue: number } | null>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('friend')) setTab('friends');
  }, []);

  const refreshWodSummary = async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc('get_wod_summary', { p_user_id: user.id });
    const row = data?.[0];
    if (row) setWodSummary({ completed: row.completed ?? 0, gold: row.gold ?? 0, silver: row.silver ?? 0, bronze: row.bronze ?? 0 });

    const { data: medalRows } = await supabase.rpc('get_user_wod_medals', { p_user_id: user.id });
    if (medalRows) {
      setWodMedalsState(Object.fromEntries(medalRows.map((r: { wod_slot: number; medal: string }) => [r.wod_slot, r.medal])));
    }
  };

  const refreshStats = async () => {
    const supabase = createClient();
    const { data } = await supabase.from('user_stats').select('*').eq('user_id', user.id).single();
    if (data) setStats(data);
    return data;
  };

  // Movements unlocked (the `exercises` list) are filtered server-side by
  // attribute level at page load — like All-Time Stats, they'd stay frozen
  // after a workout unless explicitly refetched. Returns how many NEW
  // exercises became available compared to the current list, so the caller
  // can show a "you unlocked new movements" popup when it's > 0.
  const refreshExercises = async (newMaxLevel: number) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .lte('unlock_level', newMaxLevel)
      .order('unlock_level', { ascending: true });
    const newCount = data ? data.length - exercises.length : 0;
    if (data) setExercises(data);
    return Math.max(0, newCount);
  };

  // All-Time Stats (time trained, kg lifted, workouts completed) are only
  // fetched server-side on initial page load — without this, they'd stay
  // frozen at whatever they were when the page loaded, even after
  // finishing a new workout in the same session.
  const refreshAllTimeStats = async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc('get_alltime_stats', { p_user_id: user.id });
    const row = data?.[0];
    if (row) {
      setAllTimeStats({
        totalWorkouts: row.total_workouts ?? 0,
        totalKg: row.total_kg ?? 0,
        totalSeconds: row.total_seconds ?? 0,
      });
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleFinish = async (requestedXp: number, grantedXp: number) => {
    setLastXP(grantedXp);
    setXpCapped(grantedXp < requestedXp);
    const supabase = createClient();
    const previousStats = stats;
    const { data } = await supabase.from('user_stats').select('*').eq('user_id', user.id).single();
    if (data) {
      setStats(data);
      const popups = detectSessionPopups(previousStats, data);
      setSessionLevelUps(popups.levelUps);
      setSessionStreakMessage(popups.streakMessage);

      // Detect a Level Challenge / Boss Battle transitioning from locked to
      // unlocked as a result of this workout's XP (separate from the
      // "new exercises unlocked" check below — this is about the Quest Lv
      // gated content, not the attribute-based exercise library).
      const previousProgress = getLevelProgress(previousStats, levelChallenges, bossBattles);
      const newProgress = getLevelProgress(data, levelChallenges, bossBattles);
      if (!previousProgress.isUnlocked && newProgress.isUnlocked) {
        if (newProgress.isBossPending && newProgress.boss) {
          setSessionUnlockedChallenge({ name: newProgress.boss.name, isBoss: true });
        } else if (newProgress.challenge) {
          setSessionUnlockedChallenge({ name: newProgress.challenge.name, isBoss: false });
        } else {
          setSessionUnlockedChallenge(null);
        }
      } else {
        setSessionUnlockedChallenge(null);
      }

      const newMaxLevel = Math.max(data.level_strength, data.level_mobility, data.level_conditioning);
      const newlyUnlocked = await refreshExercises(newMaxLevel);
      setSessionNewlyUnlocked(newlyUnlocked);
    } else {
      setSessionLevelUps([]);
      setSessionStreakMessage(null);
      setSessionNewlyUnlocked(0);
      setSessionUnlockedChallenge(null);
    }
    await refreshAllTimeStats();
    setScreen('complete');
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'exercises', label: 'Exercises' },
    { key: 'wodxp', label: 'WOD XP' },
    { key: 'friends', label: 'Friends' },
    { key: 'stats', label: 'Stats' },
    { key: 'profile', label: 'Profile' },
  ];

  const GlobalStyle = () => <style>{neonIconStyles}{illustrationStyles}</style>;

  if (screen === 'challenge') {
    const progress = getLevelProgress(stats, levelChallenges, bossBattles);
    if (!progress.challenge) { setScreen('tab'); return null; }
    return (
      <>
        <GlobalStyle />
        <PageTransition screenKey={screen}>
          <LevelChallengeScreen challenge={progress.challenge} exercises={exercises} userId={user.id} onBack={() => setScreen('tab')}
            onComplete={async (xp) => { setChallengeXpEarned(xp); await refreshStats(); setScreen('challenge-result'); }}
            onFail={() => setScreen('tab')} />
        </PageTransition>
      </>
    );
  }
  if (screen === 'challenge-result') return (
    <>
      <GlobalStyle />
      <PageTransition screenKey={screen}>
        <ChallengeResultScreen xpEarned={challengeXpEarned} onHome={() => { setScreen('tab'); setTab('home'); }} />
      </PageTransition>
    </>
  );
  if (screen === 'boss') {
    const progress = getLevelProgress(stats, levelChallenges, bossBattles);
    if (!progress.boss) { setScreen('tab'); return null; }
    return (
      <>
        <GlobalStyle />
        <PageTransition screenKey={screen}>
          <BossBattleScreen boss={progress.boss} exercises={exercises} userId={user.id} onBack={() => setScreen('tab')}
            onComplete={async (result) => { setBossResult(result); await refreshStats(); setScreen('boss-result'); }} />
        </PageTransition>
      </>
    );
  }
  if (screen === 'boss-result' && bossResult) {
    const progress = getLevelProgress(stats, levelChallenges, bossBattles);
    return (
      <>
        <GlobalStyle />
        <PageTransition screenKey={screen}>
          <BossResultScreen result={bossResult} bossName={progress.boss?.name ?? bossBattles.find((b) => b.level === stats.level)?.name ?? 'Boss'} onHome={() => { setScreen('tab'); setTab('home'); }} />
        </PageTransition>
      </>
    );
  }
  if (screen === 'wod-detail' && selectedWod) return (
    <>
      <GlobalStyle />
      <PageTransition screenKey={screen}>
        <WodDetailScreen wod={selectedWod} exercises={exercises} userId={user.id} onBack={() => setScreen('tab')}
          onComplete={async (result) => { setWodResult(result); await refreshWodSummary(); setScreen('wod-result'); }} />
      </PageTransition>
    </>
  );
  if (screen === 'wod-result' && wodResult && selectedWod) return (
    <>
      <GlobalStyle />
      <PageTransition screenKey={screen}>
        <WodResultScreen result={wodResult} wod={selectedWod} onHome={() => { setScreen('tab'); setTab('wodxp'); }} />
      </PageTransition>
    </>
  );
  if (screen === 'generator') return (
    <>
      <GlobalStyle />
      <PageTransition screenKey={screen}>
        <GeneratorScreen exercises={exercises} totalExerciseCount={totalExerciseCount} onBack={() => setScreen('tab')}
          onStart={(exs, durationMinutes) => {
            setSessionExercises(exs);
            setSessionDurationMinutes(durationMinutes);
            const skip = typeof window !== 'undefined' && window.localStorage.getItem('wodxp_skip_safety_notice') === '1';
            setScreen(skip ? 'workout' : 'safety');
          }} />
      </PageTransition>
    </>
  );
  if (screen === 'safety') return (
    <>
      <GlobalStyle />
      <PageTransition screenKey={screen}>
        <SafetyNoticeScreen onBack={() => setScreen('generator')} onContinue={() => setScreen('workout')} />
      </PageTransition>
    </>
  );
  if (screen === 'workout') return (
    <>
      <GlobalStyle />
      <PageTransition screenKey={screen}>
        <WorkoutScreen exercises={sessionExercises} userId={user.id} durationMinutes={sessionDurationMinutes}
          onBack={() => setScreen('tab')} onFinish={handleFinish} />
      </PageTransition>
    </>
  );
  if (screen === 'complete') return (
    <>
      <GlobalStyle />
      <PageTransition screenKey={screen}>
        <CompleteScreen xpEarned={lastXP} levelUps={sessionLevelUps} streakMessage={sessionStreakMessage} newlyUnlocked={sessionNewlyUnlocked} unlockedChallenge={sessionUnlockedChallenge} xpCapped={xpCapped} onHome={() => { setScreen('tab'); setTab('home'); }} />
      </PageTransition>
    </>
  );

  let content: React.ReactNode = null;
  if (tab === 'home') content = (
    <HomeScreen
      user={user} stats={stats} onGenerate={() => setScreen('generator')}
      onChallenge={() => setScreen('challenge')} onBoss={() => setScreen('boss')}
      levelChallenges={levelChallenges} bossBattles={bossBattles}
      unlockedCount={exercises.length} totalCount={totalExerciseCount}
    />
  );
  else if (tab === 'wodxp') content = <WodXpScreen stats={stats} classicWods={classicWods} summary={wodSummary} wodMedals={wodMedalsState} onOpenWod={(wod) => { setSelectedWod(wod); setScreen('wod-detail'); }} />;
  else if (tab === 'friends') content = <FriendsScreen />;
  else if (tab === 'exercises') content = <ExercisesScreen exercises={exercises} />;
  else if (tab === 'stats') content = <StatsScreen stats={stats} />;
  else if (tab === 'profile') content = <ProfileMenu username={user.username} onLogout={handleLogout} onPrivacy={() => router.push('/privacy')} allTimeStats={allTimeStats} />;

  return (
    <div style={{ backgroundColor: C.bg }}>
      <GlobalStyle />
      <PageTransition screenKey={tab}>
        {content}
      </PageTransition>
      <nav className="fixed bottom-0 left-0 right-0 flex items-center justify-around border-t px-2 py-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
        {tabs.map((t) => {
          const activeColor = t.key === 'wodxp' ? C.conditioning : C.xp;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="flex flex-col items-center gap-1 px-3 py-1" style={{ color: tab === t.key ? activeColor : C.muted }}>
              <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tab === t.key ? activeColor : 'transparent', boxShadow: tab === t.key ? `0 0 6px ${activeColor}` : 'none' }} />
              <span className="text-[10px] font-medium uppercase tracking-wide">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
