'use client';

import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

export const PageHeader = ({
  eyebrowKey = 'screens.operations',
  titleKey,
  descriptionKey,
  fallbackTitle,
  fallbackDescription
}) => {
  const { t } = useDashboardLanguage();

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">{t(eyebrowKey)}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
        {titleKey ? t(titleKey) : fallbackTitle}
      </h1>
      {descriptionKey || fallbackDescription ? (
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          {descriptionKey ? t(descriptionKey) : fallbackDescription}
        </p>
      ) : null}
    </div>
  );
};
