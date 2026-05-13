'use client';

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Languages,
  MessageSquareText,
  Sparkles,
  TicketCheck,
  Timer,
  TrendingUp
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { analyticsData } from '@/lib/analyticsData';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const periods = [
  { key: 'today', labelKey: 'analytics.filters.today' },
  { key: 'sevenDays', labelKey: 'analytics.filters.sevenDays' },
  { key: 'thirtyDays', labelKey: 'analytics.filters.thirtyDays' }
];

const maxValue = (items, key = 'value') => Math.max(...items.map((item) => item[key]), 1);

const BarList = ({ items, valueSuffix = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const max = maxValue(items);

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
              style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }}
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

  return (
    <div className="flex h-52 items-end gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className={isLight ? 'flex h-40 w-full items-end rounded-lg bg-slate-100 p-1' : 'flex h-40 w-full items-end rounded-lg bg-white/[0.035] p-1'}>
            <div
              className="w-full rounded-md bg-emerald-300 shadow-lg shadow-emerald-500/10"
              style={{ height: `${Math.max(12, (item.value / max) * 100)}%` }}
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
  const max = Math.max(
    ...items.flatMap((item) => [item.created, item.resolved]),
    1
  );

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[76px_1fr] items-center gap-3">
          <span className={isLight ? 'text-sm font-medium text-slate-600' : 'text-sm font-medium text-slate-400'}>{item.label}</span>
          <div className="space-y-1.5">
            <div className={isLight ? 'h-2 rounded-full bg-slate-200' : 'h-2 rounded-full bg-white/10'}>
              <div className="h-full rounded-full bg-sky-300" style={{ width: `${(item.created / max) * 100}%` }} />
            </div>
            <div className={isLight ? 'h-2 rounded-full bg-slate-200' : 'h-2 rounded-full bg-white/10'}>
              <div className="h-full rounded-full bg-emerald-300" style={{ width: `${(item.resolved / max) * 100}%` }} />
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

export const AnalyticsDashboard = () => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const [period, setPeriod] = useState('sevenDays');
  const isLight = theme === 'light';
  const data = analyticsData[period];

  const kpis = useMemo(() => ([
    {
      icon: MessageSquareText,
      label: t('analytics.kpis.managedMessages'),
      value: data.kpis.managedMessages,
      hint: t('analytics.kpiHints.managedMessages')
    },
    {
      icon: TicketCheck,
      label: t('analytics.kpis.ticketsCreated'),
      value: data.kpis.ticketsCreated,
      hint: t('analytics.kpiHints.ticketsCreated')
    },
    {
      icon: CheckCircle2,
      label: t('analytics.kpis.resolutionRate'),
      value: data.kpis.resolutionRate,
      hint: t('analytics.kpiHints.resolutionRate')
    },
    {
      icon: Bot,
      label: t('analytics.kpis.aiAutomation'),
      value: data.kpis.aiAutomation,
      hint: t('analytics.kpiHints.aiAutomation')
    }
  ]), [data, t]);

  return (
    <div className="space-y-6">
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
              <MessagesByDay items={data.messagesByDay} />
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
                <TicketFlow items={data.ticketFlow} />
              </div>
              <div>
                <p className={isLight ? 'mb-4 text-sm font-semibold text-slate-700' : 'mb-4 text-sm font-semibold text-slate-300'}>{t('analytics.metrics.departmentTickets')}</p>
                <BarList items={data.departmentTickets} valueSuffix="%" />
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
              <BarList items={data.languages} valueSuffix="%" />
            </div>
            <div>
              <p className={isLight ? 'mb-4 text-sm font-semibold text-slate-700' : 'mb-4 text-sm font-semibold text-slate-300'}>{t('analytics.metrics.frequentCategories')}</p>
              <BarList items={data.frequentCategories} />
            </div>
            <div>
              <p className={isLight ? 'mb-4 text-sm font-semibold text-slate-700' : 'mb-4 text-sm font-semibold text-slate-300'}>{t('analytics.metrics.peakHours')}</p>
              <BarList items={data.peakHours} />
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
            { icon: Timer, label: t('analytics.impact.timeSaved'), value: data.impact.timeSaved },
            { icon: Sparkles, label: t('analytics.impact.instantReplies'), value: data.impact.instantReplies },
            { icon: AlertTriangle, label: t('analytics.impact.urgentDetected'), value: data.impact.urgentIncidents },
            { icon: Activity, label: t('analytics.impact.activeRooms'), value: data.impact.activeRooms.join(', ') }
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

      <p className={isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-600'}>
        {t('analytics.mockNotice')}
      </p>
    </div>
  );
};
