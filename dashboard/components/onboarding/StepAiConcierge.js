'use client';

import { Bot, BrainCircuit, Sparkles, TrendingUp } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const features = [
  ['AI Concierge', 'Automatic hotel-style WhatsApp replies', Bot],
  ['OpenAI enhancement', 'Hybrid intelligence with safe fallback', Sparkles],
  ['Guest Memory', 'Persistent preferences and context', BrainCircuit],
  ['Revenue AI', 'Upsell opportunities and conversion tracking', TrendingUp]
];

export const StepAiConcierge = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <ExecutiveCard className="p-6">
      <ExecutiveBadge tone="emerald">Step 5</ExecutiveBadge>
      <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>AI Concierge</h2>
      <p className={isLight ? 'mt-2 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-2xl text-sm leading-6 text-slate-400'}>Staynex is already wired to use the AI Concierge engine, guest memory and revenue intelligence. Enable OpenAI later with environment variables when ready.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {features.map(([title, description, Icon]) => (
          <div key={title} className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
            <Icon className="h-5 w-5 text-emerald-400" />
            <p className={isLight ? 'mt-3 text-sm font-semibold text-slate-950' : 'mt-3 text-sm font-semibold text-white'}>{title}</p>
            <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-400'}>{description}</p>
            <ExecutiveBadge tone="emerald">Ready</ExecutiveBadge>
          </div>
        ))}
      </div>
    </ExecutiveCard>
  );
};
