import { NextResponse } from 'next/server';
import { DEMO_SCENARIOS, getBackendUrl } from '@/lib/demo';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function POST(request) {
  try {
    const { scenarioId } = await request.json();
    const { hotel } = await getCurrentHotelForRequest(request);
    const scenario = DEMO_SCENARIOS.find((item) => item.id === scenarioId);

    if (!scenario) {
      return NextResponse.json(
        { error: 'Demo scenario not found' },
        { status: 404, ...jsonOptions }
      );
    }

    const response = await fetch(`${getBackendUrl()}/test-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: scenario.message,
        phone: scenario.phone,
        hotelId: hotel?.id || null
      })
    });

    const payload = await response.json();

    return NextResponse.json({
      hotelId: hotel?.id || null,
      scenario,
      result: payload
    }, {
      status: response.status,
      ...jsonOptions
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, ...jsonOptions }
    );
  }
}
