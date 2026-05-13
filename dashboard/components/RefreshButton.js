'use client';

import { RefreshCw } from 'lucide-react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

export const RefreshButton = ({ action = '' }) => {
  const { t } = useDashboardLanguage();

  return (
    <form action={action}>
      <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 shadow-lg shadow-black/10 transition hover:border-emerald-300/20 hover:bg-white/[0.07] hover:text-white">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t('buttons.refresh')}
      </button>
    </form>
  );
};
