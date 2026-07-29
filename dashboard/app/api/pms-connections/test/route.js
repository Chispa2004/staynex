import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { assertPmsHotelContext, proxyBackendPmsAction } from '@/lib/pms-connections';
import { canAccess } from '@/lib/permissions';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function POST(request) {
  try {
    const { hotel, role, platformRole, fallback } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'pms_connections_manage')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403, ...jsonOptions });
    }
    if (platformRole === 'support') {
      return NextResponse.json({ ok: false, error: 'Support sessions are read-only by default' }, { status: 403, ...jsonOptions });
    }
    const hotelId = assertPmsHotelContext({ hotel, fallback });
    const body = await request.json().catch(() => ({}));
    const result = await proxyBackendPmsAction({
      action: 'test',
      hotelId,
      provider: body.provider || 'apaleo'
    });

    return NextResponse.json({ ...result, hotelId }, jsonOptions);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'PMS connection test failed'
    }, { status: error.status || 500, ...jsonOptions });
  }
}
