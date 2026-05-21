import { NextResponse } from 'next/server';
import { getPlatformContext } from '@/lib/platform';
import { getBackendUrl } from '@/lib/demo';

export const dynamic = 'force-dynamic';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function GET(request) {
  try {
    await getPlatformContext(request, { requireAdmin: true });
    const authorization = request.headers.get('authorization');
    const response = await fetch(`${getBackendUrl()}/api/platform/ai-quality/history`, {
      headers: {
        ...(authorization ? { Authorization: authorization } : {})
      },
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({
      ok: false,
      error: 'AI quality history returned an invalid response'
    }));

    return NextResponse.json(payload, {
      status: response.status,
      ...jsonOptions
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || 'AI quality history failed' },
      { status: error.status || 500, ...jsonOptions }
    );
  }
}
