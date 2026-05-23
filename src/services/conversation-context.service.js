import {
  getSupabase,
  getOpenTicketsForGuest,
  getRecentMessages
} from './supabase.service.js';
import { logger } from '../utils/logger.js';
import { detectGuestLanguage } from './language.service.js';
import { getLatestReservationForGuest } from './reservation.service.js';
import { getHotelProfileForPrompt } from './hotel.service.js';
import { getGuestMemory } from './guest-memory.service.js';

const DEFAULT_OFFER_COOLDOWN_HOURS = 12;
export const CONVERSATION_AI_MODES = {
  AI_ACTIVE: 'ai_active',
  HUMAN_TAKEOVER: 'human_takeover',
  AI_PAUSED: 'ai_paused',
  ESCALATION_LOCK: 'escalation_lock'
};

const HUMAN_CONTROLLED_AI_MODES = new Set([
  CONVERSATION_AI_MODES.HUMAN_TAKEOVER,
  CONVERSATION_AI_MODES.AI_PAUSED,
  CONVERSATION_AI_MODES.ESCALATION_LOCK
]);

const OFFER_COOLDOWN_HOURS_BY_TYPE = {
  romantic_package: 24,
  late_checkout: 12,
  spa: 24,
  airport_transfer: 24,
  room_upgrade: 12,
  dinner: 12,
  breakfast_upgrade: 12
};

const intentPriority = {
  emergency: 100,
  complaint_noise: 90,
  complaint_cleaning: 88,
  reservation_change: 82,
  cancellation_request: 82,
  late_checkout_interest: 70,
  airport_transfer_interest: 68,
  room_upgrade_interest: 65,
  restaurant_interest: 58,
  spa_interest: 52,
  romantic_package_interest: 45,
  celebration_signal: 42,
  family_trip: 35,
  business_trip: 35,
  vip_behavior: 30
};

const offerIntentMap = {
  room_upgrade_interest: 'room_upgrade',
  late_checkout_interest: 'late_checkout',
  airport_transfer_interest: 'airport_transfer',
  romantic_package_interest: 'romantic_package',
  spa_interest: 'spa',
  restaurant_interest: 'dinner'
};

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const isMissingStateTable = (error) => (
  error?.message?.includes('conversation_ai_state')
  || error?.details?.includes('conversation_ai_state')
  || error?.hint?.includes('conversation_ai_state')
);

export const getConversationAiMode = (state = null) => (
  state?.state_metadata?.conversation_ai_mode
  || state?.conversation_ai_mode
  || CONVERSATION_AI_MODES.AI_ACTIVE
);

export const getHumanTakeoverState = (state = null) => ({
  mode: getConversationAiMode(state),
  activatedBy: state?.state_metadata?.human_takeover?.activated_by || null,
  activatedAt: state?.state_metadata?.human_takeover?.activated_at || null,
  resumedBy: state?.state_metadata?.human_takeover?.resumed_by || null,
  resumedAt: state?.state_metadata?.human_takeover?.resumed_at || null,
  reason: state?.state_metadata?.human_takeover?.reason || null
});

export const isHumanControlledConversation = (state = null) => HUMAN_CONTROLLED_AI_MODES.has(getConversationAiMode(state));

const hoursSince = (value) => {
  if (!value) return Infinity;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return (Date.now() - time) / 3600000;
};

const detectSentiment = (message = '') => {
  const text = normalize(message);

  if (includesAny(text, ['angry', 'terrible', 'unacceptable', 'refund', 'enfadado', 'muy mal', 'nadie me ayuda', 'ruido', 'noisy'])) {
    return 'negative';
  }

  if (includesAny(text, ['thank you', 'thanks', 'gracias', 'perfecto', 'great', 'excellent'])) {
    return 'positive';
  }

  return 'neutral';
};

const escalationForIntent = (intent, sentiment = 'neutral') => {
  if (intent === 'emergency') return 'urgent';
  if (['complaint_noise', 'complaint_cleaning', 'cancellation_request'].includes(intent)) return 'reception_required';
  if (sentiment === 'negative') return 'reception_required';
  return 'ai_handled';
};

export const getConversationContext = async ({ hotelId, conversationId }) => {
  if (!hotelId || !conversationId) {
    return null;
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('conversation_ai_state')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (error) {
      if (isMissingStateTable(error)) {
        return null;
      }

      throw error;
    }

    return data || null;
  } catch (error) {
    logger.warn('Conversation AI state lookup failed', {
      conversationId,
      message: error.message
    });

    return null;
  }
};

