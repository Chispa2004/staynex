import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';
import { getTickets, getTicketsByCategories } from '@/lib/tickets';

export async function GET(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'tickets') && !canAccess(role, 'housekeeping') && !canAccess(role, 'maintenance')) {
      return NextResponse.json({ hotel, tickets: [], error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const categories = searchParams.get('categories')
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const tickets = categories?.length
      ? await getTicketsByCategories(categories, { supabase, hotelId: hotel?.id })
      : await getTickets({ supabase, hotelId: hotel?.id });

    return NextResponse.json({
      hotel,
      hotelId: hotel?.id || null,
      tickets
    });
  } catch (error) {
    return NextResponse.json({
      tickets: [],
      error: error.message || 'Could not load tickets'
    }, { status: 500 });
  }
}
