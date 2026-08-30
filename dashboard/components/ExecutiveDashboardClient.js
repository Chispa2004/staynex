'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  ConciergeBell,
  DatabaseZap,
  Inbox,
  Languages,
  Map,
  PauseCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  TrendingUp,
  Wrench,
  Zap
} from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { getAuthHeaders } from '@/lib/auth-headers';
import { canAccess } from '@/lib/permissions';
import { getActiveTenantId, shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { cn, ui } from '@/lib/ui/styles';

const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));
const formatPercent = (value) => `${Number(value || 0)}%`;
const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));
const formatOptionalNumber = (value) => value === null || value === undefined ? 'Sin seguimiento' : formatNumber(value);
const formatProfileLabel = (value) => String(value || '')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatProviderLabel = (value) => value ? formatProfileLabel(value) : 'Sin PMS conectado';
const formatRoleLabel = (role) => ({
  receptionist: 'Recepción',
  manager: 'Dirección',
  owner: 'Propiedad',
  admin: 'Admin'
}[role] || formatProfileLabel(role));
const formatSentimentLabel = (value) => ({
  'Needs attention': 'Necesita atención',
  Healthy: 'Correcto',
  Positive: 'Positivo',
  Neutral: 'Neutral',
  Negative: 'Negativo'
}[value] || value || 'Sin datos suficientes');

const formatDateTime = (value, timezone) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || 'Europe/Madrid',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(value ? new Date(value) : new Date());
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(value ? new Date(value) : new Date());
  }
};

const greetingForHour = (timezone) => {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Europe/Madrid',
      hour: 'numeric',
      hour12: false
    }).format(new Date()));

    if (hour < 12) return 'Buenos días';
    if (hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
  } catch {
    return 'Hola';
  }
};

const toneForSeverity = (severity) => {
  if (severity === 'critical') return 'red';
  if (severity === 'warning') return 'amber';
  if (severity === 'positive') return 'emerald';
  return 'slate';
};

