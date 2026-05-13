'use client';

import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Hotel,
  RefreshCw,
  Search,
  Send,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

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

const statusTone = (status) => {
  if (status === 'in_house') {
    return 'emerald';
  }

  if (status === 'completed') {
    return 'slate';
  }

  return 'sky';
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
    reservation.pms_reservation_id
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
};

const Card = ({ children, className = '' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';

  return (
    <section
      className={[
        'rounded-lg border shadow-xl',
        isLight
          ? 'border-slate-200 bg-white text-slate-900 shadow-slate-200/70'
          : 'border-white/10 bg-[#0b1019]/88 text-slate-100 shadow-black/15',
        className
      ].join(' ')}
    >
      {children}
    </section>
  );
};

const Badge = ({ children, tone = 'slate' }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const styles = {
    emerald: isLight
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
    sky: isLight
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : 'border-sky-300/20 bg-sky-400/10 text-sky-100',
    amber: isLight
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    slate: isLight
      ? 'border-slate-200 bg-slate-50 text-slate-700'
      : 'border-white/10 bg-white/[0.045] text-slate-300'
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${styles[tone] || styles.slate}`}>
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
        <DetailRow label={t('reservations.columns.status')} value={reservation.status} />
        <DetailRow label={t('reservations.columns.pmsProvider')} value={reservation.pms_provider} />
        <DetailRow label={t('reservations.columns.pmsReservationId')} value={reservation.pms_reservation_id} />
        <DetailRow label={t('reservations.columns.whatsappLink')} value={reservation.whatsapp_link} />
        <DetailRow label="created_at" value={formatDateTime(reservation.created_at)} />
      </dl>

      <div className={isLight ? 'border-t border-slate-200 p-5' : 'border-t border-white/10 p-5'}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className={isLight ? 'text-sm font-semibold text-slate-950' : 'text-sm font-semibold text-white'}>
            {t('reservations.automationEvents')}
          </h3>
          <Badge tone="sky">{reservation.automation_events?.length || 0}</Badge>
        </div>

        <div className="space-y-3">
          {(reservation.automation_events || []).length === 0 ? (
            <p className={isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-500'}>
              {t('reservations.noAutomationEvents')}
            </p>
          ) : (
            reservation.automation_events.map((event) => (
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
            ))
          )}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadReservations = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/reservations', {
        cache: 'no-store'
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || t('reservations.errors.loadFailed'));
      }

      const nextReservations = payload.reservations || [];
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
      setLoading(false);
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

        <button
          type="button"
          onClick={loadReservations}
          className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white'}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('buttons.refresh')}
        </button>
      </div>

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
            <div className={isLight ? 'p-8 text-center text-sm text-slate-500' : 'p-8 text-center text-sm text-slate-500'}>
              {t('reservations.loading')}
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className={isLight ? 'p-8 text-center text-sm text-slate-500' : 'p-8 text-center text-sm text-slate-500'}>
              {reservations.length === 0 ? t('reservations.empty') : t('reservations.noMatches')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1240px] w-full text-left">
                <thead className={isLight ? 'bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500' : 'bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-slate-500'}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.guest')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.email')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.phone')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.arrival')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.departure')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.roomType')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.ratePlan')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.boardBasis')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.status')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.pmsProvider')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.whatsapp')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reservations.columns.automations')}</th>
                  </tr>
                </thead>
                <tbody className={isLight ? 'divide-y divide-slate-200' : 'divide-y divide-white/10'}>
                  {filteredReservations.map((reservation) => {
                    const stayStatus = getStayStatus(reservation);
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
                        <td className={isLight ? 'px-4 py-4 text-sm font-semibold text-slate-900' : 'px-4 py-4 text-sm font-semibold text-slate-100'}>
                          {reservation.guest_name || t('reservations.unknownGuest')}
                          <p className={isLight ? 'mt-1 text-xs font-normal text-slate-500' : 'mt-1 text-xs font-normal text-slate-500'}>
                            {reservation.pms_reservation_id}
                          </p>
                        </td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.guest_email || '-'}</td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.guest_phone || '-'}</td>
                        <td className={isLight ? 'whitespace-nowrap px-4 py-4 text-sm text-slate-700' : 'whitespace-nowrap px-4 py-4 text-sm text-slate-300'}>{formatDate(reservation.arrival_date)}</td>
                        <td className={isLight ? 'whitespace-nowrap px-4 py-4 text-sm text-slate-700' : 'whitespace-nowrap px-4 py-4 text-sm text-slate-300'}>{formatDate(reservation.departure_date)}</td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.room_type || '-'}</td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.rate_plan || '-'}</td>
                        <td className={isLight ? 'px-4 py-4 text-sm text-slate-600' : 'px-4 py-4 text-sm text-slate-400'}>{reservation.board_basis || '-'}</td>
                        <td className="px-4 py-4">
                          <Badge tone={statusTone(stayStatus)}>{t(`reservations.status.${stayStatus}`)}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge>{reservation.pms_provider || 'mock'}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          {reservation.whatsapp_link ? (
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
                          ) : (
                            <span className={isLight ? 'text-sm text-slate-400' : 'text-sm text-slate-600'}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone="sky">{reservation.automation_events?.length || 0}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <ReservationDetail reservation={selectedReservation} onClose={() => setSelectedReservation(null)} />
      </div>
    </div>
  );
};
