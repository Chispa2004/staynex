import { NextResponse } from 'next/server';
import { updateTicketStatus } from '@/lib/tickets';

const ALLOWED_STATUSES = ['open', 'in_progress', 'completed'];

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { status } = await request.json();

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const ticket = await updateTicketStatus({
      ticketId: id,
      status
    });

    return NextResponse.json({ ticket });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
