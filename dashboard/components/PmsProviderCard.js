'use client';

import { CheckCircle2, Clock3, PlugZap } from 'lucide-react';
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
  return 'slate';
};

export const PmsProviderCard = ({
  provider,
  connection,
  onEdit,
  onTest,
  onSync,
  onDisconnect,
  busyAction
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const connected = Boolean(connection?.enabled && connection?.has_client_secret);
  const available = provider.status === 'available';

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
              {available ? 'OAuth client credentials' : 'Prepared for future provider support'}
            </p>
          </div>
        </div>
        <ExecutiveBadge tone={connected ? 'emerald' : available ? 'amber' : 'slate'}>
          {connected ? 'Connected' : available ? 'Not connected' : 'Coming soon'}
        </ExecutiveBadge>
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
        </div>
      ) : (
        <div className={isLight ? 'mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500' : 'mt-5 rounded-xl border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm text-slate-500'}>
          No connection saved yet.
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => onEdit(provider, connection)} disabled={!available} className="rounded-lg border border-emerald-200/60 bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50">
          {connection ? 'Edit connection' : 'Connect'}
        </button>
        <button type="button" onClick={() => onTest(provider)} disabled={!connection || busyAction === 'test'} className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50'}>
          <CheckCircle2 className={busyAction === 'test' ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
          Test Connection
        </button>
        <button type="button" onClick={() => onSync(provider)} disabled={!connection || busyAction === 'sync'} className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50'}>
          <Clock3 className={busyAction === 'sync' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Sync Now
        </button>
        {connection ? (
          <button type="button" onClick={() => onDisconnect(connection)} className={isLight ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100' : 'rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/15'}>
            Disconnect
          </button>
        ) : null}
      </div>
    </ExecutiveCard>
  );
};
