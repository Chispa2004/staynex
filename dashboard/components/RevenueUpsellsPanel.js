'use client';

import { CircleDollarSign, Sparkles } from 'lucide-react';
import { ExecutiveCard, ExecutiveBadge } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const labels = {
  romantic_package: 'Romantic package',
  late_checkout: 'Late checkout',
  airport_transfer: 'Airport transfer',
  room_upgrade: 'Room upgrade',
  spa: 'Spa',
  dinner: 'Dinner',
  breakfast_upgrade: 'Breakfast upgrade'
};

const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

export const RevenueUpsellsPanel = ({ revenue = {} }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const byType = revenue.byType || {};
  const revenueByType = revenue.revenueByType || {};
  const topCategory = revenue.topUpsellCategory ? (labels[revenue.topUpsellCategory] || revenue.topUpsellCategory) : 'No category yet';
  const maxRevenue = Math.max(1, ...Object.values(revenueByType).map((value) => Number(value || 0)));

  return (
    <ExecutiveCard className="p-5 sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Revenue & Upsells</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Commercial opportunities detected by AI.</p>
        </div>
        <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800' : 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
          <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2">
        <Metric label="Estimated revenue" value={formatCurrency(revenue.estimatedRevenue)} />
        <Metric label="Accepted upsells" value={revenue.accepted || 0} />
        <Metric label="Conversion rate" value={`${revenue.conversionRate || 0}%`} />
        <Metric label="This month" value={formatCurrency(revenue.revenueThisMonth || revenue.acceptedRevenue)} />
      </div>

      <div className={isLight ? 'mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4' : 'mt-6 rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_minmax(82px,auto)] items-center gap-3">
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>Signal</p>
          <p className={isLight ? 'text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>Value</p>
        </div>
        <div className="space-y-4">
        {Object.entries(labels).map(([key, label]) => {
          const value = Number(revenueByType[key] || 0);
          const count = byType[key] || 0;
          const progressBase = value > 0 ? maxRevenue : Math.max(1, revenue.totalUpsells || 1);
          const progressValue = Math.min(100, ((value || count) / progressBase) * 100);

          return (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(82px,auto)] items-center gap-x-3 gap-y-2">
              <div className="min-w-0">
                <span className={isLight ? 'block truncate text-sm font-medium leading-5 text-slate-700' : 'block truncate text-sm font-medium leading-5 text-slate-300'}>{label}</span>
              </div>
              <div className="flex justify-end">
                <ExecutiveBadge tone={value > 0 ? 'emerald' : count > 0 ? 'sky' : 'slate'}>
                  <span className="tabular-nums whitespace-nowrap">
                    {value > 0 ? formatCurrency(value) : `${count} signals`}
                  </span>
                </ExecutiveBadge>
              </div>
              <div className={isLight ? 'col-span-2 h-2 overflow-hidden rounded-full bg-slate-200/80' : 'col-span-2 h-2 overflow-hidden rounded-full bg-white/[0.07]'}>
                <div className="h-full rounded-full bg-emerald-300 transition-all duration-500" style={{ width: `${Math.max(progressValue > 0 ? 5 : 0, progressValue)}%` }} />
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <div className={isLight ? 'mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4' : 'mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4'}>
        <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700' : 'text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200'}>Top performing upsell</p>
        <p className={isLight ? 'mt-2 text-lg font-semibold text-slate-950' : 'mt-2 text-lg font-semibold text-white'}>{topCategory}</p>
      </div>

      <div className={isLight ? 'mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600' : 'mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-400'}>
        <div className="flex gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          Revenue is attributed from tracked upsell conversions. PMS-confirmed revenue can plug into this same structure later.
        </div>
      </div>
    </ExecutiveCard>
  );
};

const Metric = ({ label, value }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'flex min-h-[124px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center' : 'flex min-h-[124px] flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.025] px-4 py-6 text-center'}>
      <p className={isLight ? 'max-w-full whitespace-nowrap text-center text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-slate-500' : 'max-w-full whitespace-nowrap text-center text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-slate-500'}>{label}</p>
      <p className={isLight ? 'mt-4 text-center text-2xl font-semibold leading-none tabular-nums text-slate-950 sm:text-[1.65rem]' : 'mt-4 text-center text-2xl font-semibold leading-none tabular-nums text-white sm:text-[1.65rem]'}>{value}</p>
    </div>
  );
};