export const ExecutiveDashboardClient = () => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const dashboardRequestInFlightRef = useRef(false);
  const dashboardRequestIdRef = useRef(0);
  const activeHotelIdRef = useRef(null);

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (dashboardRequestInFlightRef.current && silent) {
      return;
    }

    dashboardRequestInFlightRef.current = true;
    const requestId = dashboardRequestIdRef.current + 1;
    dashboardRequestIdRef.current = requestId;

    if (!silent) {
      setRefreshing(true);
    }

    try {
      const response = await fetch('/api/executive-dashboard', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo cargar el dashboard');
      }

      if (!shouldAcceptTenantPayload(payload, 'executive-dashboard')) {
        return;
      }

      const payloadHotelId = payload.hotel?.id || null;

      if (requestId !== dashboardRequestIdRef.current) {
        return;
      }

      if (activeHotelIdRef.current && payloadHotelId && activeHotelIdRef.current !== payloadHotelId) {
        setData(null);
      }

      activeHotelIdRef.current = payloadHotelId;
      setData(payload);
      setError(null);
    } catch (caughtError) {
      console.error('Executive dashboard refresh failed', caughtError);
      setError(caughtError.message);
    } finally {
      if (requestId === dashboardRequestIdRef.current) {
        dashboardRequestInFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    getActiveTenantId();
    loadDashboard();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        loadDashboard({ silent: true });
      }
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [loadDashboard]);

  const role = data?.role || 'receptionist';
  const hotel = data?.hotel || {};
  const hotelName = hotel.name || 'Staynex';
  const timezone = hotel.timezone || 'Europe/Madrid';
  const permissions = useMemo(() => ({
    revenue: canAccess(role, 'upsells'),
    automations: canAccess(role, 'automations'),
    pms: canAccess(role, 'pms_connections'),
    qrRooms: canAccess(role, 'qr_rooms'),
    academy: canAccess(role, 'academy'),
    knowledge: canAccess(role, 'knowledge_base'),
    localKnowledge: canAccess(role, 'local_knowledge'),
    experienceBookings: canAccess(role, 'experience_bookings'),
    reception: canAccess(role, 'reception'),
    health: canAccess(role, 'hotel_health'),
    tickets: canAccess(role, 'tickets'),
    inbox: canAccess(role, 'inbox')
  }), [role]);

  const attentionItems = useMemo(() => buildAttentionItems(data, permissions), [data, permissions]);

  return (
    <section className="space-y-5">
      <header className={cn(
        'premium-fade-in overflow-hidden rounded-2xl border p-5 shadow-2xl sm:p-6',
        isLight
          ? 'border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.15),transparent_34%),#ffffff] shadow-slate-200/80'
          : 'border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_36%),#0b1019] shadow-black/25'
      )}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ExecutiveBadge tone="sky">{tx('Hotel Operations Command Center')}</ExecutiveBadge>
              <ExecutiveBadge tone="slate">{formatDateTime(null, timezone)}</ExecutiveBadge>
              <ExecutiveBadge tone={role === 'receptionist' ? 'emerald' : 'violet'}>
                {formatRoleLabel(role)}
              </ExecutiveBadge>
            </div>
            <h1 className={cn('text-3xl font-semibold tracking-tight sm:text-5xl', ui.text.title(isLight))}>
              {tx(greetingForHour(timezone))}, {hotelName}
            </h1>
            <p className={cn('mt-4 max-w-3xl', ui.text.body(isLight))}>
              {tx('Un centro de control para ver lo urgente, entender la operación del hotel y abrir rápidamente las herramientas que necesita el equipo.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadDashboard()}
            disabled={refreshing}
            className={ui.button(isLight, 'secondary')}
          >
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            {tx('Refresh')}
          </button>
        </div>
      </header>

      {error ? (
        <ExecutiveCard className="border-red-300/25 p-4">
          <p className="text-sm font-semibold text-red-400">{tx('Dashboard data could not be refreshed.')}</p>
          <p className={cn('mt-1', ui.text.body(isLight))}>Revisa la sesión del hotel y vuelve a actualizar.</p>
        </ExecutiveCard>
      ) : null}

      <OverviewPanel data={data} loading={loading} permissions={permissions} />

      <NeedsAttentionPanel items={attentionItems} loading={loading} />

      <HotelIntelligencePanel data={data} loading={loading} />

      <div className="grid gap-5 xl:grid-cols-3">
        <GuestCommunicationPanel data={data} loading={loading} />
        <TicketsOperationsPanel data={data} loading={loading} />
        <PmsSnapshotPanel data={data} loading={loading} permissions={permissions} role={role} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <GuestIntelligencePanel data={data} loading={loading} role={role} />
        <AIOperationsPanel data={data} loading={loading} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {permissions.revenue || permissions.experienceBookings ? (
          <RevenueExperiencesPanel data={data} loading={loading} permissions={permissions} />
        ) : null}
        <HotelKnowledgePanel data={data} loading={loading} permissions={permissions} compact={!(permissions.revenue || permissions.experienceBookings)} />
      </div>

      <div>
        <QuickActionsPanel role={role} permissions={permissions} data={data} />
      </div>
    </section>
  );
};

const buildAttentionItems = (data, permissions) => {
  if (!data) return [];

  const kpis = data.kpis || {};
  const summary = data.summary || {};
  const ai = data.conversationIntelligence || {};
  const experienceBookings = data.experienceBookings || {};
  const pms = data.pmsStatus || {};
  const onboarding = data.onboardingHealth || {};
  const items = [
    {
      label: 'Conversaciones con control humano',
      value: ai.humanTakeovers || summary.humanTakeovers || 0,
      href: '/dashboard/inbox',
      severity: Number(ai.humanTakeovers || summary.humanTakeovers || 0) > 0 ? 'warning' : 'positive',
      detail: 'Conversaciones que gestiona recepción ahora mismo.'
    },
    {
      label: 'Tickets urgentes',
      value: kpis.urgentTickets || summary.urgentTickets || 0,
      href: '/dashboard/tickets',
      severity: Number(kpis.urgentTickets || summary.urgentTickets || 0) > 0 ? 'critical' : 'positive',
      detail: 'Mantenimiento, emergencia o alta prioridad.'
    },
    {
      label: 'Huéspedes frustrados',
      value: ai.repeatedFrustrations || ai.unresolvedComplaints || 0,
      href: '/dashboard/inbox',
      severity: Number(ai.repeatedFrustrations || ai.unresolvedComplaints || 0) > 0 ? 'warning' : 'positive',
      detail: 'Señales de queja o sentimiento negativo.'
    },
    {
      label: 'Solicitudes a proveedor con incidencia',
      value: experienceBookings.failedProviderEmails || summary.providerEmailFailures || 0,
      href: '/dashboard/experience-bookings',
      severity: Number(experienceBookings.failedProviderEmails || summary.providerEmailFailures || 0) > 0 ? 'critical' : 'positive',
      detail: 'Solicitudes de experiencias que necesitan revisión.',
      hidden: !permissions.experienceBookings
    },
    {
      label: 'Avisos de PMS o WhatsApp',
      value: (pms.syncErrors || 0) + (onboarding.whatsappConfigured ? 0 : 1),
      href: '/dashboard/settings/pms',
      severity: (pms.syncErrors || 0) + (onboarding.whatsappConfigured ? 0 : 1) > 0 ? 'warning' : 'positive',
      detail: 'Señales de conexión y preparación del piloto.',
      hidden: !permissions.pms
    }
  ].filter((item) => !item.hidden);

  return items;
};

const OverviewPanel = ({ data, loading, permissions }) => {
  const kpis = data?.kpis || {};
  const summary = data?.summary || {};
  const revenue = data?.revenue || {};
  const experienceBookings = data?.experienceBookings || {};
  const conversationIntelligence = data?.conversationIntelligence || {};
  const stats = [
    { label: 'Mensajes gestionados hoy', value: kpis.aiResponses || 0, icon: Bot, tone: 'violet' },
    { label: 'Conversaciones activas', value: summary.activeConversations || 0, icon: Inbox, tone: 'sky' },
    { label: 'Tickets abiertos', value: kpis.openTickets || 0, icon: TicketCheck, tone: Number(kpis.openTickets || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Tickets urgentes', value: kpis.urgentTickets || 0, icon: AlertTriangle, tone: Number(kpis.urgentTickets || 0) > 0 ? 'red' : 'emerald' },
    { label: 'Gestionado por IA', value: formatPercent(conversationIntelligence.aiResolutionRate || summary.averageAiConfidence || 0), icon: ShieldCheck, tone: 'emerald' },
    permissions.revenue
      ? { label: 'Oportunidades de revenue', value: revenue.totalUpsells || summary.upsellsDetected || 0, icon: TrendingUp, tone: 'emerald' }
      : null,
    permissions.experienceBookings
      ? { label: 'Solicitudes de experiencias', value: experienceBookings.active || summary.experienceRequests || 0, icon: CalendarCheck, tone: 'sky' }
      : null,
    { label: 'Satisfacción huésped', value: formatPercent(kpis.guestSatisfactionScore || conversationIntelligence.aiSatisfactionEstimate || 0), icon: Sparkles, tone: 'amber' }
  ].filter(Boolean);

  return (
    <Panel title="Resumen del hotel" eyebrow="Qué está pasando ahora" icon={Clock3}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} loading={loading} />
        ))}
      </div>
    </Panel>
  );
};

