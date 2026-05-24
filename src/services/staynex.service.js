import {
  createConversation,
  createMessage,
  findActiveConversation,
  touchConversation
} from './supabase.service.js';
import { analyzeGuestMessage } from './openai.service.js';
import {
  findKnowledgeAnswerWithMetadata,
  getKnowledgeForHotel
} from './knowledge.service.js';
import { createTicketFromAiResponse } from './ticket.service.js';
import { findOrCreateGuest } from './guest.service.js';
import { sendWhatsAppMessage } from './twilio.service.js';
import {
  buildConversationContext,
  getConversationContext,
  getConversationAiMode,
  getHumanTakeoverState,
  isHumanControlledConversation,
  buildConversationState,
  generateContextualResponse,
  upsertConversationAiState
} from './conversation-context.service.js';
import { createAiLog } from './ai-log.service.js';
import {
  buildHumanHandoffReply,
  detectHumanEscalation,
  shouldReplaceReplyForHumanEscalation
} from './human-escalation.service.js';
import {
  extractReservationAccessToken,
  findReservationByAccessToken,
  linkReservationToGuest
} from './reservation.service.js';
import { logger } from '../utils/logger.js';
import { getDefaultHotel, getHotelById } from './hotel.service.js';
import {
  createUpsellInterestTicket,
  detectUpsellInterest,
  detectUpsellOpportunities,
  getRecentUpsellsForConversation,
  storeUpsellOpportunities
} from './upsell.service.js';
import {
  detectGuestMemoryFromMessage,
  upsertDetectedGuestMemories
} from './guest-memory.service.js';
import {
  createAiOffer,
  createOperationalTicketForConciergeRisk,
  detectGuestIntent,
  detectOperationalRisk as detectConciergeOperationalRisk,
  detectRevenueOpportunity,
  generateConciergeResponse,
  generateDepartmentAction,
  getOfferTypeForIntent,
  persistConciergeMemory
} from './concierge-ai.service.js';
import { enhanceConciergeIntelligence } from './openai-concierge.service.js';
import {
  buildResponseGuidance,
  chooseSmarterConciergeResponse,
  chooseNaturalConciergeResponse,
  shouldSuppressOfferForNaturalConversation
} from './natural-conversation.service.js';
import { detectContextualRevenueOpportunities } from './contextual-revenue.service.js';
import { detectExperienceOpportunities } from './experience-intelligence.service.js';
import {
  getExperienceKnowledgeForPrompt,
  getHotelExperiences
} from './hotel-experience.service.js';
import {
  getActiveExperienceProviderCatalogForHotel,
  getExperienceProviderKnowledgeForPrompt
} from './experience-provider.service.js';
import {
  getLocalKnowledgeForHotel,
  getLocalKnowledgeForPrompt
} from './local-knowledge.service.js';
import {
  buildProviderExperienceInterestMemories,
  buildProviderExperienceRecommendationReply,
  classifyProviderExperienceConversation,
  createExperienceBookingRequest,
  detectExperienceBookingIntent,
  getExperienceBookingConfirmationReply,
  isProviderBookingConfirmation,
  setLastProviderExperience
} from './experience-booking.service.js';
import { buildStrictHotelExperienceCatalog } from './experience-catalog-isolation.service.js';
import { translateForStaff } from './translation.service.js';
import { checkInboundMessageRateLimit } from './scalability-guard.service.js';
import { buildPmsIntelligenceContext } from './pms-intelligence.service.js';
import {
  buildGuestIntelligenceProfile,
  persistGuestIntelligenceProfile
} from './guest-intelligence.service.js';
import {
  generateAutomationSuggestions,
  generateRevenueActions,
  generateUpsellRecommendations,
  persistRevenuePrediction,
  predictLikelyConversions
} from './revenue-ai.service.js';

const getOrCreateConversation = async ({ hotelId, guestId }) => {
  const existingConversation = await findActiveConversation({ hotelId, guestId });

  if (existingConversation) {
    return touchConversation(existingConversation.id);
  }

  return createConversation({ hotelId, guestId });
};

const isMockAiEnabled = () => process.env.USE_MOCK_AI === 'true';

const normalizeOpenAiOfferType = (offerType) => (
  offerType === '' || offerType === undefined ? null : offerType
);

const getRateLimitFallbackReply = (message = '') => {
  const normalized = message.toLowerCase();

  if (/[¿áéíóúñ]|\b(hola|vale|gracias|reserva|habitación|habitacion)\b/.test(normalized)) {
    return 'Estamos recibiendo muchos mensajes ahora mismo. Hemos recibido tu solicitud y recepción te responderá en cuanto sea posible.';
  }

  if (/\b(bonjour|merci|réserver|reservation)\b/.test(normalized)) {
    return 'Nous recevons beaucoup de messages en ce moment. Votre demande a bien été reçue et la réception vous répondra dès que possible.';
  }

  if (/\b(hallo|danke|buchen|zimmer)\b/.test(normalized)) {
    return 'Wir erhalten gerade viele Nachrichten. Ihre Anfrage ist eingegangen und die Rezeption meldet sich so bald wie möglich.';
  }

  return 'We are receiving many messages right now. Your request has been received and reception will reply as soon as possible.';
};

const withAiMetadata = (aiResponse, {
  provider = 'mock',
  model = 'knowledge-base',
  fallbackUsed = false
} = {}) => ({
  ...aiResponse,
  aiProvider: aiResponse.aiProvider || aiResponse.ai_provider || provider,
  aiModel: aiResponse.aiModel || aiResponse.ai_model || model,
  fallbackUsed: aiResponse.fallbackUsed ?? aiResponse.fallback_used ?? fallbackUsed,
  ai_provider: aiResponse.ai_provider || aiResponse.aiProvider || provider,
  ai_model: aiResponse.ai_model || aiResponse.aiModel || model,
  fallback_used: aiResponse.fallback_used ?? aiResponse.fallbackUsed ?? fallbackUsed
});

