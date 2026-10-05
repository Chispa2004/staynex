import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';
import { getTicketDetail } from '@/lib/tickets';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { supabase, hotel, role, accessDenied } = await getCurrentHotelForRequest(request, {readOnly:true,includeDirectory:false});

    if (accessDenied || !hotel?.id || (!canAccess(role, 'tickets') && !canAccess(role, 'housekeeping') && !canAccess(role, 'maintenance'))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const detail = await getTicketDetail(id, {
      supabase,
      hotelId: hotel?.id
    });

    if (!detail) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json({
      hotel,
      hotelId: hotel?.id || null,
      ticket: detail.ticket,
      messages: detail.messages
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not load ticket'
    }, { status: 500 });
  }
}
