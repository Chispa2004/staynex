import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const isMissingAutomationTables = (error) => (
  error?.message?.includes('automation_rules')
  || error?.message?.includes('scheduled_messages')
  || error?.details?.includes('automation_rules')
  || error?.details?.includes('scheduled_messages')
  || error?.hint?.includes('automation_rules')
  || error?.hint?.includes('scheduled_messages')
);

export async function GET(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'automations')) {
      return NextResponse.json({ hotel, scheduledMessages: [], rules: [], error: 'Access denied' }, { status: 403 });
    }

    if (!hotel?.id) {
      return NextResponse.json({ hotel, scheduledMessages: [], rules: [] });
    }

    const [{ data: scheduledMessages, error }, { data: rules, error: rulesError }] = await Promise.all([
      supabase
        .from('scheduled_messages')
        .select('*')
        .eq('hotel_id', hotel.id)
        .order('scheduled_for', { ascending: false })
        .limit(150),
      supabase
        .from('automation_rules')
        .select('*')
        .eq('hotel_id', hotel.id)
        .order('automation_type', { ascending: true })
    ]);

    if (error) {
      if (isMissingAutomationTables(error)) {
        return NextResponse.json({ hotel, scheduledMessages: [], rules: [] });
      }

      throw error;
    }

    if (rulesError && !isMissingAutomationTables(rulesError)) {
      throw rulesError;
    }

    const guestIds = [...new Set((scheduledMessages || []).map((item) => item.guest_id).filter(Boolean))];
    const reservationIds = [...new Set((scheduledMessages || []).map((item) => item.reservation_id).filter(Boolean))];

    const [{ data: guests = [] }, { data: reservations = [] }] = await Promise.all([
      guestIds.length
        ? supabase.from('guests').select('id, phone_number, current_room').in('id', guestIds)
        : Promise.resolve({ data: [] }),
      reservationIds.length
        ? supabase.from('reservations').select('id, pms_reservation_id, guest_name, arrival_date, departure_date').in('id', reservationIds)
        : Promise.resolve({ data: [] })
    ]);

    const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
    const reservationsById = new Map(reservations.map((reservation) => [reservation.id, reservation]));

    return NextResponse.json({
      hotel,
      rules: rules || [],
      scheduledMessages: (scheduledMessages || []).map((message) => ({
        ...message,
        guest: guestsById.get(message.guest_id) || null,
        reservation: reservationsById.get(message.reservation_id) || null
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        scheduledMessages: [],
        rules: [],
        error: error.message
      },
      { status: 500 }
    );
  }
}
