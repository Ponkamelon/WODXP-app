'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MIN_AGE, TERMS_VERSION, isOldEnough, isValidBirthYear } from '@/lib/legal';

// Set when someone enters an age under the limit, so changing the year and
// trying again on the same device does not get around the check.
const AGE_BLOCK_KEY = 'wodxp_age_blocked';

const C = {
  bg: '#0D0D0D', surface: '#1A1A1A', border: '#444444',
  text: '#EDEDED', muted: '#9A9A9A', xp: '#A8FF00', error: '#FF6A00',
};

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [birthYear, setBirthYear] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [ageBlocked, setAgeBlocked] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(AGE_BLOCK_KEY)) setAgeBlocked(true);
    } catch {
      // Storage can be unavailable (private mode); the check still runs on submit.
    }
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const year = Number(birthYear);
    if (!isValidBirthYear(year)) {
      setError('Please enter a valid year of birth, for example 1995.');
      return;
    }
    if (!isOldEnough(year)) {
      try {
        localStorage.setItem(AGE_BLOCK_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      setEmail('');
      setPassword('');
      setUsername('');
      setBirthYear('');
      setAgeBlocked(true);
      return;
    }
    if (!accepted) {
      setError('Please accept the Terms of Service and the Privacy Policy to continue.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // The year of birth is deliberately NOT sent or stored. Only the fact that
    // the age limit was confirmed, and which terms version was accepted, is saved.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          age_confirmed: true,
          min_age: MIN_AGE,
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError('Account created! Please log in.');
      router.push('/login');
      return;
    }

    router.push('/');
    router.refresh();
  };

  if (ageBlocked) {
    return (
      <div
        className="flex min-h-screen w-full flex-col items-center justify-center px-6"
        style={{ backgroundColor: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}
      >
        <div className="w-full max-w-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: C.xp, fontFamily: "'Oswald', sans-serif" }}>WODXP</p>
          <h1 className="mt-2 text-3xl font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>
            See you in a few years
          </h1>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: C.muted }}>
            WODXP is for people aged {MIN_AGE} and older, so we can&apos;t create an account for you right now.
            Come back when you&apos;re {MIN_AGE}. Your quest will be waiting.
          </p>
          <p className="mt-6 text-sm" style={{ color: C.muted }}>
            Already have an account?{' '}
            <a href="/login" className="font-semibold" style={{ color: C.xp }}>Log in</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center px-6"
      style={{ backgroundColor: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: C.xp, fontFamily: "'Oswald', sans-serif" }}>WODXP</p>
          <h1 className="mt-2 text-3xl font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Start your quest
          </h1>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            Create an account and begin levelling up.
          </p>
        </div>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          {[
            { label: 'Username', value: username, set: setUsername, type: 'text', placeholder: 'YourHeroName' },
            { label: 'Email', value: email, set: setEmail, type: 'email', placeholder: 'you@example.com' },
            { label: 'Password', value: password, set: setPassword, type: 'password', placeholder: '••••••••' },
          ].map(({ label, value, set, type, placeholder }) => (
            <div key={label}>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider" style={{ color: C.muted }}>
                {label}
              </label>
              <input
                type={type}
                required
                value={value}
                onChange={(e) => set(e.target.value)}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                style={{ borderColor: C.border, backgroundColor: C.surface, color: C.text }}
                placeholder={placeholder}
              />
            </div>
          ))}

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider" style={{ color: C.muted }}>
              Year of birth
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ borderColor: C.border, backgroundColor: C.surface, color: C.text }}
              placeholder="YYYY"
              autoComplete="bday-year"
            />
            <p className="mt-1.5 text-xs" style={{ color: C.muted }}>
              Used only to check the age limit. We don&apos;t store it.
            </p>
          </div>

          <label className="flex items-start gap-3 text-xs leading-relaxed" style={{ color: C.muted }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ accentColor: C.xp }}
            />
            <span>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: C.xp }}>Terms of Service</a>
              {' '}and the{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: C.xp }}>Privacy Policy</a>.
            </span>
          </label>

          {error && <p className="text-sm" style={{ color: C.error }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-2xl py-4 text-lg font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: C.xp, color: '#0D0D0D', fontFamily: "'Oswald', sans-serif" }}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: C.muted }}>
          Already have an account?{' '}
          <a href="/login" className="font-semibold" style={{ color: C.xp }}>Log in</a>
        </p>
      </div>
    </div>
  );
}
