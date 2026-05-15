'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, DatabaseZap, RefreshCw } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from './ExecutiveCard';
import { PmsConnectionForm } from './PmsConnectionForm';
import { PmsProviderCard } from './PmsProviderCard';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm());

  const loadConnections = useCallback(async () => {
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

      setHotel(body.hotel || null);
      setProviders(body.providers || []);
      setConnections(body.connections || []);
      setFeedback(null);
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const connectionsByProvider = useMemo(() => new Map(
    connections.map((connection) => [connection.provider, connection])
  ), [connections]);

  const openEditor = (provider, connection = null) => {
    setEditing({ provider, connection });
    setForm(defaultForm(provider, connection));
  };

  const save = async (event) => {
    event.preventDefault();
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

      setFeedback({ type: 'success', message: `${provider.name} connection works.` });
      await loadConnections();
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    } finally {
      setBusyAction(null);
    }
  };

  const syncReservations = async (provider) => {
    setBusyAction('sync');
    setFeedback(null);

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
          ...window
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Reservation sync failed');
      }

      setFeedback({
        type: 'success',
        message: `Sync complete: fetched ${body.summary?.fetched || 0}, synced ${body.summary?.synced || 0}, skipped ${body.summary?.skipped || 0}.`
      });
      await loadConnections();
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
    } finally {
      setBusyAction(null);
    }
  };

  const disconnect = async (connection) => {
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
        <ExecutiveCard className={feedback.type === 'error' ? 'border-red-300/25 p-4' : 'border-emerald-300/25 p-4'}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={feedback.type === 'error' ? 'mt-0.5 h-4 w-4 text-red-400' : 'mt-0.5 h-4 w-4 text-emerald-400'} />
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
              Staynex only authenticates, reads reservations and imports them through the existing reservation token flow. Webhooks are prepared but not active yet.
            </p>
          </div>
        </div>
      </ExecutiveCard>

      <div className="grid gap-4 xl:grid-cols-2">
        {(providers.length ? providers : [{ key: 'apaleo', name: 'Apaleo', status: 'available', defaultBaseUrl: 'https://api.apaleo.com' }]).map((provider) => (
          <PmsProviderCard
            key={provider.key}
            provider={provider}
            connection={connectionsByProvider.get(provider.key)}
            onEdit={openEditor}
            onTest={testConnection}
            onSync={syncReservations}
            onDisconnect={disconnect}
            busyAction={busyAction}
          />
        ))}
      </div>

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
