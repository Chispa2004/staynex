'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ExternalLink,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { StepHotelSetup } from './StepHotelSetup';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const fallbackSteps = [
  { id: 'hotel', label: 'HOTEL', title: 'Hotel', ctaLabel: 'Configurar hotel' },
  { id: 'users', label: 'USUARIOS', title: 'Usuarios', ctaLabel: 'Gestionar usuarios', href: '/dashboard/settings/users' },
  { id: 'pms', label: 'PMS', title: 'PMS', ctaLabel: 'Configurar PMS', href: '/dashboard/settings/pms' },
  { id: 'whatsapp', label: 'WHATSAPP', title: 'WhatsApp', ctaLabel: 'Configurar WhatsApp' },
  { id: 'knowledge', label: 'KNOWLEDGE', title: 'Knowledge', ctaLabel: 'Configurar Knowledge', href: '/dashboard/knowledge' },
  { id: 'readiness', label: 'PILOT READINESS', title: 'Pilot Readiness', ctaLabel: 'Revisar readiness', href: '/dashboard/health' }
];

const statusTone = {
  COMPLETADO: 'emerald',
  'ACCIÓN NECESARIA': 'amber',
  'ESPERANDO EXTERNO': 'sky',
  OPCIONAL: 'slate'
};

const protectedConfigRoles = new Set(['owner', 'admin', 'manager']);
const platformConfigRoles = new Set(['super_admin', 'platform_admin', 'internal_only']);

const canManageProtectedConfig = ({ role, platformRole, fallback }) => (
  !fallback
  && platformRole !== 'support'
  && (protectedConfigRoles.has(role) || platformConfigRoles.has(platformRole))
);

const currentStepIndex = (steps, stepId) => Math.max(0, steps.findIndex((step) => step.id === stepId));

const sanitizeError = (message) => {
  if (!message) return 'No se pudo cargar el onboarding piloto.';
  if (/supabase|postgres|schema|relation|token|secret|authorization/i.test(message)) {
    return 'No se pudo cargar el estado. Revisa la configuración y vuelve a intentarlo.';
  }

  return message;
};

