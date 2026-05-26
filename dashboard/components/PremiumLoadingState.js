'use client';

import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

export const PremiumLoadingState = ({
  title = 'Loading workspace data',
  description = 'Staynex is loading this hotel workspace only.',
  rows = 4,
  cards = 3,
  className = ''
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section
      className={cn(
        'rounded-2xl border p-5',
        ui.surface(isLight),
        className
      )}
      aria-busy="true"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{title}</p>
          <p className={cn('mt-1', ui.text.body(isLight))}>{description}</p>
        </div>
        <span className={cn('h-9 w-24', ui.skeleton(isLight))} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={`card-${index}`} className={cn('rounded-xl border p-4', ui.surface(isLight, 'subtle'))}>
            <span className={cn('block h-3 w-24', ui.skeleton(isLight))} />
            <span className={cn('mt-3 block h-7 w-16', ui.skeleton(isLight))} />
            <span className={cn('mt-3 block h-3 w-full', ui.skeleton(isLight))} />
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={`row-${index}`} className={cn('flex items-center gap-3 rounded-xl border p-3', ui.surface(isLight, 'subtle'))}>
            <span className={cn('h-9 w-9 shrink-0 rounded-lg', ui.skeleton(isLight))} />
            <span className={cn('h-3 flex-1', ui.skeleton(isLight))} />
            <span className={cn('hidden h-3 w-24 sm:block', ui.skeleton(isLight))} />
          </div>
        ))}
      </div>
    </section>
  );
};
