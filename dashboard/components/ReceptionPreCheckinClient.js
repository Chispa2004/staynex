'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  FileText,
  Inbox,
  MessageSquareText,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UserRound
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

const filters = [
  { key: 'all', label: 'All' },
  { key: 'arriving_today', label: 'Arrivals today' },
  { key: 'in_house', label: 'In-house' },
  { key: 'checkout_today', label: 'Checkout today' },
  { key: 'needs_attention', label: 'Needs attention' },
  { key: 'missing_documents', label: 'Missing documents' },
  { key: 'pending_payment', label: 'Pending payment' }
];

const statusLabels = {
  arriving_today: 'Arriving today',
  in_house: 'In-house',
  checkout_today: 'Checkout today',
  checked_out: 'Checked out',
  upcoming: 'Upcoming',
  cancelled: 'Cancelled',
  no_show: 'No show'
};

const readinessLabels = {
  ready: 'Ready',
  needs_attention: 'Needs attention',
  missing_data: 'Missing data',
  blocked: 'Blocked'
};

const readinessTone = (status) => {
  if (status === 'ready') return 'emerald';
  if (status === 'blocked') return 'red';
  if (status === 'missing_data') return 'amber';
  return 'sky';
};

const statusTone = (status) => {
  if (['arriving_today', 'checkout_today'].includes(status)) return 'sky';
  if (status === 'in_house') return 'emerald';
  if (['cancelled', 'no_show'].includes(status)) return 'red';
  return 'slate';
};

const formatDate = (value) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value}T12:00:00`));
};

const formatDateTime = (value) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const formatCurrency = (value, currency = 'EUR') => {
  if (value === null || value === undefined) return 'Unavailable';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency || ''}`.trim();
  }
};

const compactText = (value, fallback = '-') => {
  const text = String(value || '').trim();
  return text || fallback;
};

