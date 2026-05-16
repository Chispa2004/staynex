'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Bot, CalendarPlus, Inbox, PlugZap, RefreshCw, Rocket, Sparkles } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { KPIGrid } from './KPIGrid';
import { LiveActivityFeed } from './LiveActivityFeed';
import { OperationsPanel } from './OperationsPanel';
import { InsightsPanel } from './InsightsPanel';
import { RevenueUpsellsPanel } from './RevenueUpsellsPanel';
import { VipGuestsPanel } from './VipGuestsPanel';
import { ConciergeRevenuePanel } from './ConciergeRevenuePanel';
import { ConversationIntelligencePanel } from './ConversationIntelligencePanel';
import { ContextualRevenuePanel } from './ContextualRevenuePanel';
import { ExperienceOpportunitiesPanel } from './ExperienceOpportunitiesPanel';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getActiveTenantId, shouldAcceptTenantPayload } from '@/lib/tenant-client';

const greetingForHour = (hour) => {
  if (hour < 12) {
    return 'Buenos días';
  }

  if (hour < 20) {
    return 'Buenas tardes';
  }

  return 'Buenas noches';
};

const getHotelHour = (timezone) => {
  try {
    return Number(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Europe/Madrid',
      hour: 'numeric',
      hour12: false
    }).format(new Date()));
  } catch {
    return new Date().getHours();
  }
};

const formatHotelDateTime = (timezone) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone || 'Europe/Madrid',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date());
  }
};

const quickActions = [
  { label: 'Open Inbox', href: '/dashboard/inbox', icon: Inbox, tone: 'emerald' },
  { label: 'Create Reservation', href: '/dashboard/reservations', icon: CalendarPlus, tone: 'sky' },
  { label: 'PMS Connections', href: '/dashboard/settings/pms', icon: PlugZap, tone: 'emerald' },
  { label: 'View Upsells', href: '/dashboard/upsells', icon: Sparkles, tone: 'violet' },
  { label: 'Local Knowledge', href: '/dashboard/local-knowledge', icon: BookOpen, tone: 'sky' },
  { label: 'Open Knowledge Base', href: '/dashboard/knowledge', icon: BookOpen, tone: 'amber' }
];

