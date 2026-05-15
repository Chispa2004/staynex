import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { proxyBackendPmsAction } from '@/lib/pms-connections';
import { canAccess } from '@/lib/permissions';

const dateOnly = (value) => (typeof value === 'string' && value ? value.slice(0, 10) : null);
const clampNumber = (value, fallback, min, max) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(number)));
};

export async function POST(request) {
  try {
    const { hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'pms_connections_manage')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const result = await proxyBackendPmsAction({
      action: 'sync',
      hotelId: hotel.id,
      provider: body.provider || 'apaleo',
      from: dateOnly(body.from),
      to: dateOnly(body.to),
      pageSize: clampNumber(body.pageSize, 25, 1, 50),
      maxReservations: clampNumber(body.maxReservations, 50, 1, 100)
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'PMS reservations sync failed'
    }, { status: 500 });
  }
}
