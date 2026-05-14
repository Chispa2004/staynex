'use client';

import {
  Bot,
  CircleDollarSign,
  MessageSquareText,
  Smile,
  Sparkles,
  TicketCheck,
  UserRoundCheck,
  Zap
} from 'lucide-react';
import { ExecutiveCard, ExecutiveBadge } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));
const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const kpiConfig = [
  { key: 'conversationsToday', label: 'Conversations Today', icon: MessageSquareText, tone: 'emerald', format: formatNumber },
  { key: 'openTickets', label: 'Open Tickets', icon: TicketCheck, tone: 'amber', format: formatNumber },
  { key: 'activeGuests', label: 'Active Guests', icon: UserRoundCheck, tone: 'sky', format: formatNumber },
  { key: 'aiResponses', label: 'AI Responses', icon: Bot, tone: 'violet', format: formatNumber },
  { key: 'upsellsDetected', label: 'Upsells Detected', icon: Sparkles, tone: 'emerald', format: formatNumber },
  { key: 'automationsScheduled', label: 'Automations Scheduled', icon: Zap, tone: 'sky', format: formatNumber },
  { key: 'estimatedAiRevenue', label: 'Estimated AI Revenue', icon: CircleDollarSign, tone: 'emerald', format: formatCurrency },
  { key: 'guestSatisfactionScore', label: 'Guest Satisfaction Score', icon: Smile, tone: 'amber', format: (value) => `${Number(value || 0)}%` }
];

export const KPIGrid = ({ kpis = {}, loading = false }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpiConfig.map((item) => {
        const Icon = item.icon;

        return (
          <ExecutiveCard key={item.key} className="p-4" interactive>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>
                  {item.label}
                </p>
                <p className={isLight ? 'mt-3 text-3xl font-semibold tracking-tight text-slate-950' : 'mt-3 text-3xl font-semibold tracking-tight text-white'}>
                  {loading ? '...' : item.format(kpis[item.key])}
                </p>
              </div>
              <span className={isLight ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700' : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200'}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-4">
              <ExecutiveBadge tone={item.tone}>Live metric</ExecutiveBadge>
            </div>
          </ExecutiveCard>
        );
      })}
    </div>
  );
};
