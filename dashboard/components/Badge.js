'use client';

import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const darkPriorityStyles = {
  low: 'border-slate-500/30 bg-slate-400/10 text-slate-200',
  normal: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
  high: 'border-orange-300/50 bg-orange-400/15 text-orange-100 shadow-sm shadow-orange-500/10',
  urgent: 'border-red-300/70 bg-red-500/20 text-red-50 shadow-sm shadow-red-500/30'
};

const lightPriorityStyles = {
  low: 'border-slate-200 bg-slate-50 text-slate-700',
  normal: 'border-sky-200 bg-sky-50 text-sky-800',
  high: 'border-orange-200 bg-orange-50 text-orange-800 shadow-sm shadow-orange-100',
  urgent: 'border-red-200 bg-red-50 text-red-800 shadow-sm shadow-red-100'
};

const darkStatusStyles = {
  open: 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100',
  in_progress: 'border-violet-300/35 bg-violet-300/10 text-violet-100',
  completed: 'border-slate-400/35 bg-slate-400/10 text-slate-300',
  cancelled: 'border-rose-300/35 bg-rose-400/10 text-rose-100'
};

const lightStatusStyles = {
  open: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  in_progress: 'border-violet-200 bg-violet-50 text-violet-800',
  completed: 'border-slate-200 bg-slate-50 text-slate-700',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-800'
};

const baseStyles = 'inline-flex min-w-20 items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold capitalize';

const humanize = (value) => value?.replaceAll('_', ' ') || 'unknown';

export const PriorityBadge = ({ priority }) => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const priorityStyles = theme === 'light' ? lightPriorityStyles : darkPriorityStyles;

  return (
    <span className={`${baseStyles} ${priorityStyles[priority] || priorityStyles.normal} ${priority === 'urgent' ? 'animate-pulse uppercase tracking-wide' : ''}`}>
      {t(`priority.${priority || 'normal'}`) || humanize(priority)}
    </span>
  );
};

export const StatusBadge = ({ status }) => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const statusStyles = theme === 'light' ? lightStatusStyles : darkStatusStyles;

  return (
    <span className={`${baseStyles} ${statusStyles[status] || statusStyles.open}`}>
      {t(`status.${status || 'unknown'}`) || humanize(status)}
    </span>
  );
};
