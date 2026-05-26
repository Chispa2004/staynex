'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  RefreshCw,
  Search
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { canAccess } from '@/lib/permissions';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';
import { PremiumEmptyState } from './PremiumEmptyState';

const statuses = [
  'all',
  'guest_interested',
  'awaiting_guest_details',
  'awaiting_guest_confirmation',
  'provider_request_sent',
  'provider_confirmed',
  'provider_rejected',
  'failed_provider_email',
  'cancelled_by_guest',
  'pending',
  'reviewing',
  'confirmed',
  'completed',
  'rejected',
  'cancelled'
];

const formatCurrency = (value) => new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

const statusTone = {
  guest_interested: 'sky',
  awaiting_guest_details: 'amber',
  awaiting_guest_confirmation: 'amber',
  provider_request_sent: 'emerald',
  provider_confirmed: 'emerald',
  provider_rejected: 'red',
  cancelled_by_guest: 'slate',
  failed_provider_email: 'red',
  pending: 'amber',
  reviewing: 'sky',
  confirmed: 'emerald',
  completed: 'emerald',
  rejected: 'red',
  cancelled: 'slate'
};

const providerEmailStatus = (booking) => (
  booking.metadata?.provider_email_status
  || booking.lead_status
  || (booking.metadata?.provider_lead_required ? 'pending' : null)
);

const providerEmailTone = {
  sent: 'emerald',
  draft: 'sky',
  pending: 'amber',
  failed: 'red',
  skipped: 'slate',
  not_required: 'slate'
};

const providerEmailLabel = {
  sent: 'Provider email sent',
  draft: 'Provider email prepared',
  pending: 'Provider email pending',
  failed: 'Provider email failed',
  skipped: 'Provider email skipped',
  not_required: 'No provider email'
};

const isPartnerMarketplaceBooking = (booking) => (
  booking.revenue_type === 'partner_marketplace'
  || booking.metadata?.revenue_type === 'partner_marketplace'
  || booking.revenue_owner === 'staynex'
  || booking.metadata?.partner_network
);

const getHotelVisibleRevenue = (booking) => Number(
  booking.hotel_visible_estimated_revenue
  ?? booking.hotel_revenue_amount
  ?? (booking.hotel_visible_revenue ? booking.estimated_revenue : 0)
  ?? 0
);

const StatCard = ({ icon: Icon, label, value, helper, isLight }) => (
  <article className={cn('rounded-xl border p-4', ui.surface(isLight))}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className={ui.text.eyebrow(isLight)}>{label}</p>
        <p className={cn('mt-3 text-2xl font-semibold', ui.text.title(isLight))}>{value}</p>
        {helper ? <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>{helper}</p> : null}
      </div>
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg border', ui.badge(isLight, 'emerald'))}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
  </article>
);

