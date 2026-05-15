import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { getBackendUrl } from '@/lib/demo';

export async function POST(request) {
  try {
    const { hotel } = await getCurrentHotelForRequest(request);
    const body = await request.json().catch(() => ({}));
    const response = await fetch(`${getBackendUrl()}/demo-data/luxury`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        hotelId: hotel?.id || null,
        clean: body.clean !== false,
        applyHotelBranding: body.applyHotelBranding !== false
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || 'Could not generate demo data');
    }

    return NextResponse.json({
      ok: true,
      hotel,
      ...payload
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Could not generate demo data'
    }, { status: 500 });
  }
}