export const ReceptionPreCheckinClient = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [reservations, setReservations] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [hotel, setHotel] = useState(null);
  const [role, setRole] = useState('receptionist');
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState(null);

  const loadReservations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('query', query.trim());
      if (activeFilter !== 'all') params.set('status', activeFilter);

      const response = await fetch(`/api/reception?${params.toString()}`, {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Reception data could not be loaded');
      }

      if (!shouldAcceptTenantPayload(payload, 'reception')) {
        return;
      }

      setReservations(payload.reservations || []);
      setMetrics(payload.metrics || {});
      setHotel(payload.hotel || null);
      setRole(payload.role || 'receptionist');
      setError(null);
      const nextSelectedId = selectedId && payload.reservations?.some((item) => item.id === selectedId)
        ? selectedId
        : payload.reservations?.[0]?.id || null;
      setSelectedId(nextSelectedId);
      setSelected(payload.reservations?.find((item) => item.id === nextSelectedId) || null);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter, query, selectedId]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  const selectedReservation = useMemo(() => (
    reservations.find((item) => item.id === selectedId) || selected
  ), [reservations, selected, selectedId]);

  const stats = [
    { label: 'Arrivals', value: metrics.arrivalsToday || 0, icon: CalendarCheck, tone: 'sky' },
    { label: 'In-house', value: metrics.inHouse || 0, icon: BedDouble, tone: 'emerald' },
    { label: 'Checkout', value: metrics.checkoutToday || 0, icon: CreditCard, tone: 'violet' },
    { label: 'Needs attention', value: metrics.needsAttention || 0, icon: AlertTriangle, tone: Number(metrics.needsAttention || 0) > 0 ? 'amber' : 'emerald' }
  ];

  const handleSelect = async (reservationId) => {
    setSelectedId(reservationId);
    setSelected(reservations.find((item) => item.id === reservationId) || null);

    try {
      const response = await fetch(`/api/reception?reservationId=${encodeURIComponent(reservationId)}`, {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const payload = await response.json();
      if (response.ok && payload.reservation) {
        setSelected(payload.reservation);
      }
    } catch {
      // The list item already has enough safe detail for reception.
    }
  };

  const copyPhone = async () => {
    if (!selectedReservation?.phone || typeof navigator === 'undefined') return;
    await navigator.clipboard.writeText(selectedReservation.phone);
    setNotice('Phone copied.');
  };

  const submitReceptionAction = async (action) => {
    if (!selectedReservation?.id) return;

    try {
      const response = await fetch('/api/reception', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reservationId: selectedReservation.id,
          action,
          note: action === 'mark_needs_attention' ? note || 'Marked as needs attention.' : note
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Reception action failed');
      }

      setNotice(action === 'mark_needs_attention' ? 'Reservation marked for attention.' : 'Internal note saved.');
      setNote('');
      await loadReservations({ silent: true });
    } catch (caughtError) {
      setNotice(caughtError.message);
    }
  };

  return (
    <section className="space-y-5">
      <div className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className={ui.text.eyebrow(isLight)}>Reception operations</p>
            <h2 className={cn('mt-2 text-2xl sm:text-3xl', ui.text.title(isLight))}>Reception / Pre Check-in</h2>
            <p className={cn('mt-2 max-w-3xl', ui.text.body(isLight))}>
              Search guests and reservations, review check-in readiness and open the connected Staynex context before arrival or checkout.
            </p>
          </div>
          <button type="button" onClick={() => loadReservations()} disabled={refreshing} className={ui.button(isLight, 'secondary')}>
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <MetricCard key={stat.label} stat={stat} loading={loading} />
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className={cn('flex min-h-11 flex-1 items-center gap-2 rounded-xl border px-3', isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.035]')}>
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, room, phone, email, locator, document or status"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={cn(activeFilter === filter.key ? ui.button(isLight, 'active') : ui.button(isLight, 'small'), 'rounded-full')}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className={cn('rounded-xl border p-4 text-sm', isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-300/20 bg-red-500/10 text-red-100')}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className={cn('rounded-xl border p-4 text-sm', isLight ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-sky-300/20 bg-sky-300/10 text-sky-100')}>
          {notice}
        </div>
      ) : null}

      <div className="grid min-h-[640px] gap-5 xl:grid-cols-[minmax(320px,0.44fr)_minmax(0,0.56fr)]">
        <ReservationList
          reservations={reservations}
          selectedId={selectedReservation?.id}
          onSelect={handleSelect}
          loading={loading}
          hotelName={hotel?.name}
        />
        <ReservationDetail
          reservation={selectedReservation}
          loading={loading}
          role={role}
          note={note}
          setNote={setNote}
          onCopyPhone={copyPhone}
          onAddNote={() => submitReceptionAction('add_note')}
          onMarkAttention={() => submitReceptionAction('mark_needs_attention')}
        />
      </div>
    </section>
  );
};

const MetricCard = ({ stat, loading }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const Icon = stat.icon;

  return (
    <div className={cn(ui.row(isLight), 'p-4')}>
      <div className="flex items-center justify-between gap-3">
        <p className={ui.text.eyebrow(isLight)}>{stat.label}</p>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', ui.badge(isLight, stat.tone, true))}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className={cn('mt-4 text-3xl font-semibold tabular-nums', ui.text.title(isLight))}>{loading ? '...' : stat.value}</p>
    </div>
  );
};

