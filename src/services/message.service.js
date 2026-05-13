import {
  createMessage,
  findConversationWithGuest,
  touchConversation
} from './supabase.service.js';
import { sendWhatsAppMessage } from './twilio.service.js';
import { logger } from '../utils/logger.js';

export const sendStaffMessage = async ({ conversationId, message }) => {
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

  if (!conversation.guest?.phone_number) {
    throw new Error('Conversation guest does not have a phone number');
  }

  const staffMessage = await createMessage({
    conversationId,
    senderType: 'staff',
    content: message.trim()
  });

  await touchConversation(conversationId);

  const twilioMessage = await sendWhatsAppMessage({
    to: conversation.guest.phone_number,
    body: message.trim()
  });

  logger.info('Staff WhatsApp message sent', {
    conversationId,
    guestId: conversation.guest.id,
    messageId: staffMessage.id,
    twilioSid: twilioMessage.sid
  });

  return {
    message: staffMessage,
    conversation,
    delivery: {
      sent_via_twilio: true,
      twilio_sid: twilioMessage.sid
    }
  };
};
