'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeEuro,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Languages,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Star,
  TicketCheck,
  UserRound
} from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const formatDate = (value) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
};

const formatDateTime = (value) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const formatCurrency = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const toneForPriority = (value) => {
  if (value === 'urgent') return 'red';
  if (value === 'high') return 'amber';
  if (value === 'normal') return 'sky';
  return 'slate';
};

const labelForDepartment = {
  reception: 'Reception',
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance',
  revenue: 'Revenue'
};

const timelineIcons = {
  message: MessageSquareText,
  ticket: TicketCheck,
  reservation: CalendarDays,
  upsell: Sparkles,
  automation: Clock3,
  insight: BrainCircuit
};

export const GuestAiProfileClient = ({ guestId }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadProfile = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const response = await fetch(`/api/guest-memory/${guestId}`, {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Could not load AI guest profile');
      }

      setData(payload);
      setError(null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
      if (!silent) {
        setRefreshing(false);
      }
    }
  }, [guestId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const header = data?.header || {};
  const timeline = data?.timeline || [];
  const insights = data?.insights || [];
  const actions = data?.actions || [];
  const tags = data?.tags || [];
  const departmentContext = data?.departmentContext || {};
  const risk = data?.risk || {};
  const revenue = data?.revenue || {};
  const primaryReservation = data?.raw?.reservations?.[0];
  const scoreTone = Number(header.guestScore || 0) >= 80 ? 'emerald' : Number(header.guestScore || 0) >= 60 ? 'sky' : 'amber';

  const skeleton = useMemo(() => Array.from({ length: 4 }).map((_, index) => index), []);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/dashboard/guest-memory"
            className={isLight ? 'inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950' : 'inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white'}
          >
            <ArrowLeft className="h-4 w-4" />
            Guest Memory
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ExecutiveBadge tone="emerald">AI Guest Profile</ExecutiveBadge>
            <ExecutiveBadge tone={risk.level === 'high' ? 'red' : risk.level === 'medium' ? 'amber' : 'slate'}>
              Risk {risk.level || 'learning'}
            </ExecutiveBadge>
          </div>
          <h1 className={isLight ? 'mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl' : 'mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl'}>
            {loading ? 'Loading guest...' : header.name}
          </h1>
          <p className={isLight ? 'mt-3 max-w-3xl text-sm leading-6 text-slate-600' : 'mt-3 max-w-3xl text-sm leading-6 text-slate-400'}>
            Persistent AI context built from WhatsApp, reservations, tickets, upsells, automations and memory.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadProfile()}
          disabled={refreshing}
          className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.08] disabled:opacity-60'}
        >
          <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </button>
      </div>

      {error ? (
        <ExecutiveCard className="border-red-300/25 p-4">
          <p className="text-sm font-semibold text-red-300">Guest profile could not be loaded.</p>
          <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-400'}>{error}</p>
        </ExecutiveCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ExecutiveCard className="p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Mail} label="Email" value={header.email || '-'} />
            <Metric icon={Phone} label="Phone" value={header.phone || '-'} />
            <Metric icon={Languages} label="Language" value={String(header.preferredLanguage || '-').toUpperCase()} />
            <Metric icon={Star} label="AI guest score" value={`${header.guestScore ?? '-'} / 100`} tone={scoreTone} />
            <Metric icon={CalendarDays} label="Reservations" value={header.reservationCount ?? 0} />
            <Metric icon={Clock3} label="Last stay" value={formatDate(header.lastStay?.departure_date || header.lastStay?.arrival_date)} />
            <Metric icon={MessageSquareText} label="Conversations" value={header.totalConversations ?? 0} />
            <Metric icon={TicketCheck} label="Tickets" value={header.totalTickets ?? 0} />
            <Metric icon={Sparkles} label="Accepted upsells" value={header.acceptedUpsells ?? 0} />
            <Metric icon={BadgeEuro} label="Revenue generated" value={formatCurrency(header.revenueGenerated)} tone="emerald" />
            <Metric icon={ShieldAlert} label="Risk score" value={`${risk.score ?? 0} / 100`} tone={risk.level === 'high' ? 'red' : risk.level === 'medium' ? 'amber' : 'slate'} />
            <Metric icon={UserRound} label="Current room" value={data?.guest?.current_room || '-'} />
          </div>
        </ExecutiveCard>

        <ExecutiveCard className="p-5">
          <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>Current reservation</p>
          <div className={isLight ? 'mt-4 space-y-3 text-sm text-slate-600' : 'mt-4 space-y-3 text-sm text-slate-400'}>
            <InfoRow label="Reservation" value={primaryReservation?.pms_reservation_id || '-'} />
            <InfoRow label="Arrival" value={formatDate(primaryReservation?.arrival_date)} />
            <InfoRow label="Departure" value={formatDate(primaryReservation?.departure_date)} />
            <InfoRow label="Room type" value={primaryReservation?.room_type || '-'} />
            <InfoRow label="Board basis" value={primaryReservation?.board_basis || '-'} />
          </div>
        </ExecutiveCard>
      </div>

      <ExecutiveCard className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>AI Tags</h2>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Generated from messages, reservations and behavior.</p>
          </div>
          <ExecutiveBadge tone="violet">{tags.length} signals</ExecutiveBadge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {loading ? skeleton.map((item) => <span key={item} className={isLight ? 'h-8 w-28 rounded-full bg-slate-100' : 'h-8 w-28 rounded-full bg-white/[0.06]'} />) : null}
          {!loading && tags.length === 0 ? (
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>No strong tags yet. The profile will enrich itself as the guest interacts.</p>
          ) : null}
          {!loading && tags.map((item) => (
            <ExecutiveBadge key={item.id || item.tag} tone={item.tag === 'vip' || item.tag === 'high_spender' ? 'emerald' : item.tag === 'complains_often' ? 'red' : item.tag === 'upgrade_ready' ? 'violet' : 'sky'}>
              {item.tag}
            </ExecutiveBadge>
          ))}
        </div>
      </ExecutiveCard>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <ExecutiveCard className="overflow-hidden">
          <div className={isLight ? 'border-b border-slate-200 px-5 py-4' : 'border-b border-white/10 px-5 py-4'}>
            <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>AI Timeline</h2>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Combined history across WhatsApp, operations and revenue.</p>
          </div>
          <div className="executive-scroll max-h-[680px] overflow-y-auto p-4">
            {timeline.length === 0 ? (
              <div className={isLight ? 'rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500' : 'rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-8 text-center text-sm text-slate-500'}>
                No timeline events yet.
              </div>
            ) : timeline.map((item) => (
              <TimelineItem key={item.id} item={item} />
            ))}
          </div>
        </ExecutiveCard>

        <div className="space-y-4">
          <Panel title="AI Insights" badge={`${insights.length} insights`}>
            <div className="space-y-3">
              {insights.map((item, index) => (
                <InsightCard key={item.id || `${item.title}-${index}`} item={item} />
              ))}
            </div>
          </Panel>

          <Panel title="Recommended Actions" badge={`${actions.length} actions`}>
            <div className="space-y-3">
              {actions.map((item, index) => (
                <ActionCard key={item.id || `${item.title}-${index}`} item={item} />
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <ExecutiveCard className="p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Department Context</h2>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>Operational memory separated for each hotel team.</p>
          </div>
          <ExecutiveBadge tone="emerald">Concierge Intelligence</ExecutiveBadge>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(labelForDepartment).map(([key, label]) => (
            <DepartmentCard key={key} title={label} notes={departmentContext[key] || []} />
          ))}
        </div>
      </ExecutiveCard>
    </section>
  );
};

const Metric = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
      <div className="flex items-center justify-between gap-3">
        <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>{label}</p>
        <ExecutiveBadge tone={tone}>
          <Icon className="h-3.5 w-3.5" />
        </ExecutiveBadge>
      </div>
      <p className={isLight ? 'mt-3 truncate text-lg font-semibold text-slate-950' : 'mt-3 truncate text-lg font-semibold text-white'} title={String(value)}>
        {value}
      </p>
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-xs font-semibold uppercase tracking-[0.12em] opacity-60">{label}</span>
    <span className="text-right font-medium">{value}</span>
  </div>
);

const TimelineItem = ({ item }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const Icon = timelineIcons[item.type] || BrainCircuit;

  return (
    <div className={isLight ? 'mb-3 rounded-lg border border-slate-200 bg-white p-4 last:mb-0' : 'mb-3 rounded-lg border border-white/10 bg-white/[0.025] p-4 last:mb-0'}>
      <div className="flex gap-3">
        <span className={isLight ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700' : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300'}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{item.title}</p>
            <span className={isLight ? 'shrink-0 text-xs text-slate-500' : 'shrink-0 text-xs text-slate-500'}>{formatDateTime(item.createdAt)}</span>
          </div>
          <p className={isLight ? 'mt-1 line-clamp-3 text-sm leading-6 text-slate-600' : 'mt-1 line-clamp-3 text-sm leading-6 text-slate-400'}>{item.description}</p>
        </div>
      </div>
    </div>
  );
};

const Panel = ({ title, badge, children }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <ExecutiveCard className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>{title}</h2>
        <ExecutiveBadge tone="slate">{badge}</ExecutiveBadge>
      </div>
      {children}
    </ExecutiveCard>
  );
};

