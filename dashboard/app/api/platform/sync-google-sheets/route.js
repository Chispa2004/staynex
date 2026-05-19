import { NextResponse } from 'next/server';
import {
  getPlatformContext,
  writePlatformAuditLog
} from '@/lib/platform';

export const dynamic = 'force-dynamic';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

const getBackendUrl = () => (
  process.env.BACKEND_URL
  || process.env.NEXT_PUBLIC_BACKEND_URL
  || 'http://localhost:3000'
);

export async function POST(request) {
  try {
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const backendResponse = await fetch(`${getBackendUrl()}/api/platform/sync-google-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(request.headers.get('authorization')
          ? { Authorization: request.headers.get('authorization') }
          : {})
      },
      cache: 'no-store',
      body: JSON.stringify({})
    });
    const result = await backendResponse.json().catch(() => ({
      ok: false,
      error: 'Backend Google Sheets sync returned an invalid response'
    }));

    await writePlatformAuditLog({
      supabase,
      actor: user,
      platformRole,
      action: 'google_sheets_platform_sync',
      metadata: {
        ok: Boolean(result.ok),
        total_rows: result.totalRows || 0,
        tabs: result.tabs?.map((tab) => ({
          tabName: tab.tabName,
          rowsSynced: tab.rowsSynced
        })) || [],
        error: result.error || null
      }
    });

    return NextResponse.json(result, {
      status: backendResponse.status,
      ...jsonOptions
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Could not sync Google Sheets'
    }, { status: error.status || 500, ...jsonOptions });
  }
}
