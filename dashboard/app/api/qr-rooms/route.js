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

const isMissingHotelRoomsTable = (error) => (
  error?.message?.includes('hotel_rooms')
  || error?.details?.includes('hotel_rooms')
  || error?.hint?.includes('hotel_rooms')
);

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

const normalizeOptional = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

const normalizeBoolean = (value, fallback = true) => (
  value === undefined ? fallback : Boolean(value)
);

const buildRoomPayload = ({ hotelId, body = {}, source = 'manual' }) => {
  const roomNumber = normalizeRoom(body.room_number || body.roomNumber);

  if (!roomNumber) {
    throw new Error('Room number is required');
  }

  return {
    hotel_id: hotelId,
    room_number: roomNumber,
    floor: normalizeOptional(body.floor),
    room_type: normalizeOptional(body.room_type || body.roomType),
    active: normalizeBoolean(body.active, true),
    qr_enabled: normalizeBoolean(body.qr_enabled ?? body.qrEnabled, true),
    source,
    pms_provider: normalizeOptional(body.pms_provider || body.pmsProvider),
    pms_room_id: normalizeOptional(body.pms_room_id || body.pmsRoomId),
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    updated_at: new Date().toISOString()
  };
};

const getHotelRooms = async ({ supabase, hotelId, includeInactive = false }) => {
  let query = supabase
    .from('hotel_rooms')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('room_number', { ascending: true });

  if (!includeInactive) {
    query = query.eq('active', true).eq('qr_enabled', true);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingHotelRoomsTable(error)) {
      return {
        rooms: [],
        missingTable: true
      };
    }

    throw error;
  }

  return {
    rooms: uniqueRooms((data || []).map((room) => ({
      ...room,
      source: room.source || 'hotel_rooms'
    }))),
    missingTable: false
  };
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

const assertCanManageRooms = (role) => canAccess(role, 'qr_rooms_manage');

