'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Zap
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';
import { WORKSPACE_SELECTION_EVENT } from '@/lib/workspace-context';
import { PremiumEmptyState } from './PremiumEmptyState';
import { PremiumLoadingState } from './PremiumLoadingState';

const statusOptions = ['all', 'preview', 'scheduled', 'sent', 'failed'];
const defaultTypeOptions = ['all'];

const pilotJourneys = [
  {
    id: 'welcome',
    title: 'Bienvenida',
    automationTypes: ['welcome', 'welcome_message'],
    trigger: 'Llegada o check-in',
    eligibility: 'Huésped con reserva válida y destinatario de demo.',
    description: 'Abre la relación con el huésped y deja claro que el hotel está disponible por WhatsApp.'
  },
  {
    id: 'pre_checkin',
    title: 'Pre check-in',
    automationTypes: ['pre_checkin', 'pre_arrival_1d', 'pre_arrival_7d', 'pre_arrival'],
    trigger: 'Antes de la llegada',
    eligibility: 'Reserva confirmada dentro de la ventana pre-estancia.',
    description: 'Prepara llegada, datos pendientes y expectativas antes de que el huésped entre al hotel.'
  },
  {
    id: 'during_stay_upsell',
    title: 'Durante estancia + upsell',
    automationTypes: ['during_stay', 'upselling', 'weather_trigger', 'abandoned_interest_followup'],
    trigger: 'Durante la estancia',
    eligibility: 'Huésped alojado con contexto PMS y señales operativas o comerciales.',
    description: 'Detecta necesidades reales, oportunidades de experiencia y upsell sin saturar al huésped.'
  },
  {
    id: 'checkout_review',
    title: 'Check-out + reseña',
    automationTypes: ['checkout', 'review_request', 'post_stay_review', 'post_stay_review_intelligence'],
    trigger: 'Salida y post-estancia',
    eligibility: 'Huésped en salida o estancia completada con ventana válida de reseña.',
    description: 'Ordena la salida y decide entre reseña pública, feedback privado o alerta interna.'
  }
];

const pilotTypeSet = new Set(pilotJourneys.flatMap((journey) => journey.automationTypes));

const statusLabels = {
  all: 'Todos los estados',
  preview: 'Preview',
  scheduled: 'Programado',
  sent: 'Histórico enviado',
  failed: 'Incidencia'
};

const typeLabels = {
  all: 'Todos los journeys piloto',
  welcome: 'Bienvenida',
  welcome_message: 'Bienvenida',
  pre_checkin: 'Pre check-in',
  pre_arrival_1d: 'Pre check-in',
  pre_arrival_7d: 'Pre check-in',
  pre_arrival: 'Pre check-in',
  during_stay: 'Durante estancia',
  upselling: 'Upsell contextual',
  weather_trigger: 'Oportunidad por clima',
  abandoned_interest_followup: 'Seguimiento de interés',
  checkout: 'Check-out',
  review_request: 'Reseña post-estancia',
  post_stay_review: 'Reseña post-estancia',
  post_stay_review_intelligence: 'Reseña post-estancia'
};

const skippedReasonLabels = {
  welcome_already_delivered: 'Bienvenida ya preparada',
  not_in_pre_arrival_window: 'Fuera de ventana pre-estancia',
  guest_not_in_house: 'Huésped no alojado',
  no_guest_interest: 'Sin señal comercial',
  not_departing: 'No está en salida',
  not_checked_out_24h_ago: 'Todavía no aplica reseña',
  missing_recipient: 'Sin destinatario seguro',
  missing_reservation: 'Sin reserva válida'
};

const normalizeTypeToken = (value) => String(value || '').trim().toLowerCase();
const uniqueTypes = (values = []) => [...new Set(values
  .flat()
  .filter(Boolean)
  .map(normalizeTypeToken)
  .filter(Boolean))];

const familyFromRecord = (record = {}) => uniqueTypes([
  record.type,
  record.automation_type,
  record.canonical_type,
  record.canonicalType,
  record.metadata?.canonical_type,
  record.metadata?.canonical_automation_type,
  record.metadata?.legacy_automation_type,
  record.metadata?.automation_type,
  record.metadata?.aliases,
  record.aliases
]);

