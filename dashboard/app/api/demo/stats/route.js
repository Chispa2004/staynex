import { NextResponse } from 'next/server';
import { areServerTestRoutesEnabled } from '@/lib/internal-api';
import {
  getDemoPlatformAdminContext,
  getDemoStats,
  getExplicitDemoStatsHotelId
} from '@/lib/demo';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

const jsonError = (message, status) => NextResponse.json(
  { ok: false, error: message },
  { status, ...jsonOptions }
);

export async function GET(request) {
  try {
    if (!areServerTestRoutesEnabled()) {
      return jsonError('Not found', 404);
    }

    const context = await getDemoPlatformAdminContext(request);
    const hotelId = getExplicitDemoStatsHotelId(request);

    if (!hotelId) {
      return jsonError('hotelId is required', 400);
    }

    const stats = await getDemoStats({
      supabase: context.supabase,
      hotelId
    });

    return NextResponse.json({ ok: true, stats, hotelId }, jsonOptions);
  } catch (error) {
    return jsonError(error.message || 'Could not load demo stats', error.status || 500);
  }
}
