import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';
import { getHotelOperationalHealth } from '@/lib/system-health';

const noStore = {
  headers: {
    'Cache-Control': 'no-store'
  }
};

export async function GET(request) {
  try {
    const { supabase, hotel, role, fallback, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!canAccess(role, 'hotel_health')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const health = await getHotelOperationalHealth({
      supabase,
      hotelId: hotel.id,
      hotel
    });

    return NextResponse.json({
      ok: true,
      hotel,
      hotelId: hotel.id,
      role,
      health
    }, noStore);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Hotel health could not be loaded'
    }, { status: 500, ...noStore });
  }
}
