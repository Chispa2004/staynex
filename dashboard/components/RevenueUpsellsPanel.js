'use client';

import { CircleDollarSign, Sparkles } from 'lucide-react';
import { ExecutiveCard, ExecutiveBadge } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const labels = {
  romantic_package: 'Romantic package',
  late_checkout: 'Late checkout',
  airport_transfer: 'Airport transfer',
  room_upgrade: 'Room upgrade'
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

  return (
    <ExecutiveCard className="p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Revenue & Upsells</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Commercial opportunities detected by AI.</p>
        </div>
        <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800' : 'flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
          <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Detected" value={revenue.totalUpsells || 0} />
        <Metric label="Mock conversion" value={`${revenue.conversionRate || 0}%`} />
        <Metric label="Estimated revenue" value={formatCurrency(revenue.estimatedRevenue)} />
      </div>

      <div className="mt-5 space-y-3">
        {Object.entries(labels).map(([key, label]) => {
          const value = byType[key] || 0;
          const max = Math.max(1, revenue.totalUpsells || 1);

          return (
            <div key={key}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className={isLight ? 'text-sm font-medium text-slate-700' : 'text-sm font-medium text-slate-300'}>{label}</span>
                <ExecutiveBadge tone={value > 0 ? 'emerald' : 'slate'}>{value}</ExecutiveBadge>
              </div>
              <div className={isLight ? 'h-2 overflow-hidden rounded-full bg-slate-100' : 'h-2 overflow-hidden rounded-full bg-white/[0.06]'}>
                <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className={isLight ? 'mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600' : 'mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-400'}>
        <div className="flex gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          Revenue is estimated from detected opportunity types. Real conversion and PMS revenue can plug into this structure later.
        </div>
      </div>
    </ExecutiveCard>
  );
};

const Metric = ({ label, value }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-3' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
      <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>{label}</p>
      <p className={isLight ? 'mt-2 text-xl font-semibold text-slate-950' : 'mt-2 text-xl font-semibold text-white'}>{value}</p>
    </div>
  );
};
