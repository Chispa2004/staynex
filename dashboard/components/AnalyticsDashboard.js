'use client';

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Languages,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  TicketCheck,
  Timer,
  TrendingUp
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const periods = [
  { key: 'today', labelKey: 'analytics.filters.today' },
  { key: 'sevenDays', labelKey: 'analytics.filters.sevenDays' },
  { key: 'thirtyDays', labelKey: 'analytics.filters.thirtyDays' }
];

const emptyAnalytics = {
  hotelId: null,
  kpis: {
    managedMessages: 0,
    ticketsCreated: 0,
    resolutionRate: 0,
    aiAutomation: 0
  },
  messagesByDay: [],
  ticketFlow: [],
  departmentTickets: [],
  languages: [],
  frequentCategories: [],
  peakHours: [],
  impact: {
    timeSaved: '0 h',
    instantReplies: 0,
    urgentIncidents: 0,
    activeRooms: []
  }
};

const maxValue = (items, key = 'value') => Math.max(...items.map((item) => Number(item[key] || 0)), 1);
const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));
const formatPercent = (value) => `${Math.round(Number(value || 0))}%`;

const hasAnalyticsData = (data) => (
  Number(data?.kpis?.managedMessages || 0) > 0
  || Number(data?.kpis?.ticketsCreated || 0) > 0
  || Number(data?.impact?.instantReplies || 0) > 0
  || Number(data?.impact?.urgentIncidents || 0) > 0
);