export const OnboardingWizard = () => {
  const router = useRouter();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [hotel, setHotel] = useState(null);
  const [state, setState] = useState(null);
  const [pilot, setPilot] = useState(null);
  const [currentStep, setCurrentStep] = useState(fallbackSteps[0].id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [access, setAccess] = useState({ role: null, platformRole: null, fallback: false });

  const steps = pilot?.blocks?.length ? pilot.blocks : fallbackSteps;
  const activeIndex = currentStepIndex(steps, currentStep);
  const activeBlock = steps[activeIndex] || steps[0];
  const completedBlocks = useMemo(() => steps.filter((step) => step.status === 'COMPLETADO'), [steps]);
  const canManage = pilot?.permissions?.canModifyProtectedConfig ?? canManageProtectedConfig(access);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/onboarding/state', { headers, cache: 'no-store' });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'No se pudo cargar el onboarding piloto.');
      }

      const nextPilot = body.pilot || null;
      const nextCurrentStep = body.state?.current_step || nextPilot?.blocks?.[0]?.id || fallbackSteps[0].id;

      setHotel(body.hotel || null);
      setAccess({
        role: body.role || null,
        platformRole: body.platformRole || null,
        fallback: Boolean(body.fallback)
      });
      setState(body.state || null);
      setPilot(nextPilot);
      setCurrentStep(nextPilot?.blocks?.some((block) => block.id === nextCurrentStep) ? nextCurrentStep : fallbackSteps[0].id);
      setSuccess(null);
    } catch (caughtError) {
      setError(sanitizeError(caughtError.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveProgress = async ({ nextStep = currentStep, completed = false } = {}) => {
    if (!canManage) {
      setError('No tienes permiso para modificar la configuración piloto.');
      return false;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/onboarding/state', {
        method: 'PATCH',
        headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_step: nextStep,
          completed_steps: completedBlocks.map((block) => block.id),
          onboarding_completed: completed
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'No se pudo guardar el progreso.');
      }

      setState(body.state || null);
      setCurrentStep(body.state?.current_step || nextStep);
      setSuccess(completed ? 'Configuración disponible marcada como completada.' : 'Progreso guardado.');
      window.dispatchEvent(new CustomEvent('staynex:onboarding-updated', {
        detail: { state: body.state }
      }));

      return true;
    } catch (caughtError) {
      setError(sanitizeError(caughtError.message));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const selectStep = async (stepId) => {
    setCurrentStep(stepId);

    if (canManage) {
      await saveProgress({ nextStep: stepId });
    }
  };

  const goPrevious = () => {
    const previous = steps[Math.max(activeIndex - 1, 0)]?.id || fallbackSteps[0].id;
    setCurrentStep(previous);
  };

  const goNext = () => {
    const next = steps[Math.min(activeIndex + 1, steps.length - 1)]?.id || fallbackSteps[0].id;
    setCurrentStep(next);
  };

  const completeConfiguration = async () => {
    const saved = await saveProgress({
      nextStep: 'readiness',
      completed: true
    });

    if (saved) {
      router.push(pilot?.completion?.redirectHref || '/dashboard/health');
    }
  };

  const handleHotelSaved = async (nextHotel) => {
    setHotel(nextHotel);
    await load();
  };

  if (loading) {
    return (
      <div className={cn('rounded-xl border p-6 text-sm', ui.surface(isLight))}>
        <div className="flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" aria-hidden="true" />
          Cargando onboarding piloto...
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ExecutiveBadge tone="emerald">Onboarding piloto</ExecutiveBadge>
            {hotel?.name ? <ExecutiveBadge tone="slate">{hotel.name}</ExecutiveBadge> : null}
            {state?.onboarding_completed ? <ExecutiveBadge tone="sky">Configuración completada</ExecutiveBadge> : null}
          </div>
          <h1 className={cn('text-3xl font-semibold tracking-normal sm:text-4xl', ui.text.title(isLight))}>
            Preparar hotel piloto
          </h1>
          <p className={cn('mt-3 max-w-3xl', ui.text.body(isLight))}>
            Recorre Hotel, Usuarios, PMS, WhatsApp, Knowledge y Pilot Readiness con datos reales. Configuración puede avanzar aunque Ubikos siga esperando información externa; go-live no.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading || saving} className={ui.button(isLight, 'secondary')}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          Reintentar
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ReadyPanel
          isLight={isLight}
          title="Ready for Configuration"
          ready={pilot?.readyForConfiguration}
          description={pilot?.readyForConfiguration
            ? 'La configuración disponible puede cerrarse y pasar a readiness.'
            : 'Completa los bloques accionables antes de cerrar configuración.'}
        />
        <ReadyPanel
          isLight={isLight}
          title="Ready for Go-Live"
          ready={pilot?.readyForGoLive}
          description={pilot?.readyForGoLive
            ? 'Todos los gates obligatorios están listos para operar.'
            : 'Go-live sigue bloqueado hasta PMS real, WhatsApp, Human Fallback y Kill Switch.'}
        />
      </div>

      {error ? (
        <div className={ui.notice(isLight, 'danger')}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div className={ui.notice(isLight, 'success')}>
          {success}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={cn('rounded-xl border p-3', ui.surface(isLight))}>
          <div className="px-2 py-2">
            <p className={ui.text.eyebrow(isLight)}>Flujo piloto</p>
            <h2 className={cn('mt-1 text-lg font-semibold', ui.text.title(isLight))}>Seis bloques reales</h2>
          </div>
          <div className="mt-2 space-y-2">
            {steps.map((block, index) => (
              <button
                key={block.id}
                type="button"
                onClick={() => selectStep(block.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left text-sm transition',
                  activeBlock?.id === block.id
                    ? isLight ? 'border-emerald-200 bg-emerald-50' : 'border-emerald-300/25 bg-emerald-300/10'
                    : isLight ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.055]'
                )}
              >
                <span className="mt-0.5 text-xs font-semibold opacity-60">{String(index + 1).padStart(2, '0')}</span>
                {block.status === 'COMPLETADO'
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className={cn('block font-semibold', ui.text.title(isLight))}>{block.title}</span>
                  <span className={cn('mt-1 inline-flex', ui.badge(isLight, statusTone[block.status] || block.tone || 'slate', true))}>
                    {block.status || 'ACCIÓN NECESARIA'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <PilotBlockDetail
            block={activeBlock}
            hotel={hotel}
            isLight={isLight}
            canManage={canManage}
            onHotelSaved={handleHotelSaved}
            onSelectStep={setCurrentStep}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={goPrevious} disabled={activeIndex === 0 || saving} className={ui.button(isLight, 'secondary')}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Anterior
            </button>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button type="button" onClick={goNext} disabled={activeIndex === steps.length - 1 || saving} className={ui.button(isLight, 'secondary')}>
                Siguiente
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={completeConfiguration}
                disabled={saving || !pilot?.completion?.canCompleteConfiguration || !canManage}
                className={ui.button(isLight, 'primary')}
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                {saving ? 'Guardando...' : 'Finalizar configuración disponible'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
};

const ReadyPanel = ({ isLight, title, ready, description }) => (
  <ExecutiveCard className="p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className={ui.text.eyebrow(isLight)}>{title}</p>
        <h2 className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>
          {ready ? 'Listo' : 'No listo'}
        </h2>
        <p className={cn('mt-2', ui.text.body(isLight))}>{description}</p>
      </div>
      <span className={ui.badge(isLight, ready ? 'emerald' : 'amber')}>
        {ready ? 'COMPLETADO' : 'ACCIÓN NECESARIA'}
      </span>
    </div>
  </ExecutiveCard>
);

const PilotBlockDetail = ({ block, hotel, isLight, canManage, onHotelSaved, onSelectStep }) => {
  if (block?.id === 'hotel') {
    return <StepHotelSetup hotel={hotel} canEdit={canManage} onSaved={onHotelSaved} />;
  }

  if (block?.id === 'readiness') {
    return <ReadinessDetail block={block} isLight={isLight} onSelectStep={onSelectStep} />;
  }

  return (
    <ExecutiveCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <ExecutiveBadge tone={statusTone[block?.status] || block?.tone || 'slate'}>{block?.label || block?.title}</ExecutiveBadge>
          <h2 className={cn('mt-3 text-2xl font-semibold tracking-normal', ui.text.title(isLight))}>{block?.title}</h2>
          <p className={cn('mt-2 max-w-2xl', ui.text.body(isLight))}>{block?.description}</p>
        </div>
        <span className={ui.badge(isLight, statusTone[block?.status] || block?.tone || 'slate')}>
          {block?.status || 'ACCIÓN NECESARIA'}
        </span>
      </div>

      {block?.details?.length ? (
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {block.details.map((detail) => (
            <div key={`${block.id}-${detail.label}`} className={cn('rounded-lg border p-3', ui.surface(isLight, 'subtle'))}>
              <dt className={ui.text.eyebrow(isLight)}>{detail.label}</dt>
              <dd className={cn('mt-2 text-sm font-semibold', ui.text.title(isLight))}>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <BlockAction block={block} isLight={isLight} onSelectStep={onSelectStep} />
      </div>
    </ExecutiveCard>
  );
};

const ReadinessDetail = ({ block, isLight, onSelectStep }) => (
  <ExecutiveCard className="p-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <ExecutiveBadge tone={block?.tone || 'amber'}>Pilot Readiness</ExecutiveBadge>
        <h2 className={cn('mt-3 text-2xl font-semibold tracking-normal', ui.text.title(isLight))}>Readiness accionable</h2>
        <p className={cn('mt-2 max-w-2xl', ui.text.body(isLight))}>{block?.description}</p>
      </div>
      <ShieldCheck className="h-6 w-6 text-emerald-400" aria-hidden="true" />
    </div>

    <div className="mt-6 space-y-3">
      {(block?.details || []).map((check) => (
        <div key={check.id || check.label} className={cn('flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between', ui.surface(isLight, 'subtle'))}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{check.label}</p>
              <span className={ui.badge(isLight, check.tone || statusTone[check.value] || 'slate', true)}>{check.value}</span>
            </div>
            <p className={cn('mt-1', ui.text.muted(isLight))}>{check.description}</p>
          </div>
          <BlockAction block={check} isLight={isLight} onSelectStep={onSelectStep} compact />
        </div>
      ))}
    </div>
  </ExecutiveCard>
);

const BlockAction = ({ block, isLight, onSelectStep, compact = false }) => {
  const label = block?.actionLabel || 'Revisar';

  if (block?.href) {
    return (
      <Link href={block.href} className={ui.button(isLight, compact ? 'small' : 'secondary')}>
        {label}
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </Link>
    );
  }

  if (block?.step) {
    return (
      <button type="button" onClick={() => onSelectStep?.(block.step)} className={ui.button(isLight, compact ? 'small' : 'secondary')}>
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  return null;
};
