import { getSupabaseAdmin } from './supabase';
import { buildConversationCopilot } from './ai-copilot';

const INBOX_CONVERSATION_LIMIT = 100;
const INBOX_MESSAGE_LIMIT = 3000;

const groupMessagesByConversation = (messages) => messages.reduce((groups, message) => {
  const current = groups.get(message.conversation_id) || [];
  current.push(message);
  groups.set(message.conversation_id, current);
  return groups;
}, new Map());

const isMissingMessageTranslationFields = (error) => (
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
);

const getMessagesForConversations = async ({ supabase, conversationIds }) => {
  const baseSelect = 'id, conversation_id, sender_type, content, created_at';
  const extendedSelect = `${baseSelect}, original_language, translated_language, translated_text, translation_provider, translation_confidence, metadata`;
  let { data, error } = await supabase
    .from('messages')
    .select(extendedSelect)
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true })
    .limit(INBOX_MESSAGE_LIMIT);

  if (error && isMissingMessageTranslationFields(error)) {
    const fallback = await supabase
      .from('messages')
      .select(baseSelect)
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true })
      .limit(INBOX_MESSAGE_LIMIT);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  return data || [];
};

const getLatestAiLogsByConversation = async ({ supabase, conversationIds }) => {
  if (!conversationIds.length) {
    return new Map();
  }

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
  if (!conversationIds.length) {
    return new Map();
  }

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
  if (!conversationIds.length) {
    return new Map();
  }

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

const getExperienceBookingsByConversation = async ({ supabase, conversationIds }) => {
  if (!conversationIds.length) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .from('experience_booking_requests')
      .select('id, conversation_id, experience_title, partner_name, status, estimated_revenue, commission_estimate, requested_date, requested_time, created_at, updated_at, metadata')
      .in('conversation_id', conversationIds)
      .in('status', ['pending', 'reviewing', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      throw error;
    }

    return (data || []).reduce((bookingsByConversation, booking) => {
      const current = bookingsByConversation.get(booking.conversation_id) || [];
      current.push(booking);
      bookingsByConversation.set(booking.conversation_id, current);
      return bookingsByConversation;
    }, new Map());
  } catch (error) {
    console.warn('Inbox experience booking metadata unavailable', error.message);
    return new Map();
  }
};

const getAiStateByConversation = async ({ supabase, conversationIds }) => {
  if (!conversationIds.length) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .from('conversation_ai_state')
      .select('conversation_id, current_intent, previous_intent, intent_confidence, last_offer_type, last_offer_sent_at, sentiment, escalation_level, last_ai_response, ai_summary, ai_reasoning, openai_enhanced, state_metadata, updated_at')
      .in('conversation_id', conversationIds)
      .limit(500);

    if (error) {
      throw error;
    }

    return (data || []).reduce((stateByConversation, state) => {
      stateByConversation.set(state.conversation_id, state);
      return stateByConversation;
    }, new Map());
  } catch (error) {
    console.warn('Inbox AI conversation state unavailable', error.message);
    return new Map();
  }
};

const getGuestMemoryByGuest = async ({ supabase, guestIds, hotelId }) => {
  if (!guestIds.length) {
    return new Map();
  }

  try {
    let query = supabase
      .from('guest_memory')
      .select('id, guest_id, memory_type, memory_key, memory_value, confidence, is_active, updated_at')
      .in('guest_id', guestIds)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(500);

    if (hotelId) {
      query = query.eq('hotel_id', hotelId);
    }

    const { data, error } = await query;

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

const getGuestStayContextByGuest = async ({ supabase, guestIds, hotelId }) => {
  if (!guestIds.length || !hotelId) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .from('guest_stay_context')
      .select('*')
      .eq('hotel_id', hotelId)
      .in('guest_id', guestIds)
      .order('last_updated_at', { ascending: false })
      .limit(500);

    if (error) {
      throw error;
    }

    return (data || []).reduce((contextByGuest, context) => {
      if (!contextByGuest.has(context.guest_id)) {
        contextByGuest.set(context.guest_id, context);
      }

      return contextByGuest;
    }, new Map());
  } catch (error) {
    console.warn('Inbox PMS guest stay context unavailable', error.message);
    return new Map();
  }
};

const getRoomStatusByRoomNumber = async ({ supabase, roomNumbers, hotelId }) => {
  if (!roomNumbers.length || !hotelId) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .from('room_status_snapshots')
      .select('*')
      .eq('hotel_id', hotelId)
      .in('room_number', roomNumbers)
      .order('last_updated_at', { ascending: false })
      .limit(500);

    if (error) {
      throw error;
    }

    return (data || []).reduce((statusByRoom, status) => {
      if (!statusByRoom.has(status.room_number)) {
        statusByRoom.set(status.room_number, status);
      }

      return statusByRoom;
    }, new Map());
  } catch (error) {
    console.warn('Inbox PMS room status unavailable', error.message);
    return new Map();
  }
};

