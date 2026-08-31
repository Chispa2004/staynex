'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  PlugZap,
  Power,
  PowerOff,
  QrCode,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Workflow
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { cn, ui } from '@/lib/ui/styles';

const iconById = {
  pms: PlugZap,
  whatsapp: Inbox,
  ai: Bot,
  tickets: AlertTriangle,
  provider_bookings: Sparkles,
  automations: ClipboardCheck,
  conversations: Inbox,
  qr_rooms: QrCode,
  reception: ShieldCheck,
  folio: ClipboardCheck
};

const statusLabel = {
  healthy: 'Operativo',
  warning: 'Necesita atención',
  critical: 'Crítico'
};

const pilotStatusLabel = {
  HEALTHY: 'Operativo',
  DEGRADED: 'Degradado',
  'ACTION REQUIRED': 'Acción requerida',
  BLOCKED: 'Bloqueado',
  DEMO_READY: 'Lista para demostración',
  GO_LIVE_PENDING: 'Go-Live pendiente'
};

const severityLabel = {
  critical: 'Crítico',
  warning: 'Necesita atención',
  info: 'Informativo'
};

const componentLabel = {
  Backend: 'Plataforma',
  PMS: 'PMS',
  WhatsApp: 'WhatsApp',
  AI: 'IA',
  Automations: 'Journeys',
  Operations: 'Operaciones',
  'PMS Connected': 'PMS conectado',
  'WhatsApp Online': 'WhatsApp disponible',
  'AI Auto-Reply': 'Respuestas IA',
  'Open Tickets': 'Tickets abiertos',
  'Provider Bookings': 'Solicitudes a proveedores',
  'Automations Healthy': 'Journeys piloto',
  Conversations: 'Conversaciones',
  'QR Rooms Active': 'QR habitaciones',
  'Reception Module': 'Recepción',
  'Checkout Folio': 'Folio de salida',
  'Demo environment': 'Entorno demo',
  'Live workspace': 'Workspace real',
  'Guest review risk detected': 'Riesgo de reseña detectado',
  'Pending check-ins': 'Check-ins pendientes',
  'Provider booking follow-up': 'Seguimiento de proveedor',
  'Urgent tickets unresolved': 'Tickets urgentes pendientes'
};

