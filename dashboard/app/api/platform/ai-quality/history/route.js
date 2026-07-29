import { NextResponse } from 'next/server';
import { getPlatformContext } from '@/lib/platform';
import { getBackendUrl } from '@/lib/demo';
import {
  areServerTestRoutesEnabled,
  getInternalApiHeaders
} from '@/lib/internal-api';

export const dynamic = 'force-dynamic';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function GET(request) {
  try {
    if (!areServerTestRoutesEnabled()) {
      return NextResponse.json(
        { ok: false, error: 'Not found' },
        { status: 404, ...jsonOptions }
      );
    }

    await getPlatformContext(request, { requireAdmin: true });
    const authorization = request.headers.get('authorization');
    const response = await fetch(`${getBackendUrl()}/api/platform/ai-quality/history`, {
      headers: getInternalApiHeaders({
        ...(authorization ? { Authorization: authorization } : {})
      }),
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
