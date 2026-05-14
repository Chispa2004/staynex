'use client';

import Link from 'next/link';
import { ArrowUpRight, BrainCircuit, ShieldAlert, Sparkles } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

export const VipGuestsPanel = ({ guests = [] }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <ExecutiveCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>VIP Guests & AI Signals</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Important guests, revenue opportunities and operational risks.</p>
        </div>
        <ExecutiveBadge tone="violet">
          <BrainCircuit className="mr-1 h-3.5 w-3.5" />
          AI
        </ExecutiveBadge>
      </div>

      <div className="mt-4 space-y-3">
        {guests.length === 0 ? (
          <div className={isLight ? 'rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500' : 'rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-6 text-center text-sm text-slate-500'}>
            No strong guest signals yet. Staynex will surface VIPs as conversations and stays accumulate.
          </div>
        ) : guests.map((guest) => (
          <Link
            key={guest.guestId}
            href={guest.href || `/dashboard/guest-memory/${guest.guestId}`}
            className={isLight ? 'block rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:bg-white' : 'block rounded-lg border border-white/10 bg-white/[0.025] p-4 transition hover:bg-white/[0.055]'}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={isLight ? 'truncate text-sm font-semibold text-slate-950' : 'truncate text-sm font-semibold text-white'}>{guest.label}</p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  Room {guest.room || '-'} - Score {guest.score || 0}/100
                </p>
              </div>
              <ArrowUpRight className={isLight ? 'h-4 w-4 shrink-0 text-slate-400' : 'h-4 w-4 shrink-0 text-slate-500'} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(guest.tags || []).slice(0, 3).map((tag) => (
                <ExecutiveBadge key={tag} tone={tag === 'needs_attention' ? 'red' : tag === 'upgrade_ready' ? 'violet' : 'emerald'}>
                  {tag}
                </ExecutiveBadge>
              ))}
              {Number(guest.revenue || 0) > 0 ? (
                <ExecutiveBadge tone="emerald">
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {formatCurrency(guest.revenue)}
                </ExecutiveBadge>
              ) : null}
              {Number(guest.risk || 0) >= 50 ? (
                <ExecutiveBadge tone="red">
                  <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                  Attention
                </ExecutiveBadge>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </ExecutiveCard>
  );
};
