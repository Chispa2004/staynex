'use client';

import Link from 'next/link';
import { Bot, CalendarClock, CircleDollarSign, CircleDot, Lightbulb, MessageSquareText, Sparkles, TicketCheck } from 'lucide-react';
import { ExecutiveCard, ExecutiveBadge } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const icons = {
  whatsapp: MessageSquareText,
  ticket: TicketCheck,
  upsell: Sparkles,
  revenue: CircleDollarSign,
  automation: CalendarClock,
  memory: Lightbulb,
  ai: Bot
};

const formatRelative = (value) => {
  if (!value) {
    return '';
  }

  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(delta / 60000));

  if (minutes < 1) {
    return 'now';
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  return `${Math.round(minutes / 60)} h ago`;
};

export const LiveActivityFeed = ({ activity = [], loading = false }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const items = loading && activity.length === 0
    ? Array.from({ length: 5 }).map((_, index) => ({ id: `loading-${index}`, title: 'Loading activity...', description: 'Syncing latest AI operations', tone: 'slate' }))
    : activity;

  return (
    <ExecutiveCard className="overflow-hidden xl:flex xl:h-full xl:min-h-0 xl:flex-col">
      <div className={isLight ? 'border-b border-slate-200 px-5 py-4' : 'border-b border-white/10 px-5 py-4'}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Live AI Activity</h2>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Recent guest, AI and operation events.</p>
          </div>
          <ExecutiveBadge tone="emerald">LIVE</ExecutiveBadge>
        </div>
      </div>

      <div className="executive-scroll max-h-[min(620px,68vh)] space-y-3 overflow-y-auto p-3 pb-4 pr-2 xl:min-h-0 xl:flex-1 xl:max-h-none">
        {items.length === 0 ? (
          <div className={isLight ? 'rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500' : 'rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-8 text-center text-sm text-slate-500'}>
            No live activity yet.
          </div>
        ) : items.map((item, index) => {
          const Icon = icons[item.type] || CircleDot;
          const content = (
            <div className={[
              'flex min-h-[88px] gap-3 rounded-lg border p-3 transition',
              isLight
                ? 'border-slate-200 bg-white hover:bg-slate-50'
                : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.045]'
            ].join(' ')}
            >
              <span className={isLight ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700' : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300'}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className={isLight ? 'min-w-0 text-sm font-semibold leading-5 text-slate-900' : 'min-w-0 text-sm font-semibold leading-5 text-slate-100'}>{item.title}</p>
                  <span className={isLight ? 'shrink-0 pt-0.5 text-right text-xs text-slate-500' : 'shrink-0 pt-0.5 text-right text-xs text-slate-500'}>{formatRelative(item.createdAt)}</span>
                </div>
                <p className={isLight ? 'mt-1 text-sm leading-6 text-slate-600' : 'mt-1 text-sm leading-6 text-slate-400'}>{item.description}</p>
              </div>
            </div>
          );

          return item.href ? (
            <Link key={`${item.type}-${item.createdAt}-${index}`} href={item.href} className="block">
              {content}
            </Link>
          ) : (
            <div key={`${item.type}-${item.createdAt}-${index}`} className="block">
              {content}
            </div>
          );
        })}
      </div>
    </ExecutiveCard>
  );
};
