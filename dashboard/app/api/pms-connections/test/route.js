import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { proxyBackendPmsAction } from '@/lib/pms-connections';
import { canAccess } from '@/lib/permissions';

export async function POST(request) {
  try {
    const { hotel, role, platformRole } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'pms_connections_manage')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 });
    }
    if (platformRole === 'support') {
      return NextResponse.json({ ok: false, error: 'Support sessions are read-only by default' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const result = await proxyBackendPmsAction({
      action: 'test',
      hotelId: hotel.id,
      provider: body.provider || 'apaleo'
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'PMS connection test failed'
    }, { status: 500 });
  }
}
