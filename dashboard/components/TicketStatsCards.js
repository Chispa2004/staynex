'use client';

import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

const isToday = (value) => {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();

  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
};

export const TicketStatsCards = ({ tickets }) => {
  const { t } = useDashboardLanguage();
  const stats = [
    {
      label: t('stats.open'),
      value: tickets.filter((ticket) => ticket.status === 'open').length
    },
    {
      label: t('stats.inProgress'),
      value: tickets.filter((ticket) => ticket.status === 'in_progress').length
    },
    {
      label: t('stats.completedToday'),
      value: tickets.filter((ticket) => ticket.status === 'completed' && isToday(ticket.completed_at || ticket.created_at)).length
    },
    {
      label: t('stats.urgent'),
      value: tickets.filter((ticket) => ticket.priority === 'urgent').length
    }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border border-white/10 bg-white/[0.04] px-5 py-5 shadow-xl shadow-black/10">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
        </div>
      ))}
    </div>
  );
};
