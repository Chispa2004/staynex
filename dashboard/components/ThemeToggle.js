'use client';

import { Moon, Sun } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useDashboardTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#0b1019]/80 px-2.5 text-xs font-semibold text-slate-300 shadow-lg shadow-black/15 backdrop-blur transition hover:bg-white/[0.08] hover:text-white"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className={[
        'flex h-6 w-6 items-center justify-center rounded-md transition',
        isDark ? 'bg-emerald-300 text-slate-950' : 'bg-amber-300 text-amber-950'
      ].join(' ')}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Sun className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </span>
      {isDark ? 'Dark' : 'Light'}
    </button>
  );
};