export const calculateIntentConfidence = ({ intent, confidence = 0, message = '', previousState = null }) => {
  const priorityBoost = Math.min(0.08, (intentPriority[intent] || 0) / 1000);
  const repeatedPenalty = previousState?.current_intent === intent ? -0.04 : 0;
  const questionBoost = /[?¿]/.test(message) ? 0.02 : 0;

  return Math.max(0, Math.min(0.99, Number(confidence || 0) + priorityBoost + repeatedPenalty + questionBoost));
};

export const detectPrimaryIntent = ({ intents = [], previousState = null, message = '' } = {}) => {
  const validIntents = (intents || [])
    .filter((item) => item?.intent)
    .map((item) => ({
      ...item,
      confidence: calculateIntentConfidence({
        intent: item.intent,
        confidence: item.confidence,
        message,
        previousState
      }),
      priority: intentPriority[item.intent] || 10
    }))
    .sort((a, b) => (b.priority + b.confidence * 20) - (a.priority + a.confidence * 20));

  return validIntents[0] || {
    intent: null,
    confidence: 0,
    priority: 0,
    source: 'none'
  };
};

export const detectIntentShift = ({ previousIntent = null, primaryIntent = null }) => (
  Boolean(previousIntent && primaryIntent && previousIntent !== primaryIntent)
);

export const shouldOverridePreviousIntent = ({ previousIntent = null, primaryIntent = null, confidence = 0 }) => {
  if (!primaryIntent) return false;
  if (!previousIntent || previousIntent !== primaryIntent) {
    return (intentPriority[primaryIntent] || 0) >= (intentPriority[previousIntent] || 0) || Number(confidence) >= 0.72;
  }

  return true;
};

export const shouldSuppressRepeatedOffer = ({ offerType = null, previousState = null, intentShift = false } = {}) => {
  if (!offerType || !previousState?.last_offer_type) {
    return false;
  }

  if (intentShift && previousState.last_offer_type !== offerType) {
    return false;
  }

  const cooldownHours = OFFER_COOLDOWN_HOURS_BY_TYPE[offerType] || DEFAULT_OFFER_COOLDOWN_HOURS;

  return previousState.last_offer_type === offerType
    && hoursSince(previousState.last_offer_sent_at) < cooldownHours;
};

export const buildConversationState = async ({
  hotelId,
  conversationId,
  message,
  detectedIntents = [],
  response = null,
  offerType = null
}) => {
  const previousState = await getConversationContext({ hotelId, conversationId });
  const primary = detectPrimaryIntent({
    intents: detectedIntents,
    previousState,
    message
  });
  const previousIntent = previousState?.current_intent || null;
  const intentShift = detectIntentShift({
    previousIntent,
    primaryIntent: primary.intent
  });
  const overridePrevious = shouldOverridePreviousIntent({
    previousIntent,
    primaryIntent: primary.intent,
    confidence: primary.confidence
  });
  const sentiment = detectSentiment(message);
  const escalationLevel = escalationForIntent(primary.intent, sentiment);
  const suppressedOffer = shouldSuppressRepeatedOffer({
    offerType: offerType || offerIntentMap[primary.intent],
    previousState,
    intentShift
  });

  return {
    previousState,
    currentIntent: overridePrevious ? primary.intent : previousIntent,
    previousIntent,
    primaryIntent: primary,
    intentShift,
    overridePrevious,
    suppressedOffer,
    sentiment,
    escalationLevel,
    metadata: {
      detected_intents: detectedIntents,
      cooldown_hours: OFFER_COOLDOWN_HOURS_BY_TYPE[offerType || offerIntentMap[primary.intent]] || DEFAULT_OFFER_COOLDOWN_HOURS,
      cooldown_hours_by_type: OFFER_COOLDOWN_HOURS_BY_TYPE,
      dominant_priority: primary.priority || 0
    },
    response
  };
};

