import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { assertDemoHotelContext, getBackendUrl } from '@/lib/demo';
import {
  areServerTestRoutesEnabled,
  getInternalApiHeaders
} from '@/lib/internal-api';

export async function POST(request) {
  try {
    if (!areServerTestRoutesEnabled()) {
      return NextResponse.json({
        ok: false,
        error: 'Not found'
      }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { hotel, fallback, platformRole } = await getCurrentHotelForRequest(request);

    const hotelId = assertDemoHotelContext({
      hotel,
      fallback,
      platformRole,
      request,
      body
    });

    const response = await fetch(`${getBackendUrl()}/demo-data/luxury`, {
      method: 'POST',
      headers: getInternalApiHeaders({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        hotelId,
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
    }, { status: error.status || 500 });
  }
}
