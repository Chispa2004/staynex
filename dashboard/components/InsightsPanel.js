'use client';

import { BrainCircuit, Lightbulb } from 'lucide-react';
import { ExecutiveCard, ExecutiveBadge } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const InsightsPanel = ({ insights = [] }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <ExecutiveCard className="p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={isLight ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800' : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
            <BrainCircuit className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>AI Insights</h2>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Simple copilot signals generated from recent data.</p>
          </div>
        </div>
        <ExecutiveBadge tone="emerald">Copilot</ExecutiveBadge>
      </div>

      <div className="space-y-3">
        {(insights.length ? insights : [{ title: 'No insights yet', description: 'Staynex will surface patterns as guest activity grows.', tone: 'slate' }]).map((insight) => (
          <div
            key={insight.title}
            className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}
          >
            <div className="flex items-start gap-3">
              <Lightbulb className={isLight ? 'mt-0.5 h-4 w-4 shrink-0 text-emerald-700' : 'mt-0.5 h-4 w-4 shrink-0 text-emerald-300'} aria-hidden="true" />
              <div>
                <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{insight.title}</p>
                <p className={isLight ? 'mt-1 text-sm leading-6 text-slate-600' : 'mt-1 text-sm leading-6 text-slate-400'}>{insight.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ExecutiveCard>
  );
};
