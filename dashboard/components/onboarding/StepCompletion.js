'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const StepCompletion = ({ completedSteps, steps, onComplete, completing }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const done = new Set(completedSteps || []);

  return (
    <ExecutiveCard className="p-6">
      <ExecutiveBadge tone="emerald">Step 8</ExecutiveBadge>
      <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>Staynex is ready</h2>
      <p className={isLight ? 'mt-2 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-2xl text-sm leading-6 text-slate-400'}>Complete onboarding when the hotel profile, PMS, WhatsApp instructions, KB and test flow are in a good state.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {steps.slice(0, -1).map((step) => (
          <div key={step.id} className={isLight ? 'flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3' : 'flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
            <CheckCircle2 className={done.has(step.id) ? 'h-5 w-5 text-emerald-400' : 'h-5 w-5 text-slate-500'} />
            <span className={isLight ? 'text-sm font-semibold text-slate-800' : 'text-sm font-semibold text-slate-200'}>{step.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onComplete} disabled={completing} className="rounded-lg border border-emerald-200/60 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60">
          {completing ? 'Completing...' : 'Complete onboarding'}
        </button>
        <Link href="/dashboard" className={isLight ? 'rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>Open Dashboard</Link>
        <Link href="/dashboard/inbox" className={isLight ? 'rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>Open Inbox</Link>
      </div>
    </ExecutiveCard>
  );
};
