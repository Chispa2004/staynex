import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const isMissingGuestMemoryTable = (error) => (
  error?.message?.includes('guest_memory')
  || error?.details?.includes('guest_memory')
  || error?.hint?.includes('guest_memory')
);

export async function GET(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'guest_memory')) {
      return NextResponse.json({ hotel, memories: [], error: 'Access denied' }, { status: 403 });
    }

    if (!hotel?.id) {
      return NextResponse.json({ hotel, hotelId: null, memories: [] });
    }

    const { data: memories, error } = await supabase
      .from('guest_memory')
      .select('*')
      .eq('hotel_id', hotel.id)
      .order('updated_at', { ascending: false })
      .limit(250);

    if (error) {
      if (isMissingGuestMemoryTable(error)) {
        return NextResponse.json({ hotel, hotelId: hotel.id, memories: [] });
      }

      throw error;
    }

    const guestIds = [...new Set((memories || []).map((item) => item.guest_id).filter(Boolean))];
    const { data: guests = [], error: guestsError } = guestIds.length
      ? await supabase
        .from('guests')
        .select('id, phone_number, current_room, preferred_language')
        .in('id', guestIds)
      : { data: [], error: null };

    if (guestsError) {
      throw guestsError;
    }

    const guestsById = new Map(guests.map((guest) => [guest.id, guest]));

    return NextResponse.json({
      hotel,
      hotelId: hotel.id,
      memories: (memories || []).map((memory) => ({
        ...memory,
        guest: guestsById.get(memory.guest_id) || null
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { memories: [], error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'guest_memory')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const body = await request.json();

    if (!body.id) {
      throw new Error('id is required');
    }

    const updates = {
      updated_at: new Date().toISOString()
    };

    if (body.memory_value !== undefined) updates.memory_value = String(body.memory_value);
    if (body.confidence !== undefined) updates.confidence = Number(body.confidence);
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

    const { data, error } = await supabase
      .from('guest_memory')
      .update(updates)
      .eq('id', body.id)
      .eq('hotel_id', hotel.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ memory: data });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'guest_memory')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const body = await request.json();

    if (!body.id) {
      throw new Error('id is required');
    }

    const { error } = await supabase
      .from('guest_memory')
      .delete()
      .eq('id', body.id)
      .eq('hotel_id', hotel.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ id: body.id });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