export const upsertConversationAiState = async ({
  hotelId,
  conversationId,
  state,
  offerType = null,
  aiResponse = null,
  aiSummary = null,
  aiReasoning = null,
  openAiEnhanced = false
}) => {
  if (!hotelId || !conversationId || !state) {
    return null;
  }

  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const previousMetadata = state.previousState?.state_metadata && typeof state.previousState.state_metadata === 'object'
      ? state.previousState.state_metadata
      : {};
    const nextMetadata = state.metadata || {};
    const record = {
      hotel_id: hotelId,
      conversation_id: conversationId,
      current_intent: state.currentIntent || null,
      previous_intent: state.previousIntent || null,
      intent_confidence: state.primaryIntent?.confidence || 0,
      last_offer_type: offerType || state.previousState?.last_offer_type || null,
      last_offer_sent_at: offerType ? now : state.previousState?.last_offer_sent_at || null,
      last_ai_response: aiResponse || null,
      ai_summary: aiSummary || null,
      ai_reasoning: aiReasoning || null,
      openai_enhanced: Boolean(openAiEnhanced),
      sentiment: state.sentiment || 'neutral',
      escalation_level: state.escalationLevel || 'ai_handled',
      state_metadata: {
        ...previousMetadata,
        ...nextMetadata,
        human_takeover: nextMetadata.human_takeover || previousMetadata.human_takeover || null,
        conversation_ai_mode: nextMetadata.conversation_ai_mode || previousMetadata.conversation_ai_mode || CONVERSATION_AI_MODES.AI_ACTIVE
      },
      updated_at: now
    };
    const { data, error } = await supabase
      .from('conversation_ai_state')
      .upsert(record, {
        onConflict: 'conversation_id'
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingStateTable(error)) {
        logger.warn('conversation_ai_state table missing; skipping state upsert');
        return null;
      }

      throw error;
    }

    return data;
  } catch (error) {
    logger.warn('Conversation AI state upsert failed', {
      conversationId,
      message: error.message
    });

    return null;
  }
};

export const generateContextualResponse = ({ fallbackResponse = null, state, responses = [] } = {}) => {
  if (state?.suppressedOffer && fallbackResponse) {
    return fallbackResponse;
  }

  const uniqueResponses = [...new Set((responses || []).filter(Boolean))];

  if (uniqueResponses.length > 1) {
    return uniqueResponses.join(' ');
  }

  return uniqueResponses[0] || fallbackResponse || null;
};

export const buildConversationContext = async ({
  hotel = null,
  guest,
  conversation,
  message,
  reservation = null
}) => {
  const [recentMessages, openTickets, hotelProfile, guestMemory] = await Promise.all([
    getRecentMessages({
      conversationId: conversation.id,
      limit: 8
    }),
    getOpenTicketsForGuest({
      guestId: guest.id,
      limit: 5
    }),
    hotel?.id ? getHotelProfileForPrompt(hotel.id) : Promise.resolve(null),
    hotel?.id && guest?.id ? getGuestMemory(hotel.id, guest.id) : Promise.resolve([])
  ]);

  const activeReservation = reservation || await getLatestReservationForGuest({
    guestId: guest.id
  });
  const language = detectGuestLanguage(message, guest.preferred_language || 'es');

  logger.info('language detected', {
    guestId: guest.id,
    language
  });

  const context = {
    knownRoom: guest.current_room || null,
    recentMessages,
    openTickets,
    language,
    hotelProfile,
    guestMemory,
    reservation: activeReservation
      ? {
        id: activeReservation.id,
        guest_name: activeReservation.guest_name,
        arrival_date: activeReservation.arrival_date,
        departure_date: activeReservation.departure_date,
        room_type: activeReservation.room_type,
        rate_plan: activeReservation.rate_plan,
        board_basis: activeReservation.board_basis,
        reservation_status: activeReservation.status,
        reservation_access_token: activeReservation.reservation_access_token
      }
      : null
  };

  if (context.reservation) {
    logger.info('reservation context loaded', {
      guestId: guest.id,
      conversationId: conversation.id,
      reservationId: context.reservation.id,
      reservationAccessToken: context.reservation.reservation_access_token
    });
  }

  logger.info('context loaded', {
    guestId: guest.id,
    conversationId: conversation.id,
    knownRoom: context.knownRoom,
    recentMessages: recentMessages.length,
    openTickets: openTickets.length,
    language: context.language,
    hotelId: context.hotelProfile?.id || hotel?.id || null,
    guestMemory: guestMemory.length,
    reservationId: context.reservation?.id || null
  });

  return context;
};