const NeedsAttentionPanel = ({ items, loading }) => {
  const hasAttention = items.some((item) => Number(item.value || 0) > 0);

  return (
    <Panel title="Necesita atención" eyebrow="Empieza aquí" icon={AlertTriangle} badgeTone={hasAttention ? 'amber' : 'emerald'} badge={hasAttention ? 'Revisar' : 'Todo correcto'}>
      {loading ? (
        <SkeletonList />
      ) : hasAttention ? (
        <div className="space-y-3">
          {items.map((item) => (
            <AttentionRow key={item.label} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="Todo correcto: no hay urgencias ahora."
          description="No hay tickets urgentes, controles humanos bloqueantes ni incidencias de proveedor visibles."
        />
      )}
    </Panel>
  );
};

const HotelIntelligencePanel = ({ data, loading }) => {
  const hotel = data?.hotelIntelligence || {};
  const occupancy = hotel.occupancyCurrent === null || hotel.occupancyCurrent === undefined
    ? 'Sin datos PMS'
    : formatPercent(Math.round(Number(hotel.occupancyCurrent || 0)));
  const tiles = [
    { label: 'Ocupación', value: occupancy, tone: hotel.occupancyCurrent === null || hotel.occupancyCurrent === undefined ? 'slate' : 'sky' },
    { label: 'Habitaciones ocupadas', value: hotel.occupiedRooms || 0, tone: 'slate' },
    { label: 'Habitaciones libres', value: hotel.freeRooms || 0, tone: 'emerald' },
    { label: 'Habitaciones con incidencias', value: hotel.roomsWithIssues || 0, tone: Number(hotel.roomsWithIssues || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Llegadas hoy', value: hotel.arrivalsToday || 0, tone: 'sky' },
    { label: 'Salidas hoy', value: hotel.departuresToday || 0, tone: 'violet' },
    { label: 'Check-ins pendientes', value: hotel.pendingCheckins || 0, tone: Number(hotel.pendingCheckins || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Check-outs pendientes', value: hotel.pendingCheckouts || 0, tone: Number(hotel.pendingCheckouts || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Reservas con atención', value: hotel.reservationsNeedingAttention || hotel.guestsWithAlerts || 0, tone: Number(hotel.reservationsNeedingAttention || hotel.guestsWithAlerts || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Huéspedes alojados', value: hotel.inHouseGuests || 0, tone: 'slate' },
    { label: 'Huéspedes VIP', value: hotel.vipGuests || 0, tone: Number(hotel.vipGuests || 0) > 0 ? 'violet' : 'slate' },
    { label: 'Huéspedes con alertas', value: hotel.guestsWithAlerts || 0, tone: Number(hotel.guestsWithAlerts || 0) > 0 ? 'red' : 'emerald' }
  ];

  return (
    <Panel
      title="Contexto del hotel"
      eyebrow="Snapshot operativo"
      icon={ConciergeBell}
      badge={hotel.dataState === 'active' ? 'Contexto activo' : 'Datos limitados'}
      badgeTone={hotel.dataState === 'active' ? 'emerald' : 'slate'}
    >
      {loading ? (
        <SkeletonGrid />
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {tiles.map((tile) => (
            <DataTile key={tile.label} {...tile} />
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
        <div className="rounded-xl border border-dashed border-slate-300/60 p-4 dark:border-white/10">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Operación de hoy</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Llegadas, salidas, estado de habitaciones y alertas de huéspedes se agrupan aquí para entender el hotel sin abrir varias herramientas.
          </p>
        </div>
        <LanguagePills languages={hotel.topLanguages || []} loading={loading} />
      </div>
    </Panel>
  );
};

const AIOperationsPanel = ({ data, loading }) => {
  const ai = data?.conversationIntelligence || {};
  const summary = data?.summary || {};
  const automations = data?.kpis?.automationsScheduled || 0;
  const items = [
    { label: 'Estado IA', value: 'Activa', tone: 'emerald' },
    { label: 'Control humano', value: ai.humanTakeovers || summary.humanTakeovers || 0, tone: Number(ai.humanTakeovers || summary.humanTakeovers || 0) > 0 ? 'amber' : 'slate' },
    { label: 'Fiabilidad media', value: formatPercent(ai.avgAiConfidence || summary.averageAiConfidence || 0), tone: 'sky' },
    { label: 'Escalaciones', value: ai.activeEscalations || 0, tone: Number(ai.activeEscalations || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Previews de journeys', value: automations, tone: automations > 0 ? 'violet' : 'slate' },
    { label: 'Control seguro IA', value: ai.unresolvedComplaints || ai.repeatedFrustrations ? 'Revisar' : 'Correcto', tone: ai.unresolvedComplaints || ai.repeatedFrustrations ? 'amber' : 'emerald' }
  ];

  return (
    <Panel title="Control de IA" eyebrow="Estado seguro para el hotel" icon={Bot} badge="Vista hotel" badgeTone="sky">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <MiniMetric key={item.label} item={item} loading={loading} />
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-slate-300/60 p-4 text-sm leading-6 text-slate-500 dark:border-white/10">
        La IA puede seguir preparando contexto PMS y respuestas sugeridas, pero el control humano bloquea respuestas automáticas.
      </div>
    </Panel>
  );
};

const GuestCommunicationPanel = ({ data, loading }) => {
  const summary = data?.summary || {};
  const ai = data?.conversationIntelligence || {};
  const lines = [
    `${formatNumber(summary.activeConversations || 0)} conversaciones activas`,
    `${formatNumber(ai.humanTakeovers || summary.humanTakeovers || 0)} en control humano`,
    `${formatNumber(ai.activeEscalations || 0)} señales de escalación`,
    `${formatPercent(ai.avgAiConfidence || summary.averageAiConfidence || 0)} fiabilidad media IA`
  ];

  return (
    <Panel title="Comunicación con huéspedes" eyebrow="Control del Inbox" icon={Inbox} action={{ href: '/dashboard/inbox', label: 'Abrir Inbox' }}>
      <BulletList lines={lines} loading={loading} />
    </Panel>
  );
};

const TicketsOperationsPanel = ({ data, loading }) => {
  const operations = data?.operations || {};
  const kpis = data?.kpis || {};
  const lines = [
    `${formatNumber(kpis.openTickets || 0)} tickets abiertos`,
    `${formatNumber(kpis.urgentTickets || 0)} tickets urgentes`,
    `${formatNumber(operations.maintenance?.openTickets || 0)} tickets de mantenimiento`,
    `${formatNumber(operations.housekeeping?.openTickets || 0)} tickets de pisos`,
    `${formatNumber(operations.reception?.arrivalsToday || 0)} llegadas hoy`
  ];

  return (
    <Panel title="Tickets y operaciones" eyebrow="Carga operativa" icon={TicketCheck} action={{ href: '/dashboard/tickets', label: 'Ver tickets' }}>
      <BulletList lines={lines} loading={loading} />
    </Panel>
  );
};

const PmsSnapshotPanel = ({ data, loading, permissions, role }) => {
  const pms = data?.pmsSnapshot || {};
  const isReceptionist = role === 'receptionist';
  const statusTone = pms.connected ? (pms.errors ? 'amber' : 'emerald') : 'red';
  const action = permissions.pms && !isReceptionist
    ? { href: '/dashboard/settings/pms', label: 'Ver estado PMS' }
    : null;
  const tiles = [
    { label: 'Conexión', value: pms.connected ? 'Conectado' : 'Desconectado', tone: statusTone },
    { label: 'PMS', value: formatProviderLabel(pms.providerName), tone: pms.providerName ? 'sky' : 'slate' },
    { label: 'Reservas sincronizadas', value: pms.reservationsSynced || 0, tone: 'slate' },
    { label: 'Habitaciones sincronizadas', value: pms.roomsSynced || 0, tone: pms.roomsSynced ? 'emerald' : 'slate' },
    { label: 'Errores PMS', value: pms.errors || 0, tone: Number(pms.errors || 0) > 0 ? 'red' : 'emerald' },
    { label: 'Webhook', value: pms.webhookStatus === 'healthy' ? 'Correcto' : 'No configurado', tone: pms.webhookStatus === 'healthy' ? 'emerald' : 'slate' }
  ];
  const operationalWarnings = isReceptionist
    ? (pms.warnings || []).filter((warning) => !String(warning).toLowerCase().includes('webhook')).slice(0, 3)
    : pms.warnings || [];

  return (
    <Panel
      title="Contexto PMS"
      eyebrow="Estado de datos del hotel"
      icon={DatabaseZap}
      action={action}
      badge={pms.connected ? 'Conectado' : 'Necesita revisión'}
      badgeTone={statusTone}
    >
      {loading ? (
        <SkeletonList />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {tiles.map((tile) => (
              <DataTile key={tile.label} {...tile} compact />
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <StatusLine
              icon={Clock3}
              label="Última sincronización"
              value={pms.lastSyncAt ? formatDateTime(pms.lastSyncAt, data?.hotel?.timezone) : 'No sincronizado'}
              tone={pms.lastSyncAt ? 'emerald' : 'amber'}
            />
            <StatusLine
              icon={AlertTriangle}
              label="Avisos de datos"
              value={operationalWarnings.length ? `${operationalWarnings.length} avisos` : 'Ninguno'}
              tone={operationalWarnings.length ? 'amber' : 'emerald'}
            />
          </div>
          {operationalWarnings.length ? (
            <WarningList warnings={operationalWarnings} />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="El contexto PMS está correcto."
              description="No hay errores de sincronización PMS ni avisos operativos visibles ahora."
            />
          )}
          {!isReceptionist ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <DataTile label="Teléfonos inválidos" value={formatOptionalNumber(pms.invalidPhones)} tone={Number(pms.invalidPhones || 0) > 0 ? 'amber' : 'slate'} compact />
              <DataTile label="Huéspedes sin idioma" value={pms.guestsWithoutLanguage || 0} tone={Number(pms.guestsWithoutLanguage || 0) > 0 ? 'amber' : 'emerald'} compact />
              <DataTile label="Estancias sin habitación" value={pms.reservationsWithoutRoom || 0} tone={Number(pms.reservationsWithoutRoom || 0) > 0 ? 'amber' : 'emerald'} compact />
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
};

const GuestIntelligencePanel = ({ data, loading, role }) => {
  const intelligence = data?.guestIntelligence || {};
  const isReceptionist = role === 'receptionist';
  const topProfiles = intelligence.topProfiles || [];
  const operationalTiles = [
    { label: 'Huéspedes que necesitan atención', value: intelligence.guestsNeedingAttention || 0, tone: Number(intelligence.guestsNeedingAttention || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'VIPs activos', value: intelligence.vipGuests || 0, tone: Number(intelligence.vipGuests || 0) > 0 ? 'violet' : 'slate' },
    { label: 'Conversaciones con frustración', value: intelligence.frustratedConversations || 0, tone: Number(intelligence.frustratedConversations || 0) > 0 ? 'red' : 'emerald' },
    { label: 'Sentimiento general', value: formatSentimentLabel(intelligence.sentimentLabel), tone: intelligence.sentimentLabel === 'Needs attention' ? 'amber' : 'emerald' }
  ];
  const adminTiles = [
    ...operationalTiles,
    { label: 'Riesgo de reseña', value: intelligence.reviewRiskGuests || 0, tone: Number(intelligence.reviewRiskGuests || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Potencial revenue alto', value: intelligence.highRevenueGuests || 0, tone: Number(intelligence.highRevenueGuests || 0) > 0 ? 'emerald' : 'slate' },
    { label: 'Probabilidad de conversión', value: formatPercent(intelligence.averageConversionProbability || 0), tone: 'sky' },
    { label: 'Afinidad principal', value: intelligence.topAffinity?.type ? formatProfileLabel(intelligence.topAffinity.type.replace('_affinity', '')) : 'Sin datos suficientes', tone: 'violet' }
  ];
  const tiles = isReceptionist ? operationalTiles : adminTiles;

  return (
    <Panel
      title="Contexto de huéspedes"
      eyebrow={isReceptionist ? 'Señales operativas' : 'Señales de perfil y revenue'}
      icon={Sparkles}
      badge={isReceptionist ? 'Vista recepción' : 'Vista manager'}
      badgeTone="violet"
    >
      {loading ? (
        <SkeletonGrid />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {tiles.map((tile) => (
              <DataTile key={tile.label} {...tile} compact />
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <LanguagePills languages={intelligence.topLanguages || []} loading={loading} />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.025]">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Perfiles principales</p>
              {topProfiles.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {topProfiles.map((profile) => (
                    <ExecutiveBadge key={profile.type} tone="sky">
                      {formatProfileLabel(profile.type)}: {profile.count}
                    </ExecutiveBadge>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Todavía no hay patrón de perfiles.</p>
              )}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
};

const RevenueExperiencesPanel = ({ data, loading, permissions }) => {
  const revenue = data?.revenue || {};
  const experienceBookings = data?.experienceBookings || {};
  const lines = [
    permissions.revenue ? `${formatNumber(revenue.totalUpsells || 0)} oportunidades de upsell` : null,
    permissions.revenue ? `${formatNumber(revenue.accepted || 0)} upsells aceptados` : null,
    permissions.experienceBookings ? `${formatNumber(experienceBookings.active || 0)} solicitudes de experiencias` : null,
    permissions.experienceBookings ? `${formatNumber(experienceBookings.providerRequestsSent || 0)} solicitudes enviadas a proveedor` : null,
    permissions.experienceBookings ? `${formatNumber(experienceBookings.failedProviderEmails || 0)} incidencias con proveedor` : null,
    permissions.revenue ? `${formatCurrency(revenue.estimatedRevenue || experienceBookings.estimatedRevenue || 0)} revenue estimado` : null
  ].filter(Boolean);

  return (
    <Panel
      title="Revenue y experiencias"
      eyebrow="Seguimiento comercial"
      icon={TrendingUp}
      actions={[
        permissions.revenue ? { href: '/dashboard/upsells', label: 'Ver revenue' } : null,
        permissions.experienceBookings ? { href: '/dashboard/experience-bookings', label: 'Ver experiencias' } : null
      ].filter(Boolean)}
    >
      <BulletList lines={lines} loading={loading} emptyTitle="Todavía no hay oportunidades comerciales." />
    </Panel>
  );
};

const HotelKnowledgePanel = ({ data, loading, permissions, compact = false }) => {
  const knowledge = data?.localIntelligence || {};
  const updatedAt = knowledge.topRecommendations?.[0]?.updated_at || null;
  const lines = [
    `${formatNumber(knowledge.active || 0)} entradas activas`,
    updatedAt ? `Actualizado ${formatDateTime(updatedAt)}` : 'Base de conocimiento actualizada',
    `${formatNumber(knowledge.featured || 0)} recomendaciones destacadas`,
    `${formatNumber(knowledge.indoorReady || 0)} sugerencias para lluvia o interior`
  ];

  return (
    <Panel
      title="Conocimiento del hotel"
      eyebrow="Calidad de información"
      icon={BookOpen}
      actions={[
        permissions.knowledge ? { href: '/dashboard/settings/knowledge', label: 'Abrir base' } : null,
        permissions.localKnowledge ? { href: '/dashboard/local-knowledge', label: 'Abrir conocimiento local' } : null
      ].filter(Boolean)}
      compact={compact}
    >
      <BulletList lines={lines} loading={loading} emptyTitle="Base de conocimiento actualizada." />
    </Panel>
  );
};

const QuickActionsPanel = ({ role, permissions, data }) => {
  const demoCoreActions = [
    permissions.inbox ? { label: 'Inbox', href: '/dashboard/inbox', icon: Inbox } : null,
    canAccess(role, 'reservations') ? { label: 'Reservas', href: '/dashboard/reservations', icon: CalendarDays } : null,
    permissions.tickets ? { label: 'Tickets', href: '/dashboard/tickets', icon: TicketCheck } : null,
    permissions.automations ? { label: 'Automatizaciones', href: '/dashboard/automations', icon: Zap } : null,
    permissions.health ? { label: 'Salud piloto', href: '/dashboard/health', icon: ShieldCheck } : null
  ].filter(Boolean);
  const adminActions = [
    ...demoCoreActions,
    permissions.reception ? { label: 'Recepción / Pre Check-in', href: '/dashboard/reception', icon: ConciergeBell } : null,
    permissions.revenue ? { label: 'Revenue', href: '/dashboard/upsells', icon: TrendingUp } : null,
    permissions.experienceBookings ? { label: 'Reservas de experiencias', href: '/dashboard/experience-bookings', icon: CalendarCheck } : null,
    permissions.knowledge ? { label: 'Base de conocimiento', href: '/dashboard/settings/knowledge', icon: BookOpen } : null,
    permissions.qrRooms ? { label: 'QR habitaciones', href: '/dashboard/qr-rooms', icon: QrCode } : null,
    permissions.academy ? { label: 'Formación', href: '/dashboard/settings/academy', icon: ShieldCheck } : null,
    permissions.pms ? { label: 'Estado PMS', href: '/dashboard/settings/pms', icon: DatabaseZap } : null
  ].filter(Boolean);
  const receptionistActions = [
    ...demoCoreActions,
    permissions.reception ? { label: 'Recepción / Pre Check-in', href: '/dashboard/reception', icon: ConciergeBell } : null,
    permissions.qrRooms ? { label: 'QR habitaciones', href: '/dashboard/qr-rooms', icon: QrCode } : null,
    permissions.knowledge ? { label: 'Base de conocimiento', href: '/dashboard/settings/knowledge', icon: BookOpen } : null,
    permissions.localKnowledge ? { label: 'Conocimiento local', href: '/dashboard/local-knowledge', icon: Map } : null,
    permissions.academy ? { label: 'Formación recepción', href: '/dashboard/settings/academy', icon: ShieldCheck } : null
  ].filter(Boolean);
  const actions = role === 'receptionist' ? receptionistActions : adminActions;
  const onboarding = data?.onboardingHealth || {};

  return (
    <Panel title="Ruta de demo" eyebrow="Abre la pantalla correcta" icon={Sparkles} badge={role === 'receptionist' ? 'Recepción' : 'Admin'} badgeTone="violet">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <LinkCard key={action.href} href={action.href} icon={Icon} label={action.label} />
          );
        })}
      </div>
      {role !== 'receptionist' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <StatusLine icon={DatabaseZap} label="PMS" value={onboarding.pmsConnected ? 'Conectado' : 'Necesita configuración'} tone={onboarding.pmsConnected ? 'emerald' : 'amber'} />
          <StatusLine icon={Languages} label="WhatsApp" value={onboarding.whatsappConfigured ? 'Configurado' : 'Necesita configuración'} tone={onboarding.whatsappConfigured ? 'emerald' : 'amber'} />
        </div>
      ) : null}
    </Panel>
  );
};

const DataTile = ({ label, value, tone = 'slate', compact = false, badge = null }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <div className={cn(
      'flex min-h-[88px] flex-col justify-center rounded-xl border text-center',
      compact ? 'p-3' : 'p-4',
      isLight ? 'border-slate-200 bg-slate-50/85' : 'border-white/10 bg-white/[0.025]'
    )}
    >
      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', isLight ? 'text-slate-500' : 'text-slate-400')}>
        {tx(label)}
      </p>
      <p className={cn('mt-2 truncate text-xl font-semibold tracking-tight tabular-nums', ui.text.title(isLight))}>
        {value}
      </p>
      {badge ? (
        <div className="mt-2 flex justify-center">
          <ExecutiveBadge tone={tone}>{tx(badge)}</ExecutiveBadge>
        </div>
      ) : null}
    </div>
  );
};

const LanguagePills = ({ languages = [], loading }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  if (loading) {
    return <div className={cn('h-28 rounded-xl', ui.skeleton(isLight))} />;
  }

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{tx('Top languages')}</p>
      {languages.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {languages.map((language) => (
            <ExecutiveBadge key={language.label} tone="sky">
              {String(language.label).toUpperCase()} {language.count}
            </ExecutiveBadge>
          ))}
        </div>
      ) : (
        <p className={cn('mt-2 text-sm', ui.text.muted(isLight))}>{tx('No language pattern yet.')}</p>
      )}
    </div>
  );
};

const WarningList = ({ warnings = [] }) => (
  <div className="mt-3 space-y-2">
    {warnings.map((warning) => (
      <StatusLine key={warning} icon={AlertTriangle} label={warning} value="Review" tone="amber" compact />
    ))}
  </div>
);

const Panel = ({ title, eyebrow, icon: Icon, children, action = null, actions = [], badge = null, badgeTone = 'slate', compact = false }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const actionList = action ? [action, ...actions] : actions;

  return (
    <ExecutiveCard className={compact ? 'p-4' : 'p-5'}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
            isLight ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-sky-300/20 bg-sky-300/10 text-sky-100'
          )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className={ui.text.eyebrow(isLight)}>{tx(eyebrow)}</p>
            <h2 className={cn('mt-1 text-lg', ui.text.title(isLight))}>{tx(title)}</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {badge ? <ExecutiveBadge tone={badgeTone}>{tx(badge)}</ExecutiveBadge> : null}
          {actionList.map((item) => (
            <Link key={item.href} href={item.href} className={ui.button(isLight, 'secondary')}>
              {tx(item.label)}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
      {children}
    </ExecutiveCard>
  );
};

const StatCard = ({ label, value, icon: Icon, tone = 'slate', loading }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50/85' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex items-start justify-between gap-3">
        <p className={ui.text.eyebrow(isLight)}>{tx(label)}</p>
        <ExecutiveBadge tone={tone}>{tx('Actual')}</ExecutiveBadge>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className={cn('text-3xl font-semibold tracking-tight tabular-nums', ui.text.title(isLight))}>
          {loading ? '...' : value}
        </p>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/10 bg-white/[0.04] text-slate-200')}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
};

const MiniMetric = ({ item, loading }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex items-center justify-between gap-3">
        <p className={ui.text.eyebrow(isLight)}>{tx(item.label)}</p>
        <ExecutiveBadge tone={item.tone}>{loading ? '...' : tx(item.value)}</ExecutiveBadge>
      </div>
    </div>
  );
};

const AttentionRow = ({ item }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const tone = toneForSeverity(Number(item.value || 0) > 0 ? item.severity : 'positive');

  return (
    <Link href={item.href} className={cn(
      'block rounded-xl border p-4 transition hover:-translate-y-0.5',
      isLight ? 'border-slate-200 bg-slate-50 hover:bg-white' : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.055]'
    )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{tx(item.label)}</p>
          <p className={cn('mt-1', ui.text.muted(isLight))}>{tx(item.detail)}</p>
        </div>
        <ExecutiveBadge tone={tone}>{formatNumber(item.value)}</ExecutiveBadge>
      </div>
    </Link>
  );
};

const BulletList = ({ lines, loading, emptyTitle = 'No items yet.' }) => {
  if (loading) return <SkeletonList />;

  if (!lines.length) {
    return <EmptyState icon={CheckCircle2} title={emptyTitle} description="Staynex completará este panel cuando aparezca actividad." />;
  }

  return (
    <div className="space-y-3">
      {lines.map((line) => (
        <StatusLine key={line} icon={CheckCircle2} label={line} value={null} tone="slate" compact />
      ))}
    </div>
  );
};

const StatusLine = ({ icon: Icon, label, value, tone = 'slate', compact = false }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 rounded-xl border',
      compact ? 'px-3 py-2.5' : 'p-3',
      isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]'
    )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <span className={cn('truncate text-sm font-medium', isLight ? 'text-slate-700' : 'text-slate-300')}>{tx(label)}</span>
      </div>
      {value !== null && value !== undefined ? <ExecutiveBadge tone={tone}>{tx(value)}</ExecutiveBadge> : null}
    </div>
  );
};

const LinkCard = ({ href, icon: Icon, label }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <Link href={href} className={cn(
      'group flex items-center justify-between gap-3 rounded-xl border p-4 text-sm font-semibold transition hover:-translate-y-0.5',
      isLight ? 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-white' : 'border-white/10 bg-white/[0.025] text-slate-200 hover:bg-white/[0.06]'
    )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <span className="truncate">{tx(label)}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
    </Link>
  );
};

const EmptyState = ({ icon: Icon, title, description }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border border-dashed p-5 text-center', isLight ? 'border-slate-300 bg-slate-50/70' : 'border-white/10 bg-white/[0.02]')}>
      <span className={cn('mx-auto flex h-10 w-10 items-center justify-center rounded-xl border', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className={cn('mt-3 text-sm font-semibold', ui.text.title(isLight))}>{tx(title)}</p>
      <p className={cn('mt-1', ui.text.muted(isLight))}>{tx(description)}</p>
    </div>
  );
};

const SkeletonList = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className={cn('h-16 rounded-xl', ui.skeleton(isLight))} />
      ))}
    </div>
  );
};

const SkeletonGrid = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className={cn('h-24 rounded-xl', ui.skeleton(isLight))} />
      ))}
    </div>
  );
};

