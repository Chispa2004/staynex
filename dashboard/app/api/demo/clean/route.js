import { NextResponse } from 'next/server';
import { areServerTestRoutesEnabled } from '@/lib/internal-api';
import {
  cleanDemoData,
  getDemoPlatformAdminContext,
  getExplicitDemoCleanHotelId
} from '@/lib/demo';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

const jsonError = (message, status) => NextResponse.json(
  { ok: false, error: message },
  { status, ...jsonOptions }
);

export async function DELETE(request) {
  try {
    if (!areServerTestRoutesEnabled()) {
      return jsonError('Not found', 404);
    }

    const context = await getDemoPlatformAdminContext(request);
    const body = await request.json().catch(() => ({}));
    const hotelId = getExplicitDemoCleanHotelId(body);

    if (!hotelId) {
      return jsonError('hotelId is required', 400);
    }

    const result = await cleanDemoData({
      supabase: context.supabase,
      hotelId
    });

    return NextResponse.json(result, jsonOptions);
  } catch (error) {
    return jsonError(error.message || 'Could not clean demo data', error.status || 500);
  }
}
