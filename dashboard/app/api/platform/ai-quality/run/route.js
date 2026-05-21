import { NextResponse } from 'next/server';
import { getPlatformContext } from '@/lib/platform';
import { getBackendUrl } from '@/lib/demo';

export const dynamic = 'force-dynamic';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function POST(request) {
  try {
    await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json();
    const authorization = request.headers.get('authorization');
    const response = await fetch(`${getBackendUrl()}/api/platform/ai-quality/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {})
      },
      cache: 'no-store',
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({
      ok: false,
      error: 'AI quality backend returned an invalid response'
    }));

    return NextResponse.json(payload, {
      status: response.status,
      ...jsonOptions
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || 'AI quality run failed' },
      { status: error.status || 500, ...jsonOptions }
    );
  }
}
