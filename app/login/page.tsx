'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const C = {
  bg: '#0D0D0D', surface: '#1A1A1A', border: '#444444',
  text: '#EDEDED', muted: '#9A9A9A', xp: '#A8FF00', error: '#FF6A00',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center px-6"
      style={{ backgroundColor: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon-512.png" alt="WODXP" className="mx-auto mb-4 h-28 w-28 rounded-3xl" />
          <h1 className="mt-2 text-3xl font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Welcome back
          </h1>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            Log in to continue your training quest.
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider" style={{ color: C.muted }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors"
              style={{ borderColor: C.border, backgroundColor: C.surface, color: C.text }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider" style={{ color: C.muted }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors"
              style={{ borderColor: C.border, backgroundColor: C.surface, color: C.text }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: C.error }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center rounded-2xl py-4 text-lg font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: C.xp, color: '#0D0D0D', fontFamily: "'Oswald', sans-serif" }}
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: C.muted }}>
          New here?{' '}
          <a href="/signup" className="font-semibold" style={{ color: C.xp }}>
            Create an account
          </a>
        </p>
        <p className="mt-4 text-center text-xs" style={{ color: C.muted }}>
          <a href="/terms" className="underline">Terms</a>
          {' · '}
          <a href="/privacy" className="underline">Privacy</a>
        </p>
      </div>
    </div>
  );
}
