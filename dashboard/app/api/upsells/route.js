import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';

const isMissingUpsellsTable = (error) => (
  error?.message?.includes('ai_upsells')
  || error?.details?.includes('ai_upsells')
  || error?.hint?.includes('ai_upsells')
);

export async function GET(request) {
  try {
    const { supabase, hotel } = await getCurrentHotelForRequest(request);

    if (!hotel?.id) {
      return NextResponse.json({ upsells: [] });
    }

    const { data: upsells, error } = await supabase
      .from('ai_upsells')
      .select('*')
      .eq('hotel_id', hotel.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      if (isMissingUpsellsTable(error)) {
        return NextResponse.json({ upsells: [], hotel });
      }

      throw error;
    }

    const guestIds = [...new Set((upsells || []).map((item) => item.guest_id).filter(Boolean))];
    const reservationIds = [...new Set((upsells || []).map((item) => item.reservation_id).filter(Boolean))];
    const conversationIds = [...new Set((upsells || []).map((item) => item.conversation_id).filter(Boolean))];

    const [
      { data: guests = [] },
      { data: reservations = [] },
      { data: conversations = [] }
    ] = await Promise.all([
      guestIds.length
        ? supabase.from('guests').select('id, phone_number, current_room').in('id', guestIds)
        : Promise.resolve({ data: [] }),
      reservationIds.length
        ? supabase.from('reservations').select('id, pms_reservation_id, guest_name, arrival_date, departure_date').in('id', reservationIds)
        : Promise.resolve({ data: [] }),
      conversationIds.length
        ? supabase.from('conversations').select('id, status, last_message_at').in('id', conversationIds)
        : Promise.resolve({ data: [] })
    ]);

    const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
    const reservationsById = new Map(reservations.map((reservation) => [reservation.id, reservation]));
    const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]));

    return NextResponse.json({
      hotel,
      upsells: (upsells || []).map((upsell) => ({
        ...upsell,
        guest: guestsById.get(upsell.guest_id) || null,
        reservation: reservationsById.get(upsell.reservation_id) || null,
        conversation: conversationsById.get(upsell.conversation_id) || null
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        upsells: [],
        error: error.message
      },
      { status: 500 }
    );
  }
}
