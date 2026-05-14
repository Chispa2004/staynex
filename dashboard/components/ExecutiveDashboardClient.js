'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Bot, CalendarPlus, Inbox, RefreshCw, Sparkles } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { KPIGrid } from './KPIGrid';
import { LiveActivityFeed } from './LiveActivityFeed';
import { OperationsPanel } from './OperationsPanel';
import { InsightsPanel } from './InsightsPanel';
import { RevenueUpsellsPanel } from './RevenueUpsellsPanel';
import { VipGuestsPanel } from './VipGuestsPanel';
import { ConciergeRevenuePanel } from './ConciergeRevenuePanel';
import { ConversationIntelligencePanel } from './ConversationIntelligencePanel';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

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
  { label: 'View Upsells', href: '/dashboard/upsells', icon: Sparkles, tone: 'violet' },
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

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setRefreshing(true);
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

      setData(payload);
      setError(null);
    } catch (caughtError) {
      console.error('Executive dashboard refresh failed', caughtError);
      setError(caughtError.message);
    } finally {
      setLoading(false);
      if (!silent) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const intervalId = window.setInterval(() => {
      loadDashboard({ silent: true });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [loadDashboard]);

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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)] 2xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.55fr)]">
        <LiveActivityFeed activity={data?.activity || []} loading={loading} />
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <RevenueUpsellsPanel revenue={data?.revenue || {}} />
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