export const ExperienceBookingsClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [bookings, setBookings] = useState([]);
  const [role, setRole] = useState('receptionist');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [draftNotes, setDraftNotes] = useState({});
  const requestIdRef = useRef(0);

  const canManage = canAccess(role, 'experience_bookings_manage');
  const canAddNotes = canAccess(role, 'experience_bookings_notes') || canManage;
  const canViewAnalytics = canAccess(role, 'analytics') || canAccess(role, 'revenue');

  const loadBookings = async ({ silent = false } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/experience-bookings', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load experience bookings');
      }

      if (!shouldAcceptTenantPayload(body, 'experience-bookings')) {
        return;
      }

      if (requestId !== requestIdRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale response ignored', { surface: 'experience-bookings', hotelId: body.hotelId });
        }
        return;
      }

      setBookings(body.bookings || []);
      setRole(body.role || 'receptionist');

      if (body.missingTable) {
        setError('Run supabase/sql/create_experience_booking_requests.sql to enable booking workflow.');
      }
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadBookings();
    const intervalId = window.setInterval(() => loadBookings({ silent: true }), 10000);

    return () => window.clearInterval(intervalId);
  }, []);

  const stats = useMemo(() => {
    const pending = bookings.filter((item) => ['guest_interested', 'awaiting_guest_details', 'awaiting_guest_confirmation', 'pending', 'reviewing'].includes(item.status));
    const confirmedToday = bookings.filter((item) => {
      if (item.status !== 'confirmed') return false;
      return new Date(item.updated_at).toDateString() === new Date().toDateString();
    });
    const confirmedRevenue = bookings
      .filter((item) => ['confirmed', 'completed'].includes(item.status))
      .reduce((total, item) => total + getHotelVisibleRevenue(item), 0);
    const topExperience = Object.entries(bookings.reduce((acc, item) => {
      acc[item.experience_title] = (acc[item.experience_title] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0];

    return {
      pending: pending.length,
      potentialRevenue: pending.reduce((total, item) => total + getHotelVisibleRevenue(item), 0),
      confirmedToday: confirmedToday.length,
      confirmedRevenue,
      topExperience: topExperience?.[0] || 'No data'
    };
  }, [bookings]);

  const filtered = useMemo(() => bookings.filter((booking) => {
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
    const haystack = [
      booking.experience_title,
      booking.partner_name,
      booking.guest_name,
      booking.room_number,
      booking.notes
    ].filter(Boolean).join(' ').toLowerCase();

    return matchesStatus && haystack.includes(search.toLowerCase());
  }), [bookings, search, statusFilter]);

  const updateBooking = async (id, payload) => {
    setBusyId(id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/experience-bookings', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id, ...payload })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update booking');
      }

      setBookings((current) => current.map((item) => (item.id === id ? body.booking : item)));
      setNotice('Booking request updated.');
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
          {notice}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard isLight={isLight} icon={Clock3} label="Guest requests" value={loading ? '...' : stats.pending} helper="Awaiting guest details or provider follow-up" />
        <StatCard isLight={isLight} icon={CalendarCheck} label="Potential revenue" value={loading ? '...' : formatCurrency(stats.potentialRevenue)} helper="Pending and reviewing" />
        <StatCard isLight={isLight} icon={CheckCircle2} label="Confirmed today" value={loading ? '...' : stats.confirmedToday} helper={canViewAnalytics ? formatCurrency(stats.confirmedRevenue) : 'Operational view'} />
        <StatCard isLight={isLight} icon={ClipboardList} label="Top experience" value={loading ? '...' : stats.topExperience} helper="Most requested" />
      </section>

      <section className={cn('rounded-xl border p-4', ui.surface(isLight))}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                  onClick={() => setStatusFilter(status)}
                className={statusFilter === status ? ui.button(isLight, 'active') : cn(ui.button(isLight, 'small'), 'rounded-full')}
              >
                {status === 'all' ? 'All' : ui.humanize(status)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <label className={cn('flex min-w-0 items-center gap-2 rounded-lg border px-3', isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#0b1019]')}>
              <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 bg-transparent py-2 text-sm outline-none"
                placeholder="Search guest, partner, experience..."
              />
            </label>
            <button type="button" onClick={() => loadBookings()} className={ui.iconButton(isLight, 'secondary')} title="Refresh">
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className={cn('h-44 rounded-xl', ui.skeleton(isLight))} />
            ))}
          </div>
        ) : null}
        {!loading && filtered.map((booking) => {
          const busy = busyId === booking.id;
          const notesValue = draftNotes[booking.id] ?? booking.notes ?? '';

          return (
            <article key={booking.id} className={cn('rounded-xl border p-4', ui.surface(isLight))}>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_260px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className={cn('truncate text-lg font-semibold', ui.text.title(isLight))}>{booking.experience_title}</h2>
                    <span className={ui.badge(isLight, statusTone[booking.status] || 'slate')}>{ui.humanize(booking.status)}</span>
                    {providerEmailStatus(booking) ? (
                      <span className={ui.badge(isLight, providerEmailTone[providerEmailStatus(booking)] || 'slate')}>
                        {providerEmailLabel[providerEmailStatus(booking)] || providerEmailStatus(booking)}
                      </span>
                    ) : null}
                    {isPartnerMarketplaceBooking(booking) ? (
                      <span className={ui.badge(isLight, 'violet')}>Partner experience</span>
                    ) : null}
                  </div>
                  <p className={cn('mt-2 text-sm', ui.text.body(isLight))}>
                    {booking.guest_name || 'Guest'} / Room {booking.room_number || '-'} / {booking.provider_source || booking.metadata?.provider_source || booking.partner_name || 'Internal concierge'}
                  </p>
                  {booking.metadata?.guest_phone ? (
                    <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>WhatsApp {booking.metadata.guest_phone}</p>
                  ) : null}
                  <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
                    Created {formatDate(booking.created_at)} / Source {booking.source || 'ai_concierge'}
                  </p>
                  <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
                    Provider request {ui.humanize(booking.lead_status || booking.metadata?.provider_email_status || 'pending')}
                  </p>
                  {isPartnerMarketplaceBooking(booking) ? (
                    <p className={cn('mt-2 rounded-lg border px-3 py-2 text-xs', isLight ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-violet-300/20 bg-violet-300/10 text-violet-100')}>
                      Managed by external provider. Reception action: {booking.metadata?.reception_confirmation_required === false || booking.reception_action_required === false ? 'none' : 'follow-up optional'}.
                    </p>
                  ) : null}
                  {booking.metadata?.provider_email_error || booking.lead_error ? (
                    <p className={cn('mt-2 text-xs font-medium', isLight ? 'text-red-700' : 'text-red-200')}>
                      Provider request needs attention: {booking.metadata?.provider_email_error || booking.lead_error}
                    </p>
                  ) : null}
                  {booking.metadata?.original_message ? (
                    <p className={cn('mt-2 line-clamp-2 text-xs', ui.text.muted(isLight))}>
                      Original message: {booking.metadata.original_message}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div><span className={ui.text.eyebrow(isLight)}>Date</span><p className="text-sm font-semibold">{booking.requested_date || 'To confirm'}</p></div>
                    <div><span className={ui.text.eyebrow(isLight)}>Time</span><p className="text-sm font-semibold">{booking.requested_time || 'To confirm'}</p></div>
                    <div><span className={ui.text.eyebrow(isLight)}>Guests</span><p className="text-sm font-semibold">{booking.guests_count || '-'}</p></div>
                  </div>
                </div>

                <div className={cn('rounded-lg border p-3', ui.surface(isLight, 'subtle'))}>
                  <p className={ui.text.eyebrow(isLight)}>Revenue</p>
                  {isPartnerMarketplaceBooking(booking) && !booking.hotel_visible_revenue ? (
                    <>
                      <p className={cn('mt-2 text-sm font-semibold', ui.text.title(isLight))}>Partner marketplace</p>
                      <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>Revenue managed by Staynex Partner Network</p>
                    </>
                  ) : (
                    <>
                      <p className={cn('mt-2 text-xl font-semibold', ui.text.title(isLight))}>{formatCurrency(getHotelVisibleRevenue(booking))}</p>
                      <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>Visible hotel benefit {formatCurrency(booking.hotel_visible_commission ?? booking.commission_estimate)}</p>
                    </>
                  )}
                  <p className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', isLight ? 'border-slate-200 bg-white text-slate-600' : 'border-white/10 bg-black/20 text-slate-400')}>
                    Provider requests are sent automatically by Staynex after guest confirmation. Hotel teams can monitor and add notes only.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className={cn('rounded-lg border p-3', ui.surface(isLight, 'subtle'))}>
                    <p className={ui.text.eyebrow(isLight)}>External status</p>
                    <p className={cn('mt-2 text-sm font-semibold', ui.text.title(isLight))}>{ui.humanize(booking.status || 'pending')}</p>
                    {booking.metadata?.provider_email_sent_at || booking.lead_email_sent_at ? (
                      <p className={cn('mt-1 text-xs', ui.text.muted(isLight))}>
                        Email sent {formatDate(booking.metadata?.provider_email_sent_at || booking.lead_email_sent_at)}
                      </p>
                    ) : null}
                  </div>
                  <textarea
                    value={notesValue}
                    onChange={(event) => setDraftNotes((current) => ({ ...current, [booking.id]: event.target.value }))}
                    rows={3}
                    disabled={!canAddNotes}
                    className={cn('w-full resize-none', ui.input(isLight))}
                    placeholder="Internal operational notes..."
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy || !canAddNotes} onClick={() => updateBooking(booking.id, { notes: notesValue })} className={ui.button(isLight, 'secondary')}>
                      Save notes
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {!loading && filtered.length === 0 ? (
          <PremiumEmptyState
            icon={ClipboardList}
            title="No experience booking requests"
            description="When guests confirm an experience request, Staynex sends it to the provider and shows the follow-up status here."
          />
        ) : null}
      </section>
    </div>
  );
};