const InsightCard = ({ item }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-4' : 'rounded-lg border border-white/10 bg-white/[0.025] p-4'}>
      <div className="flex items-start justify-between gap-3">
        <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{item.title}</p>
        <ExecutiveBadge tone={toneForPriority(item.priority)}>{item.priority || 'normal'}</ExecutiveBadge>
      </div>
      <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-600' : 'mt-2 text-sm leading-6 text-slate-400'}>{item.description}</p>
    </div>
  );
};

const ActionCard = ({ item }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-4' : 'rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4'}>
      <div className="flex items-start justify-between gap-3">
        <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{item.title}</p>
        <ExecutiveBadge tone={toneForPriority(item.priority)}>{item.department || 'reception'}</ExecutiveBadge>
      </div>
      <p className={isLight ? 'mt-2 text-sm leading-6 text-slate-700' : 'mt-2 text-sm leading-6 text-slate-300'}>
        {item.description || item.action_type || item.actionType}
      </p>
    </div>
  );
};

const DepartmentCard = ({ title, notes }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
      <h3 className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{title}</h3>
      <div className="mt-3 space-y-2">
        {(notes.length ? notes : ['No specific context yet']).map((note) => (
          <div key={note} className={isLight ? 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-600' : 'rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm leading-5 text-slate-400'}>
            {note}
          </div>
        ))}
      </div>
    </div>
  );
};
