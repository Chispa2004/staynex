'use client';

import Link from 'next/link';
import { CalendarClock, Mail, MessageCircle, Star } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const automations = [
  ['Pre-arrival 7 days', 'Ask for transfer, parking and preferences', CalendarClock],
  ['Pre-arrival 1 day', 'Arrival reminder and WhatsApp access', MessageCircle],
  ['In-stay upsell', 'Contextual concierge revenue opportunities', Star],
  ['Post-stay review', 'Review request and loyalty follow-up', Mail]
];

export const StepAutomations = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <ExecutiveCard className="p-6">
      <ExecutiveBadge tone="sky">Step 6</ExecutiveBadge>
      <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>Automations</h2>
      <p className={isLight ? 'mt-2 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-2xl text-sm leading-6 text-slate-400'}>Reservation journeys are prepared by the existing automation engine. Sending remains safe-controlled by configuration.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {automations.map(([title, description, Icon]) => (
          <div key={title} className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
            <Icon className="h-5 w-5 text-emerald-400" />
            <p className={isLight ? 'mt-3 text-sm font-semibold text-slate-950' : 'mt-3 text-sm font-semibold text-white'}>{title}</p>
            <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-400'}>{description}</p>
          </div>
        ))}
      </div>

      <Link href="/dashboard/automations" className={isLight ? 'mt-6 inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'mt-6 inline-flex rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>
        Open automation center
      </Link>
    </ExecutiveCard>
  );
};