const extractHotelIdFromMessage = (message = '') => {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const patterns = [
    /Staynex hotel id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    /\bhotel[_\s-]?id[:=]\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i,
    /\bstx-hotel[:=]\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
};

const resolveMessageHotelContext = async ({ initialHotel, message }) => {
  let activeHotel = initialHotel || await getDefaultHotel();
  let source = initialHotel?.id ? 'whatsapp_number' : 'default_hotel';
  const embeddedHotelId = extractHotelIdFromMessage(message);

  if (embeddedHotelId && embeddedHotelId !== activeHotel?.id) {
    const embeddedHotel = await getHotelById(embeddedHotelId);

    if (embeddedHotel) {
      activeHotel = embeddedHotel;
      source = 'message_hotel_id';
    }
  }

  return {
    hotel: activeHotel,
    source
  };
};

export const normalizeWhatsappNumber = (phoneNumber) => (
  phoneNumber?.replace(/^whatsapp:/, '') || null
);

export const processGuestMessage = async ({
  hotel,
  message,
  phone,
  sendReply = false,
  replyTo = null,
  channel = 'local-test'
}) => {
  if (!message?.trim()) {
    throw new Error('message is required');
  }

  if (!phone?.trim()) {
    throw new Error('phone is required');
  }

  let { hotel: activeHotel, source: hotelContextSource } = await resolveMessageHotelContext({
    initialHotel: hotel,
    message
  });
  const cleanPhone = normalizeWhatsappNumber(phone);
  const rateLimit = checkInboundMessageRateLimit({
    hotelId: activeHotel.id,
    guestKey: cleanPhone,
    context: {
      channel,
      phone: cleanPhone
    }
  });

  if (!rateLimit.allowed) {
    const reply = getRateLimitFallbackReply(message);
    let twilioMessage = null;

    if (sendReply) {
      twilioMessage = await sendWhatsAppMessage({
        to: replyTo || phone,
        body: reply
      });
    }

    return {
      ai: {
        intent: 'rate_limited',
        confidence: 1,
        reply,
        fallbackUsed: true,
        aiProvider: 'system',
        aiModel: 'rate-limit-guard'
      },
      hotel: activeHotel,
      guest: null,
      conversation: null,
      messages: {},
      ticket: null,
      upsells: [],
      memories: [],
      delivery: {
        channel,
        sent_via_twilio: Boolean(twilioMessage),
        twilio_sid: twilioMessage?.sid || null,
        rate_limited: true,
        reason: rateLimit.reason
      }
    };
  }

  logger.info('Processing guest message', {
    channel,
    hotelId: activeHotel.id,
    hotelContextSource,
    phone: cleanPhone
  });

  const reservationAccessToken = extractReservationAccessToken(message);
  let reservation = null;

  if (reservationAccessToken) {
    logger.info('token detected', {
      hotelId: activeHotel.id,
      phone: cleanPhone,
      reservationAccessToken
    });

    reservation = await findReservationByAccessToken(reservationAccessToken);

    if (reservation?.hotel_id && reservation.hotel_id !== activeHotel?.id) {
      const reservationHotel = await getHotelById(reservation.hotel_id);

      if (reservationHotel) {
        activeHotel = reservationHotel;
        hotelContextSource = 'reservation_access_token';
        logger.info('hotel context switched from reservation token', {
          hotelId: activeHotel.id,
          reservationId: reservation.id,
          reservationAccessToken
        });
      }
    }
  }

  const guest = await findOrCreateGuest({
    hotelId: activeHotel.id,
    phoneNumber: cleanPhone,
    message
  });

  if (reservation) {
    reservation = await linkReservationToGuest({
      reservation,
      guest,
      message
    });
  }

  const conversation = await getOrCreateConversation({
    hotelId: activeHotel.id,
    guestId: guest.id
  });
  const guestLanguage = guest.preferred_language || activeHotel.default_language || 'es';
  const staffTranslationLanguage = activeHotel.staff_translation_language || activeHotel.default_language || 'es';
  const staffTranslation = await translateForStaff({
    text: message,
    guestLanguage,
    staffLanguage: staffTranslationLanguage
  });

  const guestMessage = await createMessage({
    conversationId: conversation.id,
    senderType: 'guest',
    content: message,
    originalLanguage: staffTranslation.sourceLanguage || guestLanguage,
    translatedLanguage: staffTranslation.translatedText ? staffTranslation.targetLanguage : null,
    translatedText: staffTranslation.translatedText,
    translationProvider: staffTranslation.provider,
    translationConfidence: staffTranslation.confidence,
    metadata: {
      translation_direction: 'guest_to_staff',
      conversation_language: guestLanguage,
      staff_language: staffTranslationLanguage
    }
  });

  const existingAiState = await getConversationContext({
    hotelId: activeHotel.id,
    conversationId: conversation.id
  });
  const takeoverState = getHumanTakeoverState(existingAiState);
  const humanControlled = isHumanControlledConversation(existingAiState);

  const conversationContext = await buildConversationContext({
    hotel: activeHotel,
    guest,
    conversation,
    message,
    reservation
  });
  conversationContext.pmsIntelligenceContext = await buildPmsIntelligenceContext({
    hotelId: activeHotel.id,
    guestId: guest.id,
    reservationId: conversationContext.reservation?.id || reservation?.id || null,
    roomNumber: guest.current_room || conversationContext.reservation?.room_number || null,
    reservation: conversationContext.reservation || reservation || null
  });
  const guestIntelligenceProfile = buildGuestIntelligenceProfile({
    hotelId: activeHotel.id,
    guestId: guest.id,
    reservationId: conversationContext.reservation?.id || reservation?.id || null,
    message,
    recentMessages: conversationContext.recentMessages,
    guestMemory: conversationContext.guestMemory,
    tickets: conversationContext.openTickets || [],
    aiLogs: conversationContext.aiLogs || [],
    bookings: conversationContext.experienceBookings || [],
    pmsIntelligenceContext: conversationContext.pmsIntelligenceContext,
    language: conversationContext.language,
    country: conversationContext.reservation?.country || conversationContext.pmsIntelligenceContext?.guestStayContext?.country || null,
    source: 'whatsapp_conversation'
  });
  const revenuePrediction = predictLikelyConversions({
    guestIntelligence: guestIntelligenceProfile,
    pmsIntelligenceContext: conversationContext.pmsIntelligenceContext
  });
  conversationContext.guestIntelligence = {
    profile: guestIntelligenceProfile,
    affinities: guestIntelligenceProfile.affinities,
    signals: guestIntelligenceProfile.signals,
    revenuePrediction,
    upsellRecommendations: generateUpsellRecommendations({
      guestIntelligence: guestIntelligenceProfile,
      revenuePrediction,
      pmsIntelligenceContext: conversationContext.pmsIntelligenceContext
    }),
    revenueActions: generateRevenueActions({
      guestIntelligence: guestIntelligenceProfile,
      revenuePrediction,
      pmsIntelligenceContext: conversationContext.pmsIntelligenceContext
    }),
    automationSuggestions: generateAutomationSuggestions({
      guestIntelligence: guestIntelligenceProfile,
      revenuePrediction,
      pmsIntelligenceContext: conversationContext.pmsIntelligenceContext
    })
  };

  await Promise.all([
    persistGuestIntelligenceProfile({
      ...guestIntelligenceProfile,
      metadata: {
        ...guestIntelligenceProfile.metadata,
        conversation_id: conversation.id,
        detected_from: message
      }
    }),
    persistRevenuePrediction({
      hotelId: activeHotel.id,
      guestId: guest.id,
      reservationId: conversationContext.reservation?.id || reservation?.id || null,
      prediction: revenuePrediction,
      metadata: {
        source: 'whatsapp_conversation',
        profile_type: guestIntelligenceProfile.profileType
      }
    })
  ]);

  if (humanControlled) {
    logger.info('human_takeover_ai_response_suppressed', {
      hotelId: activeHotel.id,
      guestId: guest.id,
      conversationId: conversation.id,
      mode: takeoverState.mode,
      activatedBy: takeoverState.activatedBy,
      activatedAt: takeoverState.activatedAt,
      reason: takeoverState.reason
    });

    await createAiLog({
      messageId: guestMessage.id,
      hotelId: activeHotel.id,
      hotelName: activeHotel.name || activeHotel.brand_name || null,
      guestId: guest.id,
      conversationId: conversation.id,
      detectedLanguage: conversationContext.language,
      detectedIntent: 'human_takeover_active',
      detectedRoom: guest.current_room || conversationContext.knownRoom || null,
      confidenceScore: 1,
      generatedResponse: null,
      rawGuestMessage: message,
      needsHuman: true,
      humanReason: 'human_takeover_active',
      aiProvider: 'system',
      aiModel: 'human-takeover-guard',
      fallbackUsed: false,
      translatedForStaff: Boolean(staffTranslation.translatedText),
      translatedForGuest: false,
      translationProvider: staffTranslation.provider,
      responseLanguage: conversationContext.language,
      aiReasoning: `conversation_ai_mode=${getConversationAiMode(existingAiState)}; automatic_ai_reply=false; human_takeover_active=true`
    });

    const silentAi = {
      intent: 'human_takeover_active',
      confidence: 1,
      reply: null,
      fallbackUsed: false,
      aiProvider: 'system',
      aiModel: 'human-takeover-guard',
      silent: true
    };

    return {
      ai: silentAi,
      hotel: activeHotel,
      guest,
      conversation,
      messages: {
        guest: guestMessage,
        ai: null
      },
      ticket: null,
      upsells: [],
      memories: [],
      reservation: conversationContext.reservation,
      human: {
        needsHuman: true,
        humanReason: 'human_takeover_active',
        takeover: takeoverState
      },
      delivery: {
        channel,
        sent_via_twilio: false,
        twilio_sid: null,
        ai_suppressed_by_human_takeover: true
      }
    };
  }

  const knowledgeResult = await findKnowledgeAnswerWithMetadata(
    activeHotel.id,
    message,
    conversationContext.language
  );
  const hotelKnowledge = knowledgeResult
    ? [{
      key: knowledgeResult.metadata.knowledgeKey,
      value: knowledgeResult.metadata.knowledgeValue
    }]
    : await getKnowledgeForHotel(activeHotel.id);
  const rawHotelExperiences = await getHotelExperiences({
    hotelId: activeHotel.id,
    activeOnly: true,
    limit: 80
  });
  const rawProviderExperiences = await getActiveExperienceProviderCatalogForHotel({
    hotelId: activeHotel.id,
    activeOnly: true,
    limit: 80
  });
  const strictCatalog = buildStrictHotelExperienceCatalog({
    hotel: activeHotel,
    providerExperiences: rawProviderExperiences,
    hotelExperiences: rawHotelExperiences
  });
  const providerExperiences = strictCatalog.providerExperiences;
  const hotelExperiences = strictCatalog.hotelExperiences;
  const experienceCatalog = strictCatalog.experienceCatalog;

  if (strictCatalog.blockedCrossTenantExperiences) {
    logger.warn('cross tenant experiences blocked from AI catalog', {
      hotelId: activeHotel.id,
      hotelName: activeHotel.name,
      blocked: strictCatalog.blockedExperiences.slice(0, 8)
    });
  }

  logger.info('strict experience catalog loaded', {
    hotelId: activeHotel.id,
    providerExperiences: providerExperiences.length,
    hotelExperiences: hotelExperiences.length,
    providerNames: strictCatalog.providerNames,
    finalExperienceSource: strictCatalog.finalExperienceSource,
    blockedCrossTenantExperiences: strictCatalog.blockedCrossTenantExperiences
  });
  const localKnowledgeItems = await getLocalKnowledgeForHotel({
    hotelId: activeHotel.id,
    activeOnly: true,
    limit: 120
  });
  const aiHotelKnowledge = [
    ...hotelKnowledge,
    ...getLocalKnowledgeForPrompt(localKnowledgeItems),
    ...getExperienceProviderKnowledgeForPrompt(providerExperiences),
    ...getExperienceKnowledgeForPrompt(hotelExperiences)
  ];
  const upsellOpportunities = detectUpsellOpportunities({
    reservation: conversationContext.reservation,
    language: conversationContext.language,
    message,
    recentMessages: conversationContext.recentMessages,
    hotelKnowledge: aiHotelKnowledge,
    guestMemory: conversationContext.guestMemory
  });
  const conciergeIntent = detectGuestIntent({
    message,
    context: conversationContext
  });
  const detectedConciergeIntents = conciergeIntent.allIntents?.length
    ? conciergeIntent.allIntents
    : conciergeIntent.intent
      ? [conciergeIntent]
      : [];
  const preliminaryConversationState = await buildConversationState({
    hotelId: activeHotel.id,
    conversationId: conversation.id,
    message,
    detectedIntents: detectedConciergeIntents
  });
  const primaryConciergeIntent = preliminaryConversationState.primaryIntent?.intent
    ? preliminaryConversationState.primaryIntent
    : conciergeIntent;
  const conciergeRisk = detectConciergeOperationalRisk({
    intentResult: primaryConciergeIntent,
    message
  });
  const intentRevenueOpportunity = detectRevenueOpportunity({
    intentResult: primaryConciergeIntent,
    context: conversationContext
  });
  const contextualRevenue = detectContextualRevenueOpportunities({
    message,
    reservation: conversationContext.reservation,
    guestMemory: conversationContext.guestMemory,
    conversationState: preliminaryConversationState,
    risk: conciergeRisk,
    sentiment: preliminaryConversationState.sentiment,
    language: conversationContext.language
  });
  const experienceIntelligence = detectExperienceOpportunities({
    message,
    hotel: activeHotel,
    hotelKnowledge: aiHotelKnowledge,
    hotelExperiences: experienceCatalog,
    reservation: conversationContext.reservation,
    guestMemory: conversationContext.guestMemory,
    conversationState: preliminaryConversationState,
    risk: conciergeRisk,
    sentiment: preliminaryConversationState.sentiment,
    language: conversationContext.language
  });
  const providerExperienceConversation = await classifyProviderExperienceConversation({
    message,
    conversationId: conversation.id,
    hotelExperiences: experienceCatalog
  });
  const providerConfirmationMessage = isProviderBookingConfirmation(message);
  const providerBookingConfirmationOverride = (
    providerExperienceConversation.reason === 'provider_booking_confirmation_override'
    && providerExperienceConversation.bookingReady
    && providerConfirmationMessage
  );

  if (providerConfirmationMessage) {
    logger.info('provider_last_experience_read_for_confirmation', {
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      message,
      lastProviderExperienceId: providerExperienceConversation.latestProviderContext?.provider_experience_id || null,
      lastProviderExperienceTitle: providerExperienceConversation.latestProviderContext?.title || providerExperienceConversation.latestProviderContext?.last_provider_experience_title || null,
      lastProviderSetReason: providerExperienceConversation.latestProviderContext?.last_provider_set_reason || providerExperienceConversation.latestProviderContext?.set_reason || null,
      lastProviderSetAt: providerExperienceConversation.latestProviderContext?.last_provider_set_at || providerExperienceConversation.latestProviderContext?.set_at || null
    });
  }

  if (providerBookingConfirmationOverride) {
    logger.info('provider_booking_confirmation_override_detected', {
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      providerId: providerExperienceConversation.matchedExperience?.provider_id || providerExperienceConversation.latestProviderContext?.provider_id || null,
      providerExperienceId: providerExperienceConversation.matchedExperience?.provider_experience_id || providerExperienceConversation.latestProviderContext?.provider_experience_id || null,
      message,
      reason: providerExperienceConversation.reason
    });
    logger.info('provider_confirmation_using_last_experience', {
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      message,
      lastProviderExperienceId: providerExperienceConversation.latestProviderContext?.provider_experience_id || null,
      lastProviderExperienceTitle: providerExperienceConversation.latestProviderContext?.title || providerExperienceConversation.latestProviderContext?.last_provider_experience_title || null,
      lastProviderSetReason: providerExperienceConversation.latestProviderContext?.last_provider_set_reason || providerExperienceConversation.latestProviderContext?.set_reason || null,
      lastProviderSetAt: providerExperienceConversation.latestProviderContext?.last_provider_set_at || providerExperienceConversation.latestProviderContext?.set_at || null
    });
  }
  const conciergeRevenueOpportunities = [
    ...contextualRevenue.opportunities,
    ...experienceIntelligence.opportunities,
    ...detectedConciergeIntents
    .map((intentResult) => detectRevenueOpportunity({
      intentResult,
      context: conversationContext
    }))
    .filter(Boolean)
  ]
    .filter((opportunity, index, list) => (
      list.findIndex((item) => item.offerType === opportunity.offerType) === index
    ))
    .sort((a, b) => Number(Boolean(b.timing?.allowed)) - Number(Boolean(a.timing?.allowed)) || Number(b.confidence || 0) - Number(a.confidence || 0));
  const conciergeRevenueOpportunity = contextualRevenue.primaryOpportunity || experienceIntelligence.primaryOpportunity || intentRevenueOpportunity || conciergeRevenueOpportunities[0] || null;
  const conversationState = await buildConversationState({
    hotelId: activeHotel.id,
    conversationId: conversation.id,
    message,
    detectedIntents: detectedConciergeIntents,
    offerType: conciergeRevenueOpportunity?.offerType || getOfferTypeForIntent(primaryConciergeIntent.intent)
  });
  const preliminaryOfferSuppression = shouldSuppressOfferForNaturalConversation({
    message,
    offerType: conciergeRevenueOpportunity?.offerType || getOfferTypeForIntent(primaryConciergeIntent.intent),
    intent: primaryConciergeIntent.intent,
    opportunity: conciergeRevenueOpportunity,
    conversationState,
    risk: conciergeRisk,
    sentiment: conversationState.sentiment
  });
  const responseGuidance = buildResponseGuidance({
    message,
    conversationState,
    offerType: conciergeRevenueOpportunity?.offerType || null,
    offerSuppression: preliminaryOfferSuppression
  });
  const conciergeDepartmentAction = generateDepartmentAction({
    intentResult: primaryConciergeIntent,
    opportunity: preliminaryOfferSuppression.suppress ? null : conciergeRevenueOpportunity,
    risk: conciergeRisk
  });

  conversationContext.upsellOpportunities = upsellOpportunities;
  conversationContext.hotelExperiences = experienceCatalog;
  conversationContext.providerExperiences = providerExperiences;
  conversationContext.localKnowledge = localKnowledgeItems;
  conversationContext.responseGuidance = responseGuidance;
  conversationContext.concierge = {
    intent: primaryConciergeIntent,
    allIntents: detectedConciergeIntents,
    revenueOpportunity: preliminaryOfferSuppression.suppress ? null : conciergeRevenueOpportunity,
    revenueOpportunities: conciergeRevenueOpportunities,
    contextualRevenue,
    experienceIntelligence,
    providerExperienceConversation,
    risk: conciergeRisk,
    departmentAction: conciergeDepartmentAction,
    state: conversationState
  };

  const shouldUseDirectKnowledgeResponse = Boolean(knowledgeResult && isMockAiEnabled());

  const rawAiResponse = withAiMetadata(
    shouldUseDirectKnowledgeResponse ? knowledgeResult.aiResponse : await analyzeGuestMessage({
      hotel: activeHotel,
      guest,
      message,
      hotelKnowledge: aiHotelKnowledge,
      conversationContext,
      fallbackAiResponse: knowledgeResult?.aiResponse || null,
      fallbackMetadata: knowledgeResult
        ? {
          provider: 'mock',
          model: 'knowledge-base'
        }
        : null
    }),
    shouldUseDirectKnowledgeResponse
      ? {
        provider: 'mock',
        model: 'knowledge-base',
        fallbackUsed: false
      }
      : {}
  );
  const openAiConcierge = await enhanceConciergeIntelligence({
    hotel: activeHotel,
    guest,
    message,
    hotelKnowledge: aiHotelKnowledge,
    conversationContext,
    conversationState,
    heuristic: {
      primary_intent: primaryConciergeIntent.intent,
      secondary_intents: detectedConciergeIntents.map((item) => item.intent).filter(Boolean),
      confidence: primaryConciergeIntent.confidence || 0,
      revenue_opportunity: Boolean(conciergeRevenueOpportunity),
      offer_type: conciergeRevenueOpportunity?.offerType || null,
      risk: conciergeRisk,
      suggested_response: rawAiResponse.reply,
      suppressed_offer: preliminaryOfferSuppression.suppress,
      response_guidance: responseGuidance,
      contextual_revenue: {
        contexts: contextualRevenue.contexts,
        primary_offer_type: contextualRevenue.primaryOpportunity?.offerType || null,
        timing: contextualRevenue.primaryOpportunity?.timing || null
      },
      experience_intelligence: {
        contexts: experienceIntelligence.contexts,
        destination: experienceIntelligence.destination,
        primary_offer_type: experienceIntelligence.primaryOpportunity?.offerType || null,
        timing: experienceIntelligence.primaryOpportunity?.timing || null,
        conversational_intent: providerExperienceConversation.intentType || null,
        booking_ready: Boolean(providerExperienceConversation.bookingReady),
        provider_used: providerExperienceConversation.matchedExperience?.provider_source || null,
        provider_experience_used: providerExperienceConversation.matchedExperience?.title || null
      }
    }
  });
  const openAiResult = openAiConcierge.ok ? openAiConcierge.result : null;
  const enhancedPrimaryIntent = openAiResult?.primary_intent
    ? {
      intent: openAiResult.primary_intent,
      confidence: openAiResult.confidence,
      source: 'openai_concierge'
    }
    : primaryConciergeIntent;
  const enhancedOfferType = normalizeOpenAiOfferType(openAiResult?.offer_type);
  const enhancedRevenueOpportunity = openAiResult?.revenue_opportunity && enhancedOfferType
    ? {
      offerType: enhancedOfferType,
      suggestedPrice: conciergeRevenueOpportunity?.suggestedPrice || null,
      currency: conciergeRevenueOpportunity?.currency || 'EUR',
      confidence: openAiResult.confidence || conciergeRevenueOpportunity?.confidence || 0.75,
      aiReason: openAiResult.reasoning || `OpenAI Concierge detected ${enhancedOfferType}.`,
      triggerIntent: openAiResult.primary_intent || primaryConciergeIntent.intent
    }
    : conciergeRevenueOpportunity;
  let enhancedRisk = openAiResult?.should_escalate
    ? {
      hasRisk: true,
      category: openAiResult.escalation_level === 'urgent' ? 'emergency' : 'reception',
      priority: openAiResult.escalation_level === 'urgent' ? 'urgent' : 'high',
      reason: openAiResult.risk_flags?.[0] || openAiResult.escalation_level || 'openai_escalation'
    }
    : conciergeRisk;
  const providerExperienceOwnsResponse = Boolean(
    providerExperienceConversation.intentType
    && providerExperienceConversation.matchedExperience
    && !conciergeRisk.hasRisk
  );
  const providerSafeEscalationReasons = new Set([
    'low_confidence',
    'fallback_response',
    'openai_escalation',
    'reception'
  ]);

  if (providerExperienceOwnsResponse && enhancedRisk?.hasRisk && providerSafeEscalationReasons.has(enhancedRisk.reason)) {
    enhancedRisk = {
      hasRisk: false,
      category: null,
      priority: 'normal',
      reason: 'provider_experience_catalog_match_overrides_fallback'
    };
  }
  const finalOfferSuppression = shouldSuppressOfferForNaturalConversation({
    message,
    offerType: enhancedRevenueOpportunity?.offerType || null,
    intent: enhancedPrimaryIntent.intent,
    opportunity: enhancedRevenueOpportunity,
    conversationState,
    risk: enhancedRisk,
    sentiment: openAiResult?.sentiment || conversationState.sentiment
  });
  const offerAllowedInReply = Boolean(enhancedRevenueOpportunity && !finalOfferSuppression.suppress);

  let humanEscalation = detectHumanEscalation({
    message,
    aiResponse: rawAiResponse,
    knowledgeUsed: Boolean(knowledgeResult)
  });
  if (
    providerExperienceOwnsResponse
    && ['low_confidence', 'fallback_response'].includes(humanEscalation.humanReason)
  ) {
    humanEscalation = {
      needsHuman: false,
      humanReason: null
    };
  }
  const aiResponse = humanEscalation.needsHuman && shouldReplaceReplyForHumanEscalation({
    aiResponse: rawAiResponse,
    reason: humanEscalation.humanReason
  })
    ? {
      ...rawAiResponse,
      reply: buildHumanHandoffReply({
        language: conversationContext.language,
        reason: humanEscalation.humanReason
      }),
      escalate_to_human: true
    }
    : {
      ...rawAiResponse,
      escalate_to_human: rawAiResponse.escalate_to_human || humanEscalation.needsHuman
  };
  const conciergeReply = generateConciergeResponse({
    intentResult: enhancedPrimaryIntent,
    opportunity: offerAllowedInReply ? enhancedRevenueOpportunity : null,
    risk: enhancedRisk,
    language: conversationContext.language
  });
  const enhancedSuggestedResponse = openAiResult?.suggested_response?.trim();
  const secondaryConciergeResponses = conciergeRevenueOpportunities
    .filter((opportunity) => opportunity.offerType !== enhancedRevenueOpportunity?.offerType)
    .filter((opportunity) => !shouldSuppressOfferForNaturalConversation({
      message,
      offerType: opportunity.offerType,
      intent: detectedConciergeIntents.find((item) => getOfferTypeForIntent(item.intent) === opportunity.offerType)?.intent || null,
      opportunity,
      conversationState,
      risk: enhancedRisk,
      sentiment: openAiResult?.sentiment || conversationState.sentiment
    }).suppress)
    .slice(0, 1)
    .map((opportunity) => generateConciergeResponse({
      intentResult: detectedConciergeIntents.find((item) => getOfferTypeForIntent(item.intent) === opportunity.offerType),
      opportunity,
      risk: { hasRisk: false },
      language: conversationContext.language
    }));
  const naturalPrimaryReply = chooseNaturalConciergeResponse({
    baseResponse: aiResponse.reply,
    openAiSuggestedResponse: enhancedSuggestedResponse,
    conciergeResponse: conciergeReply,
    offerType: enhancedRevenueOpportunity?.offerType || null,
    offerAllowed: offerAllowedInReply,
    risk: enhancedRisk
  });
  const contextualConciergeReply = generateContextualResponse({
    fallbackResponse: naturalPrimaryReply,
    state: {
      ...conversationState,
      suppressedOffer: finalOfferSuppression.suppress
    },
    responses: [naturalPrimaryReply, ...secondaryConciergeResponses]
  });
  const providerRecommendationReply = providerExperienceConversation.intentType && !enhancedRisk.hasRisk && !providerExperienceConversation.bookingReady
    ? buildProviderExperienceRecommendationReply({
      intent: providerExperienceConversation,
      hotelExperiences: experienceCatalog,
      language: conversationContext.language
    })
    : null;
  const aiResponseWithConcierge = contextualConciergeReply && !aiResponse.emergency
    ? {
      ...aiResponse,
      reply: providerRecommendationReply || contextualConciergeReply,
      intent: providerExperienceConversation.intentType || enhancedPrimaryIntent.intent || aiResponse.intent,
      confidence: Math.max(Number(aiResponse.confidence || 0), Number(enhancedPrimaryIntent.confidence || 0.75)),
      concierge_intent: providerExperienceConversation.intentType || enhancedPrimaryIntent.intent,
      upsell_opportunity: Boolean(offerAllowedInReply && enhancedRevenueOpportunity) || aiResponse.upsell_opportunity,
      escalate_to_human: aiResponse.escalate_to_human || enhancedRisk.hasRisk
    }
    : {
      ...aiResponse,
      reply: providerRecommendationReply || aiResponse.reply,
      intent: providerExperienceConversation.intentType || aiResponse.intent,
      concierge_intent: providerExperienceConversation.intentType || enhancedPrimaryIntent.intent
    };
  let aiResponseWithUpsell = upsellOpportunities.length > 0
    ? {
      ...aiResponseWithConcierge,
      upsell_opportunity: Boolean(offerAllowedInReply && enhancedRevenueOpportunity) || aiResponseWithConcierge.upsell_opportunity
    }
    : aiResponseWithConcierge;

  if (humanEscalation.needsHuman) {
    logger.warn('Conversation marked as needs human', {
      guestId: guest.id,
      conversationId: conversation.id,
      reason: humanEscalation.humanReason,
      intent: aiResponseWithUpsell.intent,
      confidence: aiResponseWithUpsell.confidence
    });
  }

  const storedUpsells = await storeUpsellOpportunities({
    hotel: activeHotel,
    guest,
    conversation,
    reservation: conversationContext.reservation,
    opportunities: upsellOpportunities
  });
  const conciergeOffers = [];

  for (const opportunity of conciergeRevenueOpportunities) {
    const suppression = shouldSuppressOfferForNaturalConversation({
      message,
      offerType: opportunity.offerType,
      intent: detectedConciergeIntents.find((item) => getOfferTypeForIntent(item.intent) === opportunity.offerType)?.intent || enhancedPrimaryIntent.intent,
      opportunity,
      conversationState,
      risk: enhancedRisk,
      sentiment: openAiResult?.sentiment || conversationState.sentiment
    });
    const suppressThisOffer = opportunity.offerType === enhancedRevenueOpportunity?.offerType
      && suppression.suppress;

    if (suppression.suppress) {
      continue;
    }

    const offerRecord = await createAiOffer({
      hotel: activeHotel,
      guest,
      conversation,
      reservation: conversationContext.reservation,
      opportunity: opportunity.offerType === enhancedRevenueOpportunity?.offerType ? enhancedRevenueOpportunity : opportunity,
      status: !suppressThisOffer && offerAllowedInReply && contextualConciergeReply && opportunity.offerType === enhancedRevenueOpportunity?.offerType ? 'sent' : 'suggested'
    });

    if (offerRecord) {
      conciergeOffers.push(offerRecord);
    }
  }

  const conciergeOffer = conciergeOffers[0] || null;
  const experienceBookingIntent = await detectExperienceBookingIntent({
    message,
    conversationId: conversation.id,
    hotelExperiences: experienceCatalog,
    latestProviderContext: providerExperienceConversation.latestProviderContext || null,
    recentMessages: conversationContext.recentMessages,
    experienceBookingState: conversationState.previousState?.state_metadata?.experience_booking_state || null
  });
  const providerBookingFlowActive = Boolean(
    experienceBookingIntent.matchedExperience
    && experienceBookingIntent.conversationIntent?.intentType
  );
  const providerBookingFlowReply = providerBookingFlowActive && !experienceBookingIntent.detected
    ? buildProviderExperienceRecommendationReply({
      intent: {
        ...experienceBookingIntent.conversationIntent,
        matchedExperience: experienceBookingIntent.matchedExperience,
        requestedDate: experienceBookingIntent.requestedDate,
        requestedTime: experienceBookingIntent.requestedTime,
        guestsCount: experienceBookingIntent.guestsCount,
        missingDetails: experienceBookingIntent.missingDetails,
        reason: experienceBookingIntent.reason,
        latestProviderContext: experienceBookingIntent.latestProviderContext
          || experienceBookingIntent.conversationIntent?.latestProviderContext
          || null
      },
      hotelExperiences: experienceCatalog,
      language: conversationContext.language
    })
    : null;

  if (providerBookingFlowActive) {
    logger.info('provider_flow_active', {
      hotelId: activeHotel.id,
      guestId: guest.id,
      conversationId: conversation.id,
      experienceTitle: experienceBookingIntent.matchedExperience?.title || null,
      provider: experienceBookingIntent.matchedExperience?.provider_source || null,
      reason: experienceBookingIntent.reason,
      requestedDate: experienceBookingIntent.requestedDate || null,
      guestsCount: experienceBookingIntent.guestsCount || null,
      awaitingGuestDetails: experienceBookingIntent.reason === 'booking_missing_guest_details',
      awaitingGuestConfirmation: experienceBookingIntent.reason === 'awaiting_guest_confirmation',
      confirmationDetected: Boolean(experienceBookingIntent.guestConfirmedProviderRequest)
    });
  }

  if (providerBookingFlowActive && enhancedRisk?.hasRisk && providerSafeEscalationReasons.has(enhancedRisk.reason)) {
    logger.info('fallback_blocked_because_provider_flow_active', {
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      fallbackReason: enhancedRisk.reason,
      source: 'enhanced_risk',
      experienceTitle: experienceBookingIntent.matchedExperience?.title || null,
      provider: experienceBookingIntent.matchedExperience?.provider_source || null
    });
    logger.info('provider_booking_fallback_blocked', {
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      fallbackReason: enhancedRisk.reason,
      source: 'enhanced_risk',
      experienceTitle: experienceBookingIntent.matchedExperience?.title || null,
      provider: experienceBookingIntent.matchedExperience?.provider_source || null
    });
    enhancedRisk = {
      hasRisk: false,
      category: null,
      priority: 'normal',
      reason: 'provider_booking_flow_overrides_fallback'
    };
  }

  if (
    providerBookingFlowActive
    && ['low_confidence', 'fallback_response'].includes(humanEscalation.humanReason)
  ) {
    logger.info('fallback_blocked_because_provider_flow_active', {
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      humanReason: humanEscalation.humanReason,
      experienceTitle: experienceBookingIntent.matchedExperience?.title || null,
      provider: experienceBookingIntent.matchedExperience?.provider_source || null
    });
    logger.info('provider_booking_fallback_blocked', {
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      humanReason: humanEscalation.humanReason,
      source: 'human_escalation',
      experienceTitle: experienceBookingIntent.matchedExperience?.title || null,
      provider: experienceBookingIntent.matchedExperience?.provider_source || null
    });
    humanEscalation = {
      needsHuman: false,
      humanReason: null
    };
  }

  const bookingResolvedFromRecentExplicitExperience = ['current_message', 'recent_guest_message'].includes(
    experienceBookingIntent.experienceResolution?.resolvedSource
  );
  let preBookingLastProviderWrite = null;
  if (bookingResolvedFromRecentExplicitExperience && experienceBookingIntent.matchedExperience) {
    preBookingLastProviderWrite = await setLastProviderExperience({
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      guestId: guest.id,
      providerExperience: experienceBookingIntent.matchedExperience,
      reason: 'explicit_guest_booking_intent',
      message: experienceBookingIntent.experienceResolution?.resolvedFromMessage || message,
      previousLastExperience: providerExperienceConversation.latestProviderContext || conversationState.previousState?.state_metadata?.last_provider_experience || null,
      callsite: `staynex.processGuestMessage.bookingResolution.${experienceBookingIntent.experienceResolution?.resolvedSource}`
    });
  }
  const experienceBookingRequest = await createExperienceBookingRequest({
    hotel: activeHotel,
    guest,
    conversation,
    reservation: conversationContext.reservation,
    message,
    hotelExperiences: experienceCatalog,
    intent: experienceBookingIntent
  });

  if (experienceBookingRequest) {
    aiResponseWithUpsell = {
      ...aiResponseWithUpsell,
      reply: getExperienceBookingConfirmationReply({
        language: conversationContext.language,
        providerName: experienceBookingRequest.provider_source || providerExperienceConversation.matchedExperience?.provider_source || null,
        experienceTitle: experienceBookingRequest.experience_title || providerExperienceConversation.matchedExperience?.title || null,
        leadStatus: experienceBookingRequest.lead_status || experienceBookingRequest.metadata?.provider_email_status || null
      }),
      concierge_intent: aiResponseWithUpsell.concierge_intent || 'experience_booking_request',
      intent: aiResponseWithUpsell.intent || 'experience_booking_request',
      upsell_opportunity: true
    };

    await createMessage({
      conversationId: conversation.id,
      senderType: 'ai',
      content: `Provider experience request created: ${experienceBookingRequest.experience_title}. Availability is not confirmed until the provider replies.`,
      originalLanguage: 'en',
      metadata: {
        system_event: 'experience_booking_request_created'
      }
    });
  } else if (experienceBookingIntent.detected) {
    const providerName = experienceBookingIntent.matchedExperience?.provider_source || 'el proveedor';
    const failureReply = {
      es: `He recogido la confirmacion, pero ahora mismo no he podido enviar la solicitud a ${providerName}. La disponibilidad no esta confirmada todavia; lo intentaremos de nuevo para no duplicar la peticion.`,
      fr: `J ai bien recu la confirmation, mais je n ai pas pu envoyer la demande a ${providerName} pour le moment. La disponibilite n est pas encore confirmee; nous reessaierons sans dupliquer la demande.`,
      de: `Ich habe die Bestaetigung erhalten, konnte die Anfrage an ${providerName} aber gerade nicht senden. Die Verfuegbarkeit ist noch nicht bestaetigt; wir versuchen es erneut, ohne die Anfrage zu duplizieren.`,
      en: `I have the confirmation, but I could not send the request to ${providerName} right now. Availability is not confirmed yet; we will retry without duplicating the request.`
    }[conversationContext.language] || `I have the confirmation, but I could not send the request to ${providerName} right now. Availability is not confirmed yet; we will retry without duplicating the request.`;

    logger.warn('provider_booking_request_create_failed', {
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      experienceTitle: experienceBookingIntent.matchedExperience?.title || null,
      provider: providerName,
      reason: experienceBookingIntent.reason || experienceBookingIntent.conversationIntent?.reason || null,
      requestedDate: experienceBookingIntent.requestedDate || null,
      guestsCount: experienceBookingIntent.guestsCount || null
    });

    aiResponseWithUpsell = {
      ...aiResponseWithUpsell,
      reply: failureReply,
      concierge_intent: 'experience_booking_request_failed',
      intent: 'experience_booking_request_failed',
      escalate_to_human: false
    };
  } else if (providerBookingFlowReply) {
    aiResponseWithUpsell = {
      ...aiResponseWithUpsell,
      reply: providerBookingFlowReply,
      intent: experienceBookingIntent.conversationIntent?.intentType || aiResponseWithUpsell.intent,
      concierge_intent: experienceBookingIntent.conversationIntent?.intentType || aiResponseWithUpsell.concierge_intent,
      confidence: Math.max(Number(aiResponseWithUpsell.confidence || 0), Number(experienceBookingIntent.confidence || 0.8)),
      escalate_to_human: false
    };

    logger.info(
      experienceBookingIntent.reason === 'awaiting_guest_confirmation'
        ? 'awaiting_guest_confirmation'
        : 'awaiting_guest_details',
      {
        hotelId: activeHotel.id,
        conversationId: conversation.id,
        experienceTitle: experienceBookingIntent.matchedExperience?.title || null,
        provider: experienceBookingIntent.matchedExperience?.provider_source || null,
        requestedDate: experienceBookingIntent.requestedDate || null,
        guestsCount: experienceBookingIntent.guestsCount || null,
        missingDetails: experienceBookingIntent.missingDetails || []
      }
    );
  }

  const smarterResponse = chooseSmarterConciergeResponse({
    message,
    aiResponse: aiResponseWithUpsell,
    language: conversationContext.language,
    conversationState,
    humanEscalation,
    enhancedRisk,
    providerIntent: providerExperienceConversation,
    knowledgeUsed: Boolean(knowledgeResult || providerRecommendationReply || providerBookingFlowReply || experienceBookingRequest || experienceBookingIntent.detected),
    recentMessages: conversationContext.recentMessages
  });
  aiResponseWithUpsell = smarterResponse.aiResponse;
  humanEscalation = smarterResponse.humanEscalation;

  logger.info('smarter_concierge_response_strategy', {
    hotelId: activeHotel.id,
    guestId: guest.id,
    conversationId: conversation.id,
    response_strategy: smarterResponse.metadata.response_strategy,
    clarification_used: smarterResponse.metadata.clarification_used,
    escalation_reason: smarterResponse.metadata.escalation_reason,
    repeated_response_detected: smarterResponse.metadata.repeated_response_detected,
    response_variant: smarterResponse.metadata.response_variant,
    confidence: smarterResponse.metadata.confidence,
    language: smarterResponse.metadata.language,
    repeated_fallback_detected: smarterResponse.metadata.repeated_fallback_detected,
    conversation_loop_detected: smarterResponse.metadata.conversation_loop_detected,
    repair_mode_activated: smarterResponse.metadata.repair_mode_activated,
    fallback_blocked_due_to_repetition: smarterResponse.metadata.fallback_blocked_due_to_repetition,
    alternative_response_used: smarterResponse.metadata.alternative_response_used,
    repair_intent: smarterResponse.metadata.repair_intent || null
  });

  if (smarterResponse.metadata.repeated_fallback_detected) {
    logger.warn('repeated_fallback_detected', {
      hotelId: activeHotel.id,
      guestId: guest.id,
      conversationId: conversation.id,
      repairIntent: smarterResponse.metadata.repair_intent || null,
      recentFallbackCount: smarterResponse.metadata.recent_fallback_count
    });
  }

  if (smarterResponse.metadata.conversation_loop_detected) {
    logger.warn('conversation_loop_detected', {
      hotelId: activeHotel.id,
      guestId: guest.id,
      conversationId: conversation.id,
      repairIntent: smarterResponse.metadata.repair_intent || null,
      recentFallbackCount: smarterResponse.metadata.recent_fallback_count
    });
  }

  if (smarterResponse.metadata.repair_mode_activated) {
    logger.info('repair_mode_activated', {
      hotelId: activeHotel.id,
      guestId: guest.id,
      conversationId: conversation.id,
      repairIntent: smarterResponse.metadata.repair_intent || null
    });
  }

  if (smarterResponse.metadata.fallback_blocked_due_to_repetition) {
    logger.info('fallback_blocked_due_to_repetition', {
      hotelId: activeHotel.id,
      guestId: guest.id,
      conversationId: conversation.id
    });
  }

  if (smarterResponse.metadata.alternative_response_used) {
    logger.info('alternative_response_used', {
      hotelId: activeHotel.id,
      guestId: guest.id,
      conversationId: conversation.id,
      responseStrategy: smarterResponse.metadata.response_strategy
    });
  }

  const conciergeMemories = await persistConciergeMemory({
    hotel: activeHotel,
    guest,
    reservation: conversationContext.reservation,
    intentResult: enhancedPrimaryIntent,
    opportunity: offerAllowedInReply ? enhancedRevenueOpportunity : null,
    risk: enhancedRisk
  });
  const recentUpsells = storedUpsells.length > 0
    ? storedUpsells
    : await getRecentUpsellsForConversation(conversation.id);
  const upsellInterest = detectUpsellInterest({
    message,
    recentUpsells
  });

  let ticket = await createTicketFromAiResponse({
    aiResponse: aiResponseWithUpsell,
    hotel: activeHotel,
    guest,
    conversation
  });

  if (!ticket && upsellInterest) {
    ticket = await createUpsellInterestTicket({
      hotel: activeHotel,
      guest,
      conversation,
      interest: upsellInterest,
      message
    });
  }

  if (!ticket && enhancedRisk.hasRisk) {
    ticket = await createOperationalTicketForConciergeRisk({
      hotel: activeHotel,
      guest,
      conversation,
      risk: enhancedRisk,
      message
    });
  }

  const aiMessage = await createMessage({
    conversationId: conversation.id,
    senderType: 'ai',
    content: aiResponseWithUpsell.reply,
    originalLanguage: conversationContext.language,
    metadata: {
      translation_direction: 'ai_to_guest',
      response_language: conversationContext.language
    }
  });
  const previousLastProviderExperience = conversationState.previousState?.state_metadata?.last_provider_experience || null;
  const effectiveProviderExperienceForState = experienceBookingIntent.matchedExperience
    || providerExperienceConversation.matchedExperience
    || null;
  const effectiveProviderIntentForState = experienceBookingIntent.matchedExperience
    ? {
      bookingReady: experienceBookingIntent.detected,
      reason: experienceBookingIntent.reason || experienceBookingIntent.conversationIntent?.reason || providerExperienceConversation.reason,
      intentType: experienceBookingIntent.conversationIntent?.intentType || providerExperienceConversation.intentType
    }
    : providerExperienceConversation;
  const lastProviderWriteReason = effectiveProviderExperienceForState
    ? effectiveProviderIntentForState.bookingReady
      ? 'explicit_guest_booking_intent'
      : ['booking_missing_guest_details', 'awaiting_guest_confirmation'].includes(effectiveProviderIntentForState.reason)
        || ['excursion_booking_intent', 'excursion_booking_confirmation'].includes(effectiveProviderIntentForState.intentType)
        ? 'explicit_guest_booking_intent'
        : effectiveProviderIntentForState.reason === 'soft_interest_or_detail_request'
        ? 'explicit_guest_detail_request'
        : effectiveProviderIntentForState.intentType === 'excursion_interest'
          ? 'explicit_guest_interest'
          : null
    : null;
  const lastProviderWrite = preBookingLastProviderWrite?.written
    ? preBookingLastProviderWrite
    : (providerExperienceConversation.intentType || experienceBookingIntent.conversationIntent?.intentType)
    ? await setLastProviderExperience({
      hotelId: activeHotel.id,
      conversationId: conversation.id,
      guestId: guest.id,
      providerExperience: effectiveProviderExperienceForState,
      reason: lastProviderWriteReason || 'recommendation_list',
      message,
      previousLastExperience: preBookingLastProviderWrite?.lastProviderExperience || previousLastProviderExperience,
      callsite: 'staynex.processGuestMessage.providerExperienceConversation'
    })
    : {
      written: false,
      lastProviderExperience: previousLastProviderExperience
    };
  const nextLastProviderExperience = lastProviderWrite.lastProviderExperience || previousLastProviderExperience;
  const savedConversationState = await upsertConversationAiState({
    hotelId: activeHotel.id,
    conversationId: conversation.id,
    state: {
      ...conversationState,
      currentIntent: enhancedPrimaryIntent.intent || conversationState.currentIntent,
      primaryIntent: {
        ...conversationState.primaryIntent,
        ...enhancedPrimaryIntent
      },
      sentiment: openAiResult?.sentiment || conversationState.sentiment,
      escalationLevel: openAiResult?.escalation_level || conversationState.escalationLevel,
      metadata: {
        ...conversationState.metadata,
        openai_concierge_used: Boolean(openAiResult),
        openai_secondary_intents: openAiResult?.secondary_intents || [],
        openai_risk_flags: openAiResult?.risk_flags || [],
        openai_department_actions: openAiResult?.department_actions || [],
        natural_response_guidance: responseGuidance,
        smart_response: smarterResponse.metadata,
        final_offer_suppression: finalOfferSuppression,
        provider_experience_conversation: {
          intent: providerExperienceConversation.intentType || null,
          confidence: providerExperienceConversation.confidence || 0,
          reason: providerExperienceConversation.reason || null,
          booking_created: Boolean(experienceBookingRequest),
          booking_ready: Boolean(providerExperienceConversation.bookingReady),
          booking_block_reason: experienceBookingRequest ? null : providerExperienceConversation.reason || null,
          matched_provider_experience_id: providerExperienceConversation.matchedExperience?.provider_experience_id || providerExperienceConversation.matchedExperience?.id || null,
          last_provider_experience_id: nextLastProviderExperience?.provider_experience_id || null,
          provider_used: providerExperienceConversation.matchedExperience?.provider_source || null,
          provider_experience_used: providerExperienceConversation.matchedExperience?.title || null,
          provider_lead_status: experienceBookingRequest?.lead_status || null,
          provider_email_status: experienceBookingRequest?.metadata?.provider_email_status || experienceBookingRequest?.lead_status || null
        },
        experience_booking_state: providerBookingFlowActive || experienceBookingRequest ? {
          conversation_id: conversation.id,
          provider_experience_id: experienceBookingIntent.matchedExperience?.provider_experience_id
            || experienceBookingIntent.matchedExperience?.metadata?.provider_experience_id
            || experienceBookingRequest?.provider_experience_id
            || null,
          provider_id: experienceBookingIntent.matchedExperience?.provider_id
            || experienceBookingIntent.matchedExperience?.metadata?.provider_id
            || experienceBookingRequest?.provider_id
            || null,
          detected_experience: experienceBookingIntent.matchedExperience?.title || experienceBookingRequest?.experience_title || null,
          provider: experienceBookingIntent.matchedExperience?.provider_source || experienceBookingRequest?.provider_source || null,
          requested_date: experienceBookingIntent.requestedDate || experienceBookingRequest?.requested_date || null,
          requested_time: experienceBookingIntent.requestedTime || experienceBookingRequest?.requested_time || null,
          guest_count: experienceBookingIntent.guestsCount || experienceBookingRequest?.guests_count || null,
          awaiting_guest_confirmation: experienceBookingIntent.reason === 'awaiting_guest_confirmation' && !experienceBookingRequest,
          awaiting_confirmation: experienceBookingIntent.reason === 'awaiting_guest_confirmation' && !experienceBookingRequest,
          awaiting_guest_details: experienceBookingIntent.reason === 'booking_missing_guest_details' && !experienceBookingRequest,
          provider_request_sent: Boolean(experienceBookingRequest),
          guest_confirmed_provider_request: Boolean(experienceBookingIntent.guestConfirmedProviderRequest),
          last_message: message
        } : conversationState.previousState?.state_metadata?.experience_booking_state || null,
        last_provider_experience: nextLastProviderExperience
      }
    },
    offerType: conciergeOffer?.status === 'sent' ? conciergeOffer.offer_type : null,
    aiResponse: aiResponseWithUpsell.reply,
    aiSummary: openAiResult?.summary || null,
    aiReasoning: openAiResult?.reasoning || null,
    openAiEnhanced: Boolean(openAiResult)
  });
  const primaryUpsell = storedUpsells[0] || upsellOpportunities[0] || null;
  const detectedMemories = detectGuestMemoryFromMessage({
    message,
    context: conversationContext,
    aiResult: aiResponseWithUpsell
  });
  const savedMemories = await upsertDetectedGuestMemories({
    hotelId: activeHotel.id,
    guestId: guest.id,
    sourceMessageId: guestMessage.id,
    reservationId: conversationContext.reservation?.id || null,
    memories: [
      ...detectedMemories,
      ...(openAiResult?.guest_insights || []).map((item) => ({
        memoryType: item.memory_type || 'openai_insight',
        memoryKey: item.memory_key,
        memoryValue: item.memory_value,
        confidence: item.confidence || 0.75,
        metadata: { openai_concierge: true }
      })),
      ...buildProviderExperienceInterestMemories({
        intent: providerExperienceConversation
      })
    ]
  });
  const memoryKeysUsed = (conversationContext.guestMemory || []).map((item) => item.memory_key);

  await createAiLog({
    messageId: guestMessage.id,
    hotelId: activeHotel.id,
    hotelName: activeHotel.name || activeHotel.brand_name || null,
    guestId: guest.id,
    conversationId: conversation.id,
    detectedLanguage: conversationContext.language,
    detectedIntent: providerExperienceConversation.intentType || conversationState.currentIntent || aiResponseWithUpsell.intent,
    detectedRoom: guest.current_room || conversationContext.knownRoom || ticket?.room_number || null,
    confidenceScore: aiResponseWithUpsell.confidence,
    knowledgeUsed: Boolean(knowledgeResult),
    knowledgeKey: knowledgeResult?.metadata?.knowledgeKey || null,
    knowledgeHotelId: knowledgeResult?.metadata?.knowledgeHotelId || null,
    ticketCreated: Boolean(ticket),
    ticketId: ticket?.id || null,
    ticketCategory: ticket?.category || aiResponseWithUpsell.ticket?.category || null,
    generatedResponse: aiResponseWithUpsell.reply,
    rawGuestMessage: message,
    needsHuman: humanEscalation.needsHuman,
    humanReason: humanEscalation.humanReason,
    aiProvider: aiResponseWithUpsell.aiProvider || aiResponseWithUpsell.ai_provider || 'unknown',
    aiModel: aiResponseWithUpsell.aiModel || aiResponseWithUpsell.ai_model || null,
    fallbackUsed: Boolean(aiResponseWithUpsell.fallbackUsed ?? aiResponseWithUpsell.fallback_used),
    upsellDetected: Boolean(primaryUpsell),
    upsellType: primaryUpsell?.upsell_type || (offerAllowedInReply ? enhancedRevenueOpportunity?.offerType : null) || null,
    upsellConfidence: primaryUpsell?.confidence || (offerAllowedInReply ? enhancedRevenueOpportunity?.confidence : null) || null,
    memoryUsed: memoryKeysUsed.length > 0,
    memoryKeysUsed: memoryKeysUsed,
    conciergeIntent: providerExperienceConversation.intentType || enhancedPrimaryIntent.intent || conversationState.currentIntent || null,
    offerCreated: conciergeOffers.length > 0,
    offerType: conciergeOffer?.offer_type || (offerAllowedInReply ? enhancedRevenueOpportunity?.offerType : null) || null,
    offerStatus: conciergeOffer?.status || null,
    experienceBookingRequestCreated: Boolean(experienceBookingRequest),
    experienceBookingRequestId: experienceBookingRequest?.id || null,
    providerExperienceIntent: providerExperienceConversation.intentType || null,
    providerBookingCreated: Boolean(experienceBookingRequest),
    providerUsed: providerExperienceConversation.matchedExperience?.provider_source || experienceBookingRequest?.provider_source || null,
    providerExperienceUsed: providerExperienceConversation.matchedExperience?.title || experienceBookingRequest?.experience_title || null,
    providerExperiencesCount: providerExperiences.length,
    hotelExperiencesCount: hotelExperiences.length,
    responseLanguage: conversationContext.language,
    translatedForStaff: Boolean(staffTranslation.translatedText),
    translatedForGuest: false,
    translationProvider: staffTranslation.provider,
    sourcePriority: providerExperiences.length ? 'provider_experiences>hotel_experiences>local_knowledge' : hotelExperiences.length ? 'hotel_experiences>local_knowledge' : 'local_knowledge_or_empty',
    blockedCrossTenantExperiences: strictCatalog.blockedCrossTenantExperiences,
    providerNamesLoaded: strictCatalog.providerNames.join(', '),
    finalExperienceSourceUsed: strictCatalog.finalExperienceSource,
    providerBookingDetected: Boolean(experienceBookingIntent.detected || providerExperienceConversation.intentType),
    bookingReady: Boolean(experienceBookingIntent.detected || providerExperienceConversation.bookingReady),
    bookingBlockReason: experienceBookingRequest ? null : experienceBookingIntent.reason || providerExperienceConversation.reason || null,
    matchedProviderExperienceId: providerExperienceConversation.matchedExperience?.provider_experience_id || providerExperienceConversation.matchedExperience?.id || null,
    lastProviderExperienceId: nextLastProviderExperience?.provider_experience_id || conversationState.previousState?.state_metadata?.last_provider_experience?.provider_experience_id || null,
    providerLeadStatus: experienceBookingRequest?.lead_status || null,
    providerEmailStatus: experienceBookingRequest?.metadata?.provider_email_status || experienceBookingRequest?.lead_status || null,
    openAiConciergeUsed: Boolean(openAiResult),
    openAiConciergeModel: openAiConcierge.model || null,
    openAiConciergeFallback: Boolean(openAiConcierge.fallback),
    aiSummary: openAiResult?.summary || null,
    aiReasoning: [
      openAiResult?.reasoning || openAiConcierge.reason || null,
      `response_strategy=${smarterResponse.metadata.response_strategy}; clarification_used=${smarterResponse.metadata.clarification_used}; escalation_reason=${smarterResponse.metadata.escalation_reason || 'none'}; repeated_response_detected=${smarterResponse.metadata.repeated_response_detected}; response_variant=${smarterResponse.metadata.response_variant}; confidence=${smarterResponse.metadata.confidence}; language=${smarterResponse.metadata.language}`,
      `hotel_context_source=${hotelContextSource}; hotel_id=${activeHotel.id}; provider_experiences=${providerExperiences.length}; hotel_experiences=${hotelExperiences.length}; providers=${strictCatalog.providerNames.join(', ') || 'none'}; final_experience_source=${strictCatalog.finalExperienceSource}; blocked_cross_tenant=${strictCatalog.blockedCrossTenantExperiences}; response_language=${conversationContext.language}`,
      providerExperienceConversation.intentType
        ? `provider_experience_intent=${providerExperienceConversation.intentType}; booking_ready=${Boolean(providerExperienceConversation.bookingReady)}; booking_created=${Boolean(experienceBookingRequest)}; booking_request_id=${experienceBookingRequest?.id || 'none'}; booking_block_reason=${experienceBookingRequest ? 'none' : experienceBookingIntent.reason || providerExperienceConversation.reason || 'none'}; provider_used=${providerExperienceConversation.matchedExperience?.provider_source || experienceBookingRequest?.provider_source || 'none'}; provider_experience_used=${providerExperienceConversation.matchedExperience?.title || experienceBookingRequest?.experience_title || 'none'}; provider_lead_status=${experienceBookingRequest?.lead_status || 'none'}; provider_email_status=${experienceBookingRequest?.metadata?.provider_email_status || experienceBookingRequest?.lead_status || 'none'}; matched_provider_experience_id=${providerExperienceConversation.matchedExperience?.provider_experience_id || providerExperienceConversation.matchedExperience?.id || 'none'}; last_provider_experience_id=${nextLastProviderExperience?.provider_experience_id || conversationState.previousState?.state_metadata?.last_provider_experience?.provider_experience_id || 'none'}`
        : null
    ].filter(Boolean).join('\n'),
    aiSatisfactionEstimate: openAiResult?.satisfaction_estimate || null,
    aiResolutionEstimate: openAiResult?.resolution_estimate || false
  });

  let twilioMessage = null;

  if (sendReply) {
    twilioMessage = await sendWhatsAppMessage({
      to: replyTo || phone,
      body: aiResponseWithUpsell.reply
    });
  }

  logger.info('Guest message processed', {
    channel,
    hotelId: activeHotel.id,
    guestId: guest.id,
    conversationId: conversation.id,
    intent: aiResponseWithUpsell.intent,
    createTicket: aiResponseWithUpsell.create_ticket,
    ticketId: ticket?.id || null,
    upsellsDetected: upsellOpportunities.length,
    memoriesDetected: detectedMemories.length + conciergeMemories.length,
    conciergeIntent: providerExperienceConversation.intentType || enhancedPrimaryIntent.intent || conversationState.currentIntent || null,
    conciergeOfferId: conciergeOffer?.id || null,
    experienceBookingRequestId: experienceBookingRequest?.id || null,
    conversationStateId: savedConversationState?.id || null,
    openAiConciergeUsed: Boolean(openAiResult),
    openAiConciergeFallback: Boolean(openAiConcierge.fallback),
    sentViaTwilio: Boolean(twilioMessage)
  });

  logger.info('replying in guest language', {
    guestId: guest.id,
    language: conversationContext.language,
    intent: aiResponseWithUpsell.intent
  });

  return {
    ai: aiResponseWithUpsell,
    hotel: activeHotel,
    guest,
    conversation,
    messages: {
      guest: guestMessage,
      ai: aiMessage
    },
    ticket,
    upsells: storedUpsells,
    concierge: {
      intent: enhancedPrimaryIntent,
      allIntents: detectedConciergeIntents,
      state: savedConversationState,
      offer: conciergeOffer,
      offers: conciergeOffers,
      revenueOpportunity: offerAllowedInReply ? enhancedRevenueOpportunity : null,
      suppressedOffer: finalOfferSuppression.suppress,
      suppressionReason: finalOfferSuppression.reason,
      risk: enhancedRisk,
      openAi: openAiConcierge,
      departmentAction: conciergeDepartmentAction,
      experienceBookingRequest
    },
    memories: savedMemories,
    reservation: conversationContext.reservation,
    human: humanEscalation,
    delivery: {
      channel,
      sent_via_twilio: Boolean(twilioMessage),
      twilio_sid: twilioMessage?.sid || null
    }
  };
};