const getGuestIntelligenceByGuest = async ({ supabase, guestIds, hotelId }) => {
  if (!guestIds.length || !hotelId) {
    return new Map();
  }

  try {
    const [profilesResult, affinitiesResult, predictionsResult, signalsResult] = await Promise.all([
      supabase
        .from('guest_intelligence_profiles')
        .select('*')
        .eq('hotel_id', hotelId)
        .in('guest_id', guestIds)
        .order('updated_at', { ascending: false })
        .limit(500),
      supabase
        .from('guest_interest_affinities')
        .select('*')
        .eq('hotel_id', hotelId)
        .in('guest_id', guestIds)
        .order('updated_at', { ascending: false })
        .limit(500),
      supabase
        .from('guest_revenue_predictions')
        .select('*')
        .eq('hotel_id', hotelId)
        .in('guest_id', guestIds)
        .order('generated_at', { ascending: false })
        .limit(500),
      supabase
        .from('guest_behavior_signals')
        .select('*')
        .eq('hotel_id', hotelId)
        .in('guest_id', guestIds)
        .order('created_at', { ascending: false })
        .limit(1000)
    ]);

    const firstByGuest = (rows = [], dateField = 'updated_at') => rows.reduce((acc, row) => {
      const current = acc.get(row.guest_id);
      if (!current || new Date(row[dateField] || 0) > new Date(current[dateField] || 0)) {
        acc.set(row.guest_id, row);
      }
      return acc;
    }, new Map());

    const profiles = firstByGuest(profilesResult.data || []);
    const affinities = firstByGuest(affinitiesResult.data || []);
    const predictions = firstByGuest(predictionsResult.data || [], 'generated_at');
    const signals = (signalsResult.data || []).reduce((acc, signal) => {
      const current = acc.get(signal.guest_id) || [];
      current.push(signal);
      acc.set(signal.guest_id, current);
      return acc;
    }, new Map());

    return guestIds.reduce((acc, guestId) => {
      acc.set(guestId, {
        profile: profiles.get(guestId) || null,
        affinities: affinities.get(guestId) || null,
        prediction: predictions.get(guestId) || null,
        signals: signals.get(guestId) || []
      });
      return acc;
    }, new Map());
  } catch (error) {
    console.warn('Inbox guest intelligence unavailable', error.message);
    return new Map();
  }
};

