'use client';

import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Hotel,
  Mail,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  UserPlus,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { canAccess } from '@/lib/permissions';
import { PremiumEmptyState } from './PremiumEmptyState';
import { DataTableShell } from './DataTableShell';
import { cn, ui } from '@/lib/ui/styles';

const filterOptions = [
  { key: 'upcoming', labelKey: 'reservations.filters.upcoming' },
  { key: 'in_house', labelKey: 'reservations.filters.inHouse' },
  { key: 'completed', labelKey: 'reservations.filters.completed' },
  { key: 'today_arrivals', labelKey: 'reservations.filters.todayArrivals' },
  { key: 'today_departures', labelKey: 'reservations.filters.todayDepartures' }
];

const todayKey = () => new Date().toISOString().slice(0, 10);

const addDaysKey = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const addDaysToDate = (dateValue, days) => {
  if (!dateValue) {
    return null;
  }

  const date = new Date(`${dateValue}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value}T12:00:00`));
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const getStayStatus = (reservation) => {
  const today = todayKey();
  const arrival = reservation.arrival_date;
  const departure = reservation.departure_date;
  const rawStatus = String(reservation.status || '').toLowerCase();

  if (['completed', 'checked_out'].includes(rawStatus) || (departure && departure < today)) {
    return 'completed';
  }

  if (arrival && departure && arrival <= today && departure >= today) {
    return 'in_house';
  }

  return 'upcoming';
};

const getJourneyStatus = (reservation) => {
  if (reservation.computedJourneyStatus) {
    return reservation.computedJourneyStatus;
  }

  const today = todayKey();

  if (reservation.departure_date && today > reservation.departure_date) {
    return 'post_stay';
  }

  if (
    reservation.arrival_date
    && reservation.departure_date
    && today >= reservation.arrival_date
    && today <= reservation.departure_date
  ) {
    return 'in_house';
  }

  return 'pre_arrival';
};

const statusTone = (status) => {
  if (status === 'in_house' || status === 'linked') {
    return 'emerald';
  }

  if (status === 'completed' || status === 'post_stay' || status === 'not_linked') {
    return 'slate';
  }

  if (status === 'pre_arrival') {
    return 'amber';
  }

  return 'sky';
};

const buildEmailSnippet = (reservation) => (
  reservation.whatsapp_link
    ? [
      `Hola ${reservation.guest_name?.split(' ')[0] || reservation.guest_name || ''},`.trim(),
      '',
      `Tu reserva en ${reservation.hotel?.name || reservation.hotel_name || 'nuestro hotel'} está confirmada.`,
      '',
      'Para hablar con nuestro asistente por WhatsApp antes de tu llegada:',
      reservation.whatsapp_link,
      '',
      'También puedes escribir directamente usando tu código:',
      reservation.reservation_access_token || '-',
      '',
      'Nos vemos pronto :)'
    ].join('\n')
    : ''
);

const isPreStayTestReservation = (reservation) => (
  reservation.source === 'demo_web_booking'
  || reservation.pms_provider === 'demo_web_booking'
);

const generate7DayPreArrivalPreview = (reservation) => {
  const guestName = reservation.guest_name?.split(' ')[0] || 'there';
  const details = [
    reservation.room_type ? `Room type: ${reservation.room_type}.` : null,
    reservation.board_basis ? `Board basis: ${reservation.board_basis}.` : null
  ].filter(Boolean).join(' ');

  return [
    `Hola ${guestName} 👋`,
    `Estamos deseando recibirte el ${reservation.arrival_date || 'dia de tu llegada'}.`,
    details,
    '¿Necesitas parking, transfer o recomendaciones?'
  ].filter(Boolean).join('\n');
};

const generate1DayPreArrivalPreview = (reservation) => {
  const guestName = reservation.guest_name?.split(' ')[0] || 'there';

  return [
    `Hola ${guestName} 😊`,
    'Tu llegada es mañana.',
    reservation.room_type ? `Tu reserva es para ${reservation.room_type}.` : null,
    'Puedes escribirnos directamente por este chat para cualquier cosa.'
  ].filter(Boolean).join('\n');
};

