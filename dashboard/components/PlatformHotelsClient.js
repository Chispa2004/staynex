'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  DoorOpen,
  MessageSquareText,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { persistWorkspaceSelection } from '@/lib/workspace-context';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { cn, ui } from '@/lib/ui/styles';
import { PremiumEmptyState } from './PremiumEmptyState';
import { PremiumLoadingState } from './PremiumLoadingState';

const getAuthHeaders = async () => {
  const supabase = getSupabaseBrowser();
  const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

  return data?.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
};

const formatDate = (value) => {
  if (!value) return 'No activity yet';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

const StatusBadge = ({ isLight, tone = 'slate', children }) => {
  const { tx } = useDashboardLanguage();
  return <span className={ui.badge(isLight, tone, true)}>{typeof children === 'string' ? tx(children) : children}</span>;
};

const toneForHealth = (score = 0) => {
  if (score >= 80) return 'emerald';
  if (score >= 60) return 'amber';
  if (score >= 35) return 'orange';
  return 'red';
};

const HealthBar = ({ value = 0, isLight }) => (
  <div className={cn('h-2 overflow-hidden rounded-full', isLight ? 'bg-slate-100' : 'bg-white/[0.06]')}>
    <div
      className={cn(
        'h-full rounded-full transition-all',
        value >= 80 ? 'bg-emerald-400' : value >= 60 ? 'bg-amber-400' : value >= 35 ? 'bg-orange-400' : 'bg-red-400'
      )}
      style={{ width: `${Math.max(0, Math.min(100, Number(value || 0)))}%` }}
    />
  </div>
);

const HotelCard = ({ hotel, isLight, onEnterWorkspace }) => {
  const { tx } = useDashboardLanguage();
  const warnings = [
    hotel.pms?.lastSyncError ? 'PMS sync warning' : null,
    hotel.stats?.urgentTickets ? `${hotel.stats.urgentTickets} urgent tickets` : null,
    !hotel.stats?.whatsappConfigured ? 'WhatsApp not configured' : null,
    hotel.readiness?.critical_checks ? `${hotel.readiness.critical_checks} readiness blockers` : null
  ].filter(Boolean);

  return (
    <article className={ui.card(isLight, { interactive: true })}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-lg"
            style={{ backgroundColor: hotel.brand_color || '#34d399' }}
          >
            {(hotel.name || 'H').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={cn('truncate text-xl font-semibold', ui.text.title(isLight))}>{hotel.name}</h2>
              <StatusBadge isLight={isLight} tone={toneForHealth(hotel.healthScore)}>{hotel.healthStatus}</StatusBadge>
              {hotel.readiness?.ready_for_live ? (
                <StatusBadge isLight={isLight} tone="emerald">Ready for live</StatusBadge>
              ) : (
                <StatusBadge isLight={isLight} tone="amber">Onboarding</StatusBadge>
              )}
            </div>
            <p className={cn('mt-2 text-sm', ui.text.muted(isLight))}>
              {hotel.destination_country || hotel.country || hotel.timezone || tx('Hotel workspace')} - {hotel.plan_label || tx('No plan')}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className={cn('rounded-lg border px-3 py-2', ui.surface(isLight, 'subtle'))}>
                <p className={ui.text.eyebrow(isLight)}>PMS</p>
                <p className={cn('mt-1 text-sm font-semibold', ui.text.title(isLight))}>
                  {hotel.pms?.enabled ? hotel.pms.provider : tx('Disconnected')}
                </p>
              </div>
              <div className={cn('rounded-lg border px-3 py-2', ui.surface(isLight, 'subtle'))}>
                <p className={ui.text.eyebrow(isLight)}>WhatsApp</p>
                <p className={cn('mt-1 text-sm font-semibold', ui.text.title(isLight))}>
                  {tx(hotel.stats?.whatsappConfigured ? 'Configured' : 'Needs setup')}
                </p>
              </div>
              <div className={cn('rounded-lg border px-3 py-2', ui.surface(isLight, 'subtle'))}>
                <p className={ui.text.eyebrow(isLight)}>AI status</p>
                <p className={cn('mt-1 text-sm font-semibold', ui.text.title(isLight))}>
                  {hotel.stats?.aiLogs ? tx(`${hotel.stats.aiHandled || 0} handled`) : tx('No traffic yet')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
          <Link href={`/platform/hotels/${hotel.id}`} className={ui.button(isLight, 'secondary')}>
            {tx('View detail')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button type="button" onClick={() => onEnterWorkspace(hotel)} className={ui.button(isLight, 'primary')}>
            <DoorOpen className="h-4 w-4" aria-hidden="true" />
            {tx('Enter workspace')}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Active conversations', hotel.stats?.activeConversations || 0, MessageSquareText],
          ['Open tickets', hotel.stats?.openTickets || 0, AlertTriangle],
          ['Reservations', hotel.stats?.reservations || 0, Building2],
          ['Users', hotel.stats?.activeUsers || hotel.stats?.users || 0, Users],
          ['Experiences', hotel.stats?.experienceBookings || 0, Sparkles]
        ].map(([label, value, Icon]) => (
          <div key={label} className={cn('rounded-lg border p-3', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.025]')}>
            <div className="flex items-center justify-between gap-2">
              <p className={cn('text-xs font-semibold uppercase tracking-[0.13em]', isLight ? 'text-slate-500' : 'text-slate-500')}>{tx(label)}</p>
              <Icon className={cn('h-4 w-4', isLight ? 'text-slate-400' : 'text-slate-500')} aria-hidden="true" />
            </div>
            <p className={cn('mt-2 text-2xl font-semibold tabular-nums', ui.text.title(isLight))}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className={ui.text.eyebrow(isLight)}>{tx('Health score')}</p>
            <span className={cn('text-sm font-semibold tabular-nums', ui.text.title(isLight))}>{hotel.healthScore || 0}%</span>
          </div>
          <div className="mt-2">
            <HealthBar value={hotel.healthScore || 0} isLight={isLight} />
          </div>
          <p className={cn('mt-2 text-xs', ui.text.muted(isLight))}>{tx('Last activity')}: {formatDate(hotel.lastActivityAt)}</p>
        </div>
        <div className={cn('rounded-lg border px-3 py-2.5', warnings.length ? (isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-300/20 bg-amber-400/10') : ui.surface(isLight, 'subtle'))}>
          <p className={cn('text-xs font-semibold uppercase tracking-[0.13em]', warnings.length ? (isLight ? 'text-amber-800' : 'text-amber-100') : (isLight ? 'text-slate-500' : 'text-slate-500'))}>
            {tx('Warnings')}
          </p>
          {warnings.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {warnings.map((warning) => (
                <StatusBadge key={warning} isLight={isLight} tone="amber">{warning}</StatusBadge>
              ))}
            </div>
          ) : (
            <p className={cn('mt-2 text-sm', ui.text.body(isLight))}>{tx('No platform warnings for this workspace.')}</p>
          )}
        </div>
      </div>
    </article>
  );
};

export const PlatformHotelsClient = () => {
  const router = useRouter();
  const { theme } = useDashboardTheme();
  const { tx } = useDashboardLanguage();
  const isLight = theme === 'light';
  const [data, setData] = useState({ hotels: [], metrics: {} });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHotels = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/platform/hotels', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not load hotel workspaces');
      }
      setData(body);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHotels();
  }, []);

  const filteredHotels = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return data.hotels || [];
    return (data.hotels || []).filter((hotel) => [
      hotel.name,
      hotel.slug,
      hotel.workspace_slug,
      hotel.timezone,
      hotel.pms?.provider,
      hotel.healthStatus
    ].filter(Boolean).join(' ').toLowerCase().includes(search));
  }, [data.hotels, query]);

  const enterWorkspace = async (hotel) => {
    setError(null);
    try {
      const response = await fetch(`/api/platform/hotels/${hotel.id}/support`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not enter hotel workspace');
      }
      window.sessionStorage.setItem('staynex_support_session', JSON.stringify(body.supportSession));
      persistWorkspaceSelection({
        hotelId: hotel.id,
        workspace: {
          hotel: body.hotel,
          role: 'support',
          supportSession: body.supportSession
        }
      });
      router.push('/dashboard');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">{tx('Platform workspaces')}</p>
          <h1 className={cn('mt-3 text-3xl font-semibold tracking-normal sm:text-4xl', ui.text.title(isLight))}>{tx('Hotels')}</h1>
          <p className={cn('mt-3 max-w-2xl text-sm leading-6', ui.text.body(isLight))}>
            {tx('Dedicated multi-hotel workspace directory. Enter a hotel to switch into the hotel operations sidebar.')}
          </p>
        </div>
        <button type="button" onClick={loadHotels} className={ui.button(isLight, 'secondary')}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          {tx('Refresh')}
        </button>
      </div>

      {error ? (
        <div className={ui.notice(isLight, 'danger')}>
          {tx(error)}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Hotels', data.metrics?.totalHotels || 0, Building2],
          ['Active hotels', data.metrics?.activeHotels || 0, CheckCircle2],
          ['PMS connected', data.metrics?.pmsConnectedHotels || 0, PlugZap],
          ['Needs attention', data.metrics?.hotelsNeedingAttention || 0, AlertTriangle]
        ].map(([label, value, Icon]) => (
          <article key={label} className={cn('rounded-xl border p-4', ui.surface(isLight))}>
            <div className="flex items-center justify-between">
              <p className={ui.text.eyebrow(isLight)}>{tx(label)}</p>
              <Icon className={cn('h-4 w-4', isLight ? 'text-slate-400' : 'text-slate-500')} aria-hidden="true" />
            </div>
            <p className={cn('mt-3 text-3xl font-semibold tabular-nums', ui.text.title(isLight))}>{value}</p>
          </article>
        ))}
      </section>

      <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', ui.surface(isLight, 'subtle'))}>
        <Search className={cn('h-4 w-4 shrink-0', isLight ? 'text-slate-400' : 'text-slate-500')} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tx('Search hotels, PMS, health...')}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
        />
      </div>

      {loading ? (
        <PremiumLoadingState
          title={tx('Loading hotel workspaces')}
          description={tx('Staynex is checking hotel health, PMS status and workspace activity.')}
          rows={3}
          cards={4}
        />
      ) : filteredHotels.length ? (
        <div className="grid gap-4">
          {filteredHotels.map((hotel) => (
            <HotelCard key={hotel.id} hotel={hotel} isLight={isLight} onEnterWorkspace={enterWorkspace} />
          ))}
        </div>
      ) : (
        <PremiumEmptyState
          icon={Building2}
          title={tx('No hotel workspaces found')}
          description={tx('Create or unarchive a hotel workspace from the platform console to see it here.')}
        />
      )}
    </div>
  );
};

