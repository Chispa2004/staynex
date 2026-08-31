import { getSupabaseAdmin } from './supabase';
import { buildConversationCopilot } from './ai-copilot';
import { isGuestMemoryEnabled } from '../../shared/guest-memory/feature-flag.js';

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

const isMissingGuestIdentityFields = (error) => (
  error?.message?.includes('name')
  || error?.message?.includes('full_name')
  || error?.details?.includes('name')
  || error?.details?.includes('full_name')
);

const getMessagesForConversations = async ({ supabase, conversationIds, hotelId }) => {
  if (!hotelId || !conversationIds.length) {
    return [];
  }

  const baseSelect = 'id, conversation_id, hotel_id, sender_type, content, created_at';
  const extendedSelect = `${baseSelect}, original_language, translated_language, translated_text, translation_provider, translation_confidence, metadata`;
  let { data, error } = await supabase
    .from('messages')
    .select(extendedSelect)
    .eq('hotel_id', hotelId)
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true })
    .limit(INBOX_MESSAGE_LIMIT);

  if (error && isMissingMessageTranslationFields(error)) {
    const fallback = await supabase
      .from('messages')
      .select(baseSelect)
      .eq('hotel_id', hotelId)
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

const getGuestsForInbox = async ({ supabase, guestIds, hotelId }) => {
  if (!guestIds.length || !hotelId) {
    return [];
  }

  const baseSelect = 'id, hotel_id, phone_number, current_room, preferred_language';
  const identitySelect = `${baseSelect}, name, full_name`;
  let { data, error } = await supabase
    .from('guests')
    .select(identitySelect)
    .eq('hotel_id', hotelId)
    .in('id', guestIds);

  if (error && isMissingGuestIdentityFields(error)) {
    const fallback = await supabase
      .from('guests')
      .select(baseSelect)
      .eq('hotel_id', hotelId)
      .in('id', guestIds);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  return data || [];
};

const getLatestAiLogsByConversation = async ({ supabase, conversationIds, hotelId }) => {
  if (!conversationIds.length || !hotelId) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .from('ai_logs')
      .select('conversation_id, needs_human, human_reason, confidence_score, detected_intent, created_at')
      .eq('hotel_id', hotelId)
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

const getAiStateByConversation = async ({ supabase, conversationIds, hotelId }) => {
  if (!conversationIds.length || !hotelId) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .from('conversation_ai_state')
      .select('conversation_id, current_intent, previous_intent, intent_confidence, last_offer_type, last_offer_sent_at, sentiment, escalation_level, last_ai_response, ai_summary, ai_reasoning, openai_enhanced, state_metadata, updated_at')
      .eq('hotel_id', hotelId)
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
  if (!isGuestMemoryEnabled()) {
    return new Map();
  }

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

const RESERVATION_CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'no_show', 'void']);
const RESERVATION_COMPLETED_STATUSES = new Set(['completed', 'checked_out', 'departed']);

const getTodayKey = () => new Date().toISOString().slice(0, 10);
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');
const uniqueById = (rows = []) => [...new Map(rows.map((row) => [row.id, row])).values()];

const reservationDateTime = (reservation = {}) => {
  const value = reservation.arrival_date || reservation.departure_date;
  const time = value ? new Date(`${value}T12:00:00.000Z`).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const scoreReservationForInbox = (reservation = {}) => {
  const today = getTodayKey();
  const status = String(reservation.status || '').toLowerCase();
  const arrival = reservation.arrival_date;
  const departure = reservation.departure_date;

  if (RESERVATION_CANCELLED_STATUSES.has(status)) {
    return -1000 + reservationDateTime(reservation) / 10000000000000;
  }

  if (
    !RESERVATION_COMPLETED_STATUSES.has(status)
    && arrival
    && departure
    && arrival <= today
    && departure >= today
  ) {
    return 1000 + reservationDateTime(reservation) / 10000000000000;
  }

  if (arrival && arrival >= today) {
    return 500 - Math.abs(reservationDateTime(reservation) - Date.now()) / 1000000000;
  }

  if (RESERVATION_COMPLETED_STATUSES.has(status) || (departure && departure < today)) {
    return 100 + reservationDateTime(reservation) / 10000000000000;
  }

  return reservationDateTime(reservation) / 10000000000000;
};

const getReservationIdentityLookups = async ({ supabase, guestIds, guestPhones, hotelId }) => {
  const phoneValues = [...new Set((guestPhones || []).flatMap((phone) => {
    const raw = String(phone || '').trim();
    const normalized = normalizePhone(raw);
    return [raw, normalized].filter(Boolean);
  }))];
  const phoneKeys = new Set(phoneValues.map(normalizePhone).filter(Boolean));

  if ((!guestIds.length && !phoneValues.length) || !hotelId) {
    return {
      byGuestId: new Map(),
      byPhone: new Map()
    };
  }

  try {
    const select = 'id, hotel_id, guest_id, guest_name, guest_phone, room_number, room_type, arrival_date, departure_date, status, pms_provider, pms_reservation_id, source';
    const queries = [];

    if (guestIds.length) {
      queries.push(supabase
        .from('reservations')
        .select(select)
        .eq('hotel_id', hotelId)
        .in('guest_id', guestIds)
        .order('arrival_date', { ascending: false, nullsFirst: false })
        .limit(500));
    }

    if (phoneValues.length) {
      queries.push(supabase
        .from('reservations')
        .select(select)
        .eq('hotel_id', hotelId)
        .in('guest_phone', phoneValues)
        .order('arrival_date', { ascending: false, nullsFirst: false })
        .limit(500));
    }

    const results = await Promise.all(queries);
    let reservations = uniqueById(results.flatMap((result) => {
      if (result.error) {
        throw result.error;
      }

      return result.data || [];
    }));

    const matchedPhoneKeys = new Set(reservations.map((reservation) => normalizePhone(reservation.guest_phone)).filter(Boolean));
    const needsNormalizedPhoneLookup = [...phoneKeys].some((phoneKey) => !matchedPhoneKeys.has(phoneKey));

    if (needsNormalizedPhoneLookup) {
      const { data: hotelReservations, error } = await supabase
        .from('reservations')
        .select(select)
        .eq('hotel_id', hotelId)
        .order('arrival_date', { ascending: false, nullsFirst: false })
        .limit(1000);

      if (error) {
        throw error;
      }

      reservations = uniqueById([
        ...reservations,
        ...(hotelReservations || []).filter((reservation) => phoneKeys.has(normalizePhone(reservation.guest_phone)))
      ]);
    }

    const byGuestId = new Map();
    const byPhone = new Map();

    for (const reservation of reservations) {
      if (reservation.guest_id) {
        const currentByGuest = byGuestId.get(reservation.guest_id);
        if (!currentByGuest || scoreReservationForInbox(reservation) > scoreReservationForInbox(currentByGuest)) {
          byGuestId.set(reservation.guest_id, reservation);
        }
      }

      const phoneKey = normalizePhone(reservation.guest_phone);
      if (phoneKey) {
        const currentByPhone = byPhone.get(phoneKey);
        if (!currentByPhone || scoreReservationForInbox(reservation) > scoreReservationForInbox(currentByPhone)) {
          byPhone.set(phoneKey, reservation);
        }
      }
    }

    return { byGuestId, byPhone };
  } catch (error) {
    console.warn('Inbox reservation context unavailable', error.message);
    return {
      byGuestId: new Map(),
      byPhone: new Map()
    };
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
  const guestMemoryEnabled = isGuestMemoryEnabled();

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
  const [guests, messages, aiLogsByConversation, upsellsByConversation, offersByConversation, experienceBookingsByConversation, aiStateByConversation, memoryByGuest, stayContextByGuest, intelligenceByGuest] = await Promise.all([
    getGuestsForInbox({ supabase, guestIds, hotelId: resolvedHotelId }),
    getMessagesForConversations({ supabase, conversationIds, hotelId: resolvedHotelId }),
    getLatestAiLogsByConversation({ supabase, conversationIds, hotelId: resolvedHotelId }),
    getActiveUpsellsByConversation({ supabase, conversationIds }),
    getActiveOffersByConversation({ supabase, conversationIds }),
    getExperienceBookingsByConversation({ supabase, conversationIds }),
    getAiStateByConversation({ supabase, conversationIds, hotelId: resolvedHotelId }),
    guestMemoryEnabled
      ? getGuestMemoryByGuest({ supabase, guestIds, hotelId: resolvedHotelId })
      : Promise.resolve(new Map()),
    getGuestStayContextByGuest({ supabase, guestIds, hotelId: resolvedHotelId }),
    getGuestIntelligenceByGuest({ supabase, guestIds, hotelId: resolvedHotelId })
  ]);

  const guestsById = new Map((guests || []).map((guest) => [guest.id, guest]));
  const reservationIdentityLookups = await getReservationIdentityLookups({
    supabase,
    guestIds,
    guestPhones: (guests || []).map((guest) => guest.phone_number),
    hotelId: resolvedHotelId
  });
  const roomNumbers = [...new Set([
    ...(guests || []).map((guest) => guest.current_room),
    ...[...reservationIdentityLookups.byGuestId.values()].map((reservation) => reservation.room_number),
    ...[...reservationIdentityLookups.byPhone.values()].map((reservation) => reservation.room_number),
    ...[...stayContextByGuest.values()].map((context) => context.room_number)
  ].filter(Boolean))];
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
    const reservation = reservationIdentityLookups.byGuestId.get(conversation.guest_id)
      || reservationIdentityLookups.byPhone.get(normalizePhone(guest?.phone_number))
      || null;
    const resolvedGuest = guest || reservation ? {
      ...(guest || { id: conversation.guest_id }),
      name: guest?.name || guest?.full_name || reservation?.guest_name || null,
      full_name: guest?.full_name || guest?.name || reservation?.guest_name || null,
      phone_number: guest?.phone_number || reservation?.guest_phone || null,
      current_room: guest?.current_room || reservation?.room_number || guestStayContext?.room_number || null,
      preferred_language: guest?.preferred_language || null
    } : null;
    const roomNumber = resolvedGuest?.current_room || reservation?.room_number || guestStayContext?.room_number || null;
    const roomStatus = roomStatusByRoom.get(roomNumber) || null;
    const guestName = resolvedGuest?.name || resolvedGuest?.full_name || reservation?.guest_name || null;
    const guestPhone = resolvedGuest?.phone_number || reservation?.guest_phone || null;
    const enrichedConversation = {
      ...conversation,
      guestName,
      guest_name: guestName,
      roomNumber,
      room_number: roomNumber,
      phoneNumber: guestPhone,
      phone_number: guestPhone,
      guest: resolvedGuest,
      reservation,
      guestMemoryEnabled,
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
        guestStayContext,
        reservation: reservation ? {
          id: reservation.id,
          guestName: reservation.guest_name || null,
          roomNumber: reservation.room_number || null,
          roomType: reservation.room_type || null,
          arrivalDate: reservation.arrival_date || null,
          departureDate: reservation.departure_date || null,
          status: reservation.status || null,
          pmsProvider: reservation.pms_provider || null,
          pmsReservationId: reservation.pms_reservation_id || null,
          source: reservation.source || null
        } : null
      }
    };

    return {
      ...enrichedConversation,
      copilot: buildConversationCopilot(enrichedConversation)
    };
  });
};
