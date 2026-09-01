'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, PlugZap, RefreshCw } from 'lucide-react';
import { ExecutiveBadge, ExecutiveCard } from '@/components/ExecutiveCard';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';
import { PMS_PROVIDER_CATALOG } from '@/lib/pms-providers';

const CHECKIN_DEMO_SLUG = 'hotel-demo-checkin';
const PMS_CONNECTION_STATES = Object.freeze({
  CONNECTED: 'CONNECTED',
  WAITING_EXTERNAL: 'WAITING_EXTERNAL',
  NOT_CONFIGURED: 'NOT_CONFIGURED'
});

const STATUS_COPY = {
  [PMS_CONNECTION_STATES.CONNECTED]: {
    stateLabel: 'CONNECTED',
    statusLabel: 'Conectado',
    tone: 'emerald',
    icon: 'text-emerald-400'
  },
  [PMS_CONNECTION_STATES.WAITING_EXTERNAL]: {
    stateLabel: 'WAITING EXTERNAL',
    statusLabel: 'Pendiente de integración',
    tone: 'amber',
    icon: 'text-amber-400'
  },
  [PMS_CONNECTION_STATES.NOT_CONFIGURED]: {
    stateLabel: 'NOT CONFIGURED',
    statusLabel: 'No configurado',
    tone: 'slate',
    icon: 'text-slate-500'
  }
};

const pendingStatuses = new Set(['pending_setup', 'manual_setup', 'waiting_external', 'not_configured']);
const providersByKey = new Map(PMS_PROVIDER_CATALOG.map((provider) => [provider.key, provider]));

const isCheckinPilotHotel = (hotel = {}) => (
  hotel?.slug === CHECKIN_DEMO_SLUG
  || String(hotel?.name || '').toLowerCase() === 'hotel demo checkin'
);

const formatProviderName = (providerKey) => (
  providersByKey.get(providerKey)?.name || String(providerKey || 'PMS del hotel')
);

const isConnectedConnection = (connection = null) => {
  if (!connection) {
    return false;
  }

  const syncStatus = String(connection.sync_status || connection.metadata?.setup_status || '').toLowerCase();
  return Boolean(connection.enabled && connection.has_client_secret && !pendingStatuses.has(syncStatus));
};

const getConnectionState = (connection = null) => {
  if (isConnectedConnection(connection)) {
    return PMS_CONNECTION_STATES.CONNECTED;
  }

  return connection ? PMS_CONNECTION_STATES.WAITING_EXTERNAL : PMS_CONNECTION_STATES.NOT_CONFIGURED;
};

const getHotelPmsStatus = ({ connections = [], hotel = null } = {}) => {
  const checkinPilot = isCheckinPilotHotel(hotel);
  const ubikos = connections.find((item) => item.provider === 'ubikos') || null;
  const connected = connections.find(isConnectedConnection) || null;
  const selected = checkinPilot ? ubikos : connected || connections[0] || null;

  if (checkinPilot) {
    const copy = STATUS_COPY[PMS_CONNECTION_STATES.WAITING_EXTERNAL];
    return {
      ...copy,
      state: PMS_CONNECTION_STATES.WAITING_EXTERNAL,
      providerKey: 'ubikos',
      providerName: 'Ubikos',
      detail: 'Piloto read-only'
    };
  }

  const state = getConnectionState(selected);
  const copy = STATUS_COPY[state];

  return {
    ...copy,
    state,
    providerKey: selected?.provider || null,
    providerName: selected ? formatProviderName(selected.provider) : 'PMS del hotel',
    detail: state === PMS_CONNECTION_STATES.NOT_CONFIGURED
      ? 'Sin proveedor configurado'
      : selected?.sync_status || copy.statusLabel
  };
};

export const StepPmsConnection = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [connections, setConnections] = useState([]);
  const [hotel, setHotel] = useState(null);
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
      setHotel(body.hotel || null);
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

  const status = getHotelPmsStatus({ connections, hotel });

  return (
    <ExecutiveCard className="p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <ExecutiveBadge tone="sky">Step 2</ExecutiveBadge>
          <h2 className={isLight ? 'mt-3 text-2xl font-semibold text-slate-950' : 'mt-3 text-2xl font-semibold text-white'}>PMS del hotel</h2>
          <p className={isLight ? 'mt-2 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-2 max-w-2xl text-sm leading-6 text-slate-400'}>Revisa el proveedor PMS previsto para el hotel. En el piloto Checkin, Ubikos queda como pendiente de integración externa y visible en modo read-only hasta validación real.</p>
        </div>
        <ExecutiveBadge tone={status.tone}>{loading ? 'CHECKING' : status.stateLabel}</ExecutiveBadge>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {PMS_PROVIDER_CATALOG.slice(0, 8).map((provider) => {
          const selectedProvider = provider.key === status.providerKey;
          const providerStatusLabel = selectedProvider ? status.statusLabel : provider.statusLabel;
          const providerDetail = selectedProvider ? status.detail : provider.region;

          return (
            <div key={provider.key} className={isLight ? 'rounded-xl border border-slate-200 bg-slate-50 p-4' : 'rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
              <PlugZap className={`h-5 w-5 ${selectedProvider ? status.icon : 'text-emerald-400'}`} />
              <p className={isLight ? 'mt-3 font-semibold text-slate-950' : 'mt-3 font-semibold text-white'}>{provider.name}</p>
              <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>{providerStatusLabel}</p>
              <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>{providerDetail}</p>
            </div>
          );
        })}
      </div>

      <div className={isLight ? 'mt-5 rounded-xl border border-slate-200 bg-white p-4' : 'mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className={`h-5 w-5 ${status.icon}`} />
            <div>
              <p className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>{status.providerName}</p>
              <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>{loading ? 'Comprobando...' : `${status.statusLabel} · ${status.detail}`}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={load} className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Actualizar
            </button>
            <Link href="/dashboard/settings/pms" className="rounded-lg border border-emerald-200/60 bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200">
              Configurar PMS
            </Link>
          </div>
        </div>
        {feedback ? <p className="mt-3 text-sm text-red-400">{feedback.text}</p> : null}
      </div>
    </ExecutiveCard>
  );
};
