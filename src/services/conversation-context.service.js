import {
  getOpenTicketsForGuest,
  getRecentMessages
} from './supabase.service.js';
import { logger } from '../utils/logger.js';
import { detectGuestLanguage } from './language.service.js';
import { getLatestReservationForGuest } from './reservation.service.js';
import { getHotelProfileForPrompt } from './hotel.service.js';
import { getGuestMemory } from './guest-memory.service.js';

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
