'use client';

import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { Moon, Sun } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const ThemeToggle = ({ compact = false }) => {
  const { tx } = useDashboardLanguage();
  const { theme, toggleTheme } = useDashboardTheme();
  const isDark = theme === 'dark';
  const isLight = theme === 'light';

  return (
    <button data-theme-toggle
      type="button"
      onClick={toggleTheme}
      className={[
        'inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold shadow-lg backdrop-blur transition',
        isLight
          ? 'border-slate-200 bg-white text-slate-700 shadow-slate-200/70 hover:bg-slate-50 hover:text-slate-950'
          : 'border-white/10 bg-[#0b1019]/80 text-slate-300 shadow-black/15 hover:bg-white/[0.08] hover:text-white'
      ].join(' ')}
      title={tx(isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro')}
      aria-label={tx(isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro')}
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
      <span className={compact ? 'sr-only' : undefined}>{tx(isDark ? 'Oscuro' : 'Claro')}</span>
    </button>
  );
};
