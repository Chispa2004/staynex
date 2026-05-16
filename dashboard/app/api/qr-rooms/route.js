import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const noStore = {
  headers: {
    'Cache-Control': 'no-store'
  }
};

const normalizeRoom = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

const uniqueRooms = (rooms) => {
  const seen = new Set();

  return rooms
    .map((room) => ({
      ...room,
      room_number: normalizeRoom(room.room_number)
    }))
    .filter((room) => {
      if (!room.room_number || seen.has(room.room_number)) {
        return false;
      }

      seen.add(room.room_number);
      return true;
    })
    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, {
      numeric: true,
      sensitivity: 'base'
    }));
};

const getReservationLinkedRooms = async ({ supabase, hotelId }) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('id, hotel_id, guest_id, pms_provider, pms_reservation_id, arrival_date, departure_date, status')
    .eq('hotel_id', hotelId)
    .in('status', ['confirmed', 'checked_in', 'in_house'])
    .or(`departure_date.gte.${today},departure_date.is.null`)
    .order('arrival_date', { ascending: true, nullsFirst: false })
    .limit(250);

  if (error) {
    throw error;
  }

  const guestIds = [...new Set((reservations || []).map((reservation) => reservation.guest_id).filter(Boolean))];

  if (!guestIds.length) {
    return [];
  }

  const { data: guests, error: guestsError } = await supabase
    .from('guests')
    .select('id, hotel_id, current_room')
    .eq('hotel_id', hotelId)
    .in('id', guestIds)
    .not('current_room', 'is', null)
    .limit(250);

  if (guestsError) {
    throw guestsError;
  }

  const reservationsByGuest = (reservations || []).reduce((acc, reservation) => {
    if (!reservation.guest_id || acc.has(reservation.guest_id)) {
      return acc;
    }

    acc.set(reservation.guest_id, reservation);
    return acc;
  }, new Map());

  return (guests || []).map((guest) => {
    const reservation = reservationsByGuest.get(guest.id);

    return {
      room_number: guest.current_room,
      source: reservation?.pms_provider && reservation.pms_provider !== 'mock'
        ? 'pms_reservation_guest_room'
        : 'reservation_guest_room',
      reservation_id: reservation?.id || null,
      pms_provider: reservation?.pms_provider || null,
      pms_reservation_id: reservation?.pms_reservation_id || null
    };
  });
};

export async function GET(request) {
  try {
    const { supabase, hotel, role, fallback, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, hotel: null, hotelId: null, rooms: [], error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!canAccess(role, 'qr_rooms')) {
      return NextResponse.json({ ok: false, hotel, hotelId: hotel.id, rooms: [], error: 'Access denied' }, { status: 403, ...noStore });
    }

    // Tenant-safe room source v1:
    // 1. PMS/reservation guest room context stored on guests.current_room.
    // 2. Future hotel_rooms/manual setup will plug in here without demo fallbacks.
    const reservationRooms = await getReservationLinkedRooms({ supabase, hotelId: hotel.id });
    const rooms = uniqueRooms(reservationRooms);

    if (process.env.NODE_ENV !== 'production') {
      console.info('qr rooms loaded', {
        hotelId: hotel.id,
        count: rooms.length,
        sources: [...new Set(rooms.map((room) => room.source))]
      });

      if (rooms.length === 0) {
        console.info('no rooms available', { hotelId: hotel.id });
      }
    }

    return NextResponse.json({
      ok: true,
      hotel,
      hotelId: hotel.id,
      fallback: Boolean(fallback),
      whatsappNumber: hotel.whatsapp_number || null,
      rooms,
      roomSource: rooms.length ? 'reservation_guest_rooms' : 'none',
      futureRoomSource: {
        table: 'hotel_rooms',
        fields: ['hotel_id', 'room_number', 'floor', 'active', 'qr_enabled', 'room_type', 'metadata']
      }
    }, noStore);
  } catch (error) {
    console.error('QR rooms API failed', error);
    return NextResponse.json({
      ok: false,
      hotel: null,
      hotelId: null,
      rooms: [],
      error: error.message || 'Could not load QR rooms'
    }, { status: 500, ...noStore });
  }
}
