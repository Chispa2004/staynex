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
import { buildConversationContext } from './conversation-context.service.js';
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
import { getDefaultHotel } from './hotel.service.js';
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
  persistConciergeMemory
} from './concierge-ai.service.js';

const getOrCreateConversation = async ({ hotelId, guestId }) => {
  const existingConversation = await findActiveConversation({ hotelId, guestId });

  if (existingConversation) {
    return touchConversation(existingConversation.id);
  }

  return createConversation({ hotelId, guestId });
};

const isMockAiEnabled = () => process.env.USE_MOCK_AI === 'true';

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

  const activeHotel = hotel || await getDefaultHotel();
  const cleanPhone = normalizeWhatsappNumber(phone);

  logger.info('Processing guest message', {
    channel,
    hotelId: activeHotel.id,
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

  const guestMessage = await createMessage({
    conversationId: conversation.id,
    senderType: 'guest',
    content: message
  });

  const conversationContext = await buildConversationContext({
    hotel: activeHotel,
    guest,
    conversation,
    message,
    reservation
  });

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
  const upsellOpportunities = detectUpsellOpportunities({
    reservation: conversationContext.reservation,
    language: conversationContext.language,
    message,
    recentMessages: conversationContext.recentMessages,
    hotelKnowledge,
    guestMemory: conversationContext.guestMemory
  });
  const conciergeIntent = detectGuestIntent({
    message,
    context: conversationContext
  });
  const conciergeRevenueOpportunity = detectRevenueOpportunity({
    intentResult: conciergeIntent,
    context: conversationContext
  });
  const conciergeRisk = detectConciergeOperationalRisk({
    intentResult: conciergeIntent,
    message
  });
  const conciergeDepartmentAction = generateDepartmentAction({
    intentResult: conciergeIntent,
    opportunity: conciergeRevenueOpportunity,
    risk: conciergeRisk
  });

  conversationContext.upsellOpportunities = upsellOpportunities;
  conversationContext.concierge = {
    intent: conciergeIntent,
    revenueOpportunity: conciergeRevenueOpportunity,
    risk: conciergeRisk,
    departmentAction: conciergeDepartmentAction
  };

  const shouldUseDirectKnowledgeResponse = Boolean(knowledgeResult && isMockAiEnabled());

  const rawAiResponse = withAiMetadata(
    shouldUseDirectKnowledgeResponse ? knowledgeResult.aiResponse : await analyzeGuestMessage({
      hotel: activeHotel,
      guest,
      message,
      hotelKnowledge,
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
  const humanEscalation = detectHumanEscalation({
    message,
    aiResponse: rawAiResponse,
    knowledgeUsed: Boolean(knowledgeResult)
  });
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
    intentResult: conciergeIntent,
    opportunity: conciergeRevenueOpportunity,
    risk: conciergeRisk,
    language: conversationContext.language
  });
  const aiResponseWithConcierge = conciergeReply && !aiResponse.emergency
    ? {
      ...aiResponse,
      reply: conciergeReply,
      intent: conciergeIntent.intent || aiResponse.intent,
      confidence: Math.max(Number(aiResponse.confidence || 0), Number(conciergeIntent.confidence || 0.75)),
      concierge_intent: conciergeIntent.intent,
      upsell_opportunity: Boolean(conciergeRevenueOpportunity) || aiResponse.upsell_opportunity,
      escalate_to_human: aiResponse.escalate_to_human || conciergeRisk.hasRisk
    }
    : {
      ...aiResponse,
      concierge_intent: conciergeIntent.intent
    };
  const aiResponseWithUpsell = upsellOpportunities.length > 0
    ? {
      ...aiResponseWithConcierge,
      upsell_opportunity: true
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
  const conciergeOffer = await createAiOffer({
    hotel: activeHotel,
    guest,
    conversation,
    reservation: conversationContext.reservation,
    opportunity: conciergeRevenueOpportunity,
    status: conciergeReply && conciergeRevenueOpportunity ? 'sent' : 'suggested'
  });
  const conciergeMemories = await persistConciergeMemory({
    hotel: activeHotel,
    guest,
    reservation: conversationContext.reservation,
    intentResult: conciergeIntent,
    opportunity: conciergeRevenueOpportunity,
    risk: conciergeRisk
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

  if (!ticket && conciergeRisk.hasRisk) {
    ticket = await createOperationalTicketForConciergeRisk({
      hotel: activeHotel,
      guest,
      conversation,
      risk: conciergeRisk,
      message
    });
  }

  const aiMessage = await createMessage({
    conversationId: conversation.id,
    senderType: 'ai',
    content: aiResponseWithUpsell.reply
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
    memories: detectedMemories
  });
  const memoryKeysUsed = (conversationContext.guestMemory || []).map((item) => item.memory_key);

  await createAiLog({
    messageId: guestMessage.id,
    guestId: guest.id,
    conversationId: conversation.id,
    detectedLanguage: conversationContext.language,
    detectedIntent: aiResponseWithUpsell.intent,
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
    upsellType: primaryUpsell?.upsell_type || conciergeRevenueOpportunity?.offerType || null,
    upsellConfidence: primaryUpsell?.confidence || conciergeRevenueOpportunity?.confidence || null,
    memoryUsed: memoryKeysUsed.length > 0,
    memoryKeysUsed: memoryKeysUsed,
    conciergeIntent: conciergeIntent.intent || null,
    offerCreated: Boolean(conciergeOffer),
    offerType: conciergeOffer?.offer_type || conciergeRevenueOpportunity?.offerType || null,
    offerStatus: conciergeOffer?.status || null
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
    conciergeIntent: conciergeIntent.intent || null,
    conciergeOfferId: conciergeOffer?.id || null,
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
      intent: conciergeIntent,
      offer: conciergeOffer,
      revenueOpportunity: conciergeRevenueOpportunity,
      risk: conciergeRisk,
      departmentAction: conciergeDepartmentAction
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
