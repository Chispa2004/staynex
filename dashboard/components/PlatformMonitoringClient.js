'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Clock3,
  MailWarning,
  PlugZap,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Workflow
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const serviceIcons = {
  openai: Bot,
  twilio: Activity,
  pms: PlugZap,
  resend: MailWarning,
  webhooks: ServerCog,
  automation_queue: Workflow
};

export const PlatformMonitoringClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadMonitoring = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);

    try {
      const response = await fetch('/api/platform/monitoring', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Platform monitoring could not be loaded');
      }

      setData(body.monitoring);
      setError(null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMonitoring();
  }, [loadMonitoring]);

  const monitoring = data || {};
  const globalHealth = monitoring.globalHealth || {};
  const aiHealth = monitoring.aiHealth || {};
  const automation = monitoring.automationMonitoring || {};
  const queue = monitoring.queueMonitoring || {};

  return (
    <section className="space-y-5">
      <section className={cn('overflow-hidden rounded-2xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className={ui.text.eyebrow(isLight)}>Internal Observability</p>
            <h1 className={cn('mt-2 text-3xl font-semibold sm:text-4xl', ui.text.title(isLight))}>Platform Monitoring</h1>
            <p className={cn('mt-3 max-w-3xl', ui.text.body(isLight))}>
              Internal Staynex console for technical health, retries, provider failures, AI quality signals and queue monitoring.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={globalHealth.status || 'healthy'} />
            <button type="button" onClick={() => loadMonitoring()} disabled={refreshing} className={ui.button(isLight, 'secondary')}>
              <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className={cn('mt-4 rounded-xl border p-4 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Active hotels" value={loading ? '...' : globalHealth.activeHotels || 0} icon={ShieldCheck} />
          <Metric label="Hotels with warnings" value={loading ? '...' : globalHealth.hotelsWithWarnings || 0} icon={AlertTriangle} tone={(globalHealth.hotelsWithWarnings || 0) > 0 ? 'amber' : 'emerald'} />
          <Metric label="Disconnected PMS" value={loading ? '...' : globalHealth.disconnectedPmsHotels || 0} icon={PlugZap} tone={(globalHealth.disconnectedPmsHotels || 0) > 0 ? 'amber' : 'emerald'} />
          <Metric label="WhatsApp issues" value={loading ? '...' : globalHealth.whatsappIssueHotels || 0} icon={Activity} tone={(globalHealth.whatsappIssueHotels || 0) > 0 ? 'amber' : 'emerald'} />
          <Metric label="Review risk hotels" value={loading ? '...' : globalHealth.highReviewRiskHotels || 0} icon={ShieldAlert} tone={(globalHealth.highReviewRiskHotels || 0) > 0 ? 'red' : 'emerald'} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {(loading ? Array.from({ length: 6 }) : globalHealth.services || []).map((service, index) => (
          loading ? <div key={index} className={cn('h-40 rounded-xl', ui.skeleton(isLight))} /> : <ServiceCard key={service.id} service={service} />
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Panel title="AI Health" eyebrow="Quality and fallback signals" icon={Bot}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Fallback rate" value={`${aiHealth.fallbackRate || 0}%`} icon={RotateCcw} tone={(aiHealth.fallbackRate || 0) > 25 ? 'amber' : 'emerald'} compact />
            <Metric label="Loop detection" value={aiHealth.loopDetection || 0} icon={RefreshCw} tone={(aiHealth.loopDetection || 0) > 0 ? 'amber' : 'emerald'} compact />
            <Metric label="Repair mode" value={aiHealth.repairModeActivations || 0} icon={Workflow} tone={(aiHealth.repairModeActivations || 0) > 0 ? 'amber' : 'emerald'} compact />
            <Metric label="Avg confidence" value={`${aiHealth.averageConfidence || 0}%`} icon={ShieldCheck} compact />
            <Metric label="Escalation rate" value={`${aiHealth.escalationRate || 0}%`} icon={ShieldAlert} tone={(aiHealth.escalationRate || 0) > 20 ? 'amber' : 'emerald'} compact />
            <Metric label="Provider flow failures" value={aiHealth.providerFlowFailures || 0} icon={MailWarning} tone={(aiHealth.providerFlowFailures || 0) > 0 ? 'amber' : 'emerald'} compact />
          </div>
        </Panel>

        <Panel title="Automation And Queue" eyebrow="Scheduled message pipeline" icon={Workflow}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Preview generated" value={automation.previewGenerated || 0} icon={Clock3} compact />
            <Metric label="Sent" value={automation.sent || 0} icon={ShieldCheck} compact />
            <Metric label="Blocked / skipped" value={automation.blocked || 0} icon={AlertTriangle} tone={(automation.blocked || 0) > 0 ? 'amber' : 'emerald'} compact />
            <Metric label="Retry" value={automation.retry || queue.retryQueue || 0} icon={RotateCcw} tone={(automation.retry || queue.retryQueue || 0) > 0 ? 'amber' : 'emerald'} compact />
            <Metric label="Failed" value={automation.failed || queue.failedScheduledMessages || 0} icon={ShieldAlert} tone={(automation.failed || queue.failedScheduledMessages || 0) > 0 ? 'red' : 'emerald'} compact />
            <Metric label="Queue delays" value={queue.queueDelays || 0} icon={Clock3} tone={(queue.queueDelays || 0) > 0 ? 'amber' : 'emerald'} compact />
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
        <Panel title="Internal Alerts" eyebrow="Severity based" icon={AlertTriangle}>
          {loading ? (
            <div className={cn('h-36 rounded-xl', ui.skeleton(isLight))} />
          ) : monitoring.alerts?.length ? (
            <div className="space-y-3">
              {monitoring.alerts.map((alert) => <AlertRow key={`${alert.title}-${alert.message}`} alert={alert} />)}
            </div>
          ) : (
            <Empty title="No internal alerts." description="No critical platform monitoring alerts are currently active." />
          )}
        </Panel>

        <Panel title="Failed Events" eyebrow="Provider, PMS, Twilio and automation" icon={ServerCog}>
          {loading ? (
            <div className={cn('h-52 rounded-xl', ui.skeleton(isLight))} />
          ) : monitoring.failedEvents?.length ? (
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {monitoring.failedEvents.map((event) => <FailedEventRow key={event.id} event={event} />)}
            </div>
          ) : (
            <Empty title="No failed events in the latest sample." description="Provider email, PMS sync, Twilio and automation failures will appear here." />
          )}
        </Panel>
      </div>
    </section>
  );
};

const StatusBadge = ({ status = 'healthy' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tone = status === 'critical' ? 'red' : status === 'warning' ? 'amber' : 'emerald';

  return <span className={ui.badge(isLight, tone)}>{status}</span>;
};

const Metric = ({ label, value, icon: Icon, tone = 'emerald', compact = false }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border', compact ? 'p-3' : 'p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex items-center justify-between gap-3">
        <p className={ui.text.eyebrow(isLight)}>{label}</p>
        <span className={ui.badge(isLight, tone, true)}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className={cn('mt-3 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{value}</p>
    </div>
  );
};

const ServiceCard = ({ service }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const Icon = serviceIcons[service.id] || ServerCog;

  return (
    <article className={cn('rounded-xl border p-4', ui.surface(isLight))}>
      <div className="flex items-start justify-between gap-3">
        <span className={ui.badge(isLight, service.tone || 'slate')}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <StatusBadge status={service.status} />
      </div>
      <p className={cn('mt-4 text-sm font-semibold', ui.text.title(isLight))}>{service.label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{service.value}</p>
      <p className={cn('mt-2 text-sm leading-5', ui.text.body(isLight))}>{service.description}</p>
    </article>
  );
};

const Panel = ({ title, eyebrow, icon: Icon, children }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
      <div className="mb-4 flex items-start gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl border', isLight ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-sky-300/20 bg-sky-300/10 text-sky-100')}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className={ui.text.eyebrow(isLight)}>{eyebrow}</p>
          <h2 className={cn('mt-1 text-xl', ui.text.title(isLight))}>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
};

const AlertRow = ({ alert }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tone = alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'amber' : 'sky';

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{alert.title}</p>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>{alert.message}</p>
        </div>
        <span className={ui.badge(isLight, tone, true)}>{alert.severity}</span>
      </div>
    </div>
  );
};

const FailedEventRow = ({ event }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tone = event.severity === 'critical' ? 'red' : 'amber';

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{event.title}</p>
          <p className={cn('mt-1 truncate text-sm', ui.text.body(isLight))}>{event.detail || event.type}</p>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{event.createdAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt)) : 'No timestamp'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={ui.badge(isLight, tone, true)}>{event.severity}</span>
          <span className={ui.badge(isLight, 'slate', true)}>{event.type}</span>
        </div>
      </div>
    </div>
  );
};

const Empty = ({ title, description }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border border-dashed p-6 text-center', isLight ? 'border-slate-300 bg-slate-50' : 'border-white/10 bg-white/[0.02]')}>
      <ShieldCheck className="mx-auto h-8 w-8 text-emerald-400" aria-hidden="true" />
      <p className={cn('mt-3 text-sm font-semibold', ui.text.title(isLight))}>{title}</p>
      <p className={cn('mt-1', ui.text.muted(isLight))}>{description}</p>
    </div>
  );
};
