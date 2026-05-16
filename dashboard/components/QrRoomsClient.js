'use client';

import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Hotel,
  QrCode
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';

const rooms = [101, 102, 103, 201, 202, 203, 301, 302];

const buildRoomMessage = (room) => `Hello, I am in room ${room}`;

const buildWhatsappLink = ({ whatsappNumber, room }) => (
  whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(buildRoomMessage(room))}`
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

  if (href) {
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

export const QrRoomsClient = ({ whatsappNumber }) => {
  const { t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const [qrCodes, setQrCodes] = useState({});
  const [copiedRoom, setCopiedRoom] = useState(null);
  const [hotelWhatsappNumber, setHotelWhatsappNumber] = useState('');
  const activeWhatsappNumber = hotelWhatsappNumber || whatsappNumber;
  const whatsappConfigured = Boolean(activeWhatsappNumber);

  const roomLinks = useMemo(() => Object.fromEntries(
    rooms.map((room) => [
      room,
      buildWhatsappLink({ whatsappNumber: activeWhatsappNumber, room })
    ])
  ), [activeWhatsappNumber]);

  useEffect(() => {
    let active = true;

    const loadHotelWhatsappNumber = async () => {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = supabase ? await supabase.auth.getSession() : { data: {} };
        const headers = data?.session?.access_token
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : {};
        const response = await fetch('/api/current-hotel', {
          headers,
          cache: 'no-store'
        });
        const body = await response.json();
        if (!shouldAcceptTenantPayload(body, 'qr-rooms')) {
          return;
        }
        const normalizedNumber = normalizeWhatsappNumber(body.hotel?.whatsapp_number || '');

        if (active && response.ok && normalizedNumber) {
          setHotelWhatsappNumber(normalizedNumber);
        }
      } catch (error) {
        console.error('QR Rooms hotel WhatsApp lookup failed', error);
      }
    };

    loadHotelWhatsappNumber();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const generateQrCodes = async () => {
      const entries = await Promise.all(rooms.map(async (room) => {
        if (!roomLinks[room]) {
          return [room, null];
        }

        const dataUrl = await QRCode.toDataURL(roomLinks[room], {
          margin: 2,
          width: 360,
          color: {
            dark: '#07111F',
            light: '#FFFFFF'
          }
        });

        return [room, dataUrl];
      }));

      if (!cancelled) {
        setQrCodes(Object.fromEntries(entries));
      }
    };

    generateQrCodes().catch((error) => {
      console.error('QR generation failed', error);
    });

    return () => {
      cancelled = true;
    };
  }, [roomLinks]);

  const copyLink = async (room) => {
    if (!roomLinks[room]) {
      return;
    }

    await window.navigator.clipboard.writeText(roomLinks[room]);
    setCopiedRoom(room);
    window.setTimeout(() => setCopiedRoom(null), 1600);
  };

  const downloadQr = (room) => {
    const dataUrl = qrCodes[room];

    if (!dataUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `staynex-room-${room}.png`;
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
            {t('screens.qrRoomsDescription')}
          </p>
        </div>

        <Card className="p-4 lg:min-w-[320px]">
          <div className="flex items-center gap-3">
            <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700' : 'flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200'}>
              <Hotel className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>
                {t('qrRooms.whatsappNumber')}
              </p>
              <p className={isLight ? 'mt-1 text-sm font-semibold text-slate-950' : 'mt-1 text-sm font-semibold text-white'}>
                {whatsappConfigured ? `+${activeWhatsappNumber}` : t('qrRooms.missingWhatsappNumber')}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rooms.map((room) => {
          const dataUrl = qrCodes[room];
          const copied = copiedRoom === room;

          return (
            <Card key={room} className="overflow-hidden">
              <div className={isLight ? 'border-b border-slate-200 p-4' : 'border-b border-white/10 p-4'}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={isLight ? 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500' : 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500'}>
                      {t('qrRooms.room')}
                    </p>
                    <h2 className={isLight ? 'mt-1 text-2xl font-semibold text-slate-950' : 'mt-1 text-2xl font-semibold text-white'}>
                      {room}
                    </h2>
                  </div>
                  <span className={isLight ? 'flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700' : 'flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-300/10 text-emerald-200'}>
                    <QrCode className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
              </div>

              <div className="p-4">
                <div className={isLight ? 'rounded-lg border border-slate-200 bg-slate-50 p-3' : 'rounded-lg border border-white/10 bg-white p-3'}>
                  {dataUrl ? (
                    <img
                      src={dataUrl}
                      alt={t('qrRooms.qrAlt', { room })}
                      className="aspect-square w-full rounded-md bg-white"
                    />
                  ) : (
                    <div className="aspect-square w-full animate-pulse rounded-md bg-slate-200" />
                  )}
                </div>

                <div className={isLight ? 'mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600' : 'mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400'}>
                  <p className="truncate">{buildRoomMessage(room)}</p>
                </div>

                <div className="mt-4 grid gap-2">
                  <ActionButton
                    icon={Download}
                    onClick={() => downloadQr(room)}
                    disabled={!dataUrl}
                  >
                    {t('qrRooms.downloadQr')}
                  </ActionButton>
                  <ActionButton
                    icon={copied ? Check : Copy}
                    onClick={() => copyLink(room)}
                    disabled={!roomLinks[room]}
                  >
                    {copied ? t('qrRooms.copied') : t('qrRooms.copyLink')}
                  </ActionButton>
                  <ActionButton icon={ExternalLink} href={roomLinks[room] || null} disabled={!roomLinks[room]}>
                    {t('qrRooms.openWhatsapp')}
                  </ActionButton>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
