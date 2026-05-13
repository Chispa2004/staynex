'use client';

import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';

const filterClass = 'rounded-lg border border-white/10 bg-[#0b1019] px-3 py-2.5 text-sm text-slate-200 outline-none transition focus:border-emerald-300/40';

const labelClass = 'space-y-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500';

const humanize = (value) => value.replaceAll('_', ' ');

export const TicketFilters = ({
  filters,
  onChange,
  categories,
  priorities,
  statuses
}) => {
  const { t } = useDashboardLanguage();

  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/10 sm:grid-cols-3">
      <label className={labelClass}>
        {t('filters.status')}
        <select
          value={filters.status}
          onChange={(event) => onChange({ ...filters, status: event.target.value })}
          className={filterClass}
        >
          <option value="all">{t('filters.all')}</option>
          {statuses.map((status) => (
            <option key={status} value={status}>{t(`status.${status}`)}</option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        {t('filters.priority')}
        <select
          value={filters.priority}
          onChange={(event) => onChange({ ...filters, priority: event.target.value })}
          className={filterClass}
        >
          <option value="all">{t('filters.all')}</option>
          {priorities.map((priority) => (
            <option key={priority} value={priority}>{t(`priority.${priority}`)}</option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        {t('filters.category')}
        <select
          value={filters.category}
          onChange={(event) => onChange({ ...filters, category: event.target.value })}
          className={filterClass}
        >
          <option value="all">{t('filters.all')}</option>
          {categories.map((category) => (
            <option key={category} value={category}>{humanize(category)}</option>
          ))}
        </select>
      </label>
    </div>
  );
};
