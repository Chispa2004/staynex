'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeEuro, BedDouble, BookOpen, Bot, CalendarPlus, CheckCircle2, Inbox, MessageSquareText, PlugZap, RefreshCw, Rocket, Sparkles, TrendingUp } from 'lucide-react';
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

      <DashboardIntelligencePanel
        summary={summary}
        revenue={data?.revenue || {}}
        conversationIntelligence={data?.conversationIntelligence || {}}
        experienceIntelligence={data?.experienceIntelligence || {}}
        conciergeRevenue={data?.conciergeRevenue || {}}
        loading={loading}
      />

      <KPIGrid kpis={data?.kpis || {}} loading={loading} />
      <OperationalContextCard data={data?.operationalContext || {}} loading={loading} />
      <GuestIntelligenceInsightsCard data={data?.guestIntelligenceInsights || {}} loading={loading} />

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

const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const OperationalContextCard = ({ data = {}, loading = false }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const stats = [
    { label: 'Occupancy', value: data.occupancyToday === null || data.occupancyToday === undefined ? 'Unknown' : `${data.occupancyToday}%`, tone: 'emerald' },
    { label: 'Arrivals', value: data.arrivalsToday ?? 0, tone: 'sky' },
    { label: 'Departures', value: data.departuresToday ?? 0, tone: 'orange' },
    { label: 'Rooms ready', value: data.roomsReady ?? 0, tone: 'emerald' },
    { label: 'Rooms dirty', value: data.roomsDirty ?? 0, tone: 'orange' },
    { label: 'Maintenance', value: data.roomsMaintenance ?? 0, tone: data.roomsMaintenance > 0 ? 'orange' : 'slate' },
    { label: 'VIP guests', value: data.vipGuests ?? 0, tone: 'violet' },
    { label: 'Upgrade opportunities', value: data.upgradeOpportunities ?? 0, tone: 'emerald' }
  ];

  return (
    <ExecutiveCard className={isLight ? 'p-5' : 'p-5'}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={isLight ? 'flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700' : 'flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-100'}>
              <BedDouble className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Operational Context</h2>
              <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>
                PMS-derived room, occupancy and stay context for AI, Copilot and automations.
              </p>
            </div>
          </div>
        </div>
        <ExecutiveBadge tone={data.health === 'active' ? 'emerald' : 'slate'}>
          {data.health === 'active' ? 'PMS intelligence active' : 'Fallback mode'}
        </ExecutiveBadge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-3' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>{item.label}</p>
            <p className={isLight ? 'mt-2 text-xl font-semibold text-slate-950' : 'mt-2 text-xl font-semibold text-white'}>{loading ? '...' : item.value}</p>
          </div>
        ))}
      </div>
      {data.lastUpdatedAt ? (
        <p className={isLight ? 'mt-4 text-xs text-slate-500' : 'mt-4 text-xs text-slate-500'}>
          Last PMS intelligence update: {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.lastUpdatedAt))}
        </p>
      ) : null}
    </ExecutiveCard>
  );
};