const recordMatchesType = (record, typeOrAliases) => {
  const aliases = uniqueTypes(Array.isArray(typeOrAliases) ? typeOrAliases : [typeOrAliases]);
  const family = familyFromRecord(record);
  return family.some((type) => aliases.includes(type));
};

const recordMatchesPilot = (record) => familyFromRecord(record).some((type) => pilotTypeSet.has(type));

const formatAutomationLabel = (value) => {
  const normalized = normalizeTypeToken(value);
  return typeLabels[normalized] || String(value || 'Automatización').replace(/_/g, ' ');
};

const formatStatusLabel = (value) => statusLabels[normalizeTypeToken(value)] || String(value || 'Sin estado').replace(/_/g, ' ');

const formatSkippedReason = (value) => skippedReasonLabels[normalizeTypeToken(value)] || String(value || 'Sin motivo').replace(/_/g, ' ');

const formatDate = (value) => {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const formatDateOnly = (value) => {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(value));
};

const buildPreviewResultMessage = (body = {}) => {
  const hotelName = body.hotel?.name || 'hotel activo';
  const evaluatedReservations = Number(body.evaluatedReservations || body.decisions?.evaluatedReservations || 0);
  const preview = Number(body.preview ?? body.previewGenerated ?? body.scheduled ?? body.decisions?.preview ?? 0);
  const skipped = Number(body.skipped ?? body.decisions?.skipped ?? 0);
  const duplicateCandidate = Number(body.duplicateCandidate ?? body.decisions?.duplicateCandidate ?? 0);
  const duplicateExisting = Number(body.duplicateExisting ?? body.decisions?.duplicateExisting ?? 0);
  const duplicates = duplicateCandidate + duplicateExisting;

  return `Preview generado para ${hotelName}: ${evaluatedReservations} reservas evaluadas, ${preview} previews preparados, ${skipped} omitidas y ${duplicates} duplicadas. Modo preview: no se enviaron mensajes reales.`;
};

const getJourneyForRecord = (record) => pilotJourneys.find((journey) => recordMatchesType(record, journey.automationTypes));

const Card = ({ children, className = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={cn(ui.card(isLight), className)}>
      {children}
    </section>
  );
};

const Badge = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  return (
    <span className={ui.badge(isLight, tone)}>
      {children}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value, tone }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-60">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </div>
      <Badge tone={tone}>
        <Icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Preview
      </Badge>
    </div>
  </Card>
);