const ReservationList = ({ reservations, selectedId, onSelect, loading, hotelName }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn('min-h-0 rounded-2xl border p-4', ui.surface(isLight))}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className={ui.text.eyebrow(isLight)}>Reservation finder</p>
          <h3 className={cn('mt-1 text-lg', ui.text.title(isLight))}>{hotelName || 'Hotel'} guests</h3>
        </div>
        <Badge tone="slate">{reservations.length}</Badge>
      </div>
      {loading ? (
        <SkeletonList />
      ) : reservations.length ? (
        <div className="max-h-[780px] space-y-3 overflow-y-auto pr-1">
          {reservations.map((reservation) => (
            <button
              key={reservation.id}
              type="button"
              onClick={() => onSelect(reservation.id)}
              className={cn(
                'w-full rounded-xl border p-4 text-left transition hover:-translate-y-0.5',
                selectedId === reservation.id
                  ? isLight
                    ? 'border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-100'
                    : 'border-emerald-300/25 bg-emerald-300/10'
                  : isLight
                    ? 'border-slate-200 bg-slate-50 hover:bg-white'
                    : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.055]'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn('truncate text-sm font-semibold', ui.text.title(isLight))}>{reservation.guestName}</p>
                  <p className={cn('mt-1 truncate text-xs', ui.text.muted(isLight))}>
                    Room {compactText(reservation.roomNumber)} - {compactText(reservation.roomType, 'Room type unavailable')}
                  </p>
                </div>
                <Badge tone={readinessTone(reservation.readiness?.status)}>
                  {reservation.readiness?.score || 0}%
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={statusTone(reservation.reservationStatus)}>
                  {statusLabels[reservation.reservationStatus] || reservation.reservationStatus}
                </Badge>
                {reservation.vip ? <Badge tone="violet">VIP</Badge> : null}
                {reservation.language ? <Badge tone="sky">{String(reservation.language).toUpperCase()}</Badge> : null}
                {reservation.readiness?.alerts?.length ? <Badge tone="amber">{reservation.readiness.alerts.length} alerts</Badge> : null}
              </div>
              <div className={cn('mt-3 grid gap-2 text-xs sm:grid-cols-2', ui.text.muted(isLight))}>
                <span>In: {formatDate(reservation.arrivalDate)}</span>
                <span>Out: {formatDate(reservation.departureDate)}</span>
                <span>{compactText(reservation.phone, 'No phone')}</span>
                <span>{compactText(reservation.locator, 'No locator')}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title="No reservations found."
          description="Try another name, room, phone, locator or quick filter."
        />
      )}
    </div>
  );
};

const ReservationDetail = ({
  reservation,
  loading,
  role,
  note,
  setNote,
  onCopyPhone,
  onAddNote,
  onMarkAttention
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  if (loading) {
    return (
      <div className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
        <SkeletonList />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
        <EmptyState
          icon={ClipboardList}
          title="Select a reservation."
          description="Reservation details, readiness and connected Staynex data will appear here."
        />
      </div>
    );
  }

  const canOpenConversation = Boolean(reservation.connectedData?.conversation?.id);
  const canViewQr = Boolean(reservation.roomNumber);

  return (
    <div className={cn('rounded-2xl border p-5', ui.surface(isLight))}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className={ui.text.eyebrow(isLight)}>Reservation detail</p>
          <h3 className={cn('mt-2 text-2xl', ui.text.title(isLight))}>{reservation.guestName}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={readinessTone(reservation.readiness?.status)}>
              {readinessLabels[reservation.readiness?.status] || 'Needs attention'} - {reservation.readiness?.score || 0}%
            </Badge>
            <Badge tone={statusTone(reservation.reservationStatus)}>
              {statusLabels[reservation.reservationStatus] || reservation.reservationStatus}
            </Badge>
            <Badge tone="slate">{role}</Badge>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-72">
          <ActionLink href={canOpenConversation ? `/dashboard/inbox?conversationId=${reservation.connectedData.conversation.id}` : null} icon={Inbox} label="Open WhatsApp conversation" />
          <ActionLink href="/dashboard/tickets" icon={TicketCheck} label="Create ticket" />
          <ActionButton onClick={onCopyPhone} icon={Copy} label="Copy guest phone" disabled={!reservation.phone} />
          <ActionLink href={canViewQr ? `/dashboard/qr-rooms?room=${encodeURIComponent(reservation.roomNumber)}` : null} icon={QrCode} label="View room QR" />
          <ActionLink href="/dashboard/experience-bookings" icon={CalendarCheck} label="View experience bookings" />
          <ActionLink href={reservation.connectedData?.tickets?.[0]?.id ? `/dashboard/tickets/${reservation.connectedData.tickets[0].id}` : '/dashboard/tickets'} icon={MessageSquareText} label="Open related tickets" />
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <DetailPanel title="Guest profile" icon={UserRound}>
          <DetailGrid rows={[
            ['Phone', compactText(reservation.phone, 'Unavailable')],
            ['Email', compactText(reservation.email, 'Unavailable')],
            ['Language', reservation.language ? String(reservation.language).toUpperCase() : 'Unavailable'],
            ['Country', compactText(reservation.country, 'Unavailable')],
            ['DNI / passport', reservation.document?.available ? reservation.document.masked : 'Not received'],
            ['VIP', reservation.vip ? `Yes${reservation.vipScore ? ` - ${reservation.vipScore}` : ''}` : 'No']
          ]} />
          {reservation.preferences?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {reservation.preferences.map((preference) => <Badge key={preference} tone="sky">{preference}</Badge>)}
            </div>
          ) : null}
        </DetailPanel>

        <DetailPanel title="Reservation details" icon={BedDouble}>
          <DetailGrid rows={[
            ['Locator', compactText(reservation.locator)],
            ['Check-in', formatDate(reservation.arrivalDate)],
            ['Check-out', formatDate(reservation.departureDate)],
            ['Estimated arrival', compactText(reservation.estimatedArrivalTime, 'Unknown')],
            ['Room', compactText(reservation.roomNumber, 'Unassigned')],
            ['Room type', compactText(reservation.roomType, 'Unavailable')],
            ['Guests', `${reservation.guestsCount || 1} total - ${reservation.adults ?? '-'} adults - ${reservation.children ?? 0} children`],
            ['Channel', compactText(reservation.bookingChannel, 'Unavailable')],
            ['PMS', compactText(reservation.pmsProvider, 'Not connected')]
          ]} />
        </DetailPanel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <DetailPanel title="Check-in readiness" icon={ShieldCheck}>
          <div className="space-y-2">
            {(reservation.readiness?.checks || []).map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </div>
        </DetailPanel>

        <DetailPanel title="Check-out readiness" icon={CreditCard}>
          <DetailGrid rows={[
            ['Outstanding balance', reservation.checkout?.folioAvailable ? formatCurrency(reservation.checkout.outstandingBalance, reservation.checkout.currency) : 'Folio not available from PMS.'],
            ['Folio data quality', compactText(reservation.checkout?.folioDataQuality, 'Unavailable')],
            ['Folio last updated', formatDateTime(reservation.checkout?.folioLastUpdatedAt)],
            ['Open tickets', reservation.checkout?.openTickets || 0],
            ['Late checkout eligible', reservation.checkout?.lateCheckout ? 'Yes' : 'No'],
            ['Pending messages', reservation.checkout?.pendingMessages || 0]
          ]} />
          {reservation.checkout?.folioPreview ? (
            <div className={cn('mt-3 rounded-xl border p-3 text-sm leading-6', isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
              {reservation.checkout.folioPreview}
            </div>
          ) : null}
          {reservation.checkout?.folioWarnings?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {reservation.checkout.folioWarnings.map((warning) => <Badge key={warning} tone="amber">{warning}</Badge>)}
            </div>
          ) : null}
        </DetailPanel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.54fr)_minmax(0,0.46fr)]">
        <DetailPanel title="Connected Staynex data" icon={Sparkles}>
          <DetailGrid rows={[
            ['WhatsApp conversation', reservation.connectedData?.conversation?.id ? 'Linked' : 'Not linked'],
            ['Open tickets', reservation.connectedData?.tickets?.length || 0],
            ['Guest memory', reservation.connectedData?.guestMemory?.length || 0],
            ['Experience bookings', reservation.connectedData?.experienceBookings?.length || 0],
            ['Revenue potential', reservation.connectedData?.revenueOpportunities?.revenuePotential || 0],
            ['Upgrade eligible', reservation.connectedData?.revenueOpportunities?.upgradeEligible ? 'Yes' : 'No']
          ]} />
          {reservation.connectedData?.notes ? (
            <div className={cn('mt-3 rounded-xl border p-3 text-sm leading-6 whitespace-pre-wrap', isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-white/10 bg-white/[0.025] text-slate-400')}>
              {reservation.connectedData.notes}
            </div>
          ) : null}
        </DetailPanel>

        <DetailPanel title="Safe reception actions" icon={FileText}>
          <p className={cn('text-sm leading-6', ui.text.body(isLight))}>
            Notes and attention marks stay inside Staynex. This does not edit PMS check-in data or send documents by WhatsApp.
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add an internal operational note"
            className={cn('mt-3 min-h-28 w-full resize-y', ui.input(isLight))}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onAddNote} disabled={!note.trim()} className={ui.button(isLight, 'secondary')}>
              Add internal note
            </button>
            <button type="button" onClick={onMarkAttention} className={ui.button(isLight, 'secondary')}>
              Mark as needs attention
            </button>
          </div>
        </DetailPanel>
      </div>
    </div>
  );
};

const DetailPanel = ({ title, icon: Icon, children }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section className={cn('rounded-xl border p-4', isLight ? 'border-slate-200 bg-slate-50/70' : 'border-white/10 bg-white/[0.025]')}>
      <div className="mb-4 flex items-center gap-3">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', isLight ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-sky-300/20 bg-sky-300/10 text-sky-100')}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h4 className={cn('text-sm', ui.text.title(isLight))}>{title}</h4>
      </div>
      {children}
    </section>
  );
};

