import {
  createGuest,
  findGuestByPhone,
  updateGuestLanguage,
  updateGuestRoom
} from './supabase.service.js';
import { logger } from '../utils/logger.js';
import { detectGuestLanguage } from './language.service.js';

export const extractRoomNumber = (message) => {
  const match = message.match(/\b(?:habitaci[oó]n|hab\.?|room|cuarto|chambre|zimmer)\s*(\d{1,5})\b/i);

  if (match?.[1]) {
    return match[1];
  }

  const standaloneMatch = message.match(/\b\d{3,5}\b/);

  return standaloneMatch?.[0] || null;
};

export const findOrCreateGuest = async ({ hotelId, phoneNumber, message }) => {
  const detectedRoom = extractRoomNumber(message);
  const existingGuest = await findGuestByPhone({ hotelId, phoneNumber });
  const detectedLanguage = detectGuestLanguage(message, existingGuest?.preferred_language || 'es');

  if (!existingGuest) {
    if (detectedRoom) {
      logger.info('room updated from message', {
        hotelId,
        phoneNumber,
        roomNumber: detectedRoom
      });
    }

    logger.info('guest language updated', {
      hotelId,
      phoneNumber,
      language: detectedLanguage
    });

    return createGuest({
      hotelId,
      phoneNumber,
      roomNumber: detectedRoom,
      preferredLanguage: detectedLanguage
    });
  }

  let guest = existingGuest;

  if (detectedLanguage && detectedLanguage !== (guest.preferred_language || 'es')) {
    logger.info('guest language updated', {
      guestId: guest.id,
      previousLanguage: guest.preferred_language || 'es',
      language: detectedLanguage
    });

    guest = await updateGuestLanguage({
      guestId: guest.id,
      preferredLanguage: detectedLanguage
    });
  }

  if (detectedRoom && detectedRoom !== guest.current_room) {
    logger.info('room updated from message', {
      guestId: guest.id,
      previousRoom: guest.current_room,
      roomNumber: detectedRoom
    });

    return updateGuestRoom({
      guestId: guest.id,
      roomNumber: detectedRoom
    });
  }

  if (!detectedRoom && guest.current_room) {
    logger.info('room reused from guest memory', {
      guestId: guest.id,
      roomNumber: guest.current_room
    });
  }

  return guest;
};