export const ExecutiveDashboardClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [schedulerResult, setSchedulerResult] = useState(null);
  const [error, setError] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
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
      setData(null);
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/executive-dashboard', {
        headers,
        cache: 'no-store'
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Could not load executive dashboard');
      }

      if (!shouldAcceptTenantPayload(payload, 'executive-dashboard')) {
        return;
      }

      const payloadHotelId = payload.hotel?.id || null;

      if (requestId !== dashboardRequestIdRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale response ignored', { surface: 'executive-dashboard', hotelId: payloadHotelId });
        }
        return;
      }

      if (activeHotelIdRef.current && payloadHotelId && activeHotelIdRef.current !== payloadHotelId) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('state reset for hotel', { surface: 'executive-dashboard', hotelId: payloadHotelId });
        }
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
        if (!silent) {
          setRefreshing(false);
        }
      }
    }
  }, []);

  useEffect(() => {
    const hotelId = getActiveTenantId();
    setDemoMode(window.localStorage.getItem(`staynex_demo_mode:${hotelId || 'none'}`) === 'true');
    loadDashboard();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      loadDashboard({ silent: true });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [loadDashboard]);

  const toggleDemoMode = () => {
    setDemoMode((current) => {
      const next = !current;
      const hotelId = activeHotelIdRef.current || getActiveTenantId() || 'none';
      window.localStorage.setItem(`staynex_demo_mode:${hotelId}`, String(next));
      return next;
    });
  };

  const runScheduler = async () => {
    setSchedulerRunning(true);
    setSchedulerResult(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/automations/run', {
        method: 'POST',
        headers
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Scheduler failed');
      }

      setSchedulerResult(`${body.scheduled || 0} messages scheduled`);
      await loadDashboard({ silent: true });
    } catch (caughtError) {
      setSchedulerResult(caughtError.message);
    } finally {
      setSchedulerRunning(false);
    }
  };

  const hotel = data?.hotel;
  const hotelName = hotel?.name || 'Staynex';
  const hotelTimeZone = hotel?.timezone || 'Europe/Madrid';
  const greeting = useMemo(() => greetingForHour(getHotelHour(hotelTimeZone)), [hotelTimeZone]);
  const summary = data?.summary || {};

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ExecutiveBadge tone="emerald">LIVE</ExecutiveBadge>
            {demoMode ? <ExecutiveBadge tone="violet">DEMO MODE</ExecutiveBadge> : null}
            <ExecutiveBadge tone="slate">{formatHotelDateTime(hotelTimeZone)}</ExecutiveBadge>
          </div>
          <h1 className={isLight ? 'text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl' : 'text-3xl font-semibold tracking-tight text-white sm:text-5xl'}>
            {greeting}, {hotelName}
          </h1>
          <p className={isLight ? 'mt-4 max-w-3xl text-sm leading-6 text-slate-600' : 'mt-4 max-w-3xl text-sm leading-6 text-slate-400'}>
            {(summary.activeConversations || 0)} conversaciones activas · {(summary.upsellsDetected || 0)} upsells detectados · {(summary.urgentTickets || 0)} tickets urgentes
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadDashboard()}
            disabled={refreshing}
            className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-60' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-60'}
          >
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={toggleDemoMode}
            className={demoMode ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-violet-200/60 bg-violet-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-violet-500/15 transition hover:bg-violet-200' : isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white'}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {demoMode ? 'Demo Mode On' : 'Demo Mode'}
          </button>
          <button
            type="button"
            onClick={runScheduler}
            disabled={schedulerRunning}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200/50 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60"
          >
            <Bot className={schedulerRunning ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} aria-hidden="true" />
            Run Scheduler
          </button>
        </div>
      </div>

      {error ? (
        <ExecutiveCard className="border-red-300/25 p-4">
          <p className="text-sm font-semibold text-red-300">Dashboard data could not be refreshed.</p>
          <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-400'}>{error}</p>
        </ExecutiveCard>
      ) : null}

      {schedulerResult ? (
        <ExecutiveCard className="p-4">
          <p className={isLight ? 'text-sm text-slate-700' : 'text-sm text-slate-300'}>{schedulerResult}</p>
        </ExecutiveCard>
      ) : null}

      <KPIGrid kpis={data?.kpis || {}} loading={loading} />

      <div className="grid min-h-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)] 2xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.55fr)]">
        <LiveActivityFeed activity={data?.activity || []} loading={loading} />
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <RevenueUpsellsPanel revenue={data?.revenue || {}} />
          <ContextualRevenuePanel data={data?.contextualRevenue || {}} />
          <ExperienceOpportunitiesPanel data={data?.experienceIntelligence || {}} />
          <LocalIntelligencePanel data={data?.localIntelligence || {}} />
          <OnboardingHealthCard onboardingHealth={data?.onboardingHealth || {}} />
          <PmsStatusCard pmsStatus={data?.pmsStatus || {}} />
          <QuickActions runScheduler={runScheduler} schedulerRunning={schedulerRunning} />
        </div>
      </div>

      <OperationsPanel operations={data?.operations || {}} />
      <ConversationIntelligencePanel data={data?.conversationIntelligence || {}} />
      <ConciergeRevenuePanel data={data?.conciergeRevenue || {}} />
      <VipGuestsPanel guests={data?.guestSignals || []} />
      <InsightsPanel insights={data?.insights || []} />
    </section>
  );
};

const LocalIntelligencePanel = ({ data }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const topRecommendations = data.topRecommendations || [];

  return (
    <ExecutiveCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Local Intelligence</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-400'}>Staff-curated local knowledge powering the AI concierge.</p>
        </div>
        <ExecutiveBadge tone={data.active > 0 ? 'emerald' : 'slate'}>{data.active || 0} active</ExecutiveBadge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
          <p className="font-semibold">{data.total || 0}</p>
          <p className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>Cards</p>
        </div>
        <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
          <p className="font-semibold">{data.featured || 0}</p>
          <p className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>Featured</p>
        </div>
        <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
          <p className="font-semibold">{data.indoorReady || 0}</p>
          <p className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>Rain ready</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {topRecommendations.length ? topRecommendations.slice(0, 4).map((item) => (
          <Link
            key={item.id}
            href="/dashboard/local-knowledge"
            className={isLight ? 'block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50' : 'block rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-sm hover:bg-white/[0.06]'}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-semibold">{item.title}</span>
              <span className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>{item.category}</span>
            </div>
          </Link>
        )) : (
          <Link href="/dashboard/local-knowledge" className={isLight ? 'block rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 hover:bg-slate-50' : 'block rounded-lg border border-dashed border-white/15 px-3 py-3 text-sm text-slate-400 hover:bg-white/[0.04]'}>
            Add local recommendations
          </Link>
        )}
      </div>
    </ExecutiveCard>
  );
};

