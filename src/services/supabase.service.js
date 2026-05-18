import { createClient } from '@supabase/supabase-js';

let supabase;

const isMissingPreferredLanguageColumn = (error) => (
  error?.message?.includes('preferred_language')
  || error?.details?.includes('preferred_language')
  || error?.hint?.includes('preferred_language')
);

const isMissingMessageTranslationColumn = (error) => (
  error?.message?.includes('original_language')
  || error?.message?.includes('translated_language')
  || error?.message?.includes('translated_text')
  || error?.message?.includes('translation_provider')
  || error?.message?.includes('translation_confidence')
  || error?.message?.includes('metadata')
  || error?.details?.includes('original_language')
  || error?.details?.includes('translated_language')
  || error?.details?.includes('translated_text')
  || error?.details?.includes('translation_provider')
  || error?.details?.includes('translation_confidence')
  || error?.details?.includes('metadata')
  || error?.hint?.includes('original_language')
  || error?.hint?.includes('translated_language')
  || error?.hint?.includes('translated_text')
  || error?.hint?.includes('translation_provider')
  || error?.hint?.includes('translation_confidence')
  || error?.hint?.includes('metadata')
);

export const getSupabase = () => {
  if (supabase) {
    return supabase;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are not configured');
  }

  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  return supabase;
};

export const findHotelByWhatsappNumber = async (whatsappNumber) => {
  const client = getSupabase();
  const cleanNumber = whatsappNumber?.replace(/^whatsapp:/, '');
  const candidates = [...new Set([whatsappNumber, cleanNumber].filter(Boolean))];

  const { data, error } = await client
    .from('hotels')
    .select('*')
    .in('whatsapp_number', candidates)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const findDefaultHotel = async () => {
  const client = getSupabase();

  const { data, error } = await client
    .from('hotels')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const createLocalTestHotel = async () => {
  const client = getSupabase();

  const { data, error } = await client
    .from('hotels')
    .insert({
      name: 'Staynex Demo Hotel',
      whatsapp_number: 'local-test'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const getOrCreateLocalTestHotel = async () => {
  const existingHotel = await findDefaultHotel();

  if (existingHotel) {
    return existingHotel;
  }

  return createLocalTestHotel();
};

export const getHotelKnowledge = async (hotelId) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('hotel_knowledge')
    .select('key, value')
    .eq('hotel_id', hotelId);

  if (error) {
    throw error;
  }

  return data || [];
};

export const findGuestByPhone = async ({ hotelId, phoneNumber }) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('phone_number', phoneNumber)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const createGuest = async ({ hotelId, phoneNumber, roomNumber, preferredLanguage = 'es' }) => {
  const client = getSupabase();

  const guestRecord = {
    hotel_id: hotelId,
    phone_number: phoneNumber,
    current_room: roomNumber || null,
    preferred_language: preferredLanguage
  };

  const { data, error } = await client
    .from('guests')
    .insert(guestRecord)
    .select('*')
    .single();

  if (error && isMissingPreferredLanguageColumn(error)) {
    const { data: fallbackData, error: fallbackError } = await client
      .from('guests')
      .insert({
        hotel_id: hotelId,
        phone_number: phoneNumber,
        current_room: roomNumber || null
      })
      .select('*')
      .single();

    if (fallbackError) {
      throw fallbackError;
    }

    return {
      ...fallbackData,
      preferred_language: preferredLanguage
    };
  }

  if (error) {
    throw error;
  }

  return data;
};

export const updateGuestLanguage = async ({ guestId, preferredLanguage }) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('guests')
    .update({
      preferred_language: preferredLanguage
    })
    .eq('id', guestId)
    .select('*')
    .single();

  if (error && isMissingPreferredLanguageColumn(error)) {
    const { data: guest, error: guestError } = await client
      .from('guests')
      .select('*')
      .eq('id', guestId)
      .single();

    if (guestError) {
      throw guestError;
    }

    return {
      ...guest,
      preferred_language: preferredLanguage
    };
  }

  if (error) {
    throw error;
  }

  return data;
};

export const updateGuestRoom = async ({ guestId, roomNumber }) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('guests')
    .update({
      current_room: roomNumber
    })
    .eq('id', guestId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const findActiveConversation = async ({ hotelId, guestId }) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('conversations')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('guest_id', guestId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const createConversation = async ({ hotelId, guestId }) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('conversations')
    .insert({
      hotel_id: hotelId,
      guest_id: guestId,
      status: 'active',
      last_message_at: new Date().toISOString()
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const touchConversation = async (conversationId) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString()
    })
    .eq('id', conversationId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const createMessage = async ({
  conversationId,
  senderType,
  content,
  originalLanguage = null,
  translatedLanguage = null,
  translatedText = null,
  translationProvider = null,
  translationConfidence = null,
  metadata = null
}) => {
  const client = getSupabase();
  const messageRecord = {
    conversation_id: conversationId,
    sender_type: senderType,
    content,
    original_language: originalLanguage,
    translated_language: translatedLanguage,
    translated_text: translatedText,
    translation_provider: translationProvider,
    translation_confidence: translationConfidence,
    metadata: metadata || {}
  };

  let { data, error } = await client
    .from('messages')
    .insert(messageRecord)
    .select('*')
    .single();

  if (error && isMissingMessageTranslationColumn(error)) {
    const fallbackResult = await client
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: senderType,
        content
      })
      .select('*')
      .single();

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw error;
  }

  return data;
};

export const getRecentMessages = async ({ conversationId, limit = 8 }) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('messages')
    .select('id, sender_type, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []).reverse();
};

export const getOpenTicketsForGuest = async ({ guestId, limit = 5 }) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('tickets')
    .select('id, room_number, category, title, description, priority, status, created_at')
    .eq('guest_id', guestId)
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
};

export const findConversationWithGuest = async (conversationId) => {
  const client = getSupabase();

  const { data: conversation, error: conversationError } = await client
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (conversationError) {
    throw conversationError;
  }

  if (!conversation) {
    return null;
  }

  const { data: guest, error: guestError } = await client
    .from('guests')
    .select('*')
    .eq('id', conversation.guest_id)
    .maybeSingle();

  if (guestError) {
    throw guestError;
  }

  return {
    ...conversation,
    guest
  };
};

export const createTicketRecord = async ({
  hotelId,
  guestId,
  conversationId,
  roomNumber,
  category,
  title,
  description,
  priority
}) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('tickets')
    .insert({
      hotel_id: hotelId,
      guest_id: guestId,
      conversation_id: conversationId,
      room_number: roomNumber || null,
      category,
      title,
      description,
      priority,
      status: 'open'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};
