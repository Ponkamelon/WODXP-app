// UI sounds (button click, level up / new unlocks, timer end). Files live in /public/sounds.
// The sounds must MIX with the user's music/podcasts instead of interrupting them:
//  - iOS: navigator.audioSession.type = 'ambient' (mixes with other audio, follows the silent switch).
//  - Sounds play through the Web Audio API (decoded buffers), which does not take over audio focus like an <audio> element.
// Browsers only allow audio after a tap, so the first tap "unlocks" it. Everything fails silently.
export type SoundName = 'click' | 'levelUp' | 'timerEnd';

const FILES: Record<SoundName, string> = {
  click: '/sounds/click.mp3',
  levelUp: '/sounds/level-up.mp3',
  timerEnd: '/sounds/timer-end.mp3',
};
const VOLUME: Record<SoundName, number> = { click: 0.5, levelUp: 0.8, timerEnd: 0.9 };
const KEY = 'wodxp_sound_off';

let ctx: AudioContext | null = null;
const buffers: Partial<Record<SoundName, AudioBuffer>> = {};
const loading: Partial<Record<SoundName, Promise<AudioBuffer | null>>> = {};

/** Ask iOS to mix with other audio. Safe to call repeatedly; ignored where unsupported. */
export function setAmbientAudio(): void {
  try {
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (s && s.type !== 'ambient') s.type = 'ambient';
  } catch { /* unsupported */ }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  try {
    setAmbientAudio();
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch { ctx = null; }
  return ctx;
}

function load(name: SoundName): Promise<AudioBuffer | null> {
  const c = getCtx();
  if (!c) return Promise.resolve(null);
  if (buffers[name]) return Promise.resolve(buffers[name] as AudioBuffer);
  if (!loading[name]) {
    loading[name] = fetch(FILES[name])
      .then((r) => r.arrayBuffer())
      .then((data) => new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(data, res, rej)))
      .then((b) => { buffers[name] = b; return b; })
      .catch(() => { delete loading[name]; return null; });
  }
  return loading[name] as Promise<AudioBuffer | null>;
}

export function soundEnabled(): boolean {
  try { return window.localStorage.getItem(KEY) !== '1'; } catch { return true; }
}

export function setSoundEnabled(on: boolean): void {
  try { if (on) window.localStorage.removeItem(KEY); else window.localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
}

/** Plays a sound. Resolves true if playback started (false if off or blocked). */
export async function playSound(name: SoundName): Promise<boolean> {
  try {
    if (!soundEnabled()) return false;
    const c = getCtx();
    if (!c) return false;
    setAmbientAudio();
    if (c.state === 'suspended') await c.resume();
    const buf = buffers[name] ?? (await load(name));
    if (!buf || c.state !== 'running') return false;
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = VOLUME[name];
    src.buffer = buf;
    src.connect(gain); gain.connect(c.destination);
    src.start();
    return true;
  } catch { return false; }
}

/** First tap: start the audio context and preload the files, so later (timer) sounds are allowed. */
export function unlockSounds(): void {
  const c = getCtx();
  if (!c) return;
  try { void c.resume(); } catch { /* ignore */ }
  (Object.keys(FILES) as SoundName[]).forEach((n) => { void load(n); });
}

/** Document-wide: a click sound on every enabled button, and the first tap unlocks audio. */
export function installClickSounds(): () => void {
  setAmbientAudio();
  let unlocked = false;
  const onDown = (e: Event) => {
    if (!unlocked) { unlocked = true; unlockSounds(); return; } // the unlocking tap itself stays silent
    const b = (e.target as HTMLElement | null)?.closest?.('button');
    if (b && !(b as HTMLButtonElement).disabled) void playSound('click');
  };
  document.addEventListener('pointerdown', onDown, true);
  return () => document.removeEventListener('pointerdown', onDown, true);
}