const DetailGrid = ({ rows }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className={cn('rounded-lg border p-3', isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-black/10')}>
          <dt className={ui.text.eyebrow(isLight)}>{label}</dt>
          <dd className={cn('mt-1 break-words text-sm font-semibold', ui.text.title(isLight))}>{value}</dd>
        </div>
      ))}
    </dl>
  );
};

const CheckRow = ({ check }) => {
  const tone = check.status === 'ok' ? 'emerald' : check.status === 'attention' ? 'amber' : check.status === 'missing' ? 'red' : 'slate';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-black/10">
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        {check.status === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />}
        <span className="truncate">{check.label}</span>
      </span>
      <Badge tone={tone}>{check.status.replaceAll('_', ' ')}</Badge>
    </div>
  );
};

const Badge = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  return <span className={ui.badge(theme === 'light', tone, true)}>{children}</span>;
};

const ActionLink = ({ href, icon: Icon, label }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  if (!href) {
    return <DisabledAction icon={Icon} label={label} />;
  }

  return (
    <Link href={href} className={cn(ui.button(isLight, 'secondary'), 'justify-between text-xs')}>
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </Link>
  );
};

const ActionButton = ({ onClick, icon: Icon, label, disabled = false }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(ui.button(isLight, 'secondary'), 'justify-between text-xs')}>
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
    </button>
  );
};

const DisabledAction = ({ icon: Icon, label }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <span className={cn(ui.button(isLight, 'secondary'), 'justify-start text-xs opacity-50')}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
};

const EmptyState = ({ icon: Icon, title, description }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={cn('rounded-xl border border-dashed p-6 text-center', isLight ? 'border-slate-300 bg-slate-50' : 'border-white/10 bg-white/[0.02]')}>
      <span className={cn('mx-auto flex h-10 w-10 items-center justify-center rounded-xl border', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className={cn('mt-3 text-sm font-semibold', ui.text.title(isLight))}>{title}</p>
      <p className={cn('mt-1', ui.text.muted(isLight))}>{description}</p>
    </div>
  );
};

const SkeletonList = () => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className={cn('h-24 rounded-xl', ui.skeleton(isLight))} />
      ))}
    </div>
  );
};
