'use client';

import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Hotel,
  PlugZap,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Trash2
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { PremiumEmptyState } from './PremiumEmptyState';
import { PremiumLoadingState } from './PremiumLoadingState';

const buildRoomMessage = ({ hotel, room }) => [
  `Hello, I am in room ${room}.`,
  hotel?.name ? `Hotel: ${hotel.name}.` : null,
  hotel?.id ? `Staynex hotel id: ${hotel.id}.` : null
].filter(Boolean).join(' ');

const buildWhatsappLink = ({ whatsappNumber, hotel, room }) => (
  whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(buildRoomMessage({ hotel, room }))}`
    : ''
);

const normalizeWhatsappNumber = (value) => (
  value?.replace(/^whatsapp:/i, '').replace(/[^\d]/g, '') || ''
);

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

const ActionButton = ({ icon: Icon, children, onClick, href, disabled = false }) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const className = [
    'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition',
    disabled ? 'cursor-not-allowed opacity-50' : '',
    isLight
      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
      : 'border-white/10 bg-white/[0.035] text-slate-300 hover:bg-white/[0.08] hover:text-white'
  ].join(' ');

  if (href && !disabled) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </button>
  );
};

export const QrRoomsClient = () => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [qrCodes, setQrCodes] = useState({});
  const [copiedRoom, setCopiedRoom] = useState(null);
  const [hotel, setHotel] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [detectedRooms, setDetectedRooms] = useState([]);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [roomSource, setRoomSource] = useState('none');
  const [canManageRooms, setCanManageRooms] = useState(false);
  const [missingHotelRoomsTable, setMissingHotelRoomsTable] = useState(false);
  const [roomForm, setRoomForm] = useState({
    room_number: '',
    floor: '',
    room_type: '',
    active: true,
    qr_enabled: true
  });
  const [busyAction, setBusyAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const activeHotelIdRef = useRef(null);

  const whatsappConfigured = Boolean(whatsappNumber);
  const qrEnabledRooms = useMemo(() => rooms.filter((room) => (
    room.active !== false && room.qr_enabled !== false
  )), [rooms]);

  const roomLinks = useMemo(() => Object.fromEntries(
    qrEnabledRooms.map((room) => [
      room.room_number,
      buildWhatsappLink({ whatsappNumber, hotel, room: room.room_number })
    ])
  ), [hotel, qrEnabledRooms, whatsappNumber]);

  const loadRooms = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setRooms([]);
    setQrCodes({});

    try {
      const response = await fetch('/api/qr-rooms?includeInactive=true', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not load QR rooms');
      }

      if (!shouldAcceptTenantPayload(body, 'qr-rooms')) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale room payload ignored', {
            hotelId: body.hotelId || null
          });
        }
        return;
      }

      if (requestId !== requestIdRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('stale room payload ignored', {
            hotelId: body.hotelId || null
          });
        }
        return;
      }

      if (activeHotelIdRef.current && body.hotelId && activeHotelIdRef.current !== body.hotelId) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('tenant room source changed, resetting state', {
            from: activeHotelIdRef.current,
            to: body.hotelId
          });
        }
        setRooms([]);
        setQrCodes({});
      }

      activeHotelIdRef.current = body.hotelId || null;
      setHotel(body.hotel || null);
      setWhatsappNumber(normalizeWhatsappNumber(body.whatsappNumber || body.hotel?.whatsapp_number || ''));
      setRooms(body.rooms || []);
      setDetectedRooms(body.detectedRooms || []);
      setRoomSource(body.roomSource || 'none');
      setCanManageRooms(Boolean(body.canManageRooms));
      setMissingHotelRoomsTable(Boolean(body.missingHotelRoomsTable));

      if (process.env.NODE_ENV !== 'production') {
        console.info('tenant room source', {
          hotelId: body.hotelId || null,
          roomSource: body.roomSource || 'none',
          rooms: body.rooms?.length || 0
        });
        if (!body.rooms?.length) {
          console.info('demo fallback blocked', { surface: 'qr-rooms', hotelId: body.hotelId || null });
        }
      }
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    const handleTenantChanged = (event) => {
      const nextHotelId = event.detail?.hotelId || null;

      if (!nextHotelId || nextHotelId === activeHotelIdRef.current) {
        return;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.info('tenant changed, resetting state', {
          surface: 'qr-rooms',
          hotelId: nextHotelId
        });
      }

      setRooms([]);
      setDetectedRooms([]);
      setQrCodes({});
      setHotel(null);
      setWhatsappNumber('');
      setRoomSource('none');
      setCanManageRooms(false);
      loadRooms();
    };

    window.addEventListener('staynex:tenant-changed', handleTenantChanged);

    return () => window.removeEventListener('staynex:tenant-changed', handleTenantChanged);
  }, [loadRooms]);

  useEffect(() => {
    let cancelled = false;

    const generateQrCodes = async () => {
      if (!qrEnabledRooms.length || !whatsappConfigured) {
        setQrCodes({});
        return;
      }

      const entries = await Promise.all(qrEnabledRooms.map(async (room) => {
        const link = roomLinks[room.room_number];

        if (!link) {
          return [room.room_number, null];
        }

        const dataUrl = await QRCode.toDataURL(link, {
          margin: 2,
          width: 360,
          color: {
            dark: '#07111F',
            light: '#FFFFFF'
          }
        });

        return [room.room_number, dataUrl];
      }));

      if (!cancelled) {
        setQrCodes(Object.fromEntries(entries));
      }
    };

    generateQrCodes().catch((caughtError) => {
      console.error('QR generation failed', caughtError);
    });

    return () => {
      cancelled = true;
    };
  }, [qrEnabledRooms, roomLinks, whatsappConfigured]);

  const saveRoom = async (event) => {
    event.preventDefault();
    setBusyAction('save-room');
    setError(null);

    try {
      const response = await fetch('/api/qr-rooms', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify(roomForm)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not save room');
      }

      setRoomForm({
        room_number: '',
        floor: '',
        room_type: '',
        active: true,
        qr_enabled: true
      });
      await loadRooms();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setBusyAction(null);
    }
  };

  const importDetectedRooms = async () => {
    setBusyAction('import-detected');
    setError(null);

    try {
      const response = await fetch('/api/qr-rooms', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({ action: 'import_detected_rooms' })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not import detected rooms');
      }

      await loadRooms();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setBusyAction(null);
    }
  };

  const updateRoom = async (room, updates) => {
    setBusyAction(`room-${room.id}`);
    setError(null);

    try {
      const response = await fetch('/api/qr-rooms', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({
          id: room.id,
          room_number: room.room_number,
          floor: room.floor || '',
          room_type: room.room_type || '',
          active: room.active !== false,
          qr_enabled: room.qr_enabled !== false,
          metadata: room.metadata || {},
          ...updates
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update room');
      }

      await loadRooms();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setBusyAction(null);
    }
  };

  const deleteRoom = async (room) => {
    setBusyAction(`room-${room.id}`);
    setError(null);

    try {
      const response = await fetch('/api/qr-rooms', {
        method: 'DELETE',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({ id: room.id })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not delete room');
      }

      await loadRooms();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setBusyAction(null);
    }
  };

  const copyLink = async (roomNumber) => {
    if (!roomLinks[roomNumber]) {
      return;
    }

    await window.navigator.clipboard.writeText(roomLinks[roomNumber]);
    setCopiedRoom(roomNumber);
    window.setTimeout(() => setCopiedRoom(null), 1600);
  };

  const downloadQr = (roomNumber) => {
    const dataUrl = qrCodes[roomNumber];

    if (!dataUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `staynex-${hotel?.workspace_slug || hotel?.id || 'hotel'}-room-${roomNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
            {t('screens.operations')}
          </p>
          <h1 className={isLight ? 'mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl' : 'mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl'}>
            {t('screens.qrRooms')}
          </h1>
          <p className={isLight ? 'mt-3 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-3 max-w-2xl text-sm leading-6 text-slate-400'}>
            Generate room QR codes only from this hotel workspace. Rooms come from active reservation/guest context and operational room signals.
          </p>
        </div>

        <Card className="p-4 lg:min-w-[320px]">
          <div className="flex items-center gap-3">
            <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700' : 'flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
              <Hotel className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>
                {hotel?.name || 'Current hotel'}
              </p>
              <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-950' : 'mt-1 text-sm font-semibold text-white'}>
                {whatsappConfigured ? `+${whatsappNumber}` : t('qrRooms.missingWhatsappNumber')}
              </p>
              <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                Source: {roomSource === 'none' ? 'No rooms yet' : roomSource.replace(/_/g, ' ')}
              </p>
              {!canManageRooms ? (
                <span className={isLight ? 'mt-3 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-800' : 'mt-3 inline-flex rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-100'}>
                  View only
                </span>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      {error ? (
        <div className={isLight ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800' : 'rounded-lg border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100'}>
          {error}
        </div>
      ) : null}

      {!loading && canManageRooms ? (
        <Card className="p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>
                Official room source
              </p>
              <h2 className={isLight ? 'mt-2 text-lg font-semibold text-slate-950' : 'mt-2 text-lg font-semibold text-white'}>
                Hotel rooms
              </h2>
              <p className={isLight ? 'mt-1 max-w-2xl text-sm leading-6 text-slate-600' : 'mt-1 max-w-2xl text-sm leading-6 text-slate-400'}>
                QR codes are generated from <code>hotel_rooms</code>. PMS-detected rooms can be imported, but demo/global rooms are never used.
              </p>
              {missingHotelRoomsTable ? (
                <p className="mt-2 text-sm font-semibold text-amber-400">
                  Run supabase/sql/create_hotel_rooms.sql to enable manual room management.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={importDetectedRooms}
              disabled={busyAction === 'import-detected' || detectedRooms.length === 0 || missingHotelRoomsTable}
              className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50'}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {busyAction === 'import-detected' ? 'Importing...' : `Import detected rooms (${detectedRooms.length})`}
            </button>
          </div>

          <form onSubmit={saveRoom} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            <label className="space-y-1.5">
              <span className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>Room number</span>
              <input
                value={roomForm.room_number}
                onChange={(event) => setRoomForm((current) => ({ ...current, room_number: event.target.value }))}
                className={isLight ? 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-300' : 'w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/30'}
                placeholder="101"
                required
                disabled={missingHotelRoomsTable}
              />
            </label>
            <label className="space-y-1.5">
              <span className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>Floor</span>
              <input
                value={roomForm.floor}
                onChange={(event) => setRoomForm((current) => ({ ...current, floor: event.target.value }))}
                className={isLight ? 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-300' : 'w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/30'}
                placeholder="1"
                disabled={missingHotelRoomsTable}
              />
            </label>
            <label className="space-y-1.5">
              <span className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>Room type</span>
              <input
                value={roomForm.room_type}
                onChange={(event) => setRoomForm((current) => ({ ...current, room_type: event.target.value }))}
                className={isLight ? 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-300' : 'w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/30'}
                placeholder="Deluxe"
                disabled={missingHotelRoomsTable}
              />
            </label>
            <button
              type="submit"
              disabled={busyAction === 'save-room' || missingHotelRoomsTable}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {busyAction === 'save-room' ? 'Saving...' : 'Add room'}
            </button>
          </form>
        </Card>
      ) : null}

      {loading ? (
        <PremiumLoadingState title="Loading QR rooms" description="Staynex is loading rooms from this hotel workspace only." rows={4} cards={3} />
      ) : !rooms.length ? (
        <PremiumEmptyState
          icon={PlugZap}
          title="No rooms available yet"
          description={canManageRooms
            ? 'Add rooms to the official hotel room catalog or import detected PMS rooms. Demo rooms are blocked for this workspace.'
            : 'No QR rooms are available yet. An admin can add rooms, and reception will be able to view, copy and print the QR codes here.'}
          action={canManageRooms ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/dashboard/settings/pms" className={isLight ? 'rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}>
                Connect PMS
              </Link>
              <Link href="/dashboard/onboarding" className="rounded-lg border border-emerald-200/60 bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200">
                Open onboarding
              </Link>
            </div>
          ) : null}
        />
      ) : (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={loadRooms}
              className={isLight ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' : 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]'}
            >
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh rooms
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {rooms.map((room) => {
              const roomNumber = room.room_number;
              const dataUrl = qrCodes[roomNumber];
              const copied = copiedRoom === roomNumber;
              const roomEnabled = room.active !== false && room.qr_enabled !== false;

              return (
                <Card key={roomNumber} className="overflow-hidden">
                  <div className={isLight ? 'border-b border-slate-200 p-4' : 'border-b border-white/10 p-4'}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>
                          {t('qrRooms.room')}
                        </p>
                        <h2 className={isLight ? 'mt-1 text-2xl font-semibold text-slate-950' : 'mt-1 text-2xl font-semibold text-white'}>
                          {roomNumber}
                        </h2>
                        <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                          {[room.source?.replace(/_/g, ' ') || 'hotel room', room.floor ? `Floor ${room.floor}` : null, room.room_type].filter(Boolean).join(' / ')}
                        </p>
                      </div>
                      <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700' : 'flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-300/10 text-emerald-200'}>
                        <QrCode className="h-5 w-5" aria-hidden="true" />
                      </span>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white p-3'}>
                      {!roomEnabled ? (
                        <div className={isLight ? 'flex aspect-square w-full items-center justify-center rounded-md bg-slate-100 text-center text-sm font-semibold text-slate-500' : 'flex aspect-square w-full items-center justify-center rounded-md bg-slate-900 text-center text-sm font-semibold text-slate-500'}>
                          QR disabled
                        </div>
                      ) : dataUrl ? (
                        <img
                          src={dataUrl}
                          alt={t('qrRooms.qrAlt', { room: roomNumber })}
                          className="aspect-square w-full rounded-md bg-white"
                        />
                      ) : (
                        <div className="aspect-square w-full animate-pulse rounded-md bg-slate-200" />
                      )}
                    </div>

                    <div className={isLight ? 'mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600' : 'mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400'}>
                      <p className="line-clamp-2">{buildRoomMessage({ hotel, room: roomNumber })}</p>
                    </div>

                    <div className="mt-4 grid gap-2">
                      <ActionButton
                        icon={Download}
                        onClick={() => downloadQr(roomNumber)}
                        disabled={!dataUrl || !roomEnabled}
                      >
                        {t('qrRooms.downloadQr')}
                      </ActionButton>
                      <ActionButton
                        icon={copied ? Check : Copy}
                        onClick={() => copyLink(roomNumber)}
                        disabled={!roomLinks[roomNumber] || !roomEnabled}
                      >
                        {copied ? t('qrRooms.copied') : t('qrRooms.copyLink')}
                      </ActionButton>
                      <ActionButton icon={ExternalLink} href={roomLinks[roomNumber] || null} disabled={!roomLinks[roomNumber]}>
                        {t('qrRooms.openWhatsapp')}
                      </ActionButton>
                      {canManageRooms && room.id ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => updateRoom(room, { qr_enabled: room.qr_enabled === false })}
                            disabled={busyAction === `room-${room.id}`}
                            className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50'}
                          >
                            <Save className="h-4 w-4" aria-hidden="true" />
                            {room.qr_enabled === false ? 'Enable QR' : 'Disable QR'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRoom(room)}
                            disabled={busyAction === `room-${room.id}`}
                            className={isLight ? 'inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50' : 'inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-50'}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
