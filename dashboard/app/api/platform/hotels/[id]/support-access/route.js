import { NextResponse } from 'next/server';
import { getHotelPlatformDetail, getPlatformContext, writePlatformAuditLog } from '@/lib/platform';

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
        source: 'platform_console_legacy_route'
      }
    });

    return NextResponse.json({
      ok: true,
      readonly: true,
      supportSession: {
        hotelId: id,
        hotelName: detail.hotel.name,
        readonly: true,
        startedAt: new Date().toISOString()
      },
      hotel: detail.hotel
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not start support access'
    }, { status: error.status || 500 });
  }
}
