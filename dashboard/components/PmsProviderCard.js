'use client';

import { CheckCircle2, Clock3, Copy, PlugZap } from 'lucide-react';
import { useState } from 'react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const formatDateTime = (value) => {
  if (!value) {
    return 'Never';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const syncTone = (status) => {
  if (['success', 'connected'].includes(status)) return 'emerald';
  if (['failed'].includes(status)) return 'red';
  if (['partial_success'].includes(status)) return 'amber';
  if (['pending_setup'].includes(status)) return 'amber';
  return 'slate';
};

export const PmsProviderCard = ({
  provider,
  connection,
  onEdit,
  onTest,
  onSync,
  onDisconnect,
  busyAction,
  canManage = true
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const connected = Boolean(connection?.enabled && connection?.has_client_secret);
  const liveApi = provider.configurationMode === 'live_api';
  const pendingSetup = connection?.sync_status === 'pending_setup' || connection?.metadata?.setup_status === 'pending_setup';
  const webhookUrl = connection?.webhook_url || provider.webhookUrl || '';
  const statusTone = connected
    ? 'emerald'
    : pendingSetup || provider.status === 'setup_available'
      ? 'amber'
      : provider.status === 'live_api'
        ? 'sky'
        : 'slate';

  const copyWebhookUrl = async () => {
    if (!webhookUrl) {
      return;
    }

    await navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    window.setTimeout(() => setCopiedWebhook(false), 1800);
  };

  return (
    <ExecutiveCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={isLight ? 'flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700' : 'flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200'}>
            <PlugZap className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className={isLight ? 'text-base font-semibold text-slate-950' : 'text-base font-semibold text-white'}>{provider.name}</h3>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>
              {provider.commonUse || (liveApi ? 'OAuth client credentials' : 'Manual setup available')}
            </p>
          </div>
        </div>
        <ExecutiveBadge tone={statusTone}>
          {connected ? 'Connected' : pendingSetup ? 'Pending setup' : provider.statusLabel || 'Setup available'}
        </ExecutiveBadge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
          <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Region</p>
          <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-800' : 'mt-1 text-sm font-semibold text-slate-200'}>{provider.region || 'Global'}</p>
        </div>
        <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
          <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Type</p>
          <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-800' : 'mt-1 text-sm font-semibold text-slate-200'}>{provider.type || 'PMS'}</p>
        </div>
        <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
          <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Readiness</p>
          <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-800' : 'mt-1 text-sm font-semibold text-slate-200'}>{provider.readiness || 'Roadmap'}</p>
        </div>
      </div>

      {connection ? (
        <div className={isLight ? 'mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4' : 'mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Last sync</p>
              <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-800' : 'mt-1 text-sm font-semibold text-slate-200'}>{formatDateTime(connection.last_sync_at)}</p>
            </div>
            <div>
              <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Status</p>
              <div className="mt-1">
                <ExecutiveBadge tone={syncTone(connection.sync_status)}>{connection.sync_status || 'configured'}</ExecutiveBadge>
              </div>
            </div>
          </div>
          {connection.metadata?.last_sync_summary ? (
            <p className={isLight ? 'mt-3 text-sm text-slate-600' : 'mt-3 text-sm text-slate-400'}>
              Reservations synced: {connection.metadata.last_sync_summary.synced || 0} / fetched {connection.metadata.last_sync_summary.fetched || 0}
            </p>
          ) : null}
          {connection.last_sync_error ? (
            <p className="mt-3 text-sm text-red-400">{connection.last_sync_error}</p>
          ) : null}
          <div className={isLight ? 'mt-4 rounded-lg border border-slate-200 bg-white p-3' : 'mt-4 rounded-lg border border-white/10 bg-black/15 p-3'}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={isLight ? 'text-xs uppercase tracking-[0.14em] text-slate-500' : 'text-xs uppercase tracking-[0.14em] text-slate-500'}>Webhook</p>
                <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-800' : 'mt-1 text-sm font-semibold text-slate-200'}>
                  {connection.webhook_status || 'not_configured'}
                </p>
              </div>
              <ExecutiveBadge tone={connection.webhook_enabled || connection.last_webhook_at ? 'emerald' : 'slate'}>
                {connection.last_webhook_at ? 'Receiving' : 'Manual setup'}
              </ExecutiveBadge>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={webhookUrl || 'Set PUBLIC_BACKEND_URL'}
                className={isLight ? 'min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600' : 'min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300'}
              />
              <button
                type="button"
                onClick={copyWebhookUrl}
                disabled={!webhookUrl}
                className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50'}
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedWebhook ? 'Copied' : 'Copy URL'}
              </button>
            </div>
            <p className={isLight ? 'mt-2 text-xs leading-5 text-slate-500' : 'mt-2 text-xs leading-5 text-slate-500'}>
              Copy this URL into the PMS webhook configuration when the connector supports live webhooks.
            </p>
            {connection.last_webhook_at ? (
              <p className={isLight ? 'mt-2 text-xs text-slate-500' : 'mt-2 text-xs text-slate-500'}>
                Last webhook: {formatDateTime(connection.last_webhook_at)}
              </p>
            ) : null}
            {connection.last_webhook_error ? (
              <p className="mt-2 text-xs text-red-400">{connection.last_webhook_error}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={isLight ? 'mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500' : 'mt-5 rounded-xl border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm text-slate-500'}>
          No connection saved yet.
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => onEdit(provider, connection)} disabled={!canManage} className="rounded-lg border border-emerald-200/60 bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50">
          {connection ? 'Manage connection' : liveApi ? 'Connect' : 'Start setup'}
        </button>
        <button type="button" onClick={() => onTest(provider)} disabled={!connection || !canManage || busyAction === 'test'} className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50'}>
          <CheckCircle2 className={busyAction === 'test' ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
          Test Connection
        </button>
        <button type="button" onClick={() => onSync(provider)} disabled={!connection || !canManage || busyAction === 'sync' || !liveApi} className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50'}>
          <Clock3 className={busyAction === 'sync' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {liveApi ? 'Sync Now' : 'Sync locked'}
        </button>
        {connection ? (
          <button type="button" onClick={() => onDisconnect(connection)} disabled={!canManage} className={isLight ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50' : 'rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-50'}>
            Disconnect
          </button>
        ) : null}
      </div>
      {!canManage ? (
        <p className={isLight ? 'mt-3 text-xs text-slate-500' : 'mt-3 text-xs text-slate-500'}>
          PMS management is available to hotel admins and platform admins.
        </p>
      ) : null}
    </ExecutiveCard>
  );
};
