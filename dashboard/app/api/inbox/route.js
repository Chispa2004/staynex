import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { getInboxConversations } from '@/lib/inbox';
import { canAccess } from '@/lib/permissions';

export async function GET(request) {
  try {
    const { supabase, hotel, hotelUser, fallback, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'inbox')) {
      return NextResponse.json({ conversations: [], hotel, error: 'Access denied' }, { status: 403 });
    }
    const conversations = await getInboxConversations({
      supabase,
      hotelId: hotel?.id || null
    });

    return NextResponse.json({
      conversations,
      hotel,
      hotelId: hotel?.id || null,
      staffLanguage: hotelUser?.preferred_translation_language || hotel?.default_language || 'es',
      fallback
    });
  } catch (error) {
    console.error('Inbox API failed', error);

    return NextResponse.json({
      conversations: [],
      hotel: null,
      error: error.message || 'Inbox lookup failed'
    }, { status: 500 });
  }
}
