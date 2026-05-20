'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, DatabaseZap, RefreshCw } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { PmsConnectionForm } from './PmsConnectionForm';
import { PmsProviderCard } from './PmsProviderCard';
import { PremiumLoadingState } from './PremiumLoadingState';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

const defaultForm = (provider, connection) => ({
  provider: provider?.key || 'apaleo',
  client_id: connection?.client_id || '',
  client_secret: '',
  account_code: connection?.account_code || '',
  base_url: connection?.base_url || provider?.defaultBaseUrl || '',
  enabled: connection?.enabled ?? true
});

const dateWindow = () => {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 90);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
};

export const PmsConnectionsClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [hotel, setHotel] = useState(null);
  const [providers, setProviders] = useState([]);
  const [connections, setConnections] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [editing, setEditing] = useState(null);
  const [connectorPreview, setConnectorPreview] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const requestIdRef = useRef(0);

  const loadConnections = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/pms-connections', {
        headers,
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load PMS connections');
      }

      if (!shouldAcceptTenantPayload(body, 'pms-connections')) {
        return;
      }

      if (requestId !== requestIdRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale response ignored', { surface: 'pms-connections', hotelId: body.hotelId || body.hotel?.id || null });
        }
        return;
      }

      setHotel(body.hotel || null);
      setProviders(body.providers || []);
      setConnections(body.connections || []);
      setCanManage(Boolean(body.canManage));
      setFeedback(null);
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const connectionsByProvider = useMemo(() => new Map(
    connections.map((connection) => [connection.provider, connection])
  ), [connections]);

  const openEditor = (provider, connection = null) => {
    if (!canManage) {
      setFeedback({ type: 'error', message: 'You do not have permission to manage PMS connections.' });
      return;
    }

    if (provider.configurationMode !== 'credentials') {
      setEditing(null);
      setConnectorPreview(provider);
      setFeedback({
        type: 'info',
        message: `${provider.name} is ${provider.statusLabel || 'coming soon'}. The adapter is visible for planning, but live credentials are not enabled yet.`
      });
      return;
    }

    setConnectorPreview(null);
    setEditing({ provider, connection });
    setForm(defaultForm(provider, connection));
  };

  const save = async (event) => {
    event.preventDefault();
    if (!canManage) {
      setFeedback({ type: 'error', message: 'You do not have permission to manage PMS connections.' });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/pms-connections', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not save PMS connection');
      }
      if (!shouldAcceptTenantPayload(body, 'pms-connections-save')) {
        return;
      }

      setEditing(null);
      setFeedback({ type: 'success', message: 'PMS connection saved.' });
      await loadConnections();
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (provider) => {
    if (!canManage) {
      setFeedback({ type: 'error', message: 'You do not have permission to test PMS connections.' });
      return;
    }

    setBusyAction('test');
    setFeedback(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/pms-connections/test', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider: provider.key })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Connection test failed');
      }
      if (!shouldAcceptTenantPayload(body, 'pms-connections-test')) {
        return;
      }

      setFeedback({ type: 'success', message: `${provider.name} connection works.` });
      await loadConnections();
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    } finally {
      setBusyAction(null);
    }
  };

  const syncReservations = async (provider) => {
    if (!canManage) {
      setFeedback({ type: 'error', message: 'You do not have permission to sync PMS reservations.' });
      return;
    }

    setBusyAction('sync');
    setFeedback({ type: 'info', message: `Sync started for ${provider.name}. Importing reservations in safe batches.` });

    try {
      const headers = await getAuthHeaders();
      const window = dateWindow();
      const response = await fetch('/api/pms-connections/sync', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: provider.key,
          pageSize: 50,
          maxReservations: 1000,
          ...window
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Reservation sync failed');
      }
      if (!shouldAcceptTenantPayload(body, 'pms-connections-sync')) {
        return;
      }

      setFeedback({
        type: 'success',
        message: `Sync complete: fetched ${body.summary?.totalFetched || body.summary?.fetched || 0}, processed ${body.summary?.totalProcessed || body.summary?.synced || 0}, skipped ${body.summary?.totalSkipped || body.summary?.skipped || 0}.`
      });
      await loadConnections();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.name === 'AbortError'
          ? 'Sync timed out after 22 seconds. Try a smaller date window or run it again.'
          : error.message
      });
    } finally {
      setBusyAction(null);
    }
  };

  const disconnect = async (connection) => {
    if (!canManage) {
      setFeedback({ type: 'error', message: 'You do not have permission to disconnect PMS connections.' });
      return;
    }

    setBusyAction('disconnect');
    setFeedback(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/pms-connections?id=${connection.id}`, {
        method: 'DELETE',
        headers
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not disconnect PMS');
      }
      if (!shouldAcceptTenantPayload(body, 'pms-connections-delete')) {
        return;
      }

      setFeedback({ type: 'success', message: 'PMS connection removed.' });
      await loadConnections();
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ExecutiveBadge tone="emerald">PMS Connections</ExecutiveBadge>
            {hotel?.name ? <ExecutiveBadge tone="slate">{hotel.name}</ExecutiveBadge> : null}
          </div>
          <h1 className={isLight ? 'text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl' : 'text-3xl font-semibold tracking-tight text-white sm:text-4xl'}>
            Connect hotel PMS
          </h1>
          <p className={isLight ? 'mt-3 max-w-3xl text-sm leading-6 text-slate-600' : 'mt-3 max-w-3xl text-sm leading-6 text-slate-400'}>
            Store PMS credentials per hotel, test read-only access, and sync reservations into Staynex without touching folios, charges or room assignments.
          </p>
        </div>
        <button
          type="button"
          onClick={loadConnections}
          disabled={loading}
          className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-60'}
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </button>
      </div>

      {feedback ? (
        <ExecutiveCard className={feedback.type === 'error' ? 'border-red-300/25 p-4' : feedback.type === 'info' ? 'border-sky-300/25 p-4' : 'border-emerald-300/25 p-4'}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={feedback.type === 'error' ? 'mt-0.5 h-4 w-4 text-red-400' : feedback.type === 'info' ? 'mt-0.5 h-4 w-4 text-sky-400' : 'mt-0.5 h-4 w-4 text-emerald-400'} />
            <p className={isLight ? 'text-sm text-slate-700' : 'text-sm text-slate-300'}>{feedback.message}</p>
          </div>
        </ExecutiveCard>
      ) : null}

      <ExecutiveCard className="p-5">
        <div className="flex items-start gap-3">
          <DatabaseZap className="mt-0.5 h-5 w-5 text-emerald-400" />
          <div>
            <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>Safe PMS mode</p>
            <p className={isLight ? 'mt-1 text-sm leading-6 text-slate-600' : 'mt-1 text-sm leading-6 text-slate-400'}>
              Staynex only authenticates, reads reservations and imports them through the existing reservation token flow. Apaleo is live today; Pluriel, Ubikos and other PMS adapters are prepared as beta or coming-soon connectors without writing back to folios, charges or room assignments.
            </p>
          </div>
        </div>
      </ExecutiveCard>

      {connectorPreview ? (
        <ExecutiveCard className="border-sky-300/25 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <ExecutiveBadge tone={connectorPreview.status === 'beta' ? 'amber' : 'slate'}>
                {connectorPreview.statusLabel || 'Coming soon'}
              </ExecutiveBadge>
              <h2 className={isLight ? 'mt-3 text-xl font-semibold text-slate-950' : 'mt-3 text-xl font-semibold text-white'}>
                {connectorPreview.name} connector readiness
              </h2>
              <p className={isLight ? 'mt-2 max-w-3xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-3xl text-sm leading-6 text-slate-400'}>
                {connectorPreview.name} is registered in the Staynex PMS ecosystem for {connectorPreview.region || 'global'} hotels. It is clickable here so teams can see readiness, but live API credentials remain disabled until the provider adapter is activated.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConnectorPreview(null)}
              className={isLight ? 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}
            >
              Close
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Region</p>
              <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-800' : 'mt-1 text-sm font-semibold text-slate-200'}>{connectorPreview.region}</p>
            </div>
            <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Type</p>
              <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-800' : 'mt-1 text-sm font-semibold text-slate-200'}>{connectorPreview.type}</p>
            </div>
            <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.025] p-3'}>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Readiness</p>
              <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-800' : 'mt-1 text-sm font-semibold text-slate-200'}>{connectorPreview.readiness}</p>
            </div>
          </div>
        </ExecutiveCard>
      ) : null}

      {loading && !providers.length ? (
        <PremiumLoadingState title="Loading PMS connections" description="Staynex is checking this hotel's PMS configuration." rows={3} cards={2} />
      ) : (
      <div className="grid gap-4 xl:grid-cols-2">
        {(providers.length ? providers : [{ key: 'apaleo', name: 'Apaleo', status: 'connected', statusLabel: 'Connected', configurationMode: 'credentials', defaultBaseUrl: 'https://api.apaleo.com' }]).map((provider) => (
          <PmsProviderCard
            key={provider.key}
            provider={provider}
            connection={connectionsByProvider.get(provider.key)}
            onEdit={openEditor}
            onTest={testConnection}
            onSync={syncReservations}
            onDisconnect={disconnect}
            busyAction={busyAction}
            canManage={canManage}
          />
        ))}
      </div>
      )}

      {editing ? (
        <PmsConnectionForm
          provider={editing.provider}
          initialConnection={editing.connection}
          form={form}
          setForm={setForm}
          onSave={save}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      ) : null}
    </section>
  );
};
