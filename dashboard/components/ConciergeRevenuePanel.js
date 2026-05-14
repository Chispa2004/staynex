'use client';

import { BadgeEuro, Bot, Sparkles, TrendingUp } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

export const ConciergeRevenuePanel = ({ data = {} }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const offers = data.recentOffers || [];

  return (
    <ExecutiveCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>AI Revenue Opportunities</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Concierge offers detected and attributed from WhatsApp.</p>
        </div>
        <ExecutiveBadge tone="emerald">
          <Bot className="mr-1 h-3.5 w-3.5" />
          Copilot
        </ExecutiveBadge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Sparkles} label="Active" value={data.activeOpportunities || 0} />
        <Metric icon={BadgeEuro} label="Potential" value={formatCurrency(data.potentialRevenue)} tone="emerald" />
        <Metric icon={TrendingUp} label="Acceptance" value={`${data.conversionRate || 0}%`} tone="sky" />
        <Metric icon={BadgeEuro} label="Avg offer" value={formatCurrency(data.averageOfferValue)} tone="violet" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>Top performing offer</p>
          <p className={isLight ? 'mt-2 text-lg font-semibold text-slate-950' : 'mt-2 text-lg font-semibold text-white'}>
            {data.topCategory || 'Learning'}
          </p>
          <p className={isLight ? 'mt-2 text-sm text-slate-600' : 'mt-2 text-sm text-slate-400'}>
            Generated: {formatCurrency(data.generatedRevenue)}
          </p>
        </div>

        <div className="space-y-2">
          {offers.length === 0 ? (
            <div className={isLight ? 'rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500' : 'rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm text-slate-500'}>
              No concierge offers yet.
            </div>
          ) : offers.map((offer) => (
            <div key={offer.id} className={isLight ? 'rounded-lg border border-slate-200 bg-white p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
              <div className="flex items-center justify-between gap-3">
                <p className={isLight ? 'truncate text-sm font-semibold text-slate-950' : 'truncate text-sm font-semibold text-white'}>{offer.offer_type}</p>
                <ExecutiveBadge tone={offer.status === 'accepted' ? 'emerald' : offer.status === 'rejected' ? 'red' : 'violet'}>{offer.status}</ExecutiveBadge>
              </div>
              <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-400'}>
                {formatCurrency(offer.suggested_price)} - {Math.round(Number(offer.confidence || 0) * 100)}% confidence
              </p>
            </div>
          ))}
        </div>
      </div>
    </ExecutiveCard>
  );
};

const Metric = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-3' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
      <div className="flex items-center justify-between gap-3">
        <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>{label}</p>
        <ExecutiveBadge tone={tone}>
          <Icon className="h-3.5 w-3.5" />
        </ExecutiveBadge>
      </div>
      <p className={isLight ? 'mt-2 text-xl font-semibold text-slate-950' : 'mt-2 text-xl font-semibold text-white'}>{value}</p>
    </div>
  );
};
