import { NextResponse } from 'next/server';
import {
  getHotelPlatformDetail,
  getPlatformContext,
  writePlatformAuditLog
} from '@/lib/platform';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { supabase, user, platformRole } = await getPlatformContext(request);
    const detail = await getHotelPlatformDetail(supabase, id);

    await writePlatformAuditLog({
      supabase,
      actor: user,
      platformRole,
      action: 'support_access_started',
      hotelId: id,
      metadata: {
        readonly: true,
        hotel_name: detail.hotel.name,
        source: 'platform_console'
      }
    });

    return NextResponse.json({
      ok: true,
      readonly: true,
      supportSession: {
        hotelId: id,
        hotelName: detail.hotel.name,
        startedAt: new Date().toISOString(),
        actorEmail: user?.email || null,
        readonly: true
      },
      hotel: detail.hotel
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not start support session'
    }, { status: error.status || 500 });
  }
}