const BarList = ({ items, valueSuffix = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const max = maxValue(items);

  if (!items.length) {
    return (
      <p className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500' : 'rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-sm text-slate-500'}>
        No data yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className={isLight ? 'font-medium text-slate-700' : 'font-medium text-slate-300'}>{item.label}</span>
            <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>{item.value}{valueSuffix}</span>
          </div>
          <div className={isLight ? 'h-2 overflow-hidden rounded-full bg-slate-200' : 'h-2 overflow-hidden rounded-full bg-white/10'}>
            <div
              className="h-full rounded-full bg-emerald-300"
              style={{ width: `${Math.max(8, (Number(item.value || 0) / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const MessagesByDay = ({ items }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const max = maxValue(items);

  if (!items.length) {
    return (
      <div className={isLight ? 'flex h-52 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500' : 'flex h-52 items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] text-sm text-slate-500'}>
        No messages yet.
      </div>
    );
  }

  return (
    <div className="flex h-52 items-end gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className={isLight ? 'flex h-40 w-full items-end rounded-lg bg-slate-100 p-1' : 'flex h-40 w-full items-end rounded-lg bg-white/[0.035] p-1'}>
            <div
              className="w-full rounded-md bg-emerald-300 shadow-lg shadow-emerald-500/10"
              style={{ height: `${Math.max(12, (Number(item.value || 0) / max) * 100)}%` }}
              title={`${item.label}: ${item.value}`}
            />
          </div>
          <span className={isLight ? 'truncate text-xs text-slate-500' : 'truncate text-xs text-slate-500'}>{item.label}</span>
        </div>
      ))}
    </div>
  );
};

const TicketFlow = ({ items }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const max = Math.max(...items.flatMap((item) => [Number(item.created || 0), Number(item.resolved || 0)]), 1);

  if (!items.length) {
    return (
      <p className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500' : 'rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-sm text-slate-500'}>
        No tickets yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[76px_1fr] items-center gap-3">
          <span className={isLight ? 'text-sm font-medium text-slate-600' : 'text-sm font-medium text-slate-400'}>{item.label}</span>
          <div className="space-y-1.5">
            <div className={isLight ? 'h-2 rounded-full bg-slate-200' : 'h-2 rounded-full bg-white/10'}>
              <div className="h-full rounded-full bg-sky-300" style={{ width: `${(Number(item.created || 0) / max) * 100}%` }} />
            </div>
            <div className={isLight ? 'h-2 rounded-full bg-slate-200' : 'h-2 rounded-full bg-white/10'}>
              <div className="h-full rounded-full bg-emerald-300" style={{ width: `${(Number(item.resolved || 0) / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const Card = ({ children, className = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={[
      'rounded-lg border p-5 shadow-xl',
      isLight
        ? 'border-slate-200 bg-white text-slate-900 shadow-slate-200/70'
        : 'border-white/10 bg-[#0b1019]/88 text-slate-100 shadow-black/15',
      className
    ].join(' ')}
    >
      {children}
    </section>
  );
};

const SectionTitle = ({ icon: Icon, title, description }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className="mb-5 flex items-start gap-3">
      <span className={isLight ? 'flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700' : 'flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <h2 className={isLight ? 'text-base font-semibold text-slate-950' : 'text-base font-semibold text-white'}>{title}</h2>
        {description ? (
          <p className={isLight ? 'mt-1 text-sm leading-6 text-slate-600' : 'mt-1 text-sm leading-6 text-slate-500'}>{description}</p>
        ) : null}
      </div>
    </div>
  );
};

const KpiCard = ({ icon: Icon, label, value, hint }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>{label}</p>
          <p className={isLight ? 'mt-3 text-3xl font-semibold text-slate-950' : 'mt-3 text-3xl font-semibold text-white'}>{value}</p>
          <p className={isLight ? 'mt-2 text-sm text-slate-600' : 'mt-2 text-sm text-slate-500'}>{hint}</p>
        </div>
        <span className={isLight ? 'flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700' : 'flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
};

const AnalyticsSkeleton = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const pulse = isLight ? 'bg-slate-200' : 'bg-white/10';

  return (
    <div className="space-y-6" aria-label="Loading analytics">
      <div className="flex gap-2">
        {[0, 1, 2].map((item) => <div key={item} className={`h-10 w-24 animate-pulse rounded-lg ${pulse}`} />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className={`h-36 animate-pulse rounded-lg ${pulse}`} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className={`h-96 animate-pulse rounded-lg ${pulse}`} />
        <div className={`h-96 animate-pulse rounded-lg ${pulse}`} />
      </div>
    </div>
  );
};

export const AnalyticsDashboard = () => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const [period, setPeriod] = useState('sevenDays');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const isLight = theme === 'light';

  const loadAnalytics = useCallback(async ({ silent = false } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!silent) {
      setLoading(true);
    }

    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/analytics?period=${period}`, {
        headers,
        cache: 'no-store'
      });
      const body = await response.json();

      if (requestId !== requestIdRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale analytics blocked');
        }
        return;
      }

      if (!response.ok) {
        throw new Error(body.error || 'Analytics could not load');
      }

      if (process.env.NODE_ENV !== 'production') {
        console.info('workspace ready', { module: 'analytics', hotelId: body.hotelId || null });
      }

      setData(body.analytics || emptyAnalytics);
    } catch (caughtError) {
      if (requestId === requestIdRef.current) {
        setData(emptyAnalytics);
        setError(caughtError.message || 'Analytics could not load');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [period]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.info('analytics gated');
    }

    setData(null);
    loadAnalytics();
  }, [loadAnalytics]);

  const analytics = data || emptyAnalytics;

  const kpis = useMemo(() => ([
    {
      icon: MessageSquareText,
      label: t('analytics.kpis.managedMessages'),
      value: formatNumber(analytics.kpis.managedMessages),
      hint: t('analytics.kpiHints.managedMessages')
    },
    {
      icon: TicketCheck,
      label: t('analytics.kpis.ticketsCreated'),
      value: formatNumber(analytics.kpis.ticketsCreated),
      hint: t('analytics.kpiHints.ticketsCreated')
    },
    {
      icon: CheckCircle2,
      label: t('analytics.kpis.resolutionRate'),
      value: formatPercent(analytics.kpis.resolutionRate),
      hint: t('analytics.kpiHints.resolutionRate')
    },
    {
      icon: Bot,
      label: t('analytics.kpis.aiAutomation'),
      value: formatPercent(analytics.kpis.aiAutomation),
      hint: t('analytics.kpiHints.aiAutomation')
    }
  ]), [analytics, t]);

  if (loading && !data) {
    return <AnalyticsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {periods.map((item) => {
            const active = period === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setPeriod(item.key)}
                className={[
                  'rounded-lg border px-4 py-2 text-sm font-semibold transition',
                  isLight
                    ? active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    : active
                      ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                      : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.08] hover:text-slate-100'
                ].join(' ')}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => loadAnalytics({ silent: false })}
          disabled={loading}
          className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.08] disabled:opacity-60'}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? (
        <div className={isLight ? 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800' : 'rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100'}>
          {error}
        </div>
      ) : null}

      {!hasAnalyticsData(analytics) ? (
        <Card>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>No analytics yet</h2>
              <p className={isLight ? 'mt-1 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-1 max-w-2xl text-sm leading-6 text-slate-500'}>
                This workspace does not have hotel activity for the selected period yet. Once conversations, tickets and AI logs are created, metrics will appear here.
              </p>
            </div>
            <span className={isLight ? 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600' : 'rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs font-semibold text-slate-400'}>
              Tenant-safe empty state
            </span>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <SectionTitle
            icon={BarChart3}
            title={t('analytics.sections.operationalOverview')}
            description={t('analytics.descriptions.operationalOverview')}
          />
          <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
            <div>
              <p className={isLight ? 'mb-4 text-sm font-semibold text-slate-700' : 'mb-4 text-sm font-semibold text-slate-300'}>{t('analytics.metrics.messagesByDay')}</p>
              <MessagesByDay items={analytics.messagesByDay} />
            </div>
            <div className="space-y-6">
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className={isLight ? 'text-sm font-semibold text-slate-700' : 'text-sm font-semibold text-slate-300'}>{t('analytics.metrics.createdVsResolved')}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1 text-sky-500"><span className="h-2 w-2 rounded-full bg-sky-300" />{t('analytics.created')}</span>
                    <span className="inline-flex items-center gap-1 text-emerald-500"><span className="h-2 w-2 rounded-full bg-emerald-300" />{t('analytics.resolved')}</span>
                  </div>
                </div>
                <TicketFlow items={analytics.ticketFlow} />
              </div>
              <div>
                <p className={isLight ? 'mb-4 text-sm font-semibold text-slate-700' : 'mb-4 text-sm font-semibold text-slate-300'}>{t('analytics.metrics.departmentTickets')}</p>
                <BarList items={analytics.departmentTickets} valueSuffix="%" />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle
            icon={Languages}
            title={t('analytics.sections.guestIntelligence')}
            description={t('analytics.descriptions.guestIntelligence')}
          />
          <div className="space-y-6">
            <div>
              <p className={isLight ? 'mb-4 text-sm font-semibold text-slate-700' : 'mb-4 text-sm font-semibold text-slate-300'}>{t('analytics.metrics.detectedLanguages')}</p>
              <BarList items={analytics.languages} valueSuffix="%" />
            </div>
            <div>
              <p className={isLight ? 'mb-4 text-sm font-semibold text-slate-700' : 'mb-4 text-sm font-semibold text-slate-300'}>{t('analytics.metrics.frequentCategories')}</p>
              <BarList items={analytics.frequentCategories} />
            </div>
            <div>
              <p className={isLight ? 'mb-4 text-sm font-semibold text-slate-700' : 'mb-4 text-sm font-semibold text-slate-300'}>{t('analytics.metrics.peakHours')}</p>
              <BarList items={analytics.peakHours} />
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle
          icon={TrendingUp}
          title={t('analytics.sections.businessImpact')}
          description={t('analytics.descriptions.businessImpact')}
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: Timer, label: t('analytics.impact.timeSaved'), value: analytics.impact.timeSaved },
            { icon: Sparkles, label: t('analytics.impact.instantReplies'), value: formatNumber(analytics.impact.instantReplies) },
            { icon: AlertTriangle, label: t('analytics.impact.urgentDetected'), value: formatNumber(analytics.impact.urgentIncidents) },
            { icon: Activity, label: t('analytics.impact.activeRooms'), value: analytics.impact.activeRooms.length ? analytics.impact.activeRooms.join(', ') : '0' }
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-4' : 'rounded-lg border border-white/10 bg-white/[0.035] p-4'}
              >
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-300 text-slate-950">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <p className={isLight ? 'text-sm font-semibold text-slate-700' : 'text-sm font-semibold text-slate-300'}>{item.label}</p>
                <p className={isLight ? 'mt-2 text-2xl font-semibold text-slate-950' : 'mt-2 text-2xl font-semibold text-white'}>{item.value}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
