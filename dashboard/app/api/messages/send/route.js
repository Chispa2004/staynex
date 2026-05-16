import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const getBackendUrl = () => (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3000'
);

export async function POST(request) {
  try {
    const { supabase, hotel, role, platformRole } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'inbox')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (platformRole === 'support') {
      return NextResponse.json({ error: 'Support sessions are read-only by default' }, { status: 403 });
    }

    const body = await request.json();
    const conversationId = body.conversationId;

    if (!conversationId || !hotel?.id) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('hotel_id', hotel.id)
      .maybeSingle();

    if (conversationError) {
      throw conversationError;
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found in active workspace' }, { status: 404 });
    }

    const response = await fetch(`${getBackendUrl()}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversationId,
        message: body.message,
        hotelId: hotel.id
      })
    });

    const payload = await response.json();

    return NextResponse.json(payload, {
      status: response.status
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