const OnboardingHealthCard = ({ onboardingHealth }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const checks = [
    ['PMS connected', onboardingHealth.pmsConnected],
    ['WhatsApp configured', onboardingHealth.whatsappConfigured],
    ['AI active', onboardingHealth.aiActive],
    ['Reservations synced', onboardingHealth.reservationsSynced],
    ['Knowledge Base', onboardingHealth.kbCompleted]
  ];
  const readyCount = checks.filter(([, ready]) => ready).length;

  return (
    <ExecutiveCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Onboarding Health</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>{readyCount} of {checks.length} launch signals ready.</p>
        </div>
        <ExecutiveBadge tone={onboardingHealth.completed ? 'emerald' : 'amber'}>
          {onboardingHealth.completed ? 'Complete' : onboardingHealth.currentStep || 'In progress'}
        </ExecutiveBadge>
      </div>
      <div className="mt-4 space-y-2">
        {checks.map(([label, ready]) => (
          <div key={label} className={isLight ? 'flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm' : 'flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-sm'}>
            <span className={isLight ? 'font-medium text-slate-700' : 'font-medium text-slate-300'}>{label}</span>
            <span className={ready ? 'text-emerald-500' : 'text-amber-500'}>{ready ? 'Ready' : 'Pending'}</span>
          </div>
        ))}
      </div>
      <Link href="/dashboard/onboarding" className={isLight ? 'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>
        <Rocket className="h-4 w-4" />
        Open onboarding
      </Link>
    </ExecutiveCard>
  );
};

const PmsStatusCard = ({ pmsStatus }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const providers = pmsStatus.providers || [];
  const primaryProvider = providers[0] || null;

  return (
    <ExecutiveCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>PMS Status</h2>
          <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Hotel PMS connectivity and sync health.</p>
        </div>
        <ExecutiveBadge tone={pmsStatus.connected > 0 ? 'emerald' : 'slate'}>
          {pmsStatus.connected > 0 ? 'Connected' : 'Not connected'}
        </ExecutiveBadge>
      </div>

      <div className={isLight ? 'mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4' : 'mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
        {primaryProvider ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <PlugZap className="h-4 w-4 text-emerald-400" />
              <div>
                <p className={isLight ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-white'}>{primaryProvider.provider}</p>
                <p className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-500'}>{primaryProvider.syncStatus || 'configured'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Imported</p>
                <p className={isLight ? 'mt-1 font-semibold text-slate-900' : 'mt-1 font-semibold text-white'}>{primaryProvider.importedReservations || 0}</p>
              </div>
              <div>
                <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Errors</p>
                <p className={primaryProvider.lastSyncError ? 'mt-1 font-semibold text-red-400' : isLight ? 'mt-1 font-semibold text-slate-900' : 'mt-1 font-semibold text-white'}>
                  {primaryProvider.lastSyncError ? 'Review' : '0'}
                </p>
              </div>
              <div>
                <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Webhook</p>
                <p className={isLight ? 'mt-1 font-semibold text-slate-900' : 'mt-1 font-semibold text-white'}>{primaryProvider.webhookStatus || 'manual setup'}</p>
              </div>
              <div>
                <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Last event</p>
                <p className={primaryProvider.lastWebhookError ? 'mt-1 font-semibold text-red-400' : isLight ? 'mt-1 font-semibold text-slate-900' : 'mt-1 font-semibold text-white'}>
                  {primaryProvider.lastWebhookError ? 'Review' : primaryProvider.lastWebhookAt ? 'Received' : 'None'}
                </p>
              </div>
            </div>
            {primaryProvider.lastWebhookError ? (
              <p className="text-xs leading-5 text-red-400">{primaryProvider.lastWebhookError}</p>
            ) : null}
          </div>
        ) : (
          <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>No PMS connected yet.</p>
        )}
      </div>
      <Link href="/dashboard/settings/pms" className={isLight ? 'mt-4 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'mt-4 inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>
        Manage PMS
      </Link>
    </ExecutiveCard>
  );
};

const QuickActions = ({ runScheduler, schedulerRunning }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <ExecutiveCard className="p-5">
      <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Quick Actions</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {quickActions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.label}
              href={action.href}
              className={isLight ? 'flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-slate-950' : 'flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white'}
            >
              <Icon className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              {action.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={runScheduler}
          disabled={schedulerRunning}
          className={isLight ? 'flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-slate-950 disabled:opacity-60' : 'flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3 text-left text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-60'}
        >
          <Bot className={schedulerRunning ? 'h-4 w-4 animate-pulse text-emerald-400' : 'h-4 w-4 text-emerald-400'} aria-hidden="true" />
          Run Scheduler
        </button>
      </div>
    </ExecutiveCard>
  );
};
