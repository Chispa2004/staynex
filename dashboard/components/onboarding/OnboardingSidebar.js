'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

export const OnboardingSidebar = ({ steps, currentStep, completedSteps, onSelectStep }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const completed = new Set(completedSteps || []);

  return (
    <aside className={isLight ? 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.035] p-3 shadow-xl shadow-black/10'}>
      <div className="px-2 py-2">
        <p className={isLight ? 'text-xs font-bold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-bold uppercase tracking-[0.14em] text-slate-500'}>Onboarding</p>
        <h2 className={isLight ? 'mt-1 text-lg font-semibold text-slate-950' : 'mt-1 text-lg font-semibold text-white'}>Go live checklist</h2>
      </div>
      <div className="mt-2 space-y-1">
        {steps.map((step, index) => {
          const active = step.id === currentStep;
          const done = completed.has(step.id);
          const Icon = done ? CheckCircle2 : Circle;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectStep(step.id)}
              className={[
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition',
                isLight
                  ? active
                    ? 'bg-emerald-50 text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                  : active
                    ? 'bg-white/[0.075] text-white'
                    : 'text-slate-400 hover:bg-white/[0.045] hover:text-slate-100'
              ].join(' ')}
            >
              <span className="text-xs font-semibold opacity-60">{String(index + 1).padStart(2, '0')}</span>
              <Icon className={done ? 'h-4 w-4 text-emerald-400' : 'h-4 w-4 opacity-40'} />
              <span className="min-w-0 flex-1 truncate">{step.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