const buildAutomationPreview = (reservation) => {
  const storedEvents = reservation.automation_events || [];

  if (storedEvents.length > 0) {
    return storedEvents;
  }

  return [
    { id: 'booking_confirmation', event_type: 'booking_confirmation', scheduled_for: new Date().toISOString(), channel: 'email', status: 'scheduled' },
    { id: 'pre_arrival_7_days', event_type: 'pre_arrival_7_days', scheduled_for: addDaysToDate(reservation.arrival_date, -7), channel: 'email', status: reservation.arrival_date ? 'scheduled' : 'pending_date' },
    { id: 'pre_arrival_1_day', event_type: 'pre_arrival_1_day', scheduled_for: addDaysToDate(reservation.arrival_date, -1), channel: 'email', status: reservation.arrival_date ? 'scheduled' : 'pending_date' },
    { id: 'post_stay_review', event_type: 'post_stay_review', scheduled_for: addDaysToDate(reservation.departure_date, 1), channel: 'email', status: reservation.departure_date ? 'scheduled' : 'pending_date' },
    { id: 'post_stay_discount', event_type: 'post_stay_discount', scheduled_for: addDaysToDate(reservation.departure_date, 14), channel: 'email', status: reservation.departure_date ? 'scheduled' : 'pending_date' }
  ];
};

const matchesFilter = (reservation, filter) => {
  const status = getStayStatus(reservation);
  const today = todayKey();

  if (filter === 'today_arrivals') {
    return reservation.arrival_date === today;
  }

  if (filter === 'today_departures') {
    return reservation.departure_date === today;
  }

  return status === filter;
};

const matchesSearch = (reservation, search) => {
  const query = search.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    reservation.guest_name,
    reservation.guest_email,
    reservation.guest_phone,
    reservation.pms_reservation_id,
    reservation.reservation_access_token
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
};

