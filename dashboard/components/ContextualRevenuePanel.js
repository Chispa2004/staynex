'use client';

import { Gem, TrendingUp } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const labels = {
  early_arrival: 'Early arrival',
  late_departure: 'Late departure',
  romantic_stay: 'Romantic stay',
  family_travel: 'Family travel',
  vip_repeat_guest: 'VIP / repeat guest',
  bad_weather: 'Weather context',
  early_checkin: 'Early check-in',
  late_checkout: 'Late checkout',
  romantic_package: 'Romantic setup',
  family_activities: 'Family activities',
  room_upgrade: 'Room upgrade',
  airport_transfer: 'Transfer',
  spa: 'Spa'
};

const formatCurrency = (value, currency = 'EUR') => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
  maximumFractionDigits: 0
}).format(Number(value || 0));

export const ContextualRevenuePanel = ({ data = {} }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const recent = data.recent || [];
  const byContext = data.byContext || {};

  return (
    <ExecutiveCard className="p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Contextual Revenue Opportunities</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Premium moments detected without pushing sales.</p>
        </div>
        <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700' : 'flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/10 text-violet-200'}>
          <Gem className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Active" value={data.activeOpportunities || 0} />
        <Metric label="Potential" value={formatCurrency(data.potentialRevenue || 0)} />
        <Metric label="Avg confidence" value={`${data.averageConfidence || 0}%`} />
      </div>

      {Object.keys(byContext).length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {Object.entries(byContext).map(([context, count]) => (
            <ExecutiveBadge key={context} tone="violet">
              {(labels[context] || context)} · {count}
            </ExecutiveBadge>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {recent.length ? recent.map((item) => (
          <div key={item.id} className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-3' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={isLight ? 'text-sm font-semibold text-slate-800' : 'text-sm font-semibold text-slate-200'}>
                  {labels[item.detectedContext] || item.detectedContext || 'Contextual moment'}
                </p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  {labels[item.offerType] || item.offerType} · {item.timingReason || 'contextual timing'}
                </p>
              </div>
              <ExecutiveBadge tone={item.status === 'accepted' ? 'emerald' : item.status === 'rejected' ? 'red' : 'sky'}>
                {item.status}
              </ExecutiveBadge>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>
                {formatCurrency(item.suggestedPrice, item.currency)}
              </span>
              <span className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>
                fatigue {item.fatigueScore ?? 0}
              </span>
            </div>
          </div>
        )) : (
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-400'}>
            <div className="flex gap-2">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              No contextual revenue moments yet. They will appear when guest messages signal timing, celebration, family travel or VIP intent.
            </div>
          </div>
        )}
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
