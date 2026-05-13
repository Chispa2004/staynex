'use client';

import { DASHBOARD_LANGUAGES } from '@/lib/i18n/translations';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

export const LanguageSelector = () => {
  const { language, setLanguage, t } = useDashboardLanguage();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0b1019]/80 p-1 shadow-lg shadow-black/15 backdrop-blur" aria-label={t('app.language')}>
      {DASHBOARD_LANGUAGES.map((item) => (
        <button
          key={item.code}
          type="button"
          title={item.name}
          onClick={() => setLanguage(item.code)}
          className={[
            'rounded-md px-2.5 py-1.5 text-xs font-semibold transition',
            language === item.code
              ? 'bg-emerald-300 text-slate-950 shadow-sm shadow-emerald-500/20'
              : 'text-slate-400 hover:bg-white/[0.08] hover:text-slate-100'
          ].join(' ')}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};
