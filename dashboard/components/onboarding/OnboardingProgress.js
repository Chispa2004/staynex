'use client';

import { CheckCircle2 } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const OnboardingProgress = ({ steps, currentStep, completedSteps }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const completed = new Set(completedSteps || []);
  const completedCount = completed.size;
  const percent = Math.round((completedCount / steps.length) * 100);

  return (
    <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/10'}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>Setup progress</p>
          <p className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>{completedCount} of {steps.length} steps completed</p>
        </div>
        <span className="rounded-full bg-emerald-300 px-2.5 py-1 text-xs font-black text-slate-950">{percent}%</span>
      </div>
      <div className={isLight ? 'h-2 overflow-hidden rounded-full bg-slate-100' : 'h-2 overflow-hidden rounded-full bg-white/10'}>
        <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {steps.map((step) => {
          const done = completed.has(step.id);
          const active = currentStep === step.id;

          return (
            <div key={step.id} className={[
              'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs',
              isLight
                ? active
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : done
                    ? 'border-slate-200 bg-slate-50 text-slate-700'
                    : 'border-slate-200 bg-white text-slate-500'
                : active
                  ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                  : done
                    ? 'border-white/10 bg-white/[0.04] text-slate-200'
                    : 'border-white/10 bg-white/[0.02] text-slate-500'
            ].join(' ')}>
              <CheckCircle2 className={done ? 'h-3.5 w-3.5 text-emerald-400' : 'h-3.5 w-3.5 opacity-40'} />
              <span className="truncate">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
