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
import { cn, ui } from '@/lib/ui/styles';

const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));
const formatPercent = (value) => `${Number(value || 0)}%`;
const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));
const formatOptionalNumber = (value) => value === null || value === undefined ? 'Not tracked' : formatNumber(value);
const formatProfileLabel = (value) => String(value || '')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatProviderLabel = (value) => value ? formatProfileLabel(value) : 'No PMS connected';

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

    if (hour < 12) return 'Buenos dias';
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
        throw new Error(payload.error || 'Could not load dashboard');
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
              <ExecutiveBadge tone="sky">Hotel Operations Command Center</ExecutiveBadge>
              <ExecutiveBadge tone="slate">{formatDateTime(null, timezone)}</ExecutiveBadge>
              <ExecutiveBadge tone={role === 'receptionist' ? 'emerald' : 'violet'}>
                {role.replaceAll('_', ' ')}
              </ExecutiveBadge>
            </div>
            <h1 className={cn('text-3xl font-semibold tracking-tight sm:text-5xl', ui.text.title(isLight))}>
              {greetingForHour(timezone)}, {hotelName}
            </h1>
            <p className={cn('mt-4 max-w-3xl', ui.text.body(isLight))}>
              Un centro de control para ver lo urgente, entender la operacion del hotel y abrir rapidamente las herramientas que necesita el equipo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadDashboard()}
            disabled={refreshing}
            className={ui.button(isLight, 'secondary')}
          >
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <ExecutiveCard className="border-red-300/25 p-4">
          <p className="text-sm font-semibold text-red-400">Dashboard data could not be refreshed.</p>
          <p className={cn('mt-1', ui.text.body(isLight))}>{error}</p>
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
      label: 'Human takeover conversations',
      value: ai.humanTakeovers || summary.humanTakeovers || 0,
      href: '/dashboard/inbox',
      severity: Number(ai.humanTakeovers || summary.humanTakeovers || 0) > 0 ? 'warning' : 'positive',
      detail: 'Conversations currently handled by reception.'
    },
    {
      label: 'Urgent tickets',
      value: kpis.urgentTickets || summary.urgentTickets || 0,
      href: '/dashboard/tickets',
      severity: Number(kpis.urgentTickets || summary.urgentTickets || 0) > 0 ? 'critical' : 'positive',
      detail: 'Maintenance, emergency or high-priority tickets.'
    },
    {
      label: 'Angry or frustrated guests',
      value: ai.repeatedFrustrations || ai.unresolvedComplaints || 0,
      href: '/dashboard/inbox',
      severity: Number(ai.repeatedFrustrations || ai.unresolvedComplaints || 0) > 0 ? 'warning' : 'positive',
      detail: 'Detected negative sentiment and complaint patterns.'
    },
    {
      label: 'Provider email failures',
      value: experienceBookings.failedProviderEmails || summary.providerEmailFailures || 0,
      href: '/dashboard/experience-bookings',
      severity: Number(experienceBookings.failedProviderEmails || summary.providerEmailFailures || 0) > 0 ? 'critical' : 'positive',
      detail: 'Experience provider requests that need review.',
      hidden: !permissions.experienceBookings
    },
    {
      label: 'PMS or WhatsApp warnings',
      value: (pms.syncErrors || 0) + (onboarding.whatsappConfigured ? 0 : 1),
      href: '/dashboard/settings/pms',
      severity: (pms.syncErrors || 0) + (onboarding.whatsappConfigured ? 0 : 1) > 0 ? 'warning' : 'positive',
      detail: 'Connectivity and launch readiness signals.',
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
    { label: 'Messages handled today', value: kpis.aiResponses || 0, icon: Bot, tone: 'violet' },
    { label: 'Active conversations', value: summary.activeConversations || 0, icon: Inbox, tone: 'sky' },
    { label: 'Open tickets', value: kpis.openTickets || 0, icon: TicketCheck, tone: Number(kpis.openTickets || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Urgent tickets', value: kpis.urgentTickets || 0, icon: AlertTriangle, tone: Number(kpis.urgentTickets || 0) > 0 ? 'red' : 'emerald' },
    { label: 'AI handled', value: formatPercent(conversationIntelligence.aiResolutionRate || summary.averageAiConfidence || 0), icon: ShieldCheck, tone: 'emerald' },
    permissions.revenue
      ? { label: 'Revenue opportunities', value: revenue.totalUpsells || summary.upsellsDetected || 0, icon: TrendingUp, tone: 'emerald' }
      : null,
    permissions.experienceBookings
      ? { label: 'Experience requests', value: experienceBookings.active || summary.experienceRequests || 0, icon: CalendarCheck, tone: 'sky' }
      : null,
    { label: 'Guest satisfaction', value: formatPercent(kpis.guestSatisfactionScore || conversationIntelligence.aiSatisfactionEstimate || 0), icon: Sparkles, tone: 'amber' }
  ].filter(Boolean);

  return (
    <Panel title="Today's Hotel Overview" eyebrow="What is happening now" icon={Clock3}>
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
    <Panel title="Needs Attention" eyebrow="Start here" icon={AlertTriangle} badgeTone={hasAttention ? 'amber' : 'emerald'} badge={hasAttention ? 'Review' : 'All clear'}>
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
          title="All clear - no urgent items right now."
          description="No urgent tickets, active takeover blockers or provider failures are currently visible."
        />
      )}
    </Panel>
  );
};

