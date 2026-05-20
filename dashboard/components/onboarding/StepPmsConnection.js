'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, PlugZap, RefreshCw } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';
import { PMS_PROVIDER_CATALOG } from '@/lib/pms-providers';

const getStatus = (connections) => {
  const apaleo = connections.find((item) => item.provider === 'apaleo');

  if (!apaleo) {
    return { connected: false, label: 'Not connected', connection: null };
  }

  return {
    connected: Boolean(apaleo.enabled && apaleo.has_client_secret),
    label: apaleo.sync_status || 'configured',
    connection: apaleo
  };
};

export const StepPmsConnection = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/pms-connections', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load PMS status');
      }

      setConnections(body.connections || []);
      setFeedback(null);
    } catch (error) {
      setFeedback({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const status = getStatus(connections);

  return (
    <ExecutiveCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <ExecutiveBadge tone="sky">Step 2</ExecutiveBadge>
          <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>PMS connection</h2>
          <p className={isLight ? 'mt-2 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-2xl text-sm leading-6 text-slate-400'}>Connect Apaleo now, or review beta and coming-soon PMS connectors for future activation.</p>
        </div>
        <ExecutiveBadge tone={status.connected ? 'emerald' : 'amber'}>{status.connected ? 'Connected' : 'Optional'}</ExecutiveBadge>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {PMS_PROVIDER_CATALOG.slice(0, 8).map((provider) => (
          <div key={provider.key} className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
            <PlugZap className="h-5 w-5 text-emerald-400" />
            <p className={isLight ? 'mt-3 font-semibold text-slate-950' : 'mt-3 font-semibold text-white'}>{provider.name}</p>
            <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>{provider.statusLabel}</p>
            <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>{provider.region}</p>
          </div>
        ))}
      </div>

      <div className={isLight ? 'mt-5 rounded-xl border border-slate-200 bg-white p-4' : 'mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className={status.connected ? 'h-5 w-5 text-emerald-400' : 'h-5 w-5 text-slate-500'} />
            <div>
              <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>Apaleo status</p>
              <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>{loading ? 'Checking...' : status.label}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={load} className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </button>
            <Link href="/dashboard/settings/pms" className="rounded-lg border border-emerald-200/60 bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200">
              Configure PMS
            </Link>
          </div>
        </div>
        {feedback ? <p className="mt-3 text-sm text-red-400">{feedback.text}</p> : null}
      </div>
    </ExecutiveCard>
  );
};