export const getInboxConversations = async ({ supabase = getSupabaseAdmin(), hotelId = null } = {}) => {
  let resolvedHotelId = hotelId;

  if (!resolvedHotelId) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Inbox tenant gate active: hotelId is required; returning empty conversations.');
    }

    return [];
  }

  let conversationsQuery = supabase
    .from('conversations')
    .select('id, hotel_id, guest_id, status, last_message_at, created_at')
    .order('last_message_at', { ascending: false })
    .limit(INBOX_CONVERSATION_LIMIT);

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

  const guestIds = [...new Set(conversations.map((conversation) => conversation.guest_id).filter(Boolean))];
  const conversationIds = conversations.map((conversation) => conversation.id).filter(Boolean);
  let guestsQuery = guestIds.length
    ? supabase
      .from('guests')
      .select('id, phone_number, current_room, preferred_language')
      .in('id', guestIds)
    : Promise.resolve({ data: [], error: null });

  if (guestIds.length && resolvedHotelId) {
    guestsQuery = guestsQuery.eq('hotel_id', resolvedHotelId);
  }

  const [{ data: guests, error: guestsError }, messages, aiLogsByConversation, upsellsByConversation, offersByConversation, experienceBookingsByConversation, aiStateByConversation, memoryByGuest, stayContextByGuest, intelligenceByGuest] = await Promise.all([
    guestsQuery,
    getMessagesForConversations({ supabase, conversationIds }),
    getLatestAiLogsByConversation({ supabase, conversationIds }),
    getActiveUpsellsByConversation({ supabase, conversationIds }),
    getActiveOffersByConversation({ supabase, conversationIds }),
    getExperienceBookingsByConversation({ supabase, conversationIds }),
    getAiStateByConversation({ supabase, conversationIds }),
    getGuestMemoryByGuest({ supabase, guestIds, hotelId: resolvedHotelId }),
    getGuestStayContextByGuest({ supabase, guestIds, hotelId: resolvedHotelId }),
    getGuestIntelligenceByGuest({ supabase, guestIds, hotelId: resolvedHotelId })
  ]);

  if (guestsError) {
    throw guestsError;
  }

  const guestsById = new Map((guests || []).map((guest) => [guest.id, guest]));
  const roomNumbers = [...new Set((guests || []).map((guest) => guest.current_room).filter(Boolean))];
  const roomStatusByRoom = await getRoomStatusByRoomNumber({
    supabase,
    roomNumbers,
    hotelId: resolvedHotelId
  });
  const messagesByConversation = groupMessagesByConversation(messages || []);

  return conversations.map((conversation) => {
    const conversationMessages = messagesByConversation.get(conversation.id) || [];
    const lastMessage = conversationMessages[conversationMessages.length - 1] || null;
    const guest = guestsById.get(conversation.guest_id) || null;
    const guestStayContext = stayContextByGuest.get(conversation.guest_id) || null;
    const roomStatus = roomStatusByRoom.get(guest?.current_room || guestStayContext?.room_number) || null;
    const enrichedConversation = {
      ...conversation,
      guest,
      guestMemory: memoryByGuest.get(conversation.guest_id) || [],
      messages: conversationMessages,
      lastMessage,
      aiLog: aiLogsByConversation.get(conversation.id) || null,
      upsells: upsellsByConversation.get(conversation.id) || [],
      offers: offersByConversation.get(conversation.id) || [],
      experienceBookings: experienceBookingsByConversation.get(conversation.id) || [],
      aiState: aiStateByConversation.get(conversation.id) || null,
      guestIntelligence: intelligenceByGuest.get(conversation.guest_id) || null,
      pmsIntelligenceContext: {
        stayPhase: guestStayContext?.stay_phase || null,
        roomStatus: roomStatus ? {
          roomNumber: roomStatus.room_number,
          roomType: roomStatus.room_type,
          housekeepingStatus: roomStatus.housekeeping_status,
          maintenanceStatus: roomStatus.maintenance_status,
          occupancyStatus: roomStatus.occupancy_status,
          lastUpdatedAt: roomStatus.last_updated_at
        } : null,
        vipScore: guestStayContext?.vip_score ?? null,
        revenuePotential: guestStayContext?.revenue_potential || 0,
        upgradeEligible: Boolean(guestStayContext?.upgrade_eligible),
        lateCheckoutEligible: Boolean(guestStayContext?.late_checkout_eligible),
        transferLikely: Boolean(guestStayContext?.transfer_likely),
        experienceLikely: Boolean(guestStayContext?.experience_likely),
        guestStayContext
      }
    };

    return {
      ...enrichedConversation,
      copilot: buildConversationCopilot(enrichedConversation)
    };
  });
};
