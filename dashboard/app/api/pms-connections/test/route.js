import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { proxyBackendPmsAction } from '@/lib/pms-connections';

export async function POST(request) {
  try {
    const { hotel } = await getCurrentHotelForRequest(request);
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
