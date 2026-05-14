import { getSupabaseAdmin } from './supabase';
import { getDefaultHotel } from './current-hotel';

const groupMessagesByConversation = (messages) => messages.reduce((groups, message) => {
  const current = groups.get(message.conversation_id) || [];
  current.push(message);
  groups.set(message.conversation_id, current);
  return groups;
}, new Map());

const getLatestAiLogsByConversation = async ({ supabase, conversationIds }) => {
  try {
    const { data, error } = await supabase
      .from('ai_logs')
      .select('conversation_id, needs_human, human_reason, confidence_score, detected_intent, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      throw error;
    }

    return (data || []).reduce((logsByConversation, log) => {
      if (!logsByConversation.has(log.conversation_id)) {
        logsByConversation.set(log.conversation_id, log);
      }

      return logsByConversation;
    }, new Map());
  } catch (error) {
    console.warn('Inbox AI log metadata unavailable', error.message);
    return new Map();
  }
};

const getActiveUpsellsByConversation = async ({ supabase, conversationIds }) => {
  try {
    const { data, error } = await supabase
      .from('ai_upsells')
      .select('id, conversation_id, upsell_type, title, confidence, status, created_at')
      .in('conversation_id', conversationIds)
      .in('status', ['suggested', 'shown'])
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      throw error;
    }

    return (data || []).reduce((upsellsByConversation, upsell) => {
      const current = upsellsByConversation.get(upsell.conversation_id) || [];
      current.push(upsell);
      upsellsByConversation.set(upsell.conversation_id, current);
      return upsellsByConversation;
    }, new Map());
  } catch (error) {
    console.warn('Inbox upsell metadata unavailable', error.message);
    return new Map();
  }
};

const getActiveOffersByConversation = async ({ supabase, conversationIds }) => {
  try {
    const { data, error } = await supabase
      .from('ai_offers')
      .select('id, conversation_id, offer_type, suggested_price, currency, status, confidence, ai_reason, created_at')
      .in('conversation_id', conversationIds)
      .in('status', ['suggested', 'sent'])
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      throw error;
    }

    return (data || []).reduce((offersByConversation, offer) => {
      const current = offersByConversation.get(offer.conversation_id) || [];
      current.push(offer);
      offersByConversation.set(offer.conversation_id, current);
      return offersByConversation;
    }, new Map());
  } catch (error) {
    console.warn('Inbox AI offer metadata unavailable', error.message);
    return new Map();
  }
};

const getGuestMemoryByGuest = async ({ supabase, guestIds }) => {
  try {
    const { data, error } = await supabase
      .from('guest_memory')
      .select('id, guest_id, memory_type, memory_key, memory_value, confidence, is_active, updated_at')
      .in('guest_id', guestIds)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(500);

    if (error) {
      throw error;
    }

    return (data || []).reduce((memoryByGuest, memory) => {
      const current = memoryByGuest.get(memory.guest_id) || [];
      current.push(memory);
      memoryByGuest.set(memory.guest_id, current);
      return memoryByGuest;
    }, new Map());
  } catch (error) {
    console.warn('Inbox guest memory unavailable', error.message);
    return new Map();
  }
};

export const getInboxConversations = async ({ supabase = getSupabaseAdmin(), hotelId = null } = {}) => {
  let resolvedHotelId = hotelId;

  if (!resolvedHotelId) {
    try {
      const defaultHotel = await getDefaultHotel(supabase);
      resolvedHotelId = defaultHotel?.id || null;
    } catch (error) {
      console.warn('Inbox default hotel fallback unavailable', error.message);
    }
  }

  let conversationsQuery = supabase
    .from('conversations')
    .select('id, hotel_id, guest_id, status, last_message_at, created_at')
    .order('last_message_at', { ascending: false });

  if (resolvedHotelId) {
    conversationsQuery = conversationsQuery.eq('hotel_id', resolvedHotelId);
  }

  const { data: conversations, error: conversationsError } = await conversationsQuery;

  if (conversationsError) {
    throw conversationsError;
  }

  if (!conversations?.length) {
    return [];
  }

  const guestIds = [...new Set(conversations.map((conversation) => conversation.guest_id))];
  const conversationIds = conversations.map((conversation) => conversation.id);

  const [{ data: guests, error: guestsError }, { data: messages, error: messagesError }, aiLogsByConversation, upsellsByConversation, offersByConversation, memoryByGuest] = await Promise.all([
    supabase
      .from('guests')
      .select('id, phone_number, current_room')
      .in('id', guestIds),
    supabase
      .from('messages')
      .select('id, conversation_id, sender_type, content, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true }),
    getLatestAiLogsByConversation({ supabase, conversationIds }),
    getActiveUpsellsByConversation({ supabase, conversationIds }),
    getActiveOffersByConversation({ supabase, conversationIds }),
    getGuestMemoryByGuest({ supabase, guestIds })
  ]);

  if (guestsError) {
    throw guestsError;
  }

  if (messagesError) {
    throw messagesError;
  }

  const guestsById = new Map((guests || []).map((guest) => [guest.id, guest]));
  const messagesByConversation = groupMessagesByConversation(messages || []);

  return conversations.map((conversation) => {
    const conversationMessages = messagesByConversation.get(conversation.id) || [];
    const lastMessage = conversationMessages[conversationMessages.length - 1] || null;

    return {
      ...conversation,
      guest: guestsById.get(conversation.guest_id) || null,
      guestMemory: memoryByGuest.get(conversation.guest_id) || [],
      messages: conversationMessages,
      lastMessage,
      aiLog: aiLogsByConversation.get(conversation.id) || null,
      upsells: upsellsByConversation.get(conversation.id) || [],
      offers: offersByConversation.get(conversation.id) || []
    };
  });
};
