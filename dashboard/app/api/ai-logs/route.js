import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

export async function GET(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'ai_logs')) {
      return NextResponse.json({ logs: [], error: 'Access denied' }, { status: 403 });
    }

    const { data: conversations = [], error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('hotel_id', hotel.id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (conversationError) {
      throw conversationError;
    }

    const conversationIds = (conversations || []).map((conversation) => conversation.id);

    if (conversationIds.length === 0) {
      return NextResponse.json({ hotel, hotelId: hotel?.id || null, logs: [] });
    }

    const { data, error } = await supabase
      .from('ai_logs')
      .select('*')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      hotel,
      hotelId: hotel?.id || null,
      logs: data || []
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
