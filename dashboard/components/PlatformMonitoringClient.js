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
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { cn, ui } from '@/lib/ui/styles';

const serviceIcons = {
  openai: Bot,
  twilio: Activity,
  pms: PlugZap,
  resend: MailWarning,
  webhooks: ServerCog,
  automation_queue: Workflow
};

const formatDateTime = (value) => {
  if (!value) return 'No timestamp';

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return 'Invalid timestamp';
  }
};

export const PlatformMonitoringClient = () => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(null);
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
        throw new Error(body.error || tx('Platform monitoring could not be loaded'));
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

  const runMonitoringAction = useCallback(async ({ action, id, hotelId, note }) => {
    setActionBusy(`${action}:${id || 'global'}`);

    try {
      const response = await fetch('/api/platform/monitoring', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, id, hotelId, note })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || tx('Monitoring action failed'));
      }

      await loadMonitoring({ silent: true });
      setError(null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setActionBusy(null);
    }
  }, [loadMonitoring]);

  const monitoring = data || {};
  const globalHealth = monitoring.globalHealth || {};
  const aiHealth = monitoring.aiHealth || {};
  const automation = monitoring.automationMonitoring || {};
  const queue = monitoring.queueMonitoring || {};
  const providerMonitoring = monitoring.providerMonitoring || {};
  const webhookMonitoring = monitoring.webhookMonitoring || {};
  const ticketMonitoring = monitoring.ticketMonitoring || {};

  return (
    <section className="space-y-5">
      <section className={cn('overflow-hidden rounded-2xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className={ui.text.eyebrow(isLight)}>{tx('Internal Observability')}</p>
            <h1 className={cn('mt-2 text-3xl font-semibold sm:text-4xl', ui.text.title(isLight))}>{tx('Platform Monitoring')}</h1>
            <p className={cn('mt-3 max-w-3xl', ui.text.body(isLight))}>
              {tx('Internal Staynex console for technical health, retries, provider failures, AI quality signals and queue monitoring.')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={globalHealth.status || 'healthy'} />
            {ticketMonitoring.demoDataDetected ? <span className={ui.badge(isLight, 'sky')}>{tx('Demo environment')}</span> : null}
            <button type="button" onClick={() => loadMonitoring()} disabled={refreshing} className={ui.button(isLight, 'secondary')}>
              <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
              {tx('Refresh')}
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
        <Panel title="AI Health" eyebrow="Resolution and recovery quality" icon={Bot}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Resolved automatically" value={aiHealth.conversationsResolvedAutomatically || 0} icon={ShieldCheck} compact />
            <Metric label="AI recovery success" value={`${aiHealth.recoverySuccessRate || 0}%`} icon={RotateCcw} tone={(aiHealth.recoverySuccessRate || 0) < 85 ? 'amber' : 'emerald'} compact />
            <Metric label="Safe recovery events" value={aiHealth.safeRecoveryEvents || 0} icon={Workflow} tone={(aiHealth.safeRecoveryEvents || 0) > 0 ? 'sky' : 'emerald'} compact />
            <Metric label="Clarification events" value={aiHealth.clarificationEvents || 0} icon={RefreshCw} tone="sky" compact />
            <Metric label="Avg confidence" value={`${aiHealth.averageConfidence || 0}%`} icon={ShieldCheck} compact />
            <Metric label="Human takeover rate" value={`${aiHealth.humanTakeoverRate || 0}%`} icon={ShieldAlert} tone={(aiHealth.humanTakeoverRate || 0) > 20 ? 'amber' : 'emerald'} compact />
            <Metric label="AI helpfulness score" value={`${aiHealth.aiHelpfulnessScore || 0}%`} icon={Bot} compact />
            <Metric label="Guest sentiment" value={aiHealth.guestSatisfactionEstimate || 'Stable'} icon={Activity} tone={aiHealth.guestSatisfactionEstimate === 'Needs attention' ? 'amber' : 'emerald'} compact />
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Panel title="Provider Monitoring" eyebrow="Marketplace delivery and response" icon={MailWarning}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Booking success rate" value={`${providerMonitoring.successRate || 0}%`} icon={ShieldCheck} compact />
            <Metric label="Pending confirmations" value={providerMonitoring.pendingConfirmations || 0} icon={Clock3} tone={(providerMonitoring.pendingConfirmations || 0) > 0 ? 'amber' : 'emerald'} compact />
            <Metric label="Provider retry queue" value={providerMonitoring.retryQueue || 0} icon={RotateCcw} tone={(providerMonitoring.retryQueue || 0) > 0 ? 'amber' : 'emerald'} compact />
            <Metric label="Retry attempts" value={providerMonitoring.retryAttempts || 0} icon={RefreshCw} tone={(providerMonitoring.retryAttempts || 0) > 0 ? 'amber' : 'emerald'} compact />
          </div>
          <div className="mt-4 space-y-3">
            {(providerMonitoring.retryItems || []).slice(0, 5).map((item) => (
              <RetryQueueRow
                key={item.id}
                item={item}
                actionBusy={actionBusy}
                onAction={runMonitoringAction}
              />
            ))}
            {providerMonitoring.retryItems?.length ? null : <Empty title="Provider retry queue is clear." description="Failed provider emails and pending retries will appear here." />}
          </div>
        </Panel>

        <Panel title="Webhooks & Integrations" eyebrow="PMS, WhatsApp and delivery signals" icon={ServerCog}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Webhook uptime" value={`${webhookMonitoring.uptimeEstimate || 0}%`} icon={Activity} compact />
            <Metric label="Failed webhooks" value={webhookMonitoring.failedWebhookCount || 0} icon={AlertTriangle} tone={(webhookMonitoring.failedWebhookCount || 0) > 0 ? 'amber' : 'emerald'} compact />
            <Metric label="Webhook retries" value={webhookMonitoring.retryCount || 0} icon={RotateCcw} tone={(webhookMonitoring.retryCount || 0) > 0 ? 'amber' : 'emerald'} compact />
          </div>
          <div className="mt-4 space-y-3">
            {(webhookMonitoring.sources || []).slice(0, 4).map((source) => (
              <WebhookRow key={source.id} source={source} actionBusy={actionBusy} onAction={runMonitoringAction} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Ticket Data Quality" eyebrow="Real operations separated from demo data" icon={ShieldAlert}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Real open tickets" value={ticketMonitoring.realOpenTickets || 0} icon={ShieldCheck} compact />
          <Metric label="Active urgent tickets" value={ticketMonitoring.urgentTickets || 0} icon={AlertTriangle} tone={(ticketMonitoring.urgentTickets || 0) > 0 ? 'red' : 'emerald'} compact />
          <Metric label="Low priority tickets" value={ticketMonitoring.lowPriorityTickets || 0} icon={Clock3} compact />
          <Metric label="Demo tickets" value={ticketMonitoring.demoTickets || 0} icon={Workflow} tone={(ticketMonitoring.demoTickets || 0) > 0 ? 'sky' : 'emerald'} compact />
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
        <Panel title="Internal Alerts" eyebrow="Severity based" icon={AlertTriangle}>
          {loading ? (
            <div className={cn('h-36 rounded-xl', ui.skeleton(isLight))} />
          ) : monitoring.alerts?.length ? (
            <div className="space-y-3">
              {monitoring.alerts.map((alert) => <AlertRow key={`${tx(alert.title)}-${tx(alert.message)}`} alert={alert} onAction={runMonitoringAction} actionBusy={actionBusy} />)}
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
              {monitoring.failedEvents.map((event) => <FailedEventRow key={event.id} event={event} onAction={runMonitoringAction} actionBusy={actionBusy} />)}
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
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const tone = status === 'critical' ? 'red' : status === 'warning' ? 'amber' : 'emerald';

  return <span className={ui.badge(isLight, tone)}>{tx(status)}</span>;
};

const Metric = ({ label, value, icon: Icon, tone = 'emerald', compact = false }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border', compact ? 'p-3' : 'p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex items-center justify-between gap-3">
        <p className={ui.text.eyebrow(isLight)}>{tx(label)}</p>
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
  const { tx } = useDashboardLanguage();
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
      <p className={cn('mt-4 text-sm font-semibold', ui.text.title(isLight))}>{tx(service.label)}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{service.value}</p>
      <p className={cn('mt-2 text-sm leading-5', ui.text.body(isLight))}>{tx(service.description)}</p>
    </article>
  );
};

const Panel = ({ title, eyebrow, icon: Icon, children }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <section className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
      <div className="mb-4 flex items-start gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl border', isLight ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-sky-300/20 bg-sky-300/10 text-sky-100')}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className={ui.text.eyebrow(isLight)}>{tx(eyebrow)}</p>
          <h2 className={cn('mt-1 text-xl', ui.text.title(isLight))}>{tx(title)}</h2>
        </div>
      </div>
      {children}
    </section>
  );
};

const RetryQueueRow = ({ item, onAction, actionBusy }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const busy = actionBusy === `retry_provider_email:${item.id}`;

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{item.provider}</p>
          <p className={cn('mt-1 truncate text-sm', ui.text.body(isLight))}>{item.experience}</p>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
            {tx(`Retry count ${item.retryCount || 0} · Last retry ${formatDateTime(item.lastRetryAt)}`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={ui.badge(isLight, item.status === 'queued' || item.status === 'pending_retry' ? 'amber' : 'red', true)}>
            {tx(item.status)}
          </span>
          <button
            type="button"
            disabled={busy || !item.retryable}
            onClick={() => onAction({ action: 'retry_provider_email', id: item.id, hotelId: item.hotelId })}
            className={ui.button(isLight, 'secondary')}
          >
            <RotateCcw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            {tx('Retry now')}
          </button>
        </div>
      </div>
    </div>
  );
};

const WebhookRow = ({ source, onAction, actionBusy }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const busy = actionBusy === `retry_webhook:${source.id}`;
  const tone = source.status === 'healthy' ? 'emerald' : source.status === 'warning' ? 'amber' : 'slate';

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{source.source}</p>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{tx(`Last received ${formatDateTime(source.lastReceivedAt)}`)}</p>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{tx(`Failed ${source.failedCount || 0} · Retries ${source.retryCount || 0}`)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={ui.badge(isLight, tone, true)}>{tx(source.status)}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction({ action: 'retry_webhook', id: source.id, hotelId: source.hotelId })}
            className={ui.button(isLight, 'secondary')}
          >
            <RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            {tx('Retry webhook')}
          </button>
        </div>
      </div>
    </div>
  );
};

const AlertRow = ({ alert, onAction, actionBusy }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const tone = alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'amber' : 'sky';
  const busy = actionBusy === `${alert.action}:global`;

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{tx(alert.title)}</p>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>{tx(alert.message)}</p>
          {alert.createdAt ? <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{formatDateTime(alert.createdAt)}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={ui.badge(isLight, tone, true)}>{tx(alert.severity)}</span>
          {alert.action ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction({ action: alert.action })}
              className={ui.button(isLight, 'ghost')}
            >
              <RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
              {tx('Review')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const FailedEventRow = ({ event, onAction, actionBusy }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const tone = event.severity === 'critical' ? 'red' : 'amber';
  const busy = actionBusy === `retry_provider_email:${event.entityId}`;

  return (
    <div className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{tx(event.title)}</p>
          <p className={cn('mt-1 truncate text-sm', ui.text.body(isLight))}>{tx(event.detail || event.type)}</p>
          <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{formatDateTime(event.createdAt)}</p>
          {event.retryCount !== undefined ? (
            <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{tx(`Retry count ${event.retryCount || 0} · Status ${event.retryStatus || 'failed'}`)}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={ui.badge(isLight, tone, true)}>{tx(event.severity)}</span>
          <span className={ui.badge(isLight, 'slate', true)}>{tx(event.type)}</span>
          {event.type === 'provider_email_failure' && event.retryable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction({ action: 'retry_provider_email', id: event.entityId, hotelId: event.hotelId })}
              className={ui.button(isLight, 'secondary')}
            >
              <RotateCcw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
              {tx('Retry now')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const Empty = ({ title, description }) => {
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border border-dashed p-6 text-center', isLight ? 'border-slate-300 bg-slate-50' : 'border-white/10 bg-white/[0.02]')}>
      <ShieldCheck className="mx-auto h-8 w-8 text-emerald-400" aria-hidden="true" />
      <p className={cn('mt-3 text-sm font-semibold', ui.text.title(isLight))}>{tx(title)}</p>
      <p className={cn('mt-1', ui.text.muted(isLight))}>{tx(description)}</p>
    </div>
  );
};

