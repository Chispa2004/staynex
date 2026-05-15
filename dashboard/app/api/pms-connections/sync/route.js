import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { proxyBackendPmsAction } from '@/lib/pms-connections';

const dateOnly = (value) => (typeof value === 'string' && value ? value.slice(0, 10) : null);

export async function POST(request) {
  try {
    const { hotel } = await getCurrentHotelForRequest(request);
    const body = await request.json().catch(() => ({}));
    const result = await proxyBackendPmsAction({
      action: 'sync',
      hotelId: hotel.id,
      provider: body.provider || 'apaleo',
      from: dateOnly(body.from),
      to: dateOnly(body.to)
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'PMS reservations sync failed'
    }, { status: 500 });
  }
}