const healthTextLabels = {
  '/health disponible y request ids activos.': 'La plataforma responde y la trazabilidad está activa.',
  'Mantener revision diaria.': 'Mantener revisión diaria.',
  'La UI esta disponible, pero parte del health no se pudo cargar.': 'La interfaz está disponible, pero parte de la salud operativa no se pudo cargar.',
  'Revisar el request id y repetir health.': 'Revisar trazabilidad y volver a comprobar salud.',
  'No hay PMS activo para el hotel piloto.': 'No hay PMS activo para el hotel piloto.',
  'Configurar o verificar PMS antes de operar con datos reales.': 'Configurar o verificar PMS antes de operar con datos reales.',
  'WhatsApp no esta configurado para el hotel.': 'WhatsApp no está configurado para el hotel.',
  'Configurar WhatsApp antes de usar un hotel real.': 'Configurar WhatsApp antes de usar un hotel real.',
  'Revisar Inbox y estado Twilio sin reenviar automaticamente.': 'Revisar Inbox y estado WhatsApp sin reenviar automáticamente.',
  'Mantener prueba diaria.': 'Mantener prueba diaria.',
  'Confirmar webhook inbound y remitente outbound.': 'Confirmar entrada WhatsApp y remitente antes de operar con envío real.',
  'El fallback humano no esta disponible.': 'El fallback humano no está disponible.',
  'Revisar Inbox takeover y gate central.': 'Revisar control humano en Inbox y el gate central.',
  'Mantener Inbox manual y revisar escalaciones.': 'Mantener Inbox manual y revisar escalaciones.',
  'Confirmar estado del kill switch antes de demo/live.': 'Confirmar estado del Kill Switch antes de demo o envío real.',
  'Auto-reply habilitado, proveedor disponible y fallback humano usable.': 'Respuestas IA habilitadas, proveedor disponible y fallback humano usable.',
  'Revisar escalaciones diariamente.': 'Revisar escalaciones diariamente.',
  'Hay automatizaciones fallidas o en retry; no deben reenviarse automaticamente.': 'Hay journeys fallidos o en reintento; no deben reenviarse automáticamente.',
  'Revisar motivo en Automations/Test Center.': 'Revisar motivo en Journeys y mantener operación en preview.',
  'No estan certificados los cuatro journeys piloto para preview.': 'No están certificados los cuatro journeys piloto para preview.',
  'Revisar matriz de certificacion.': 'Revisar matriz de certificación.',
  'Live send esta desactivado por diseno; preview runtime saludable.': 'El envío real está desactivado por diseño; el motor de preview está saludable.',
  'Mantener SEND_AUTOMATIONS=false hasta cerrar gates live.': 'Mantener envíos reales apagados hasta cerrar los controles de envío real.',
  'SEND_AUTOMATIONS esta ON; faltan gates live antes de permitir envio real.': 'El envío real está activo; faltan controles antes de permitir mensajes reales.',
  'Apagar live send o completar gates live.': 'Apagar envío real o completar controles de envío real.',
  'Abrir Inbox/Tickets y resolver manualmente.': 'Abrir Inbox/Tickets y resolver manualmente.',
  'No hay tickets urgentes ni conversaciones pendientes de humano.': 'No hay tickets urgentes ni conversaciones pendientes de humano.',
  'Reservation data is available for hotel operations.': 'Las reservas están disponibles para operaciones del hotel.',
  'PMS data is limited until a connector is active.': 'Los datos PMS son limitados hasta activar un conector.',
  'Guest messaging is ready.': 'La mensajería con huéspedes está preparada.',
  'WhatsApp setup is incomplete.': 'La configuración de WhatsApp está incompleta.',
  'Las respuestas automáticas de IA están habilitadas para próximos inbound.': 'Las respuestas IA están habilitadas para próximos mensajes entrantes.',
  'Operación manual activa: Inbox, tickets y respuestas de recepción siguen disponibles.': 'Operación manual activa: Inbox, tickets y respuestas de recepción siguen disponibles.',
  'No real operational tickets. Demo tickets are separated from live health.': 'No hay tickets operativos reales. Los tickets demo están separados de la salud real.',
  'No unresolved tickets.': 'No hay tickets pendientes.',
  'Some provider requests need follow-up.': 'Algunas solicitudes a proveedores necesitan seguimiento.',
  'Provider requests are waiting for confirmation.': 'Hay solicitudes a proveedores esperando confirmación.',
  'No pending provider bookings.': 'No hay solicitudes pendientes a proveedores.',
  'Some scheduled guest messages need review.': 'Algunos previews programados necesitan revisión.',
  'Scheduled automations are not showing hotel-impacting issues.': 'Los journeys programados no muestran incidencias con impacto en huésped.',
  'Conversation workload is manageable.': 'La carga de conversaciones es gestionable.',
  'Room QR links are available.': 'Los enlaces QR de habitaciones están disponibles.',
  'No active QR rooms are visible.': 'No hay QR de habitaciones activos visibles.',
  'Some arrivals may need document follow-up.': 'Algunas llegadas pueden necesitar seguimiento de documentos.',
  'Pre check-in view is ready.': 'La vista de pre check-in está preparada.',
  'Some folio previews need reception review.': 'Algunos previews de folio necesitan revisión de recepción.',
  'No folio issues are visible.': 'No hay incidencias visibles de folio.',
  'Some experience requests need manual follow-up.': 'Algunas solicitudes de experiencias necesitan seguimiento manual.',
  'Urgent operational tickets are still open.': 'Siguen abiertos tickets operativos urgentes.',
  'Demo separated': 'Demo separado'
};

const valueLabels = {
  Healthy: 'Operativo',
  Configured: 'Configurado',
  'Needs setup': 'Pendiente',
  'Not connected': 'No conectado',
  ON: 'Activadas',
  OFF: 'Apagadas',
  'GLOBAL OFF': 'Apagado global',
  'No configurado': 'No configurado'
};

