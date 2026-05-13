import {
  createConversation,
  createMessage,
  findActiveConversation,
  getHotelKnowledge,
  getOrCreateLocalTestHotel,
  touchConversation
} from './supabase.service.js';
import { analyzeGuestMessage } from './openai.service.js';
import { findKnowledgeAnswerWithMetadata } from './knowledge.service.js';
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
import { logger } from '../utils/logger.js';

const getOrCreateConversation = async ({ hotelId, guestId }) => {
  const existingConversation = await findActiveConversation({ hotelId, guestId });

  if (existingConversation) {
    return touchConversation(existingConversation.id);
  }

  return createConversation({ hotelId, guestId });
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

  const activeHotel = hotel || await getOrCreateLocalTestHotel();
  const cleanPhone = normalizeWhatsappNumber(phone);

  logger.info('Processing guest message', {
    channel,
    hotelId: activeHotel.id,
    phone: cleanPhone
  });

  const guest = await findOrCreateGuest({
    hotelId: activeHotel.id,
    phoneNumber: cleanPhone,
    message
  });

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
    guest,
    conversation,
    message
  });

  const knowledgeResult = await findKnowledgeAnswerWithMetadata(
    activeHotel.id,
    message,
    conversationContext.language
  );
  const hotelKnowledge = knowledgeResult ? [] : await getHotelKnowledge(activeHotel.id);

  const rawAiResponse = knowledgeResult?.aiResponse || await analyzeGuestMessage({
    hotel: activeHotel,
    guest,
    message,
    hotelKnowledge,
    conversationContext
  });
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

  if (humanEscalation.needsHuman) {
    logger.warn('Conversation marked as needs human', {
      guestId: guest.id,
      conversationId: conversation.id,
      reason: humanEscalation.humanReason,
      intent: aiResponse.intent,
      confidence: aiResponse.confidence
    });
  }

  const ticket = await createTicketFromAiResponse({
    aiResponse,
    hotel: activeHotel,
    guest,
    conversation
  });

  const aiMessage = await createMessage({
    conversationId: conversation.id,
    senderType: 'ai',
    content: aiResponse.reply
  });

  await createAiLog({
    messageId: guestMessage.id,
    guestId: guest.id,
    conversationId: conversation.id,
    detectedLanguage: conversationContext.language,
    detectedIntent: aiResponse.intent,
    detectedRoom: guest.current_room || conversationContext.knownRoom || ticket?.room_number || null,
    confidenceScore: aiResponse.confidence,
    knowledgeUsed: Boolean(knowledgeResult),
    knowledgeKey: knowledgeResult?.metadata?.knowledgeKey || null,
    ticketCreated: Boolean(ticket),
    ticketId: ticket?.id || null,
    ticketCategory: ticket?.category || aiResponse.ticket?.category || null,
    generatedResponse: aiResponse.reply,
    rawGuestMessage: message,
    needsHuman: humanEscalation.needsHuman,
    humanReason: humanEscalation.humanReason
  });

  let twilioMessage = null;

  if (sendReply) {
    twilioMessage = await sendWhatsAppMessage({
      to: replyTo || phone,
      body: aiResponse.reply
    });
  }

  logger.info('Guest message processed', {
    channel,
    hotelId: activeHotel.id,
    guestId: guest.id,
    conversationId: conversation.id,
    intent: aiResponse.intent,
    createTicket: aiResponse.create_ticket,
    ticketId: ticket?.id || null,
    sentViaTwilio: Boolean(twilioMessage)
  });

  logger.info('replying in guest language', {
    guestId: guest.id,
    language: conversationContext.language,
    intent: aiResponse.intent
  });

  return {
    ai: aiResponse,
    hotel: activeHotel,
    guest,
    conversation,
    messages: {
      guest: guestMessage,
      ai: aiMessage
    },
    ticket,
    human: humanEscalation,
    delivery: {
      channel,
      sent_via_twilio: Boolean(twilioMessage),
      twilio_sid: twilioMessage?.sid || null
    }
  };
};