export async function GET(request) {
  try {
    const { supabase, hotel, role, fallback, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, hotel: null, hotelId: null, rooms: [], error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!canAccess(role, 'qr_rooms')) {
      return NextResponse.json({ ok: false, hotel, hotelId: hotel.id, rooms: [], error: 'Access denied' }, { status: 403, ...noStore });
    }

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true';
    const [{ rooms: officialRooms, missingTable }, detectedRooms] = await Promise.all([
      getHotelRooms({ supabase, hotelId: hotel.id, includeInactive }),
      getReservationLinkedRooms({ supabase, hotelId: hotel.id })
    ]);
    const rooms = missingTable ? uniqueRooms(detectedRooms) : officialRooms;
    const roomSource = missingTable
      ? rooms.length ? 'legacy_reservation_guest_rooms' : 'none'
      : rooms.length ? 'hotel_rooms' : 'none';

    if (process.env.NODE_ENV !== 'production') {
      console.info('qr rooms loaded', {
        hotelId: hotel.id,
        count: rooms.length,
        officialCount: officialRooms.length,
        detectedCount: detectedRooms.length,
        missingTable,
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
      detectedRooms: uniqueRooms(detectedRooms),
      missingHotelRoomsTable: missingTable,
      canManageRooms: assertCanManageRooms(role),
      role,
      roomSource,
      officialRoomSource: {
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

export async function POST(request) {
  try {
    const { supabase, hotel, role, fallback, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, hotelId: null, error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!assertCanManageRooms(role)) {
      return NextResponse.json({ ok: false, hotelId: hotel.id, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const body = await request.json();
    const action = body.action || 'create_room';

    if (action === 'import_detected_rooms') {
      const detectedRooms = await getReservationLinkedRooms({ supabase, hotelId: hotel.id });
      const payloads = uniqueRooms(detectedRooms).map((room) => buildRoomPayload({
        hotelId: hotel.id,
        body: {
          room_number: room.room_number,
          pms_provider: room.pms_provider,
          metadata: {
            imported_from: room.source,
            reservation_id: room.reservation_id || null,
            pms_reservation_id: room.pms_reservation_id || null
          }
        },
        source: 'reservation_detected'
      }));

      if (!payloads.length) {
        return NextResponse.json({ ok: true, hotelId: hotel.id, rooms: [], imported: 0 }, noStore);
      }

      const { data, error } = await supabase
        .from('hotel_rooms')
        .upsert(payloads, { onConflict: 'hotel_id,room_number' })
        .select('*');

      if (error) {
        throw error;
      }

      return NextResponse.json({ ok: true, hotelId: hotel.id, rooms: data || [], imported: data?.length || 0 }, noStore);
    }

    const payload = buildRoomPayload({ hotelId: hotel.id, body });
    const { data, error } = await supabase
      .from('hotel_rooms')
      .upsert(payload, { onConflict: 'hotel_id,room_number' })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, hotelId: hotel.id, room: data }, noStore);
  } catch (error) {
    console.error('QR room create failed', error);
    return NextResponse.json({
      ok: false,
      error: isMissingHotelRoomsTable(error)
        ? 'Run supabase/sql/create_hotel_rooms.sql to enable room management.'
        : error.message || 'Could not create room'
    }, { status: isMissingHotelRoomsTable(error) ? 400 : 500, ...noStore });
  }
}

export async function PATCH(request) {
  try {
    const { supabase, hotel, role, fallback, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, hotelId: null, error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!assertCanManageRooms(role)) {
      return NextResponse.json({ ok: false, hotelId: hotel.id, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const body = await request.json();
    const roomId = body.id || body.roomId;

    if (!roomId) {
      return NextResponse.json({ ok: false, hotelId: hotel.id, error: 'Room id is required' }, { status: 400, ...noStore });
    }

    const updates = {
      floor: normalizeOptional(body.floor),
      room_type: normalizeOptional(body.room_type || body.roomType),
      active: normalizeBoolean(body.active, true),
      qr_enabled: normalizeBoolean(body.qr_enabled ?? body.qrEnabled, true),
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      updated_at: new Date().toISOString()
    };

    if (body.room_number || body.roomNumber) {
      updates.room_number = normalizeRoom(body.room_number || body.roomNumber);
    }

    const { data, error } = await supabase
      .from('hotel_rooms')
      .update(updates)
      .eq('id', roomId)
      .eq('hotel_id', hotel.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, hotelId: hotel.id, room: data }, noStore);
  } catch (error) {
    console.error('QR room update failed', error);
    return NextResponse.json({
      ok: false,
      error: isMissingHotelRoomsTable(error)
        ? 'Run supabase/sql/create_hotel_rooms.sql to enable room management.'
        : error.message || 'Could not update room'
    }, { status: isMissingHotelRoomsTable(error) ? 400 : 500, ...noStore });
  }
}

export async function DELETE(request) {
  try {
    const { supabase, hotel, role, fallback, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, hotelId: null, error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!assertCanManageRooms(role)) {
      return NextResponse.json({ ok: false, hotelId: hotel.id, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const body = await request.json();
    const roomId = body.id || body.roomId;

    if (!roomId) {
      return NextResponse.json({ ok: false, hotelId: hotel.id, error: 'Room id is required' }, { status: 400, ...noStore });
    }

    const { error } = await supabase
      .from('hotel_rooms')
      .delete()
      .eq('id', roomId)
      .eq('hotel_id', hotel.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, hotelId: hotel.id }, noStore);
  } catch (error) {
    console.error('QR room delete failed', error);
    return NextResponse.json({
      ok: false,
      error: isMissingHotelRoomsTable(error)
        ? 'Run supabase/sql/create_hotel_rooms.sql to enable room management.'
        : error.message || 'Could not delete room'
    }, { status: isMissingHotelRoomsTable(error) ? 400 : 500, ...noStore });
  }
}
