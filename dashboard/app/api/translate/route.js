import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const getBackendUrl = () => (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3000'
);

const isMissingPreferenceColumns = (error) => (
  error?.message?.includes('preferred_translation_language')
  || error?.message?.includes('preferred_dashboard_language')
  || error?.details?.includes('preferred_translation_language')
  || error?.details?.includes('preferred_dashboard_language')
);

const normalizeLanguage = (value) => {
  const language = String(value || '').trim().toLowerCase();
  return ['es', 'en', 'fr', 'de', 'it', 'pt'].includes(language) ? language : 'es';
};

export async function POST(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!hotel?.id || !canAccess(role, 'inbox')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const messageId = body.messageId || null;

    if (messageId) {
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .select('id, conversation_id')
        .eq('id', messageId)
        .maybeSingle();

      if (messageError) {
        throw messageError;
      }

      if (!message) {
        return NextResponse.json({ error: 'Message not found in active workspace' }, { status: 404 });
      }

      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', message.conversation_id)
        .eq('hotel_id', hotel.id)
        .maybeSingle();

      if (conversationError) {
        throw conversationError;
      }

      if (!conversation) {
        return NextResponse.json({ error: 'Message not found in active workspace' }, { status: 404 });
      }
    }

    const response = await fetch(`${getBackendUrl()}/messages/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: body.text,
        sourceLanguage: body.sourceLanguage,
        targetLanguage: normalizeLanguage(body.targetLanguage),
        messageId,
        hotelId: hotel.id
      })
    });
    const payload = await response.json();

    return NextResponse.json(payload, {
      status: response.status
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Translation failed' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const {
      supabase,
      hotel,
      hotelUser,
      role,
      user
    } = await getCurrentHotelForRequest(request);

    if (!hotel?.id || !canAccess(role, 'inbox')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const preferredTranslationLanguage = normalizeLanguage(body.preferredTranslationLanguage);

    if (hotelUser?.id) {
      const { error } = await supabase
        .from('hotel_users')
        .update({
          preferred_translation_language: preferredTranslationLanguage,
          updated_at: new Date().toISOString()
        })
        .eq('id', hotelUser.id)
        .eq('hotel_id', hotel.id);

      if (error && !isMissingPreferenceColumns(error)) {
        throw error;
      }
    } else if (user?.id) {
      const { error } = await supabase
        .from('hotel_users')
        .update({
          preferred_translation_language: preferredTranslationLanguage,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('hotel_id', hotel.id);

      if (error && !isMissingPreferenceColumns(error)) {
        throw error;
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info('inbox_translation_language_changed', {
        hotelId: hotel.id,
        preferredTranslationLanguage
      });
    }

    return NextResponse.json({
      ok: true,
      preferredTranslationLanguage
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save translation language' },
      { status: 500 }
    );
  }
}
