import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess, getPermissionsForRole } from '@/lib/permissions';

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getJourneyStatus = (reservation) => {
  const today = getTodayKey();

  if (reservation.departure_date && today > reservation.departure_date) {
    return 'post_stay';
  }

  if (
    reservation.arrival_date
    && reservation.departure_date
    && today >= reservation.arrival_date
    && today <= reservation.departure_date
  ) {
    return 'in_house';
  }

  return 'pre_arrival';
};

export async function GET(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'reservations')) {
      return NextResponse.json({ hotel, reservations: [], error: 'Access denied' }, { status: 403 });
    }

    let query = supabase
      .from('reservations')
      .select('*, automation_events(*)')
      .order('arrival_date', { ascending: true, nullsFirst: false })
      .limit(100);

    if (hotel?.id) {
      query = query.eq('hotel_id', hotel.id);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const reservations = data || [];
    const guestIds = [...new Set(
      reservations
        .map((reservation) => reservation.guest_id)
        .filter(Boolean)
    )];
    let conversationsByGuestId = {};

    if (guestIds.length > 0) {
      const { data: conversations, error: conversationsError } = await supabase
        .from('conversations')
        .select('id, guest_id, status, last_message_at, created_at')
        .in('guest_id', guestIds)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (conversationsError) {
        throw conversationsError;
      }

      conversationsByGuestId = (conversations || []).reduce((acc, conversation) => {
        if (!acc[conversation.guest_id]) {
          acc[conversation.guest_id] = conversation;
        }

        return acc;
      }, {});
    }

    return NextResponse.json({
      hotel,
      role,
      permissions: getPermissionsForRole(role),
      reservations: reservations.map((reservation) => {
        const linkedConversation = reservation.guest_id
          ? conversationsByGuestId[reservation.guest_id] || null
          : null;

        return {
          ...reservation,
          computedJourneyStatus: getJourneyStatus(reservation),
          linkedConversation,
          conversationId: linkedConversation?.id || null
        };
      })
    });
  } catch (error) {
    return NextResponse.json(
      {
        reservations: [],
        error: error.message
      },
      { status: 500 }
    );
  }
}
