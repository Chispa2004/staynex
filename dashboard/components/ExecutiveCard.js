'use client';

import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const ExecutiveCard = ({ children, className = '', interactive = false }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section
      className={[
        'rounded-xl border shadow-xl transition',
        interactive ? 'hover:-translate-y-0.5 hover:shadow-2xl' : '',
        isLight
          ? 'border-slate-200 bg-white text-slate-950 shadow-slate-200/70'
          : 'border-white/10 bg-[#0b1019]/90 text-slate-100 shadow-black/20',
        className
      ].join(' ')}
    >
      {children}
    </section>
  );
};

export const ExecutiveBadge = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tones = {
    emerald: isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
    sky: isLight ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-sky-300/20 bg-sky-400/10 text-sky-100',
    amber: isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    red: isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100',
    violet: isLight ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-violet-300/20 bg-violet-400/10 text-violet-100',
    slate: isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-white/10 bg-white/[0.045] text-slate-300'
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
};