const JourneyCard = ({ journey, messages, automations }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const relatedMessages = messages.filter((message) => recordMatchesType(message, journey.automationTypes));
  const relatedAutomations = automations.filter((automation) => recordMatchesType(automation, journey.automationTypes));
  const configured = relatedAutomations.some((automation) => automation.active !== false);

  return (
    <article className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{journey.title}</p>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{journey.trigger}</p>
        </div>
        <Badge tone="emerald">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Certificado para preview
        </Badge>
      </div>
      <p className={cn('mt-3 text-sm leading-6', ui.text.body(isLight))}>{journey.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone={configured ? 'emerald' : 'amber'}>{configured ? 'Configurado' : 'Pendiente de configurar'}</Badge>
        <Badge tone="sky">{relatedMessages.length} previews</Badge>
        <Badge tone="slate">Sin envío real</Badge>
      </div>
      <p className={cn('mt-3 text-xs leading-5', ui.text.muted(isLight))}>{journey.eligibility}</p>
    </article>
  );
};

export const AutomationsClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [messages, setMessages] = useState([]);
  const [rules, setRules] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [hotel, setHotel] = useState(null);
  const [typeOptions, setTypeOptions] = useState(defaultTypeOptions);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [runningPreviewPass, setRunningPreviewPass] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState(null);
  const [migrationRequired, setMigrationRequired] = useState(false);

  const inputClass = ui.input(isLight);

  const loadAutomations = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/automations', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'No se pudieron cargar las automatizaciones');
      }

      if (!shouldAcceptTenantPayload(body, 'automations')) {
        return;
      }

      setMessages(body.scheduledMessages || []);
      setRules(body.rules || []);
      setAutomations(body.automations || []);
      setTypeOptions(body.automationTypeOptions?.length ? body.automationTypeOptions : defaultTypeOptions);
      setMetrics(body.metrics || null);
      setHotel(body.hotel || null);
      setMigrationRequired(Boolean(body.migrationRequired));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAutomations();

    const handleWorkspaceChange = () => {
      setRunResult(null);
      loadAutomations();
    };

    window.addEventListener(WORKSPACE_SELECTION_EVENT, handleWorkspaceChange);

    return () => {
      window.removeEventListener(WORKSPACE_SELECTION_EVENT, handleWorkspaceChange);
    };
  }, []);

  const runPreviewPass = async () => {
    setRunningPreviewPass(true);
    setRunResult(null);
    setError(null);

    try {
      if (!hotel?.id) {
        throw new Error('Selecciona un hotel antes de generar previews.');
      }

      const response = await fetch('/api/automations/run', {
        method: 'POST',
        headers: await getAuthHeaders({ hotelId: hotel.id })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'No se pudieron generar los previews.');
      }

      if (!shouldAcceptTenantPayload(body, 'automations-run')) {
        throw new Error('El resultado no pertenece al hotel activo.');
      }

      setRunResult(buildPreviewResultMessage(body));
      await loadAutomations();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setRunningPreviewPass(false);
    }
  };

  const pilotAutomations = useMemo(() => automations.filter(recordMatchesPilot), [automations]);
  const pilotMessages = useMemo(() => messages.filter(recordMatchesPilot), [messages]);
  const pilotRules = useMemo(() => rules.filter(recordMatchesPilot), [rules]);

  const pilotTypeOptions = useMemo(() => {
    const options = uniqueTypes(typeOptions).filter((type) => type === 'all' || pilotTypeSet.has(type));
    const canonical = ['all', 'welcome', 'pre_checkin', 'during_stay', 'upselling', 'checkout', 'review_request'];
    return uniqueTypes([options.length > 1 ? options : canonical]);
  }, [typeOptions]);

  const filteredMessages = useMemo(() => {
    const query = search.trim().toLowerCase();

    return pilotMessages.filter((message) => {
      const matchesStatus = statusFilter === 'all' || message.status === statusFilter;
      const matchesType = typeFilter === 'all' || recordMatchesType(message, typeFilter);
      const journey = getJourneyForRecord(message);
      const haystack = [
        journey?.title,
        message.automation_type,
        message.metadata?.canonical_automation_type,
        message.status,
        message.message_preview,
        message.guest?.current_room,
        message.reservation?.guest_name
      ].filter(Boolean).join(' ').toLowerCase();

      return matchesStatus && matchesType && (!query || haystack.includes(query));
    });
  }, [pilotMessages, search, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    certifiedJourneys: pilotJourneys.length,
    previews: pilotMessages.filter((item) => item.status === 'preview').length,
    scheduled: pilotMessages.filter((item) => item.status === 'scheduled').length,
    failed: pilotMessages.filter((item) => item.status === 'failed').length,
    configured: pilotAutomations.filter((item) => item.active !== false).length
  }), [pilotAutomations, pilotMessages]);

  const skippedReasons = useMemo(() => {
    const runs = (metrics?.runs || []).filter(recordMatchesPilot);
    return runs.reduce((acc, run) => {
      const reason = run.metadata?.skipped_reason;
      if (reason) {
        acc[reason] = (acc[reason] || 0) + 1;
      }
      return acc;
    }, {});
  }, [metrics]);

  return (
    <div className="space-y-6">
      <Card className={isLight ? 'overflow-hidden bg-gradient-to-br from-white via-white to-emerald-50/70 p-5' : 'overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.18),transparent_34%),#0b1019] p-5'}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="emerald">
                <WandSparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Journeys certificados
              </Badge>
              <Badge tone="sky">Modo preview</Badge>
              <Badge tone="slate">Sin envío real</Badge>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Journeys piloto</h2>
            <p className={cn('mt-2 text-sm leading-6', ui.text.body(isLight))}>
              Staynex prepara Bienvenida, Pre check-in, Durante estancia + upsell y Check-out + reseña como previews seguros sobre contexto PMS. Modo preview — no se enviarán mensajes reales.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              type="button"
              onClick={loadAutomations}
              className={ui.button(isLight, 'secondary')}
            >
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
              Actualizar
            </button>
            <button
              type="button"
              onClick={runPreviewPass}
              disabled={runningPreviewPass}
              className={ui.button(isLight, 'primary')}
            >
              <Bot className={runningPreviewPass ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} aria-hidden="true" />
              Generar previews
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={CheckCircle2} label="Journeys certificados" value={stats.certifiedJourneys} tone="emerald" />
        <StatCard icon={Sparkles} label="Previews preparados" value={stats.previews} tone="sky" />
        <StatCard icon={CalendarClock} label="Programados" value={stats.scheduled} tone="amber" />
        <StatCard icon={ShieldCheck} label="Incidencias preview" value={stats.failed} tone={stats.failed ? 'red' : 'emerald'} />
        <StatCard icon={Zap} label="Configuradas" value={stats.configured} tone="emerald" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className={isLight ? 'h-4 w-4 text-emerald-600' : 'h-4 w-4 text-emerald-300'} aria-hidden="true" />
              <p className="text-sm font-semibold">Certificado para preview, no para envío real</p>
            </div>
            <p className={cn('mt-1 text-sm', ui.text.muted(isLight))}>
              Las automatizaciones se muestran como previews revisables por el hotel. Activar envíos reales queda fuera del piloto.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="emerald">Contexto PMS</Badge>
            <Badge tone="sky">Revisión humana</Badge>
            <Badge tone="slate">Envíos reales apagados</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {pilotJourneys.map((journey) => (
          <JourneyCard key={journey.id} journey={journey} messages={pilotMessages} automations={pilotAutomations} />
        ))}
      </div>

      {Object.keys(skippedReasons).length > 0 ? (
        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold">Previews omitidos</p>
              <p className={cn('mt-1 text-sm', ui.text.muted(isLight))}>
                Staynex evita preparar mensajes cuando falta contexto seguro o no aplica la ventana del journey.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(skippedReasons).map(([reason, count]) => (
                <Badge key={reason} tone="amber">{formatSkippedReason(reason)}: {count}</Badge>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {migrationRequired ? (
        <div className={ui.notice(isLight, 'warning')}>
          Falta configuración interna del motor de automatizaciones. Para la demo, mantén el flujo en preview y fallback humano.
        </div>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Playbooks piloto</p>
            <p className={cn('mt-1 text-sm', ui.text.muted(isLight))}>
              Solo se destacan los journeys que se enseñarán a Checkin.
            </p>
          </div>
          <Badge tone="sky">{pilotAutomations.length || pilotRules.length} configuraciones</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pilotAutomations.map((automation) => {
            const journey = getJourneyForRecord(automation);
            const relatedMessages = pilotMessages.filter((message) => recordMatchesType(message, familyFromRecord(automation)));
            const lastPreview = relatedMessages[0]?.scheduled_for || relatedMessages[0]?.created_at || automation.updated_at || automation.created_at;

            return (
              <article
                key={automation.type}
                className={isLight ? 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{formatAutomationLabel(automation.type)}</p>
                    <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
                      {journey?.title || 'Journey piloto'}
                    </p>
                  </div>
                  <Badge tone={automation.active === false ? 'amber' : 'emerald'}>{automation.active === false ? 'Pausada' : 'Configurada'}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="slate">Sin envío real</Badge>
                  <Badge tone="amber">{automation.cooldown_minutes || 0} min de pausa</Badge>
                  <Badge tone="sky">{relatedMessages.length} previews</Badge>
                </div>
                <p className={cn('mt-4 text-xs leading-5', ui.text.muted(isLight))}>
                  Último preview: {lastPreview ? formatDate(lastPreview) : 'sin previews todavía'}.
                </p>
              </article>
            );
          })}
          {!pilotAutomations.length ? (
            <PremiumEmptyState
              icon={CalendarClock}
              title="No hay playbooks piloto configurados."
              description="Los cuatro journeys certificados siguen disponibles como guía de preview para la demo."
              className="md:col-span-2 xl:col-span-3"
            />
          ) : null}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold">{hotel?.name || 'Hotel activo'}</p>
            <p className={cn('mt-1 text-sm', ui.text.muted(isLight))}>
              Cada decisión se prepara como preview seguro. Esta pantalla no envía mensajes al huésped.
            </p>
          </div>
          <Badge tone="slate">Modo preview</Badge>
        </div>
      </Card>

      {runResult ? (
        <div className={ui.notice(isLight, 'success')}>
          {runResult}
        </div>
      ) : null}

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="relative">
            <Search className={isLight ? 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400' : 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-600'} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar huésped, habitación o preview"
              className={`${inputClass} w-full pl-9`}
            />
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={inputClass}>
            {pilotTypeOptions.map((type) => (
              <option key={type} value={type}>{formatAutomationLabel(type)}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{formatStatusLabel(status)}</option>
            ))}
          </select>
        </div>
      </Card>

      {error ? (
        <div className={ui.notice(isLight, 'danger')}>
          No se pudieron actualizar los previews. Revisa la sesión del hotel y vuelve a intentarlo.
        </div>
      ) : null}

      {loading ? (
        <PremiumLoadingState
          title="Cargando automatizaciones"
          description="Staynex está preparando journeys piloto, previews y salvaguardas operativas."
          rows={5}
          cards={3}
        />
      ) : null}

      {!loading ? <Card className="overflow-hidden p-0">
        <div className={isLight ? 'border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900' : 'border-b border-white/10 px-4 py-3 text-sm font-semibold text-white'}>
          {`${filteredMessages.length} previews preparados`}
        </div>
        <div className="divide-y divide-slate-200/10">
          {filteredMessages.map((message) => {
            const journey = getJourneyForRecord(message);

            return (
              <article key={message.id} className={isLight ? 'grid gap-4 p-4 transition hover:bg-slate-50 xl:grid-cols-[1fr_0.75fr_0.75fr_0.7fr]' : 'grid gap-4 p-4 transition hover:bg-white/[0.035] xl:grid-cols-[1fr_0.75fr_0.75fr_0.7fr]'}>
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="sky">{journey?.title || formatAutomationLabel(message.automation_type)}</Badge>
                    <Badge tone={message.status === 'failed' ? 'red' : message.status === 'sent' ? 'slate' : 'amber'}>
                      {formatStatusLabel(message.status)}
                    </Badge>
                    {message.automation_fallback ? <Badge tone="emerald">Preview seguro</Badge> : null}
                  </div>
                  <p className={cn('mt-3 text-sm leading-6', ui.text.body(isLight))}>
                    {message.message_preview || 'Preview pendiente de generar.'}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">Huésped</p>
                  <p className={cn('mt-1', ui.text.body(isLight))}>
                    {message.reservation?.guest_name || 'Huésped demo'}
                  </p>
                  <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
                    Habitación {message.guest?.current_room || '-'}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">Estancia</p>
                  <p className={cn('mt-1', ui.text.body(isLight))}>
                    {formatDateOnly(message.reservation?.arrival_date)} a {formatDateOnly(message.reservation?.departure_date)}
                  </p>
                  <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
                    Contexto PMS demo si aplica
                  </p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">Preview</p>
                  <p className={cn('mt-1', ui.text.body(isLight))}>{formatDate(message.scheduled_for)}</p>
                  <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
                    No se enviarán mensajes reales
                  </p>
                </div>
              </article>
            );
          })}
          {filteredMessages.length === 0 ? (
            <PremiumEmptyState
              icon={Clock3}
              title="No hay previews para estos filtros."
              description="Genera previews o cambia los filtros para ver mensajes preparados del piloto."
              className="m-4"
            />
          ) : null}
        </div>
      </Card> : null}
    </div>
  );
};