const GuestIntelligenceInsightsCard = ({ data = {}, loading = false }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const topProfile = data.topProfile?.type ? data.topProfile.type.replaceAll('_', ' ') : 'Learning';
  const topAffinity = data.topAffinity?.type ? data.topAffinity.type.replace('_affinity', '').replaceAll('_', ' ') : 'Learning';
  const stats = [
    { label: 'Profiles', value: data.profiles ?? 0, tone: 'violet' },
    { label: 'High revenue guests', value: data.highRevenueGuests ?? 0, tone: 'emerald' },
    { label: 'Review risk', value: data.reviewRiskGuests ?? 0, tone: Number(data.reviewRiskGuests || 0) > 0 ? 'orange' : 'slate' },
    { label: 'Predicted revenue', value: formatCurrency(data.estimatedRevenueAi || 0), tone: 'emerald' },
    { label: 'Avg conversion', value: `${data.avgConversionProbability || 0}%`, tone: 'sky' },
    { label: 'Revenue AI events', value: data.revenueAiEvents ?? 0, tone: 'violet' }
  ];

  return (
    <ExecutiveCard className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={isLight ? 'flex h-9 w-9 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700' : 'flex h-9 w-9 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-300/10 text-violet-100'}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Guest Intelligence Insights</h2>
              <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>
                Revenue AI profile signals, affinities and conversion predictions for today&apos;s operation.
              </p>
            </div>
          </div>
        </div>
        <ExecutiveBadge tone={data.profiles ? 'violet' : 'slate'}>
          {data.profiles ? 'Intelligence active' : 'Learning mode'}
        </ExecutiveBadge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((item) => (
          <div key={item.label} className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-3' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3'}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
            <p className={isLight ? 'mt-2 text-xl font-semibold text-slate-950' : 'mt-2 text-xl font-semibold text-white'}>{loading ? '...' : item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Top guest profile</p>
          <p className={isLight ? 'mt-2 text-sm font-semibold capitalize text-slate-950' : 'mt-2 text-sm font-semibold capitalize text-white'}>{topProfile}</p>
        </div>
        <div className={isLight ? 'rounded-xl border border-slate-200 bg-white p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Top affinity</p>
          <p className={isLight ? 'mt-2 text-sm font-semibold capitalize text-slate-950' : 'mt-2 text-sm font-semibold capitalize text-white'}>{topAffinity}</p>
        </div>
      </div>

      {data.insights?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.insights.slice(0, 4).map((insight) => (
            <ExecutiveBadge key={insight} tone="sky">{insight}</ExecutiveBadge>
          ))}
        </div>
      ) : null}
    </ExecutiveCard>
  );
};

const DashboardIntelligencePanel = ({
  summary,
  revenue,
  conversationIntelligence,
  experienceIntelligence,
  conciergeRevenue,
  loading
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const activeConversations = Number(summary.activeConversations || 0);
  const urgentTickets = Number(summary.urgentTickets || 0);
  const upsellsDetected = Number(summary.upsellsDetected || 0);
  const aiRevenue = Number(conciergeRevenue.generatedRevenue || revenue.acceptedRevenue || revenue.estimatedRevenue || 0);
  const potentialRevenue = Number(conciergeRevenue.potentialRevenue || revenue.estimatedRevenue || 0);
  const experienceSignals = Number(experienceIntelligence.opportunities || experienceIntelligence.total || 0);
  const aiResolution = Number(conversationIntelligence.aiResolutionRate || conversationIntelligence.aiHandledPercent || 0);
  const insights = [
    {
      icon: MessageSquareText,
      label: 'Today AI Insights',
      title: `${activeConversations} active guest conversations`,
      body: urgentTickets > 0
        ? `${urgentTickets} urgent conversations need reception follow-up.`
        : 'Guest conversations are flowing without urgent blockers.',
      tone: urgentTickets > 0 ? 'orange' : 'emerald'
    },
    {
      icon: TrendingUp,
      label: 'Revenue pulse',
      title: `${formatCurrency(potentialRevenue)} potential revenue`,
      body: upsellsDetected > 0
        ? `${upsellsDetected} upsell moments detected by AI.`
        : 'AI will surface upsell moments as guest intent appears.',
      tone: 'sky'
    },
    {
      icon: Sparkles,
      label: 'Experience trend',
      title: experienceSignals > 0 ? `${experienceSignals} experience signals` : 'Concierge signals warming up',
      body: 'Use experiences and local knowledge to guide premium recommendations.',
      tone: 'violet'
    }
  ];
  const actions = [
    {
      icon: CheckCircle2,
      title: urgentTickets > 0 ? 'Review unresolved guest issues' : 'Keep AI coverage high',
      helper: urgentTickets > 0 ? 'Start with Needs Human conversations.' : 'Monitor inbox and let AI handle routine questions.'
    },
    {
      icon: BadgeEuro,
      title: upsellsDetected > 0 ? 'Follow up revenue opportunities' : 'Prepare late checkout offers',
      helper: upsellsDetected > 0 ? 'Prioritize accepted signals and VIP stays.' : 'Late checkout and transfer demand convert well.'
    },
    {
      icon: Rocket,
      title: 'Automation Center preview',
      helper: 'Scheduled upsells, triggers and AI campaigns stay visible from quick actions.'
    }
  ];
  const funnel = [
    { label: 'AI handled', value: aiResolution || 72 },
    { label: 'Upsells', value: Math.min(100, upsellsDetected * 12 || 28) },
    { label: 'Revenue', value: Math.min(100, aiRevenue ? 64 : 18) }
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <ExecutiveCard className={isLight ? 'overflow-hidden border-emerald-200/80 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_32%),#fff] p-5' : 'overflow-hidden border-emerald-300/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),rgba(11,16,25,0.94)] p-5'}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <ExecutiveBadge tone="emerald">AI-native operations</ExecutiveBadge>
            <h2 className={isLight ? 'mt-3 text-2xl font-semibold tracking-tight text-slate-950' : 'mt-3 text-2xl font-semibold tracking-tight text-white'}>Today AI Insights</h2>
            <p className={isLight ? 'mt-2 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-2xl text-sm leading-6 text-slate-400'}>
              Staynex highlights guest intent, operational risk and revenue moments so reception can act faster.
            </p>
          </div>
          <div className={isLight ? 'rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-right shadow-sm' : 'rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right'}>
            <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>AI revenue</p>
            <p className={isLight ? 'mt-1 text-2xl font-semibold text-slate-950' : 'mt-1 text-2xl font-semibold text-white'}>{loading ? '...' : formatCurrency(aiRevenue)}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {insights.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className={isLight ? 'rounded-xl border border-slate-200 bg-white/85 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md' : 'rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-0.5 hover:bg-white/[0.055]'}>
                <div className="flex items-center justify-between gap-3">
                  <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>{item.label}</p>
                  <span className={isLight ? 'flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700' : 'flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-100'}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <p className={isLight ? 'mt-4 text-base font-semibold text-slate-950' : 'mt-4 text-base font-semibold text-white'}>{loading ? 'Loading insight...' : item.title}</p>
                <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-400'}>{item.body}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {funnel.map((item) => (
            <div key={item.label}>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>{item.label}</span>
                <span>{item.value}%</span>
              </div>
              <div className={isLight ? 'h-2 overflow-hidden rounded-full bg-slate-100' : 'h-2 overflow-hidden rounded-full bg-white/10'}>
                <div className="h-full rounded-full bg-emerald-300 transition-all duration-500" style={{ width: `${Math.max(8, Math.min(100, item.value))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </ExecutiveCard>

      <ExecutiveCard className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Recommended Actions</h2>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Operational next steps for today.</p>
          </div>
          <ExecutiveBadge tone="violet">AI curated</ExecutiveBadge>
        </div>
        <div className="mt-4 space-y-3">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <div key={action.title} className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:bg-white' : 'rounded-xl border border-white/10 bg-white/[0.025] p-3 transition hover:bg-white/[0.055]'}>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-300 text-slate-950">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className={isLight ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-white'}>{action.title}</p>
                    <p className={isLight ? 'mt-1 text-xs leading-5 text-slate-500' : 'mt-1 text-xs leading-5 text-slate-500'}>{action.helper}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ExecutiveCard>
    </div>
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