const formatHealthText = (value) => {
  if (!value) return '';

  const text = String(value);
  const exact = healthTextLabels[text] || componentLabel[text] || valueLabels[text];
  if (exact) return exact;

  return text
    .replace(/^(\d+) active urgent tickets need attention\.$/, '$1 tickets urgentes requieren atención.')
    .replace(/^(\d+) real operational tickets are unresolved\.$/, '$1 tickets operativos reales siguen pendientes.')
    .replace(/^(\d+) demo scenario tickets are open\.$/, '$1 tickets abiertos en el escenario demo.')
    .replace(/^(\d+) conversations are handled by reception\.$/, '$1 conversaciones están en control humano.')
    .replace(/^(\d+) arrivals still need operational review\.$/, '$1 llegadas necesitan revisión operativa.')
    .replace(/^(\d+) conversations may need careful follow-up\.$/, '$1 conversaciones pueden necesitar seguimiento cuidadoso.')
    .replace(/^(\d+) PMS connection issues detected\.$/, '$1 incidencias de conexión PMS detectadas.')
    .replace(/^(\d+) WhatsApp messages failed\.$/, '$1 mensajes WhatsApp fallaron.')
    .replace(/^(\d+) warnings$/, '$1 avisos')
    .replace(/^(\d+) need review$/, '$1 necesitan revisión')
    .replace(/^(\d+) arrivals need data$/, '$1 llegadas necesitan datos')
    .replace(/^(\d+) real$/, '$1 reales')
    .replace(/\bHEALTHY\b/g, pilotStatusLabel.HEALTHY)
    .replace(/\bDEGRADED\b/g, pilotStatusLabel.DEGRADED)
    .replace(/\bACTION REQUIRED\b/g, pilotStatusLabel['ACTION REQUIRED'])
    .replace(/\bBLOCKED\b/g, pilotStatusLabel.BLOCKED)
    .replace(/\bAuto-reply\b/g, 'Respuestas IA')
    .replace(/\bautomations\b/gi, 'journeys')
    .replace(/\bautomatically\b/gi, 'automáticamente')
    .replace(/\besta\b/g, 'está')
    .replace(/\brevision\b/g, 'revisión')
    .replace(/\bconexion\b/g, 'conexión')
    .replace(/\bconfiguracion\b/g, 'configuración')
    .replace(/\bcertificacion\b/g, 'certificación')
    .replace(/\bdiseno\b/g, 'diseño')
    .replace(/\benvio\b/g, 'envío');
};

const formatPilotWhyLine = (value) => {
  const text = String(value || '');
  const match = text.match(/^(.+): (HEALTHY|DEGRADED|ACTION REQUIRED|BLOCKED) - (.+)$/);

  if (!match) {
    return formatHealthText(text);
  }

  const [, label, status, reason] = match;
  const displayStatus = label === 'Automations'
    && status === 'BLOCKED'
    && /Live send esta desactivado/.test(reason)
    ? 'GO_LIVE_PENDING'
    : status;
  return `${formatHealthText(label)}: ${pilotStatusLabel[displayStatus] || displayStatus}. ${formatHealthText(reason)}`;
};

const pilotStatusTone = {
  HEALTHY: 'emerald',
  DEGRADED: 'amber',
  'ACTION REQUIRED': 'amber',
  BLOCKED: 'red',
  DEMO_READY: 'emerald',
  GO_LIVE_PENDING: 'amber'
};

const pilotIconById = {
  backend: ServerCog,
  pms: PlugZap,
  whatsapp: Activity,
  ai: Bot,
  automations: Workflow,
  operations: AlertTriangle
};

const getPilotComponentDisplayStatus = (item = {}) => (
  item.id === 'automations'
  && item.details?.previewRuntimeHealthy === true
  && item.details?.liveSendExplicitlyOff === true
    ? 'GO_LIVE_PENDING'
    : item.status
);

