import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/demo';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function POST(request) {
  try {
    const { role, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !canAccess(role, 'simulation')) {
      return NextResponse.json(
        { ok: false, error: 'Access denied' },
        { status: 403, ...jsonOptions }
      );
    }

    const body = await request.json();
    const authorization = request.headers.get('authorization');
    const response = await fetch(`${getBackendUrl()}/api/simulation/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {})
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json();

    return NextResponse.json(payload, {
      status: response.status,
      ...jsonOptions
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Simulation failed' },
      { status: 500, ...jsonOptions }
    );
  }
}
