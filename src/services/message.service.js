import {
  createMessage,
  findConversationWithGuest,
  touchConversation
} from './supabase.service.js';
import { sendWhatsAppMessage } from './twilio.service.js';
import { logger } from '../utils/logger.js';
import { detectLanguage, translateForGuest } from './translation.service.js';

export const sendStaffMessage = async ({
  conversationId,
  message,
  hotelId = null,
  staffLanguage = 'es'
}) => {
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  if (!message?.trim()) {
    throw new Error('message is required');
  }

  const conversation = await findConversationWithGuest(conversationId);

  if (!conversation) {
    const error = new Error('Conversation not found');
    error.statusCode = 404;
    throw error;
  }

  if (hotelId && conversation.hotel_id !== hotelId) {
    const error = new Error('Conversation not found in active workspace');
    error.statusCode = 404;
    throw error;
  }

  if (!conversation.guest?.phone_number) {
    throw new Error('Conversation guest does not have a phone number');
  }

  const guestLanguage = conversation.guest?.preferred_language || 'es';
  const detectedStaffLanguage = detectLanguage(message, staffLanguage || 'es');
  const guestTranslation = await translateForGuest({
    text: message.trim(),
    staffLanguage: detectedStaffLanguage,
    guestLanguage
  });
  const outboundMessage = guestTranslation.translatedText || message.trim();

  const staffMessage = await createMessage({
    conversationId,
    senderType: 'staff',
    content: message.trim(),
    originalLanguage: detectedStaffLanguage,
    translatedLanguage: guestTranslation.translatedText ? guestTranslation.targetLanguage : null,
    translatedText: guestTranslation.translatedText,
    translationProvider: guestTranslation.provider,
    translationConfidence: guestTranslation.confidence,
    metadata: {
      translation_direction: 'staff_to_guest',
      guest_language: guestLanguage,
      staff_language: detectedStaffLanguage,
      outbound_text: outboundMessage
    }
  });

  await touchConversation(conversationId);

  const twilioMessage = await sendWhatsAppMessage({
    to: conversation.guest.phone_number,
    body: outboundMessage
  });

  logger.info('Staff WhatsApp message sent', {
    conversationId,
    guestId: conversation.guest.id,
    messageId: staffMessage.id,
    twilioSid: twilioMessage.sid,
    originalLanguage: detectedStaffLanguage,
    guestLanguage,
    translatedForGuest: Boolean(guestTranslation.translatedText),
    translationProvider: guestTranslation.provider
  });

  return {
    message: staffMessage,
    conversation,
    delivery: {
      sent_via_twilio: true,
      twilio_sid: twilioMessage.sid,
      translated_for_guest: Boolean(guestTranslation.translatedText),
      outbound_language: guestLanguage,
      outbound_text: outboundMessage,
      translation_provider: guestTranslation.provider
    }
  };
};
