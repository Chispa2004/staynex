import { NextResponse } from 'next/server';
import { assertDemoHotelContext, DEMO_SCENARIOS, getBackendUrl } from '@/lib/demo';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import {
  areServerTestRoutesEnabled,
  getInternalApiHeaders
} from '@/lib/internal-api';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function POST(request) {
  try {
    if (!areServerTestRoutesEnabled()) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, ...jsonOptions }
      );
    }

    const body = await request.json();
    const { scenarioId } = body;
    const { hotel, fallback, platformRole } = await getCurrentHotelForRequest(request);
    const scenario = DEMO_SCENARIOS.find((item) => item.id === scenarioId);

    if (!scenario) {
      return NextResponse.json(
        { error: 'Demo scenario not found' },
        { status: 404, ...jsonOptions }
      );
    }

    const hotelId = assertDemoHotelContext({
      hotel,
      fallback,
      platformRole,
      request,
      body
    });

    const response = await fetch(`${getBackendUrl()}/test-message`, {
      method: 'POST',
      headers: getInternalApiHeaders({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        message: scenario.message,
        hotelId
      })
    });

    const payload = await response.json();

    return NextResponse.json({
      hotelId,
      scenario,
      result: payload
    }, {
      status: response.status,
      ...jsonOptions
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status || 500, ...jsonOptions }
    );
  }
}
