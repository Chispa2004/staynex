import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';

const nowIso = () => new Date().toISOString();

export async function POST(request) {
  try {
    const { supabase, hotel } = await getCurrentHotelForRequest(request);
    const timestamp = Date.now();
    const { data: guest, error: guestError } = await supabase
      .from('guests')
      .insert({
        hotel_id: hotel.id,
        phone_number: `+34000${String(timestamp).slice(-6)}`,
        current_room: '208',
        preferred_language: 'es'
      })
      .select('*')
      .single();

    if (guestError) {
      throw guestError;
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        hotel_id: hotel.id,
        guest_id: guest.id,
        status: 'active',
        last_message_at: nowIso()
      })
      .select('*')
      .single();

    if (conversationError) {
      throw conversationError;
    }

    const { error: messagesError } = await supabase
      .from('messages')
      .insert([
        {
          conversation_id: conversation.id,
          sender_type: 'guest',
          content: 'Necesito dos toallas en la habitacion 208',
          created_at: nowIso()
        },
        {
          conversation_id: conversation.id,
          sender_type: 'ai',
          content: 'Claro. Aviso al equipo para llevarte las toallas a la habitacion 208.',
          created_at: nowIso()
        }
      ]);

    if (messagesError) {
      throw messagesError;
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        hotel_id: hotel.id,
        guest_id: guest.id,
        conversation_id: conversation.id,
        room_number: '208',
        category: 'housekeeping',
        title: 'Solicitud de toallas',
        description: 'Demo onboarding: el huesped solicita dos toallas.',
        priority: 'normal',
        status: 'open',
        created_at: nowIso()
      })
      .select('*')
      .single();

    if (ticketError) {
      throw ticketError;
    }

    return NextResponse.json({
      ok: true,
      guest,
      conversation,
      ticket
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Could not create onboarding demo data'
    }, { status: 400 });
  }
}
