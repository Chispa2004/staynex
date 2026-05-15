import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

export async function GET(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'tickets') && !canAccess(role, 'dashboard')) {
      return NextResponse.json({ stats: { urgentTickets: 0 }, error: 'Access denied' }, { status: 403 });
    }

    if (!hotel?.id) {
      return NextResponse.json({ stats: { urgentTickets: 0 } });
    }

    const { count, error } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotel.id)
      .eq('priority', 'urgent')
      .in('status', ['open', 'in_progress']);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      hotelId: hotel.id,
      stats: {
        urgentTickets: count || 0
      }
    });
  } catch (error) {
    return NextResponse.json({
      stats: { urgentTickets: 0 },
      error: error.message || 'Ticket stats unavailable'
    }, { status: 500 });
  }
}
