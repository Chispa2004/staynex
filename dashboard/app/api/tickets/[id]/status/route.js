import {validTicketOperation} from '../../../../../../shared/attention-lifecycle.js';
import { NextResponse } from 'next/server';
import { updateTicketStatus } from '@/lib/tickets';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';


export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {status,expectedVersion,expectedStatus,operationId}=body;
    const { supabase, hotel, role, platformRole, user } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'tickets') && !canAccess(role, 'housekeeping') && !canAccess(role, 'maintenance')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (platformRole === 'support') {
      return NextResponse.json({ error: 'Support sessions are read-only by default' }, { status: 403 });
    }

    if (!validTicketOperation(body)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const ticket = await updateTicketStatus({
      ticketId: id,
      status, expectedVersion, expectedStatus, operationId,
      supabase,
      hotelId: hotel?.id,
      actor: user,
      role,
      platformRole,
      request
    });

    return NextResponse.json({ ticket });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status || error.statusCode || 500 }
    );
  }
}