const Card = ({ children, className = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section
      className={cn(
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
    <span className={ui.badge(isLight, tone, true)}>
      {children}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>
            {label}
          </p>
          <p className={isLight ? 'mt-3 text-3xl font-semibold text-slate-950' : 'mt-3 text-3xl font-semibold text-white'}>
            {value}
          </p>
        </div>
        <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700' : 'flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
};

const DetailRow = ({ label, value }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <div className={isLight ? 'border-b border-slate-200 py-3 last:border-0' : 'border-b border-white/10 py-3 last:border-0'}>
      <dt className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>
        {label}
      </dt>
      <dd className={isLight ? 'mt-1 break-words text-sm leading-6 text-slate-900' : 'mt-1 break-words text-sm leading-6 text-slate-100'}>
        {value === null || value === undefined || value === '' ? '-' : String(value)}
      </dd>
    </div>
  );
};

const initialTestReservationForm = () => {
  const arrival = new Date();
  arrival.setDate(arrival.getDate() + 14);
  const departure = new Date(arrival);
  departure.setDate(departure.getDate() + 4);

  return {
    guest_name: 'Laura Garcia',
    guest_email: 'laura@example.com',
    guest_phone: '+34600000000',
    arrival_date: arrival.toISOString().slice(0, 10),
    departure_date: departure.toISOString().slice(0, 10),
    adults: 2,
    children: 0,
    room_type: 'Deluxe',
    rate_plan: 'Breakfast included',
    board_basis: 'breakfast',
    notes: 'Pre-stay simulator booking'
  };
};

const TestReservationModal = ({
  open,
  onClose,
  onCreated,
  copyValue,
  copiedAction,
  hotel
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [form, setForm] = useState(initialTestReservationForm);
  const [createdReservation, setCreatedReservation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!open) {
    return null;
  }

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/reservations/create-test', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not create reservation');
      }

      const reservationWithHotel = {
        ...body.reservation,
        hotel: body.hotel || hotel || null,
        hotel_name: body.hotel?.name || hotel?.name || null,
        automation_events: body.automation_events || []
      };

      setCreatedReservation(reservationWithHotel);
      onCreated(reservationWithHotel);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = isLight
    ? 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-300'
    : 'w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/30';
  const labelClass = isLight
    ? 'mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'
    : 'mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <section className={[
        'max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border shadow-2xl',
        isLight
          ? 'border-slate-200 bg-white text-slate-950 shadow-slate-300/80'
          : 'border-white/10 bg-[#0b1019] text-white shadow-black/40'
      ].join(' ')}
      >
        <div className={isLight ? 'flex items-center justify-between border-b border-slate-200 px-5 py-4' : 'flex items-center justify-between border-b border-white/10 px-5 py-4'}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">PRE-STAY TEST</p>
            <h2 className="mt-2 text-xl font-semibold">Create Test Reservation</h2>
            <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-400'}>
              Uses the same PMS webhook, reservation token and automation flow as a real integration.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={isLight ? 'rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-950' : 'rounded-lg border border-white/10 bg-white/[0.035] p-2 text-slate-400 hover:bg-white/[0.08] hover:text-white'}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form className="space-y-5 p-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['guest_name', 'Guest name', 'text'],
              ['guest_email', 'Guest email', 'email'],
              ['guest_phone', 'Guest phone', 'tel'],
              ['room_type', 'Room type', 'text'],
              ['rate_plan', 'Rate plan', 'text'],
              ['board_basis', 'Board basis', 'text'],
              ['arrival_date', 'Arrival date', 'date'],
              ['departure_date', 'Departure date', 'date'],
              ['adults', 'Adults', 'number'],
              ['children', 'Children', 'number']
            ].map(([field, label, type]) => (
              <label key={field} className="block">
                <span className={labelClass}>{label}</span>
                <input
                  type={type}
                  min={type === 'number' ? 0 : undefined}
                  required={!['children'].includes(field)}
                  value={form[field]}
                  onChange={(event) => updateField(field, event.target.value)}
                  className={inputClass}
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className={labelClass}>Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              className={`${inputClass} min-h-24 resize-y`}
            />
          </label>

          {error ? (
            <div className={isLight ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800' : 'rounded-lg border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100'}>
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={isLight ? 'text-xs leading-5 text-slate-500' : 'text-xs leading-5 text-slate-500'}>
              Future Mews, Cloudbeds and Opera webhooks will reuse this same internal reservation creation path.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200/50 bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60"
            >
              <UserPlus className={submitting ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} aria-hidden="true" />
              {submitting ? 'Creating...' : 'Create Test Reservation'}
            </button>
          </div>
        </form>

        {createdReservation ? (
          <div className={isLight ? 'border-t border-slate-200 bg-emerald-50/60 p-5' : 'border-t border-white/10 bg-emerald-300/[0.06] p-5'}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="amber">PRE-STAY TEST</Badge>
              <Badge tone="emerald">{createdReservation.reservation_access_token}</Badge>
            </div>
            <p className={isLight ? 'text-sm text-slate-700' : 'text-sm text-slate-300'}>
              Reservation created with real token onboarding and PMS automation events.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyValue({ key: 'modal-token', value: createdReservation.reservation_access_token })}
                className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]'}
              >
                {copiedAction === 'modal-token' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy Token
              </button>
              <button
                type="button"
                onClick={() => copyValue({ key: 'modal-link', value: createdReservation.whatsapp_link })}
                className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]'}
              >
                {copiedAction === 'modal-link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy WhatsApp Link
              </button>
              <button
                type="button"
                onClick={() => copyValue({ key: 'modal-email', value: buildEmailSnippet(createdReservation) })}
                className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]'}
              >
                {copiedAction === 'modal-email' ? <Check className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                Copy Email Snippet
              </button>
              {createdReservation.whatsapp_link ? (
                <a
                  href={createdReservation.whatsapp_link}
                  target="_blank"
                  rel="noreferrer"
                  className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100' : 'inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/15'}
                >
                  <Send className="h-3.5 w-3.5" />
                  Open WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};

const ReservationDetail = ({ reservation, onClose }) => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  if (!reservation) {
    return (
      <Card className="hidden min-h-[520px] p-5 xl:block">
        <div className={isLight ? 'flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500' : 'flex h-full items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.025] text-center text-sm text-slate-500'}>
          {t('reservations.selectReservation')}
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className={isLight ? 'flex items-center justify-between gap-3 border-b border-slate-200 p-5' : 'flex items-center justify-between gap-3 border-b border-white/10 p-5'}>
        <div>
          <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700' : 'text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300'}>
            {t('reservations.detailTitle')}
          </p>
          <h2 className={isLight ? 'mt-2 text-lg font-semibold text-slate-950' : 'mt-2 text-lg font-semibold text-white'}>
            {reservation.guest_name || t('reservations.unknownGuest')}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={isLight ? 'rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 xl:hidden' : 'rounded-lg border border-white/10 bg-white/[0.035] p-2 text-slate-400 transition hover:bg-white/[0.08] hover:text-white xl:hidden'}
          aria-label={t('reservations.closeDetail')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <dl className="p-5">
        <DetailRow label={t('reservations.columns.guest')} value={reservation.guest_name} />
        <DetailRow label={t('reservations.columns.email')} value={reservation.guest_email} />
        <DetailRow label={t('reservations.columns.phone')} value={reservation.guest_phone} />
        <DetailRow label={t('reservations.columns.arrival')} value={formatDate(reservation.arrival_date)} />
        <DetailRow label={t('reservations.columns.departure')} value={formatDate(reservation.departure_date)} />
        <DetailRow label={t('reservations.columns.roomType')} value={reservation.room_type} />
        <DetailRow label={t('reservations.columns.ratePlan')} value={reservation.rate_plan} />
        <DetailRow label={t('reservations.columns.boardBasis')} value={reservation.board_basis} />
        <DetailRow label="Source" value={reservation.source || reservation.pms_provider} />
        <DetailRow label="Adults" value={reservation.adults} />
        <DetailRow label="Children" value={reservation.children} />
        <DetailRow label="Notes" value={reservation.notes} />
        <DetailRow label={t('reservations.columns.status')} value={reservation.status} />
        <DetailRow label={t('reservations.columns.journey')} value={t(`reservations.journey.${getJourneyStatus(reservation)}`)} />
        <DetailRow label={t('reservations.columns.pmsProvider')} value={reservation.pms_provider} />
        <DetailRow label={t('reservations.columns.pmsReservationId')} value={reservation.pms_reservation_id} />
        <DetailRow label={t('reservations.columns.accessToken')} value={reservation.reservation_access_token} />
        <DetailRow label={t('reservations.columns.whatsappLink')} value={reservation.whatsapp_link} />
        <DetailRow label={t('reservations.columns.linkedConversation')} value={reservation.conversationId ? t('reservations.linked') : t('reservations.notLinked')} />
        <DetailRow label="created_at" value={formatDateTime(reservation.created_at)} />
      </dl>

      <div className={isLight ? 'border-t border-slate-200 p-5' : 'border-t border-white/10 p-5'}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>
            {t('reservations.upcomingAutomations')}
          </h3>
          <Badge tone="sky">{buildAutomationPreview(reservation).length}</Badge>
        </div>

        <div className="space-y-3">
          {buildAutomationPreview(reservation).map((event) => (
              <div
                key={event.id}
                className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white/[0.035] p-3'}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={isLight ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-slate-100'}>
                    {event.event_type}
                  </p>
                  <Badge tone={event.status === 'scheduled' ? 'emerald' : 'slate'}>{event.status}</Badge>
                </div>
                <p className={isLight ? 'mt-2 text-xs text-slate-500' : 'mt-2 text-xs text-slate-500'}>
                  {event.channel} · {formatDateTime(event.scheduled_for)}
                </p>
              </div>
          ))}
        </div>
      </div>

      <div className={isLight ? 'border-t border-slate-200 p-5' : 'border-t border-white/10 p-5'}>
        <h3 className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>
          {t('reservations.preArrivalPreviews')}
        </h3>
        <div className="mt-4 space-y-3">
          {[
            { label: t('reservations.preview7Day'), value: generate7DayPreArrivalPreview(reservation) },
            { label: t('reservations.preview1Day'), value: generate1DayPreArrivalPreview(reservation) }
          ].map((item) => (
            <div
              key={item.label}
              className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-black/20 p-3'}
            >
              <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.12em] text-slate-500'}>
                {item.label}
              </p>
              <p className={isLight ? 'mt-2 whitespace-pre-line text-sm leading-6 text-slate-800' : 'mt-2 whitespace-pre-line text-sm leading-6 text-slate-200'}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export const ReservationsClient = () => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [reservations, setReservations] = useState([]);
  const [activeFilter, setActiveFilter] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [copiedAction, setCopiedAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentHotel, setCurrentHotel] = useState(null);
  const [currentRole, setCurrentRole] = useState('receptionist');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const loadRequestIdRef = useRef(0);
  const activeHotelIdRef = useRef(null);

  const loadReservations = async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setReservations([]);
    setSelectedReservation(null);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/reservations', {
        headers,
        cache: 'no-store'
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || t('reservations.errors.loadFailed'));
      }

      if (!shouldAcceptTenantPayload(payload, 'reservations')) {
        return;
      }

      const nextHotelId = payload.hotel?.id || null;

      if (requestId !== loadRequestIdRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale response ignored', { surface: 'reservations', hotelId: nextHotelId });
        }
        return;
      }

      if (activeHotelIdRef.current && nextHotelId && activeHotelIdRef.current !== nextHotelId && process.env.NODE_ENV !== 'production') {
        console.info('state reset for hotel', { surface: 'reservations', hotelId: nextHotelId });
      }

      activeHotelIdRef.current = nextHotelId;
      setCurrentHotel(payload.hotel || null);
      setCurrentRole(payload.role || 'receptionist');
      const nextReservations = (payload.reservations || []).map((reservation) => ({
        ...reservation,
        hotel: payload.hotel || null,
        hotel_name: payload.hotel?.name || null
      }));
      setReservations(nextReservations);
      setSelectedReservation((current) => {
        if (!current) {
          return nextReservations[0] || null;
        }

        return nextReservations.find((reservation) => reservation.id === current.id) || nextReservations[0] || null;
      });
    } catch (loadError) {
      console.error('Reservations fetch failed', loadError);
      setError(loadError.message);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadReservations();
  }, []);

  const stats = useMemo(() => {
    const today = todayKey();
    const soon = addDaysKey(7);

    return {
      total: reservations.length,
      arrivingSoon: reservations.filter((reservation) => (
        reservation.arrival_date
        && reservation.arrival_date >= today
        && reservation.arrival_date <= soon
      )).length,
      stayingNow: reservations.filter((reservation) => getStayStatus(reservation) === 'in_house').length,
      completed: reservations.filter((reservation) => getStayStatus(reservation) === 'completed').length
    };
  }, [reservations]);

  const filteredReservations = useMemo(() => (
    reservations.filter((reservation) => (
      matchesFilter(reservation, activeFilter)
      && matchesSearch(reservation, search)
    ))
  ), [reservations, activeFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, search, pageSize, reservations.length]);

  const paginatedReservations = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredReservations.slice(start, start + pageSize);
  }, [filteredReservations, page, pageSize]);

  const canManageReservations = canAccess(currentRole, 'reservations_manage');

  const copyValue = async ({ key, value }) => {
    if (!value) {
      return;
    }

    await window.navigator.clipboard.writeText(value);
    setCopiedAction(key);
    window.setTimeout(() => setCopiedAction(null), 1600);
  };

  const handleTestReservationCreated = (reservation) => {
    const nextReservation = {
      ...reservation,
      hotel: currentHotel,
      hotel_name: currentHotel?.name || null,
      automation_events: reservation.automation_events || []
    };

    setReservations((current) => [nextReservation, ...current.filter((item) => item.id !== reservation.id)]);
    setSelectedReservation(nextReservation);
    loadReservations();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
            {t('screens.operations')}
          </p>
          <h1 className={isLight ? 'mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl' : 'mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl'}>
            {t('screens.reservations')}
          </h1>
          <p className={isLight ? 'mt-3 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-3 max-w-2xl text-sm leading-6 text-slate-400'}>
            {t('screens.reservationsDescription')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManageReservations ? (
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200/50 bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-200"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Create Test Reservation
            </button>
          ) : null}
          <button
            type="button"
            onClick={loadReservations}
            className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white'}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('buttons.refresh')}
          </button>
        </div>
      </div>

      {canManageReservations ? (
        <TestReservationModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreated={handleTestReservationCreated}
          copyValue={copyValue}
          copiedAction={copiedAction}
          hotel={currentHotel}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Hotel} label={t('reservations.stats.total')} value={stats.total} />
        <StatCard icon={CalendarClock} label={t('reservations.stats.arrivingSoon')} value={stats.arrivingSoon} />
        <StatCard icon={CalendarCheck} label={t('reservations.stats.stayingNow')} value={stats.stayingNow} />
        <StatCard icon={CheckCircle2} label={t('reservations.stats.completedStays')} value={stats.completed} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((item) => {
              const active = activeFilter === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveFilter(item.key)}
                  className={[
                    'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                    isLight
                      ? active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-100'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                      : active
                        ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                        : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.08] hover:text-slate-100'
                  ].join(' ')}
                >
                  {t(item.labelKey)}
                </button>
              );
            })}
          </div>

          <label className={isLight ? 'flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500 xl:w-96' : 'flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-slate-500 xl:w-96'}>
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('reservations.searchPlaceholder')}
              className={isLight ? 'min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400' : 'min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600'}
            />
          </label>
        </div>
      </Card>

      {error ? (
        <Card className={isLight ? 'border-red-200 bg-red-50 p-5 text-red-800' : 'border-red-300/20 bg-red-500/10 p-5 text-red-100'}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t('reservations.errors.title')}</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <div className={isLight ? 'border-b border-slate-200 px-5 py-4' : 'border-b border-white/10 px-5 py-4'}>
            <p className={isLight ? 'text-sm font-semibold text-slate-700' : 'text-sm font-semibold text-slate-300'}>
              {t('reservations.results', { count: filteredReservations.length })}
            </p>
          </div>

          {loading ? (
            <div className="space-y-3 p-5" aria-label={t('reservations.loading')}>
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className={`${ui.skeleton(isLight)} h-14 w-full`} />
              ))}
            </div>
          ) : filteredReservations.length === 0 ? (
            <PremiumEmptyState
              icon={CalendarDays}
              title={reservations.length === 0 ? t('reservations.empty') : t('reservations.noMatches')}
              description="Create a test reservation or sync your PMS to start the pre-stay flow."
              className="m-4"
            />
          ) : (
            <DataTableShell
              minWidth={1600}
              totalItems={filteredReservations.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            >
              <table className="w-full text-left">
                <thead className={isLight ? 'sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500 shadow-sm shadow-slate-200/60' : 'sticky top-0 z-10 bg-[#0f1622] text-xs uppercase tracking-[0.12em] text-slate-500 shadow-sm shadow-black/20'}>
                  <tr>
                    <th className={isLight ? 'sticky left-0 z-20 bg-slate-50 px-4 py-3 font-semibold shadow-[8px_0_16px_-14px_rgba(15,23,42,0.45)]' : 'sticky left-0 z-20 bg-[#0f1622] px-4 py-3 font-semibold shadow-[8px_0_16px_-14px_rgba(0,0,0,0.9)]'}>{t('reservations.columns.guest')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.email')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.phone')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.arrival')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.departure')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.roomType')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.ratePlan')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.boardBasis')}</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.status')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.journey')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.linkedConversation')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.pmsProvider')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.accessToken')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.whatsapp')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.automations')}</th>
                  </tr>
                </thead>
                <tbody className={isLight ? 'divide-y divide-slate-200' : 'divide-y divide-white/10'}>
                  {paginatedReservations.map((reservation) => {
                    const stayStatus = getStayStatus(reservation);
                    const journeyStatus = getJourneyStatus(reservation);
                    const selected = selectedReservation?.id === reservation.id;

                    return (
                      <tr
                        key={reservation.id}
                        onClick={() => setSelectedReservation(reservation)}
                        className={[
                          'cursor-pointer align-top transition',
                          isLight
                            ? selected
                              ? 'bg-emerald-50/80'
                              : 'hover:bg-slate-50'
                            : selected
                              ? 'bg-emerald-300/[0.06]'
                              : 'hover:bg-white/[0.035]'
                        ].join(' ')}
                      >
                        <td className={isLight ? 'sticky left-0 z-10 bg-inherit px-4 py-4 text-sm font-semibold text-slate-900 shadow-[8px_0_16px_-14px_rgba(15,23,42,0.45)]' : 'sticky left-0 z-10 bg-inherit px-4 py-4 text-sm font-semibold text-slate-100 shadow-[8px_0_16px_-14px_rgba(0,0,0,0.9)]'}>
                          {reservation.guest_name || t('reservations.unknownGuest')}
                          <p className={isLight ? 'mt-1 text-xs font-normal text-slate-500' : 'mt-1 text-xs font-normal text-slate-500'}>
                            {reservation.pms_reservation_id}
                          </p>
                          {isPreStayTestReservation(reservation) ? (
                            <span className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">
                              PRE-STAY TEST
                            </span>
                          ) : null}
                        </td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.guest_email || '-'}</td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.guest_phone || '-'}</td>
                        <td className={isLight ? 'whitespace-nowrap px-4 py-4 text-sm text-slate-700' : 'whitespace-nowrap px-4 py-4 text-sm text-slate-300'}>{formatDate(reservation.arrival_date)}</td>
                        <td className={isLight ? 'whitespace-nowrap px-4 py-4 text-sm text-slate-700' : 'whitespace-nowrap px-4 py-4 text-sm text-slate-300'}>{formatDate(reservation.departure_date)}</td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.room_type || '-'}</td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.rate_plan || '-'}</td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.board_basis || '-'}</td>
                        <td className="px-4 py-4">
                          <Badge tone={isPreStayTestReservation(reservation) ? 'amber' : 'slate'}>
                            {reservation.source || reservation.pms_provider || 'pms'}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone={statusTone(stayStatus)}>{t(`reservations.status.${stayStatus}`)}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone={statusTone(journeyStatus)}>{t(`reservations.journey.${journeyStatus}`)}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone={reservation.conversationId ? 'emerald' : 'slate'}>
                            {reservation.conversationId ? t('reservations.linked') : t('reservations.notLinked')}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge>{reservation.pms_provider || 'mock'}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          {reservation.reservation_access_token ? (
                            <div className="flex items-center gap-2">
                              <Badge tone="amber">{reservation.reservation_access_token}</Badge>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyValue({
                                    key: `token-${reservation.id}`,
                                    value: reservation.reservation_access_token
                                  });
                                }}
                                className={isLight ? 'rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900' : 'rounded-lg border border-white/10 bg-white/[0.035] p-2 text-slate-400 transition hover:bg-white/[0.08] hover:text-white'}
                                title={t('reservations.copyToken')}
                              >
                                {copiedAction === `token-${reservation.id}` ? (
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                              </button>
                            </div>
                          ) : (
                            reservation.conversationId ? (
                              <Link
                                href={`/dashboard/inbox?conversationId=${reservation.conversationId}`}
                                onClick={(event) => event.stopPropagation()}
                                className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100' : 'inline-flex items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/15'}
                              >
                                <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('reservations.openConversation')}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                disabled
                                title={t('reservations.noConversationYet')}
                                onClick={(event) => event.stopPropagation()}
                                className={isLight ? 'inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400' : 'inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-slate-600'}
                              >
                                <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('reservations.openConversation')}
                              </button>
                            )
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {reservation.whatsapp_link ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyValue({
                                    key: `email-${reservation.id}`,
                                    value: buildEmailSnippet(reservation)
                                  });
                                }}
                                className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white'}
                              >
                                {copiedAction === `email-${reservation.id}` ? (
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                {copiedAction === `email-${reservation.id}` ? t('reservations.copied') : t('reservations.copyEmailSnippet')}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyValue({
                                    key: `link-${reservation.id}`,
                                    value: reservation.whatsapp_link
                                  });
                                }}
                                className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white'}
                              >
                                {copiedAction === `link-${reservation.id}` ? (
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                {copiedAction === `link-${reservation.id}` ? t('reservations.copied') : t('reservations.copyWhatsappLink')}
                              </button>
                              <a
                                href={reservation.whatsapp_link}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100' : 'inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/15'}
                              >
                                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('reservations.openWhatsapp')}
                              </a>
                              {reservation.conversationId ? (
                                <Link
                                  href={`/dashboard/inbox?conversationId=${reservation.conversationId}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100' : 'inline-flex items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/15'}
                                >
                                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                                  {t('reservations.openConversation')}
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  title={t('reservations.noConversationYet')}
                                  onClick={(event) => event.stopPropagation()}
                                  className={isLight ? 'inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400' : 'inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-slate-600'}
                                >
                                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                                  {t('reservations.openConversation')}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className={isLight ? 'text-sm text-slate-400' : 'text-sm text-slate-600'}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone="sky">{buildAutomationPreview(reservation).length}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTableShell>
          )}
        </Card>

        <ReservationDetail reservation={selectedReservation} onClose={() => setSelectedReservation(null)} />
      </div>
    </div>
  );
};
