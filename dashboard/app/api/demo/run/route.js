import { NextResponse } from 'next/server';
import { DEMO_SCENARIOS, getBackendUrl } from '@/lib/demo';

export async function POST(request) {
  try {
    const { scenarioId } = await request.json();
    const scenario = DEMO_SCENARIOS.find((item) => item.id === scenarioId);

    if (!scenario) {
      return NextResponse.json(
        { error: 'Demo scenario not found' },
        { status: 404 }
      );
    }

    const response = await fetch(`${getBackendUrl()}/test-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: scenario.message,
        phone: scenario.phone
      })
    });

    const payload = await response.json();

    return NextResponse.json({
      scenario,
      result: payload
    }, {
      status: response.status
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