export const HotelHealthClient = () => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [killSwitchUpdating, setKillSwitchUpdating] = useState(false);
  const [error, setError] = useState(null);

  const loadHealth = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const response = await fetch('/api/health/hotel', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || tx('Hotel health could not be loaded'));
      }

      if (!shouldAcceptTenantPayload(body, 'hotel-health')) {
        return;
      }

      setPayload(body);
      setError(null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const health = payload?.health || {};
  const pilotHealth = health.pilotHealth || {};
  const pilotAiSafety = payload?.pilotAiSafety || {};
  const hotelAiStatus = pilotAiSafety.hotelStatus || {};
  const globalAiStatus = pilotAiSafety.globalStatus || {};
  const hotelAutoReplyConfigured = Boolean(hotelAiStatus.configured);
  const hotelAutoReplyEnabled = Boolean(hotelAiStatus.enabled);
  const globalAutoReplyAllowed = globalAiStatus.allowed !== false;
  const allOperational = health.overallStatus === 'healthy' && !health.warnings?.length;
  const demoReadyLivePending = Boolean(pilotHealth.readyForPilotDemo && pilotHealth.readyForLiveAutomations === false);
  const pilotHeaderStatus = demoReadyLivePending ? 'DEMO_READY' : pilotHealth.demoStatus || pilotHealth.status;
  const healthHeadline = demoReadyLivePending
    ? 'Demo preparada; Go-Live pendiente.'
    : allOperational ? 'Staynex está preparado y funcionando.' : 'Staynex necesita revisión antes de demo o envío real.';
  const healthStateValue = demoReadyLivePending
    ? 'Lista para demostración'
    : statusLabel[health.overallStatus] || 'Operativo';
  const healthStateTone = demoReadyLivePending
    ? 'emerald'
    : health.overallStatus === 'warning' ? 'amber' : health.overallStatus === 'critical' ? 'red' : 'emerald';

  const updateHotelAutoReply = async (enabled) => {
    setKillSwitchUpdating(true);

    try {
      const response = await fetch('/api/health/hotel', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'set_ai_auto_reply',
          enabled
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || tx('No se pudo actualizar el Kill Switch IA'));
      }

      setPayload((current) => ({
        ...current,
        ...body
      }));
      await loadHealth({ silent: true });
      setError(null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setKillSwitchUpdating(false);
    }
  };

  return (
    <section className="space-y-5">
      <section className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className={ui.text.eyebrow(isLight)}>Salud operativa del hotel</p>
            <h2 className={cn('mt-2 text-3xl', ui.text.title(isLight))}>
              {healthHeadline}
            </h2>
            <p className={cn('mt-2 max-w-3xl', ui.text.body(isLight))}>
              Vista operativa para recepción y administración: impacto en huésped, causa y siguiente acción.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HealthBadge status={health.overallStatus || 'healthy'} />
            {health.environment?.isDemo ? <span className={ui.badge(isLight, 'sky')}>{formatHealthText(health.environment.label)}</span> : null}
            {demoReadyLivePending ? <span className={ui.badge(isLight, 'amber')}>Go-Live pendiente</span> : null}
            <button type="button" onClick={() => loadHealth()} disabled={refreshing} className={ui.button(isLight, 'secondary')}>
              <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
              Actualizar
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Score operativo" value={loading ? '...' : `${health.healthScore || 0}%`} tone={health.overallStatus === 'critical' ? 'red' : health.overallStatus === 'warning' ? 'amber' : 'emerald'} />
          <SummaryTile label="Estado actual" value={loading ? '...' : healthStateValue} tone={healthStateTone} />
          <SummaryTile label="Avisos" value={loading ? '...' : health.warnings?.length || 0} tone={health.warnings?.length ? 'amber' : 'emerald'} />
        </div>
      </section>

      {!loading && pilotHealth.components?.length ? (
        <section className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className={ui.text.eyebrow(isLight)}>Salud piloto</p>
              <h3 className={cn('mt-1 text-2xl font-semibold', ui.text.title(isLight))}>
                {pilotHealth.readyForPilotDemo ? 'Demo preparada' : 'Necesita acción antes de la demo'}
              </h3>
              <p className={cn('mt-2 max-w-3xl text-sm leading-6', ui.text.body(isLight))}>
                {demoReadyLivePending
                  ? 'La demo está lista; el Go-Live queda pendiente hasta cerrar los controles de envío real.'
                  : pilotHealth.why?.length
                  ? 'El estado muestra solo impacto operativo y razones accionables.'
                  : 'No hay problemas operativos visibles para el ensayo piloto.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PilotStatusBadge status={pilotHeaderStatus} />
              <span className={ui.badge(isLight, pilotHealth.readyForPilotDemo ? 'emerald' : 'amber')}>
                {pilotHealth.readyForPilotDemo ? 'Lista para demostración' : 'Revisar antes de demo'}
              </span>
              <span className={ui.badge(isLight, pilotHealth.readyForLiveAutomations ? 'emerald' : 'red')}>
                {pilotHealth.readyForLiveAutomations ? 'Envío real permitido' : 'Go-Live pendiente'}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {pilotHealth.components.map((item) => (
              <PilotHealthRow key={item.id} item={item} />
            ))}
          </div>

          {pilotHealth.why?.length ? (
            <div className={cn('mt-4 rounded-xl border p-4', isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-300/20 bg-amber-400/10')}>
              <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>Por qué</p>
              <ul className={cn('mt-2 space-y-1 text-sm leading-6', ui.text.body(isLight))}>
                {pilotHealth.why.map((reason) => (
                  <li key={reason}>{formatPilotWhyLine(reason)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className={ui.text.eyebrow(isLight)}>Kill Switch IA del hotel</p>
            <h3 className={cn('mt-1 text-xl', ui.text.title(isLight))}>
              {globalAutoReplyAllowed
                ? hotelAutoReplyEnabled
                  ? 'Respuestas IA activas'
                  : 'Respuestas IA apagadas'
                : 'Apagado global activo'}
            </h3>
            <p className={cn('mt-2 max-w-3xl text-sm leading-6', ui.text.body(isLight))}>
              {globalAutoReplyAllowed
                ? hotelAutoReplyConfigured
                  ? 'Inbox, tickets y respuestas manuales siguen operativos. Este control solo gobierna respuestas automáticas; no es el takeover de una conversación.'
                  : 'Configura el estado del hotel antes del piloto. Hasta entonces, las respuestas IA fallan cerradas.'
                : 'El apagado global prevalece sobre el hotel. La operación manual sigue disponible.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={ui.badge(isLight, globalAutoReplyAllowed ? 'emerald' : 'red')}>
              {globalAutoReplyAllowed ? 'Global permitido' : 'Global apagado'}
            </span>
            <span className={ui.badge(isLight, hotelAutoReplyEnabled ? 'emerald' : 'amber')}>
              {hotelAutoReplyConfigured ? hotelAutoReplyEnabled ? 'Hotel activo' : 'Hotel apagado' : 'Hotel no configurado'}
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateHotelAutoReply(true)}
            disabled={killSwitchUpdating || hotelAutoReplyEnabled}
            className={ui.button(isLight, 'primary')}
          >
            <Power className="h-4 w-4" aria-hidden="true" />
            Activar respuestas IA
          </button>
          <button
            type="button"
            onClick={() => updateHotelAutoReply(false)}
            disabled={killSwitchUpdating || hotelAutoReplyConfigured && !hotelAutoReplyEnabled}
            className={ui.button(isLight, 'secondary')}
          >
            <PowerOff className="h-4 w-4" aria-hidden="true" />
            Apagar respuestas IA
          </button>
        </div>
      </section>

      {error ? (
        <div className={cn('rounded-xl border p-4 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          No se pudo cargar o actualizar Pilot Health. Revisa la sesión del hotel y vuelve a intentarlo.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          [0, 1, 2, 3, 4, 5].map((item) => <div key={item} className={cn('h-36 rounded-xl', ui.skeleton(isLight))} />)
        ) : (
          (health.statusCards || []).map((card) => <HealthCard key={card.id} card={card} />)
        )}
      </section>

      <section className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={ui.text.eyebrow(isLight)}>Avisos operativos</p>
            <h3 className={cn('mt-1 text-xl', ui.text.title(isLight))}>Solo impacto visible para huésped</h3>
          </div>
          <Link href="/dashboard/reception" className={ui.button(isLight, 'secondary')}>
            Abrir recepción
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {loading ? (
          <div className={cn('mt-4 h-28 rounded-xl', ui.skeleton(isLight))} />
        ) : health.warnings?.length ? (
          <div className="mt-4 space-y-3">
            {health.warnings.map((warning) => (
              <WarningRow key={`${warning.id}-${warning.label}`} warning={warning} />
            ))}
          </div>
        ) : (
          <div className={cn('mt-4 rounded-xl border border-dashed p-6 text-center', isLight ? 'border-emerald-200 bg-emerald-50' : 'border-emerald-300/20 bg-emerald-300/10')}>
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" aria-hidden="true" />
            <p className={cn('mt-3 text-sm font-semibold', ui.text.title(isLight))}>Todo operativo para la demo.</p>
            <p className={cn('mt-1', ui.text.muted(isLight))}>No hay tickets urgentes, servicios desconectados o avisos visibles para huésped ahora mismo.</p>
          </div>
        )}
      </section>
    </section>
  );
};

const PilotStatusBadge = ({ status = 'HEALTHY' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <span className={ui.badge(isLight, pilotStatusTone[status] || 'slate')}>
      {pilotStatusLabel[status] || formatHealthText(status)}
    </span>
  );
};

const PilotHealthRow = ({ item }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const Icon = pilotIconById[item.id] || ShieldCheck;
  const displayStatus = getPilotComponentDisplayStatus(item);

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={ui.badge(isLight, pilotStatusTone[displayStatus] || 'slate', true)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{formatHealthText(item.label)}</p>
            <p className={cn('mt-1 text-xs font-semibold uppercase tracking-[0.14em]', ui.text.muted(isLight))}>Por qué</p>
            <p className={cn('mt-1 text-sm leading-5', ui.text.body(isLight))}>{formatHealthText(item.why)}</p>
          </div>
        </div>
        <PilotStatusBadge status={displayStatus} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.action ? <span className={ui.badge(isLight, 'slate', true)}>Acción: {formatHealthText(item.action)}</span> : null}
        {item.href ? (
          <Link href={item.href} className={ui.button(isLight, 'small')}>
            Abrir pantalla
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
};

const HealthBadge = ({ status = 'healthy' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tone = status === 'critical' ? 'red' : status === 'warning' ? 'amber' : 'emerald';

  return (
    <span className={ui.badge(isLight, tone)}>
      {statusLabel[status] || 'Operativo'}
    </span>
  );
};

const SummaryTile = ({ label, value, tone }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border p-4 text-center', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <p className={ui.text.eyebrow(isLight)}>{formatHealthText(label)}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{value}</p>
      <div className={cn('mx-auto mt-3 h-1.5 w-16 rounded-full', tone === 'red' ? 'bg-red-400' : tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400')} />
    </div>
  );
};

const HealthCard = ({ card }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const Icon = iconById[card.id] || ShieldCheck;
  const toneClass = card.status === 'critical'
    ? isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100'
    : card.status === 'warning'
      ? isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300/20 bg-amber-400/10 text-amber-100'
      : isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';

  return (
    <article className={cn('rounded-xl border p-4', ui.surface(isLight))}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl border', toneClass)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <HealthBadge status={card.status} />
      </div>
      <p className={cn('mt-4 text-sm font-semibold', ui.text.title(isLight))}>{formatHealthText(card.label)}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{formatHealthText(card.value)}</p>
      {card.badge ? <span className={cn('mt-2', ui.badge(isLight, 'sky', true))}>{formatHealthText(card.badge)}</span> : null}
      <p className={cn('mt-2 min-h-10 text-sm leading-5', ui.text.body(isLight))}>{formatHealthText(card.description)}</p>
    </article>
  );
};

const WarningRow = ({ warning }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tone = warning.severity === 'critical' ? 'red' : warning.severity === 'warning' ? 'amber' : 'sky';

  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400' : 'text-sky-400')} aria-hidden="true" />
        <div>
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{formatHealthText(warning.label)}</p>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>{formatHealthText(warning.message)}</p>
        </div>
      </div>
      <span className={ui.badge(isLight, tone)}>{severityLabel[warning.severity] || formatHealthText(warning.severity)}</span>
    </div>
  );
};

