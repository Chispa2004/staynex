'use client';

import { CircleDashed } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

export const PremiumEmptyState = ({
  icon: Icon = CircleDashed,
  title,
  description,
  action,
  className = ''
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div
      className={cn(
        'flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center',
        isLight ? 'border-slate-300 bg-slate-50/80' : 'border-white/10 bg-white/[0.025]',
        className
      )}
    >
      <span
        className={cn(
          'mb-4 flex h-11 w-11 items-center justify-center rounded-xl border',
          isLight
            ? 'border-slate-200 bg-white text-slate-500 shadow-sm shadow-slate-200/60'
            : 'border-white/10 bg-white/[0.04] text-slate-400'
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {title ? (
        <p className={cn('text-sm font-semibold', isLight ? 'text-slate-900' : 'text-slate-200')}>
          {title}
        </p>
      ) : null}
      {description ? (
        <p className={cn('mt-2 max-w-sm', ui.text.body(isLight))}>
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5">
          {action}
        </div>
      ) : null}
    </div>
  );
};
