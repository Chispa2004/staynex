'use client';

import { Lock, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const LoginClient = () => {
  const router = useRouter();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let active = true;

    if (!supabase) {
      setError('Supabase Auth is not configured.');
      setCheckingSession(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) {
        return;
      }

      if (sessionError) {
        console.error('Login session lookup failed', sessionError);
        setCheckingSession(false);
        return;
      }

      if (data.session) {
        setCheckingSession(false);
        router.replace('/dashboard');
        return;
      }

      setCheckingSession(false);
    });

    return () => {
      active = false;
    };
  }, [router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getSupabaseBrowser();

    if (!supabase) {
      setError('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.replace('/dashboard');
    setLoading(false);
  };

  return (
    <main className={[
      'flex h-dvh items-center justify-center overflow-y-auto px-4 py-10',
      isLight ? 'bg-slate-50 text-slate-950' : 'bg-[#070b12] text-white'
    ].join(' ')}
    >
      <section className={[
        'w-full max-w-md rounded-lg border p-6 shadow-2xl',
        isLight
          ? 'border-slate-200 bg-white shadow-slate-200/80'
          : 'border-white/10 bg-[#0b1019]/95 shadow-black/30'
      ].join(' ')}
      >
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-300 text-base font-black text-slate-950">
            S
          </div>
          <div>
            <h1 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>
              Staynex
            </h1>
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>
              Hotel operations dashboard
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Secure access
          </p>
          <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>
            Login
          </h2>
          <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-400'}>
            Access Staynex with your Supabase Auth account.
          </p>
        </div>

        {error ? (
          <div className={isLight ? 'mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800' : 'mb-4 rounded-lg border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100'}>
            {error}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className={isLight ? 'mb-2 block text-sm font-medium text-slate-700' : 'mb-2 block text-sm font-medium text-slate-300'}>
              Email
            </span>
            <span className={isLight ? 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500' : 'flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-slate-500'}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className={isLight ? 'min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400' : 'min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600'}
                placeholder="you@hotel.com"
              />
            </span>
          </label>

          <label className="block">
            <span className={isLight ? 'mb-2 block text-sm font-medium text-slate-700' : 'mb-2 block text-sm font-medium text-slate-300'}>
              Password
            </span>
            <span className={isLight ? 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500' : 'flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-slate-500'}>
              <Lock className="h-4 w-4" aria-hidden="true" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                className={isLight ? 'min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400' : 'min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600'}
                placeholder="••••••••"
              />
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || checkingSession}
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-emerald-200/50 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkingSession ? 'Checking session...' : loading ? 'Entering...' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  );
};
