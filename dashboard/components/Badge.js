'use client';

import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

const priorityStyles = {
  low: 'border-slate-500/30 bg-slate-400/10 text-slate-200',
  normal: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
  high: 'border-orange-300/50 bg-orange-400/15 text-orange-100 shadow-sm shadow-orange-500/10',
  urgent: 'border-red-300/70 bg-red-500/20 text-red-50 shadow-sm shadow-red-500/30'
};

const statusStyles = {
  open: 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100',
  in_progress: 'border-violet-300/35 bg-violet-300/10 text-violet-100',
  completed: 'border-slate-400/35 bg-slate-400/10 text-slate-300',
  cancelled: 'border-rose-300/35 bg-rose-400/10 text-rose-100'
};

const baseStyles = 'inline-flex min-w-20 items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold capitalize';

const humanize = (value) => value?.replaceAll('_', ' ') || 'unknown';

export const PriorityBadge = ({ priority }) => {
  const { t } = useDashboardLanguage();

  return (
    <span className={`${baseStyles} ${priorityStyles[priority] || priorityStyles.normal} ${priority === 'urgent' ? 'animate-pulse uppercase tracking-wide' : ''}`}>
      {t(`priority.${priority || 'normal'}`) || humanize(priority)}
    </span>
  );
};

export const StatusBadge = ({ status }) => {
  const { t } = useDashboardLanguage();

  return (
    <span className={`${baseStyles} ${statusStyles[status] || statusStyles.open}`}>
      {t(`status.${status || 'unknown'}`) || humanize(status)}
    </span>
  );
};
