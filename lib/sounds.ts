// UI sounds (button click, level up / new unlocks, timer end). Files live in /public/sounds.
// Browsers only allow audio after a tap, so the first tap "unlocks" the sounds. Everything fails silently.
export type SoundName = 'click' | 'levelUp' | 'timerEnd';

const FILES: Record<SoundName, string> = {
  click: '/sounds/click.mp3',
  levelUp: '/sounds/level-up.mp3',
  timerEnd: '/sounds/timer-end.mp3',
};
const VOLUME: Record<SoundName, number> = { click: 0.5, levelUp: 0.8, timerEnd: 0.9 };
const KEY = 'wodxp_sound_off';

const cache: Partial<Record<SoundName, HTMLAudioElement>> = {};

function el(name: SoundName): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  let a = cache[name];
  if (!a) {
    a = new Audio(FILES[name]);
    a.preload = 'auto';
    cache[name] = a;
  }
  return a;
}

export function soundEnabled(): boolean {
  try { return window.localStorage.getItem(KEY) !== '1'; } catch { return true; }
}

export function setSoundEnabled(on: boolean): void {
  try { if (on) window.localStorage.removeItem(KEY); else window.localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
}

/** Plays a sound. Returns true if playback was started (false if off or blocked). */
export function playSound(name: SoundName): Promise<boolean> {
  try {
    if (!soundEnabled()) return Promise.resolve(false);
    const a = el(name);
    if (!a) return Promise.resolve(false);
    a.volume = VOLUME[name];
    a.currentTime = 0;
    const p = a.play();
    return p ? p.then(() => true).catch(() => false) : Promise.resolve(true);
  } catch { return Promise.resolve(false); }
}

/** Call once on the first tap: plays each file silently so iOS lets later (timer) sounds through. */
export function unlockSounds(): void {
  (Object.keys(FILES) as SoundName[]).forEach((n) => {
    const a = el(n);
    if (!a) return;
    try {
      a.muted = true;
      const p = a.play();
      const done = () => { a.pause(); a.currentTime = 0; a.muted = false; };
      if (p) p.then(done).catch(() => { a.muted = false; }); else done();
    } catch { /* ignore */ }
  });
}

/** Document-wide: a click sound on every enabled button, and the first tap unlocks audio. */
export function installClickSounds(): () => void {
  let unlocked = false;
  const onDown = (e: Event) => {
    if (!unlocked) { unlocked = true; unlockSounds(); return; } // the unlocking tap itself stays silent
    const b = (e.target as HTMLElement | null)?.closest?.('button');
    if (b && !(b as HTMLButtonElement).disabled) void playSound('click');
  };
  document.addEventListener('pointerdown', onDown, true);
  return () => document.removeEventListener('pointerdown', onDown, true);
}
