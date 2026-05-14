'use client';

import { RefreshCw } from 'lucide-react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const RefreshButton = ({ action = '' }) => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <form action={action}>
      <button className={[
        'inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg transition',
        isLight
          ? 'border-slate-200 bg-white text-slate-700 shadow-slate-200/60 hover:border-emerald-200 hover:bg-emerald-50 hover:text-slate-950'
          : 'border-white/10 bg-white/[0.04] text-slate-200 shadow-black/10 hover:border-emerald-300/20 hover:bg-white/[0.07] hover:text-white'
      ].join(' ')}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t('buttons.refresh')}
      </button>
    </form>
  );
};
