import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { proxyBackendPmsAction } from '@/lib/pms-connections';
import { canAccess } from '@/lib/permissions';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

const dateOnly = (value) => (typeof value === 'string' && value ? value.slice(0, 10) : null);
const pmsBatchSize = () => {
  const value = Number(process.env.PMS_SYNC_BATCH_SIZE || 50);
  return Number.isFinite(value) && value > 0 ? value : 50;
};
const pmsMaxReservations = () => {
  const value = Number(process.env.PMS_SYNC_MAX_RESERVATIONS || 1000);
  return Number.isFinite(value) && value > 0 ? value : 1000;
};
const clampNumber = (value, fallback, min, max) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(number)));
};

export async function POST(request) {
  try {
    const { hotel, role, platformRole } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'pms_connections_manage')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403, ...jsonOptions });
    }
    if (platformRole === 'support') {
      return NextResponse.json({ ok: false, error: 'Support sessions are read-only by default' }, { status: 403, ...jsonOptions });
    }
    const body = await request.json().catch(() => ({}));
    const result = await proxyBackendPmsAction({
      action: 'sync',
      hotelId: hotel.id,
      provider: body.provider || 'apaleo',
      from: dateOnly(body.from),
      to: dateOnly(body.to),
      pageSize: clampNumber(body.pageSize, pmsBatchSize(), 1, 50),
      maxReservations: clampNumber(body.maxReservations, pmsMaxReservations(), 1, 1000)
    });

    return NextResponse.json({ ...result, hotelId: hotel.id }, jsonOptions);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'PMS reservations sync failed'
    }, { status: 500, ...jsonOptions });
  }
}
