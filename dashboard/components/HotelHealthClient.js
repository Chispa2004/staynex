'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  PlugZap,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const iconById = {
  pms: PlugZap,
  whatsapp: Inbox,
  ai: Bot,
  tickets: AlertTriangle,
  provider_bookings: Sparkles,
  automations: ClipboardCheck,
  conversations: Inbox,
  qr_rooms: QrCode,
  reception: ShieldCheck,
  folio: ClipboardCheck
};

const statusLabel = {
  healthy: 'Operational',
  warning: 'Needs attention',
  critical: 'Critical'
};

export const HotelHealthClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadHealth = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const response = await fetch('/api/health/hotel', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Hotel health could not be loaded');
      }

      if (!shouldAcceptTenantPayload(body, 'hotel-health')) {
        return;
      }

      setPayload(body);
      setError(null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const health = payload?.health || {};
  const allOperational = health.overallStatus === 'healthy' && !health.warnings?.length;

  return (
    <section className="space-y-5">
      <section className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className={ui.text.eyebrow(isLight)}>Hotel Operational Health</p>
            <h2 className={cn('mt-2 text-3xl', ui.text.title(isLight))}>
              {allOperational ? 'All hotel systems operational.' : 'Hotel systems need review.'}
            </h2>
            <p className={cn('mt-2 max-w-3xl', ui.text.body(isLight))}>
              A simple operational view for reception and hotel admins. It focuses on guest-facing impact and clear next steps.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HealthBadge status={health.overallStatus || 'healthy'} />
            <button type="button" onClick={() => loadHealth()} disabled={refreshing} className={ui.button(isLight, 'secondary')}>
              <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Health score" value={loading ? '...' : `${health.healthScore || 0}%`} tone={health.overallStatus === 'critical' ? 'red' : health.overallStatus === 'warning' ? 'amber' : 'emerald'} />
          <SummaryTile label="Current status" value={loading ? '...' : statusLabel[health.overallStatus] || 'Operational'} tone={health.overallStatus === 'warning' ? 'amber' : health.overallStatus === 'critical' ? 'red' : 'emerald'} />
          <SummaryTile label="Warnings" value={loading ? '...' : health.warnings?.length || 0} tone={health.warnings?.length ? 'amber' : 'emerald'} />
        </div>
      </section>

      {error ? (
        <div className={cn('rounded-xl border p-4 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          [0, 1, 2, 3, 4, 5].map((item) => <div key={item} className={cn('h-36 rounded-xl', ui.skeleton(isLight))} />)
        ) : (
          (health.statusCards || []).map((card) => <HealthCard key={card.id} card={card} />)
        )}
      </section>

      <section className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={ui.text.eyebrow(isLight)}>Operational warnings</p>
            <h3 className={cn('mt-1 text-xl', ui.text.title(isLight))}>Guest-facing impact only</h3>
          </div>
          <Link href="/dashboard/reception" className={ui.button(isLight, 'secondary')}>
            Open Reception
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {loading ? (
          <div className={cn('mt-4 h-28 rounded-xl', ui.skeleton(isLight))} />
        ) : health.warnings?.length ? (
          <div className="mt-4 space-y-3">
            {health.warnings.map((warning) => (
              <WarningRow key={`${warning.id}-${warning.label}`} warning={warning} />
            ))}
          </div>
        ) : (
          <div className={cn('mt-4 rounded-xl border border-dashed p-6 text-center', isLight ? 'border-emerald-200 bg-emerald-50' : 'border-emerald-300/20 bg-emerald-300/10')}>
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" aria-hidden="true" />
            <p className={cn('mt-3 text-sm font-semibold', ui.text.title(isLight))}>All hotel systems operational.</p>
            <p className={cn('mt-1', ui.text.muted(isLight))}>No urgent tickets, disconnected services or guest-facing warnings are visible right now.</p>
          </div>
        )}
      </section>
    </section>
  );
};

const HealthBadge = ({ status = 'healthy' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tone = status === 'critical' ? 'red' : status === 'warning' ? 'amber' : 'emerald';

  return (
    <span className={ui.badge(isLight, tone)}>
      {statusLabel[status] || 'Operational'}
    </span>
  );
};

const SummaryTile = ({ label, value, tone }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border p-4 text-center', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <p className={ui.text.eyebrow(isLight)}>{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{value}</p>
      <div className={cn('mx-auto mt-3 h-1.5 w-16 rounded-full', tone === 'red' ? 'bg-red-400' : tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400')} />
    </div>
  );
};

const HealthCard = ({ card }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const Icon = iconById[card.id] || ShieldCheck;
  const toneClass = card.status === 'critical'
    ? isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100'
    : card.status === 'warning'
      ? isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-300/20 bg-amber-400/10 text-amber-100'
      : isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';

  return (
    <article className={cn('rounded-xl border p-4', ui.surface(isLight))}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl border', toneClass)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <HealthBadge status={card.status} />
      </div>
      <p className={cn('mt-4 text-sm font-semibold', ui.text.title(isLight))}>{card.label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{card.value}</p>
      <p className={cn('mt-2 min-h-10 text-sm leading-5', ui.text.body(isLight))}>{card.description}</p>
    </article>
  );
};

const WarningRow = ({ warning }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const tone = warning.severity === 'critical' ? 'red' : warning.severity === 'warning' ? 'amber' : 'sky';

  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400' : 'text-sky-400')} aria-hidden="true" />
        <div>
          <p className={cn('text-sm font-semibold', ui.text.title(isLight))}>{warning.label}</p>
          <p className={cn('mt-1 text-sm', ui.text.body(isLight))}>{warning.message}</p>
        </div>
      </div>
      <span className={ui.badge(isLight, tone)}>{warning.severity}</span>
    </div>
  );
};
