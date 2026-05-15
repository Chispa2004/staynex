'use client';

import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

export const ExecutiveCard = ({ children, className = '', interactive = false }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section
      className={cn(
        'premium-fade-in rounded-xl border transition-all duration-200',
        ui.surface(isLight),
        interactive ? 'hover:-translate-y-0.5 hover:border-emerald-300/35 hover:shadow-2xl' : '',
        className
      )}
    >
      {children}
    </section>
  );
};

export const ExecutiveBadge = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  return (
    <span className={ui.badge(isLight, tone)}>
      {children}
    </span>
  );
};
