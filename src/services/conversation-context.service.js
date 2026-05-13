import {
  getOpenTicketsForGuest,
  getRecentMessages
} from './supabase.service.js';
import { logger } from '../utils/logger.js';
import { detectGuestLanguage } from './language.service.js';

export const buildConversationContext = async ({
  guest,
  conversation,
  message
}) => {
  const [recentMessages, openTickets] = await Promise.all([
    getRecentMessages({
      conversationId: conversation.id,
      limit: 8
    }),
    getOpenTicketsForGuest({
      guestId: guest.id,
      limit: 5
    })
  ]);

  const language = detectGuestLanguage(message, guest.preferred_language || 'es');

  logger.info('language detected', {
    guestId: guest.id,
    language
  });

  const context = {
    knownRoom: guest.current_room || null,
    recentMessages,
    openTickets,
    language
  };

  logger.info('context loaded', {
    guestId: guest.id,
    conversationId: conversation.id,
    knownRoom: context.knownRoom,
    recentMessages: recentMessages.length,
    openTickets: openTickets.length,
    language: context.language
  });

  return context;
};
