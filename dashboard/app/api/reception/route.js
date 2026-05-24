import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';
import {
  getReservationDetails,
  searchReservations
} from '@/lib/reception';

const noStore = {
  headers: {
    'Cache-Control': 'no-store'
  }
};

const appendInternalNote = (currentNotes, note, actorLabel) => {
  const cleanNote = String(note || '').trim();
  if (!cleanNote) {
    throw new Error('Note is required');
  }

  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${actorLabel || 'Reception'}: ${cleanNote}`;
  return [entry, currentNotes].filter(Boolean).join('\n');
};

export async function GET(request) {
  try {
    const { supabase, hotel, role, fallback, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, reservations: [], error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!canAccess(role, 'reception')) {
      return NextResponse.json({ ok: false, hotel, reservations: [], error: 'Access denied' }, { status: 403, ...noStore });
    }

    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('reservationId');

    if (reservationId) {
      const reservation = await getReservationDetails({
        supabase,
        hotelId: hotel.id,
        reservationId
      });

      return NextResponse.json({
        ok: true,
        hotel,
        hotelId: hotel.id,
        role,
        reservation
      }, noStore);
    }

    const reservations = await searchReservations({
      supabase,
      hotelId: hotel.id,
      query: searchParams.get('query') || '',
      filters: {
        status: searchParams.get('status') || 'all'
      },
      limit: Number(searchParams.get('limit') || 250)
    });

    return NextResponse.json({
      ok: true,
      hotel,
      hotelId: hotel.id,
      role,
      reservations,
      metrics: {
        total: reservations.length,
        arrivalsToday: reservations.filter((item) => item.reservationStatus === 'arriving_today').length,
        inHouse: reservations.filter((item) => item.reservationStatus === 'in_house').length,
        checkoutToday: reservations.filter((item) => item.reservationStatus === 'checkout_today').length,
        needsAttention: reservations.filter((item) => ['needs_attention', 'missing_data', 'blocked'].includes(item.readiness?.status)).length,
        pendingPayment: reservations.filter((item) => Number(item.checkout?.outstandingBalance || 0) > 0).length
      }
    }, noStore);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reservations: [],
      error: error.message || 'Reception data could not be loaded'
    }, { status: 500, ...noStore });
  }
}

export async function POST(request) {
  try {
    const { supabase, hotel, role, fallback, accessDenied, hotelUser } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!canAccess(role, 'reception')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const body = await request.json();
    const reservationId = body.reservationId;
    const action = body.action;

    if (!reservationId) {
      return NextResponse.json({ ok: false, error: 'Reservation is required' }, { status: 400, ...noStore });
    }

    const { data: reservation, error: readError } = await supabase
      .from('reservations')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('id', reservationId)
      .maybeSingle();

    if (readError) {
      throw readError;
    }

    if (!reservation) {
      return NextResponse.json({ ok: false, error: 'Reservation not found' }, { status: 404, ...noStore });
    }

    const actorLabel = hotelUser?.email || role || 'Reception';
    const noteText = action === 'mark_needs_attention'
      ? body.note || 'Marked as needs attention from Reception / Pre Check-in.'
      : body.note;
    const nextNotes = appendInternalNote(reservation.notes, noteText, actorLabel);
    const { data, error } = await supabase
      .from('reservations')
      .update({
        notes: nextNotes,
        updated_at: new Date().toISOString()
      })
      .eq('hotel_id', hotel.id)
      .eq('id', reservationId)
      .select('*')
      .single();

    if (error) {
      const missingNotesColumn = error.message?.includes('notes')
        || error.details?.includes('notes')
        || error.hint?.includes('notes');

      if (missingNotesColumn && reservation.guest_id) {
        const { error: memoryError } = await supabase
          .from('guest_memory')
          .insert({
            hotel_id: hotel.id,
            guest_id: reservation.guest_id,
            memory_key: action === 'mark_needs_attention' ? 'reception_needs_attention' : 'reception_note',
            memory_value: noteText,
            memory_type: 'operational_note'
          });

        if (memoryError) {
          throw memoryError;
        }

        return NextResponse.json({
          ok: true,
          reservation,
          action,
          noteStoredIn: 'guest_memory'
        }, noStore);
      }

      throw error;
    }

    return NextResponse.json({
      ok: true,
      reservation: data,
      action
    }, noStore);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Reception action failed'
    }, { status: 500, ...noStore });
  }
}
