import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess, getPermissionsForRole } from '@/lib/permissions';

const isMissingUpsellsTable = (error) => (
  error?.message?.includes('ai_upsells')
  || error?.details?.includes('ai_upsells')
  || error?.hint?.includes('ai_upsells')
);

const isMissingRevenueTable = (error) => (
  error?.message?.includes('upsell_conversions')
  || error?.details?.includes('upsell_conversions')
  || error?.hint?.includes('upsell_conversions')
);

const revenueDefaults = {
  late_checkout: 40,
  room_upgrade: 120,
  airport_transfer: 60,
  spa: 80,
  romantic_package: 150,
  dinner: 90,
  breakfast_upgrade: 25
};

const getDefaultAmount = (type) => revenueDefaults[type] || 50;

export async function GET(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'upsells')) {
      return NextResponse.json({ hotel, upsells: [], error: 'Access denied' }, { status: 403 });
    }

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

    const { data: conversions = [], error: conversionsError } = (upsells || []).length
      ? await supabase
        .from('upsell_conversions')
        .select('*')
        .eq('hotel_id', hotel.id)
        .in('upsell_id', (upsells || []).map((item) => item.id))
      : { data: [], error: null };

    if (conversionsError && !isMissingRevenueTable(conversionsError)) {
      throw conversionsError;
    }

    const conversionsByUpsellId = new Map((conversions || []).map((conversion) => [conversion.upsell_id, conversion]));

    const [
      { data: guests = [] },
      { data: reservations = [] },
      { data: conversations = [] }
    ] = await Promise.all([
      guestIds.length
        ? supabase.from('guests').select('id, phone_number, current_room').eq('hotel_id', hotel.id).in('id', guestIds)
        : Promise.resolve({ data: [] }),
      reservationIds.length
        ? supabase.from('reservations').select('id, pms_reservation_id, guest_name, arrival_date, departure_date').eq('hotel_id', hotel.id).in('id', reservationIds)
        : Promise.resolve({ data: [] }),
      conversationIds.length
        ? supabase.from('conversations').select('id, status, last_message_at').eq('hotel_id', hotel.id).in('id', conversationIds)
        : Promise.resolve({ data: [] })
    ]);

    const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
    const reservationsById = new Map(reservations.map((reservation) => [reservation.id, reservation]));
    const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]));

    return NextResponse.json({
      hotel,
      role,
      permissions: getPermissionsForRole(role),
      upsells: (upsells || []).map((upsell) => ({
        ...upsell,
        guest: guestsById.get(upsell.guest_id) || null,
        reservation: reservationsById.get(upsell.reservation_id) || null,
        conversation: conversationsById.get(upsell.conversation_id) || null,
        conversion: conversionsByUpsellId.get(upsell.id) || null,
        estimated_amount: conversionsByUpsellId.get(upsell.id)?.estimated_amount ?? getDefaultAmount(upsell.upsell_type)
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

const getUpsellForHotel = async ({ supabase, hotelId, upsellId }) => {
  const { data, error } = await supabase
    .from('ai_upsells')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('id', upsellId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const ensureConversion = async ({ supabase, upsell, status = 'pending' }) => {
  const { data: existing, error: existingError } = await supabase
    .from('upsell_conversions')
    .select('*')
    .eq('hotel_id', upsell.hotel_id)
    .eq('upsell_id', upsell.id)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    if (isMissingRevenueTable(existingError)) {
      return null;
    }

    throw existingError;
  }

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from('upsell_conversions')
    .insert({
      hotel_id: upsell.hotel_id,
      guest_id: upsell.guest_id,
      reservation_id: upsell.reservation_id,
      conversation_id: upsell.conversation_id,
      upsell_id: upsell.id,
      upsell_type: upsell.upsell_type,
      source: 'ai_upsell',
      status,
      estimated_amount: getDefaultAmount(upsell.upsell_type),
      currency: 'EUR',
      notes: `Created from AI upsell ${upsell.id}`
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingRevenueTable(error)) {
      return null;
    }

    throw error;
  }

  return data;
};

export async function PATCH(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'upsells_manage')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const body = await request.json();
    const action = body.action;
    const upsellId = body.upsellId;

    if (!hotel?.id || !upsellId || !['send_offer', 'mark_accepted', 'mark_rejected'].includes(action)) {
      return NextResponse.json({
        error: 'Invalid upsell action'
      }, { status: 400 });
    }

    const upsell = await getUpsellForHotel({
      supabase,
      hotelId: hotel.id,
      upsellId
    });

    if (!upsell) {
      return NextResponse.json({
        error: 'Upsell not found'
      }, { status: 404 });
    }

    const conversion = await ensureConversion({
      supabase,
      upsell,
      status: action === 'send_offer' ? 'sent' : action === 'mark_accepted' ? 'accepted' : 'rejected'
    });

    if (!conversion) {
      return NextResponse.json({
        error: 'upsell_conversions table is not available. Run supabase/sql/create_upsell_conversions.sql'
      }, { status: 500 });
    }

    const now = new Date().toISOString();
    const conversionUpdates = {
      updated_at: now
    };
    const upsellUpdates = {};

    if (action === 'send_offer') {
      conversionUpdates.status = 'sent';
      conversionUpdates.offer_sent_at = conversion.offer_sent_at || now;
      upsellUpdates.status = 'shown';
    }

    if (action === 'mark_accepted') {
      conversionUpdates.status = 'accepted';
      conversionUpdates.accepted_at = conversion.accepted_at || now;
      conversionUpdates.offer_sent_at = conversion.offer_sent_at || now;
      upsellUpdates.status = 'accepted';
      upsellUpdates.accepted = true;
      upsellUpdates.rejected = false;
    }

    if (action === 'mark_rejected') {
      conversionUpdates.status = 'rejected';
      conversionUpdates.offer_sent_at = conversion.offer_sent_at || now;
      upsellUpdates.status = 'rejected';
      upsellUpdates.accepted = false;
      upsellUpdates.rejected = true;
    }

    const [{ data: updatedConversion, error: conversionError }, { data: updatedUpsell, error: upsellError }] = await Promise.all([
      supabase
        .from('upsell_conversions')
        .update(conversionUpdates)
        .eq('id', conversion.id)
        .select('*')
        .single(),
      supabase
        .from('ai_upsells')
        .update(upsellUpdates)
        .eq('id', upsell.id)
        .select('*')
        .single()
    ]);

    if (conversionError) {
      throw conversionError;
    }

    if (upsellError) {
      throw upsellError;
    }

    return NextResponse.json({
      upsell: {
        ...updatedUpsell,
        conversion: updatedConversion,
        estimated_amount: updatedConversion.estimated_amount
      },
      conversion: updatedConversion
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}