const HotelIntelligencePanel = ({ data, loading }) => {
  const hotel = data?.hotelIntelligence || {};
  const occupancy = hotel.occupancyCurrent === null || hotel.occupancyCurrent === undefined
    ? 'No PMS data'
    : formatPercent(Math.round(Number(hotel.occupancyCurrent || 0)));
  const tiles = [
    { label: 'Occupancy', value: occupancy, tone: hotel.occupancyCurrent === null || hotel.occupancyCurrent === undefined ? 'slate' : 'sky' },
    { label: 'Occupied rooms', value: hotel.occupiedRooms || 0, tone: 'slate' },
    { label: 'Free rooms', value: hotel.freeRooms || 0, tone: 'emerald' },
    { label: 'Rooms with issues', value: hotel.roomsWithIssues || 0, tone: Number(hotel.roomsWithIssues || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Arrivals today', value: hotel.arrivalsToday || 0, tone: 'sky' },
    { label: 'Departures today', value: hotel.departuresToday || 0, tone: 'violet' },
    { label: 'Pending check-ins', value: hotel.pendingCheckins || 0, tone: Number(hotel.pendingCheckins || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Pending check-outs', value: hotel.pendingCheckouts || 0, tone: Number(hotel.pendingCheckouts || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Reservations needing attention', value: hotel.reservationsNeedingAttention || hotel.guestsWithAlerts || 0, tone: Number(hotel.reservationsNeedingAttention || hotel.guestsWithAlerts || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'In-house guests', value: hotel.inHouseGuests || 0, tone: 'slate' },
    { label: 'VIP guests', value: hotel.vipGuests || 0, tone: Number(hotel.vipGuests || 0) > 0 ? 'violet' : 'slate' },
    { label: 'Guests with alerts', value: hotel.guestsWithAlerts || 0, tone: Number(hotel.guestsWithAlerts || 0) > 0 ? 'red' : 'emerald' }
  ];

  return (
    <Panel
      title="Hotel Intelligence"
      eyebrow="Operational hotel snapshot"
      icon={ConciergeBell}
      badge={hotel.dataState === 'active' ? 'Live context' : 'Limited data'}
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
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Today in operation</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Arrivals, departures, room status and guest alerts are grouped here so the team can see how the hotel is running without scanning separate tools.
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
    { label: 'AI status', value: 'Active', tone: 'emerald' },
    { label: 'Human takeover', value: ai.humanTakeovers || summary.humanTakeovers || 0, tone: Number(ai.humanTakeovers || summary.humanTakeovers || 0) > 0 ? 'amber' : 'slate' },
    { label: 'Average confidence', value: formatPercent(ai.avgAiConfidence || summary.averageAiConfidence || 0), tone: 'sky' },
    { label: 'Escalations', value: ai.activeEscalations || 0, tone: Number(ai.activeEscalations || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Automations preview', value: automations, tone: automations > 0 ? 'violet' : 'slate' },
    { label: 'AI safety', value: ai.unresolvedComplaints || ai.repeatedFrustrations ? 'Review' : 'Healthy', tone: ai.unresolvedComplaints || ai.repeatedFrustrations ? 'amber' : 'emerald' }
  ];

  return (
    <Panel title="AI Operations" eyebrow="Hotel-safe AI status" icon={Bot} badge="Hotel view" badgeTone="sky">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <MiniMetric key={item.label} item={item} loading={loading} />
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-slate-300/60 p-4 text-sm leading-6 text-slate-500 dark:border-white/10">
        AI Copilot can keep analysing sentiment, PMS context and suggested replies even when Human Takeover is active.
      </div>
    </Panel>
  );
};

const GuestCommunicationPanel = ({ data, loading }) => {
  const summary = data?.summary || {};
  const ai = data?.conversationIntelligence || {};
  const lines = [
    `${formatNumber(summary.activeConversations || 0)} active conversations`,
    `${formatNumber(ai.humanTakeovers || summary.humanTakeovers || 0)} human takeover active`,
    `${formatNumber(ai.activeEscalations || 0)} escalation signals`,
    `${formatPercent(ai.avgAiConfidence || summary.averageAiConfidence || 0)} average AI confidence`
  ];

  return (
    <Panel title="Guest Communication" eyebrow="Inbox control" icon={Inbox} action={{ href: '/dashboard/inbox', label: 'Open Inbox' }}>
      <BulletList lines={lines} loading={loading} />
    </Panel>
  );
};

const TicketsOperationsPanel = ({ data, loading }) => {
  const operations = data?.operations || {};
  const kpis = data?.kpis || {};
  const lines = [
    `${formatNumber(kpis.openTickets || 0)} open tickets`,
    `${formatNumber(kpis.urgentTickets || 0)} urgent tickets`,
    `${formatNumber(operations.maintenance?.openTickets || 0)} maintenance tickets`,
    `${formatNumber(operations.housekeeping?.openTickets || 0)} housekeeping tickets`,
    `${formatNumber(operations.reception?.arrivalsToday || 0)} arrivals today`
  ];

  return (
    <Panel title="Tickets & Operations" eyebrow="Operational workload" icon={TicketCheck} action={{ href: '/dashboard/tickets', label: 'View Tickets' }}>
      <BulletList lines={lines} loading={loading} />
    </Panel>
  );
};

const PmsSnapshotPanel = ({ data, loading, permissions, role }) => {
  const pms = data?.pmsSnapshot || {};
  const isReceptionist = role === 'receptionist';
  const statusTone = pms.connected ? (pms.errors ? 'amber' : 'emerald') : 'red';
  const action = permissions.pms && !isReceptionist
    ? { href: '/dashboard/settings/pms', label: 'View PMS Status' }
    : null;
  const tiles = [
    { label: 'Connection', value: pms.connected ? 'Connected' : 'Disconnected', tone: statusTone },
    { label: 'PMS', value: formatProviderLabel(pms.providerName), tone: pms.providerName ? 'sky' : 'slate' },
    { label: 'Reservations synced', value: pms.reservationsSynced || 0, tone: 'slate' },
    { label: 'Rooms synced', value: pms.roomsSynced || 0, tone: pms.roomsSynced ? 'emerald' : 'slate' },
    { label: 'PMS errors', value: pms.errors || 0, tone: Number(pms.errors || 0) > 0 ? 'red' : 'emerald' },
    { label: 'Webhook', value: formatProfileLabel(pms.webhookStatus || 'not configured'), tone: pms.webhookStatus === 'healthy' ? 'emerald' : 'slate' }
  ];
  const operationalWarnings = isReceptionist
    ? (pms.warnings || []).filter((warning) => !String(warning).toLowerCase().includes('webhook')).slice(0, 3)
    : pms.warnings || [];

  return (
    <Panel
      title="PMS Snapshot"
      eyebrow="Hotel data health"
      icon={DatabaseZap}
      action={action}
      badge={pms.connected ? 'Connected' : 'Needs review'}
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
              label="Last sync"
              value={pms.lastSyncAt ? formatDateTime(pms.lastSyncAt, data?.hotel?.timezone) : 'Not synced'}
              tone={pms.lastSyncAt ? 'emerald' : 'amber'}
            />
            <StatusLine
              icon={AlertTriangle}
              label="Data warnings"
              value={operationalWarnings.length ? `${operationalWarnings.length} warnings` : 'None'}
              tone={operationalWarnings.length ? 'amber' : 'emerald'}
            />
          </div>
          {operationalWarnings.length ? (
            <WarningList warnings={operationalWarnings} />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="PMS snapshot looks clean."
              description="No PMS sync errors or operational data warnings are visible right now."
            />
          )}
          {!isReceptionist ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <DataTile label="Invalid phones" value={formatOptionalNumber(pms.invalidPhones)} tone={Number(pms.invalidPhones || 0) > 0 ? 'amber' : 'slate'} compact />
              <DataTile label="Guests without language" value={pms.guestsWithoutLanguage || 0} tone={Number(pms.guestsWithoutLanguage || 0) > 0 ? 'amber' : 'emerald'} compact />
              <DataTile label="Stays without room" value={pms.reservationsWithoutRoom || 0} tone={Number(pms.reservationsWithoutRoom || 0) > 0 ? 'amber' : 'emerald'} compact />
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
    { label: 'Guests needing attention', value: intelligence.guestsNeedingAttention || 0, tone: Number(intelligence.guestsNeedingAttention || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'Active VIPs', value: intelligence.vipGuests || 0, tone: Number(intelligence.vipGuests || 0) > 0 ? 'violet' : 'slate' },
    { label: 'Frustrated conversations', value: intelligence.frustratedConversations || 0, tone: Number(intelligence.frustratedConversations || 0) > 0 ? 'red' : 'emerald' },
    { label: 'General sentiment', value: intelligence.sentimentLabel || 'Not enough data', tone: intelligence.sentimentLabel === 'Needs attention' ? 'amber' : 'emerald' }
  ];
  const adminTiles = [
    ...operationalTiles,
    { label: 'Review risk guests', value: intelligence.reviewRiskGuests || 0, tone: Number(intelligence.reviewRiskGuests || 0) > 0 ? 'amber' : 'emerald' },
    { label: 'High revenue potential', value: intelligence.highRevenueGuests || 0, tone: Number(intelligence.highRevenueGuests || 0) > 0 ? 'emerald' : 'slate' },
    { label: 'Conversion probability', value: formatPercent(intelligence.averageConversionProbability || 0), tone: 'sky' },
    { label: 'Top affinity', value: intelligence.topAffinity?.type ? formatProfileLabel(intelligence.topAffinity.type.replace('_affinity', '')) : 'Not enough data', tone: 'violet' }
  ];
  const tiles = isReceptionist ? operationalTiles : adminTiles;

  return (
    <Panel
      title="Guest Intelligence"
      eyebrow={isReceptionist ? 'Operational guest signals' : 'Guest profiles and revenue signals'}
      icon={Sparkles}
      badge={isReceptionist ? 'Reception view' : 'Manager view'}
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
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Main profiles</p>
              {topProfiles.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {topProfiles.map((profile) => (
                    <ExecutiveBadge key={profile.type} tone="sky">
                      {formatProfileLabel(profile.type)}: {profile.count}
                    </ExecutiveBadge>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No guest profile pattern yet.</p>
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
    permissions.revenue ? `${formatNumber(revenue.totalUpsells || 0)} upsell opportunities` : null,
    permissions.revenue ? `${formatNumber(revenue.accepted || 0)} accepted upsells` : null,
    permissions.experienceBookings ? `${formatNumber(experienceBookings.active || 0)} experience requests` : null,
    permissions.experienceBookings ? `${formatNumber(experienceBookings.providerRequestsSent || 0)} provider requests sent` : null,
    permissions.experienceBookings ? `${formatNumber(experienceBookings.failedProviderEmails || 0)} failed provider emails` : null,
    permissions.revenue ? `${formatCurrency(revenue.estimatedRevenue || experienceBookings.estimatedRevenue || 0)} estimated revenue` : null
  ].filter(Boolean);

  return (
    <Panel
      title="Revenue & Experiences"
      eyebrow="Commercial follow-up"
      icon={TrendingUp}
      actions={[
        permissions.revenue ? { href: '/dashboard/upsells', label: 'View Revenue' } : null,
        permissions.experienceBookings ? { href: '/dashboard/experience-bookings', label: 'View Experience Bookings' } : null
      ].filter(Boolean)}
    >
      <BulletList lines={lines} loading={loading} emptyTitle="No revenue or experience items yet." />
    </Panel>
  );
};

const HotelKnowledgePanel = ({ data, loading, permissions, compact = false }) => {
  const knowledge = data?.localIntelligence || {};
  const updatedAt = knowledge.topRecommendations?.[0]?.updated_at || null;
  const lines = [
    `${formatNumber(knowledge.active || 0)} active knowledge entries`,
    updatedAt ? `Last updated ${formatDateTime(updatedAt)}` : 'Knowledge base up to date',
    `${formatNumber(knowledge.featured || 0)} featured recommendations`,
    `${formatNumber(knowledge.indoorReady || 0)} indoor/rain-ready suggestions`
  ];

  return (
    <Panel
      title="Hotel Knowledge"
      eyebrow="Information quality"
      icon={BookOpen}
      actions={[
        permissions.knowledge ? { href: '/dashboard/settings/knowledge', label: 'Open Knowledge Base' } : null,
        permissions.localKnowledge ? { href: '/dashboard/local-knowledge', label: 'Open Local Knowledge' } : null
      ].filter(Boolean)}
      compact={compact}
    >
      <BulletList lines={lines} loading={loading} emptyTitle="Knowledge base up to date." />
    </Panel>
  );
};

const QuickActionsPanel = ({ role, permissions, data }) => {
  const adminActions = [
    permissions.inbox ? { label: 'Inbox', href: '/dashboard/inbox', icon: Inbox } : null,
    permissions.tickets ? { label: 'Tickets', href: '/dashboard/tickets', icon: TicketCheck } : null,
    permissions.reception ? { label: 'Reception / Pre Check-in', href: '/dashboard/reception', icon: ConciergeBell } : null,
    permissions.automations ? { label: 'Automations', href: '/dashboard/automations', icon: Zap } : null,
    permissions.revenue ? { label: 'Revenue', href: '/dashboard/upsells', icon: TrendingUp } : null,
    permissions.experienceBookings ? { label: 'Experience Bookings', href: '/dashboard/experience-bookings', icon: CalendarCheck } : null,
    permissions.knowledge ? { label: 'Knowledge Base', href: '/dashboard/settings/knowledge', icon: BookOpen } : null,
    permissions.qrRooms ? { label: 'QR Rooms', href: '/dashboard/qr-rooms', icon: QrCode } : null,
    permissions.academy ? { label: 'Academy', href: '/dashboard/settings/academy', icon: ShieldCheck } : null,
    permissions.pms ? { label: 'PMS status', href: '/dashboard/settings/pms', icon: DatabaseZap } : null
  ].filter(Boolean);
  const receptionistActions = [
    permissions.inbox ? { label: 'Open Inbox', href: '/dashboard/inbox', icon: Inbox } : null,
    permissions.tickets ? { label: 'View Tickets', href: '/dashboard/tickets', icon: TicketCheck } : null,
    permissions.reception ? { label: 'Reception / Pre Check-in', href: '/dashboard/reception', icon: ConciergeBell } : null,
    permissions.qrRooms ? { label: 'QR Rooms', href: '/dashboard/qr-rooms', icon: QrCode } : null,
    permissions.knowledge ? { label: 'Knowledge Base', href: '/dashboard/settings/knowledge', icon: BookOpen } : null,
    permissions.localKnowledge ? { label: 'Local Knowledge', href: '/dashboard/local-knowledge', icon: Map } : null,
    permissions.academy ? { label: 'Receptionist Academy', href: '/dashboard/settings/academy', icon: ShieldCheck } : null
  ].filter(Boolean);
  const actions = role === 'receptionist' ? receptionistActions : adminActions;
  const onboarding = data?.onboardingHealth || {};

  return (
    <Panel title="Quick Actions" eyebrow="Open the right workspace" icon={Sparkles} badge={role === 'receptionist' ? 'Reception' : 'Admin'} badgeTone="violet">
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
          <StatusLine icon={DatabaseZap} label="PMS" value={onboarding.pmsConnected ? 'Connected' : 'Needs setup'} tone={onboarding.pmsConnected ? 'emerald' : 'amber'} />
          <StatusLine icon={Languages} label="WhatsApp" value={onboarding.whatsappConfigured ? 'Configured' : 'Needs setup'} tone={onboarding.whatsappConfigured ? 'emerald' : 'amber'} />
        </div>
      ) : null}
    </Panel>
  );
};

const DataTile = ({ label, value, tone = 'slate', compact = false, badge = null }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn(
      'flex min-h-[88px] flex-col justify-center rounded-xl border text-center',
      compact ? 'p-3' : 'p-4',
      isLight ? 'border-slate-200 bg-slate-50/85' : 'border-white/10 bg-white/[0.025]'
    )}
    >
      <p className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', isLight ? 'text-slate-500' : 'text-slate-400')}>
        {label}
      </p>
      <p className={cn('mt-2 truncate text-xl font-semibold tracking-tight tabular-nums', ui.text.title(isLight))}>
        {value}
      </p>
      {badge ? (
        <div className="mt-2 flex justify-center">
          <ExecutiveBadge tone={tone}>{badge}</ExecutiveBadge>
        </div>
      ) : null}
    </div>
  );
};

const LanguagePills = ({ languages = [], loading }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  if (loading) {
    return <div className={cn('h-28 rounded-xl', ui.skeleton(isLight))} />;
  }

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>Top languages</p>
      {languages.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {languages.map((language) => (
            <ExecutiveBadge key={language.label} tone="sky">
              {String(language.label).toUpperCase()} {language.count}
            </ExecutiveBadge>
          ))}
        </div>
      ) : (
        <p className={cn('mt-2 text-sm', ui.text.muted(isLight))}>No language pattern yet.</p>
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
            <p className={ui.text.eyebrow(isLight)}>{eyebrow}</p>
            <h2 className={cn('mt-1 text-lg', ui.text.title(isLight))}>{title}</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {badge ? <ExecutiveBadge tone={badgeTone}>{badge}</ExecutiveBadge> : null}
          {actionList.map((item) => (
            <Link key={item.href} href={item.href} className={ui.button(isLight, 'secondary')}>
              {item.label}
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
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50/85' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex items-start justify-between gap-3">
        <p className={ui.text.eyebrow(isLight)}>{label}</p>
        <ExecutiveBadge tone={tone}>Live</ExecutiveBadge>
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
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex items-center justify-between gap-3">
        <p className={ui.text.eyebrow(isLight)}>{item.label}</p>
        <ExecutiveBadge tone={item.tone}>{loading ? '...' : item.value}</ExecutiveBadge>
      </div>
    </div>
  );
};

const AttentionRow = ({ item }) => {
  const { theme } = useDashboardTheme();
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
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{item.label}</p>
          <p className={cn('mt-1', ui.text.muted(isLight))}>{item.detail}</p>
        </div>
        <ExecutiveBadge tone={tone}>{formatNumber(item.value)}</ExecutiveBadge>
      </div>
    </Link>
  );
};

const BulletList = ({ lines, loading, emptyTitle = 'No items yet.' }) => {
  if (loading) return <SkeletonList />;

  if (!lines.length) {
    return <EmptyState icon={CheckCircle2} title={emptyTitle} description="Staynex will populate this panel as activity appears." />;
  }

  return (
    <div className="space-y-3">
      {lines.map((line) => (
        <StatusLine key={line} icon={CheckCircle2} label={line} value="Open" tone="slate" compact />
      ))}
    </div>
  );
};

const StatusLine = ({ icon: Icon, label, value, tone = 'slate', compact = false }) => {
  const { theme } = useDashboardTheme();
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
        <span className={cn('truncate text-sm font-medium', isLight ? 'text-slate-700' : 'text-slate-300')}>{label}</span>
      </div>
      <ExecutiveBadge tone={tone}>{value}</ExecutiveBadge>
    </div>
  );
};

const LinkCard = ({ href, icon: Icon, label }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <Link href={href} className={cn(
      'group flex items-center justify-between gap-3 rounded-xl border p-4 text-sm font-semibold transition hover:-translate-y-0.5',
      isLight ? 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-white' : 'border-white/10 bg-white/[0.025] text-slate-200 hover:bg-white/[0.06]'
    )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
    </Link>
  );
};

const EmptyState = ({ icon: Icon, title, description }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border border-dashed p-5 text-center', isLight ? 'border-slate-300 bg-slate-50/70' : 'border-white/10 bg-white/[0.02]')}>
      <span className={cn('mx-auto flex h-10 w-10 items-center justify-center rounded-xl border', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className={cn('mt-3 text-sm font-semibold', ui.text.title(isLight))}>{title}</p>
      <p className={cn('mt-1', ui.text.muted(isLight))}>{description}</p>
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
