'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { OnboardingProgress } from './OnboardingProgress';
import { OnboardingSidebar } from './OnboardingSidebar';
import { StepHotelSetup } from './StepHotelSetup';
import { StepPmsConnection } from './StepPmsConnection';
import { StepWhatsAppSetup } from './StepWhatsAppSetup';
import { StepKnowledgeBase } from './StepKnowledgeBase';
import { StepAiConcierge } from './StepAiConcierge';
import { StepAutomations } from './StepAutomations';
import { StepTestFlow } from './StepTestFlow';
import { StepCompletion } from './StepCompletion';
import { ExecutiveBadge } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';

const steps = [
  { id: 'hotel_setup', label: 'Hotel setup' },
  { id: 'pms_connection', label: 'PMS connection' },
  { id: 'whatsapp_setup', label: 'WhatsApp setup' },
  { id: 'knowledge_base', label: 'Knowledge Base' },
  { id: 'ai_concierge', label: 'AI Concierge' },
  { id: 'automations', label: 'Automations' },
  { id: 'test_flow', label: 'Test flow' },
  { id: 'completion', label: 'Completion' }
];

const stepIndex = (stepId) => Math.max(0, steps.findIndex((step) => step.id === stepId));

export const OnboardingWizard = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [hotel, setHotel] = useState(null);
  const [state, setState] = useState(null);
  const [currentStep, setCurrentStep] = useState(steps[0].id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const completedSteps = useMemo(() => state?.completed_steps || [], [state]);
  const currentIndex = stepIndex(currentStep);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/onboarding/state', { headers, cache: 'no-store' });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load onboarding');
      }

      setHotel(body.hotel || null);
      setState(body.state || null);
      setCurrentStep(body.state?.current_step || steps[0].id);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveState = async ({ nextStep = currentStep, markCompleted = null, completed = false } = {}) => {
    const nextCompletedSteps = markCompleted
      ? [...new Set([...completedSteps, markCompleted])]
      : completedSteps;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/state', {
        method: 'PATCH',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_step: nextStep,
          completed_steps: completed ? steps.map((step) => step.id) : nextCompletedSteps,
          onboarding_completed: completed
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not save onboarding progress');
      }

      setState(body.state);
      setCurrentStep(body.state.current_step);
      window.dispatchEvent(new CustomEvent('staynex:onboarding-updated', {
        detail: { state: body.state }
      }));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    const nextStep = steps[Math.min(currentIndex + 1, steps.length - 1)].id;
    await saveState({
      nextStep,
      markCompleted: currentStep
    });
  };

  const goBack = async () => {
    const previousStep = steps[Math.max(currentIndex - 1, 0)].id;
    await saveState({ nextStep: previousStep });
  };

  const renderStep = () => {
    if (currentStep === 'hotel_setup') {
      return <StepHotelSetup hotel={hotel} onSaved={setHotel} />;
    }

    if (currentStep === 'pms_connection') {
      return <StepPmsConnection />;
    }

    if (currentStep === 'whatsapp_setup') {
      return <StepWhatsAppSetup hotel={hotel} />;
    }

    if (currentStep === 'knowledge_base') {
      return <StepKnowledgeBase />;
    }

    if (currentStep === 'ai_concierge') {
      return <StepAiConcierge />;
    }

    if (currentStep === 'automations') {
      return <StepAutomations />;
    }

    if (currentStep === 'test_flow') {
      return <StepTestFlow />;
    }

    return (
      <StepCompletion
        completedSteps={completedSteps}
        steps={steps}
        completing={saving}
        onComplete={() => saveState({
          nextStep: 'completion',
          markCompleted: 'completion',
          completed: true
        })}
      />
    );
  };

  if (loading) {
    return (
      <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600' : 'rounded-xl border border-white/10 bg-white/[0.035] p-6 text-sm text-slate-400'}>
        Loading onboarding...
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ExecutiveBadge tone="emerald">Hotel onboarding</ExecutiveBadge>
            {hotel?.name ? <ExecutiveBadge tone="slate">{hotel.name}</ExecutiveBadge> : null}
          </div>
          <h1 className={isLight ? 'text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl' : 'text-3xl font-semibold tracking-tight text-white sm:text-4xl'}>
            Go live in under 10 minutes
          </h1>
          <p className={isLight ? 'mt-3 max-w-3xl text-sm leading-6 text-slate-600' : 'mt-3 max-w-3xl text-sm leading-6 text-slate-400'}>
            A guided setup for hotel identity, PMS, WhatsApp, Knowledge Base, AI Concierge, automations and a real test flow.
          </p>
        </div>
        {state?.onboarding_completed ? (
          <div className={isLight ? 'inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800' : 'inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100'}>
            <CheckCircle2 className="h-4 w-4" />
            Onboarding completed
          </div>
        ) : null}
      </div>

      <OnboardingProgress steps={steps} currentStep={currentStep} completedSteps={completedSteps} />

      {error ? (
        <div className="rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <OnboardingSidebar
          steps={steps}
          currentStep={currentStep}
          completedSteps={completedSteps}
          onSelectStep={(step) => saveState({ nextStep: step })}
        />
        <div className="min-w-0 space-y-4">
          {renderStep()}
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={goBack} disabled={saving || currentIndex === 0} className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50'}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            {currentStep !== 'completion' ? (
              <button type="button" onClick={goNext} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60">
                {saving ? 'Saving...' : 'Mark done and continue'}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};
