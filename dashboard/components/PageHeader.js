'use client';

import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

export const PageHeader = ({
  eyebrowKey = 'screens.operations',
  eyebrow,
  title,
  description,
  titleKey,
  descriptionKey,
  fallbackTitle,
  fallbackDescription
}) => {
  const { t, tx } = useDashboardLanguage();
  const resolvedTitle = titleKey ? t(titleKey) : title ? tx(title) : fallbackTitle ? tx(fallbackTitle) : '';
  const resolvedDescription = descriptionKey ? t(descriptionKey) : description ? tx(description) : fallbackDescription ? tx(fallbackDescription) : '';

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">{eyebrow ? tx(eyebrow) : t(eyebrowKey)}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
        {resolvedTitle}
      </h1>
      {resolvedDescription ? (
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          {resolvedDescription}
        </p>
      ) : null}
    </div>
  );
};
