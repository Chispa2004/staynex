import { logger } from '../utils/logger.js';

export const logReservationConfirmationEmail = (reservation) => {
  logger.info('Reservation confirmation email mock prepared', {
    to: reservation.guest_email || 'missing-email',
    guestName: reservation.guest_name || 'Guest',
    arrivalDate: reservation.arrival_date,
    departureDate: reservation.departure_date,
    whatsappLink: reservation.whatsapp_link
  });
};
