'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Euro, RefreshCw, Send, Search, Sparkles, XCircle } from 'lucide-react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { canAccess } from '@/lib/permissions';
import { PremiumEmptyState } from './PremiumEmptyState';
import { cn, ui } from '@/lib/ui/styles';

const filterTypes = ['all', 'room_upgrade', 'late_checkout', 'airport_transfer', 'romantic_package', 'spa', 'dinner', 'breakfast_upgrade'];
const filterStatuses = ['all', 'suggested', 'shown', 'sent', 'accepted', 'rejected'];

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const formatConfidence = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${Math.round(numberValue * 100)}%` : '-';
};

const formatCurrency = (value, currency = 'EUR') => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
  maximumFractionDigits: 0
}).format(Number(value || 0));

const Card = ({ children, className = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={cn(
      'rounded-xl border transition duration-200',
      ui.surface(isLight),
      className
    )}
    >
      {children}
    </section>
  );
};

const Badge = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  return (
    <span className={ui.badge(isLight, tone)}>
      {children}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value, tone }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-60">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </div>
      <Badge tone={tone}>
        <Icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        AI
      </Badge>
    </div>
  </Card>
);

export const UpsellsClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [upsells, setUpsells] = useState([]);
  const [hotel, setHotel] = useState(null);
  const [currentRole, setCurrentRole] = useState('receptionist');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState(null);
  const loadRequestIdRef = useRef(0);
  const activeHotelIdRef = useRef(null);

  const inputClass = ui.input(isLight);

  const getAuthHeaders = async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: {} };

    return data?.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : {};
  };

  const loadUpsells = async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setUpsells([]);
    setError(null);

    try {
      const response = await fetch('/api/upsells', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load upsells');
      }

      const nextHotelId = body.hotel?.id || null;

      if (requestId !== loadRequestIdRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale response ignored', { surface: 'upsells', hotelId: nextHotelId });
        }
        return;
      }

      if (activeHotelIdRef.current && nextHotelId && activeHotelIdRef.current !== nextHotelId && process.env.NODE_ENV !== 'production') {
        console.info('state reset for hotel', { surface: 'upsells', hotelId: nextHotelId });
      }

      activeHotelIdRef.current = nextHotelId;
      setUpsells(body.upsells || []);
      setHotel(body.hotel || null);
      setCurrentRole(body.role || 'receptionist');
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadUpsells();
  }, []);

  const filteredUpsells = useMemo(() => {
    const query = search.trim().toLowerCase();

    return upsells.filter((upsell) => {
      const matchesType = typeFilter === 'all' || upsell.upsell_type === typeFilter;
      const conversionStatus = upsell.conversion?.status || upsell.status;
      const matchesStatus = statusFilter === 'all' || upsell.status === statusFilter || conversionStatus === statusFilter;
      const text = [
        upsell.title,
        upsell.description,
        upsell.suggested_message,
        upsell.upsell_type,
        upsell.guest?.phone_number,
        upsell.guest?.current_room,
        upsell.reservation?.guest_name,
        upsell.reservation?.pms_reservation_id
      ].filter(Boolean).join(' ').toLowerCase();

      return matchesType && matchesStatus && (!query || text.includes(query));
    });
  }, [search, statusFilter, typeFilter, upsells]);

  const stats = useMemo(() => ({
    total: upsells.length,
    accepted: upsells.filter((item) => item.conversion?.status === 'accepted' || item.accepted || item.status === 'accepted').length,
    rejected: upsells.filter((item) => item.conversion?.status === 'rejected' || item.rejected || item.status === 'rejected').length,
    pending: upsells.filter((item) => !item.accepted && !item.rejected && ['suggested', 'shown', 'sent'].includes(item.conversion?.status || item.status)).length,
    revenue: upsells
      .filter((item) => item.conversion?.status === 'accepted' || item.accepted || item.status === 'accepted')
      .reduce((total, item) => total + Number(item.conversion?.estimated_amount || item.estimated_amount || 0), 0)
  }), [upsells]);
  const canManageUpsells = canAccess(currentRole, 'upsells_manage');

  const updateUpsellAction = async ({ upsellId, action }) => {
    setUpdatingId(`${upsellId}-${action}`);
    setError(null);

    try {
      const response = await fetch('/api/upsells', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          upsellId,
          action
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update upsell');
      }

      setUpsells((current) => current.map((item) => (
        item.id === upsellId
          ? {
            ...item,
            ...body.upsell,
            guest: item.guest,
            reservation: item.reservation,
            conversation: item.conversation
          }
          : item
      )));
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Sparkles} label="Total upsells" value={stats.total} tone="violet" />
        <StatCard icon={Clock3} label="Pending" value={stats.pending} tone="amber" />
        <StatCard icon={CheckCircle2} label="Accepted" value={stats.accepted} tone="emerald" />
        <StatCard icon={XCircle} label="Rejected" value={stats.rejected} tone="red" />
        <StatCard icon={Euro} label="Accepted revenue" value={formatCurrency(stats.revenue)} tone="emerald" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold">{hotel?.name || 'Current hotel'}</p>
            <p className={isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-500'}>
              Detected commercial opportunities are stored here before any human follow-up.
            </p>
          </div>
          <button
            type="button"
            onClick={loadUpsells}
            className={ui.button(isLight, 'secondary')}
          >
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="relative">
            <Search className={isLight ? 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400' : 'pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-600'} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search guest, room, reservation or type"
              className={`${inputClass} w-full pl-9`}
            />
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={inputClass}>
            {filterTypes.map((type) => (
              <option key={type} value={type}>{type === 'all' ? 'All types' : type}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
            {filterStatuses.map((status) => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>
            ))}
          </select>
        </div>
      </Card>

      {error ? (
        <div className={isLight ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800' : 'rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100'}>
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className={isLight ? 'border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900' : 'border-b border-white/10 px-4 py-3 text-sm font-semibold text-white'}>
          {loading ? 'Loading upsells...' : `${filteredUpsells.length} opportunities`}
        </div>

        <div className="divide-y divide-slate-200/10">
          {filteredUpsells.map((upsell) => (
            <article key={upsell.id} className={isLight ? 'grid gap-4 p-4 transition hover:bg-slate-50 xl:grid-cols-[1.1fr_0.75fr_0.75fr_0.9fr]' : 'grid gap-4 p-4 transition hover:bg-white/[0.035] xl:grid-cols-[1.1fr_0.75fr_0.75fr_0.9fr]'}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="violet">{upsell.upsell_type}</Badge>
                  <Badge tone={upsell.status === 'accepted' ? 'emerald' : upsell.status === 'rejected' ? 'red' : 'amber'}>
                    {upsell.status}
                  </Badge>
                  <Badge tone={upsell.conversion?.status === 'accepted' ? 'emerald' : upsell.conversion?.status === 'rejected' ? 'red' : upsell.conversion?.status === 'sent' ? 'sky' : 'slate'}>
                    {upsell.conversion?.status || 'pending'}
                  </Badge>
                </div>
                <h2 className="mt-3 text-sm font-semibold">{upsell.title}</h2>
                <p className={isLight ? 'mt-1 text-sm leading-6 text-slate-600' : 'mt-1 text-sm leading-6 text-slate-400'}>
                  {upsell.description}
                </p>
                <p className={isLight ? 'mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700' : 'mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300'}>
                  {upsell.suggested_message}
                </p>
              </div>

              <div className="text-sm">
                <p className="font-semibold">Guest</p>
                <p className={isLight ? 'mt-1 text-slate-600' : 'mt-1 text-slate-400'}>
                  {upsell.reservation?.guest_name || upsell.guest?.phone_number || 'Unknown guest'}
                </p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  Room {upsell.guest?.current_room || '-'}
                </p>
              </div>

              <div className="text-sm">
                <p className="font-semibold">Reservation</p>
                <p className={isLight ? 'mt-1 text-slate-600' : 'mt-1 text-slate-400'}>
                  {upsell.reservation?.pms_reservation_id || '-'}
                </p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  {upsell.reservation?.arrival_date || '-'} {'->'} {upsell.reservation?.departure_date || '-'}
                </p>
              </div>

              <div className="text-sm">
                <p className="font-semibold">Revenue attribution</p>
                <p className={isLight ? 'mt-1 text-xl font-semibold text-slate-950' : 'mt-1 text-xl font-semibold text-white'}>
                  {formatCurrency(upsell.conversion?.estimated_amount || upsell.estimated_amount, upsell.conversion?.currency || 'EUR')}
                </p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  Signal: {upsell.trigger_source}
                </p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  Confidence {formatConfidence(upsell.confidence)}
                </p>
                <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                  {formatDate(upsell.created_at)}
                </p>
                {canManageUpsells ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={updatingId === `${upsell.id}-send_offer`}
                      onClick={() => updateUpsellAction({ upsellId: upsell.id, action: 'send_offer' })}
                      className={cn(ui.button(isLight, 'secondary'), 'px-2.5 py-1.5 text-xs', isLight ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100' : 'border-sky-300/20 bg-sky-300/10 text-sky-100 hover:bg-sky-300/15')}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send Offer
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === `${upsell.id}-mark_accepted`}
                      onClick={() => updateUpsellAction({ upsellId: upsell.id, action: 'mark_accepted' })}
                      className={cn(ui.button(isLight, 'secondary'), 'px-2.5 py-1.5 text-xs', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15')}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark Accepted
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === `${upsell.id}-mark_rejected`}
                      onClick={() => updateUpsellAction({ upsellId: upsell.id, action: 'mark_rejected' })}
                      className={cn(ui.button(isLight, 'danger'), 'px-2.5 py-1.5 text-xs')}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Mark Rejected
                    </button>
                  </div>
                ) : (
                  <p className={isLight ? 'mt-3 text-xs font-medium text-slate-500' : 'mt-3 text-xs font-medium text-slate-500'}>
                    Read-only for this role
                  </p>
                )}
              </div>
            </article>
          ))}

          {!loading && filteredUpsells.length === 0 ? (
            <PremiumEmptyState
              icon={Sparkles}
              title="No upsell opportunities yet"
              description="Staynex will surface revenue signals here when guests ask about upgrades, late checkout, transfers or experiences."
              className="m-4"
            />
          ) : null}
        </div>
      </Card>
    </div>
  );
};
