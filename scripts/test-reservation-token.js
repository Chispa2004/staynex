import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { createOrUpdateReservation } from '../src/services/reservation.service.js';
import { processGuestMessage } from '../src/services/staynex.service.js';
import { logger } from '../src/utils/logger.js';

validateEnvironment({ exitOnError: true });

const suffix = Date.now().toString().slice(-6);
const phone = `+34677${suffix}`;

try {
  const { reservation } = await createOrUpdateReservation({
    pms_provider: 'mock',
    pms_reservation_id: `TOKEN-${suffix}`,
    guest_name: 'Reservation Token Guest',
    guest_email: `token-${suffix}@example.com`,
    guest_phone: phone,
    arrival_date: '2026-07-15',
    departure_date: '2026-07-20',
    room_type: 'Deluxe',
    rate_plan: 'Breakfast included',
    board_basis: 'breakfast'
  });

  if (!reservation.reservation_access_token) {
    throw new Error('reservation_access_token was not generated. Run supabase/sql/add_reservation_access_tokens.sql first.');
  }

  const result = await processGuestMessage({
    message: reservation.reservation_access_token,
    phone,
    sendReply: false,
    channel: 'reservation-token-test'
  });

  if (result.reservation?.id !== reservation.id) {
    throw new Error('Reservation token did not link the conversation context to the reservation');
  }

  console.log(JSON.stringify({
    ok: true,
    reservation_id: reservation.id,
    reservation_access_token: reservation.reservation_access_token,
    whatsapp_link: reservation.whatsapp_link,
    linked_guest_id: result.guest.id,
    conversation_id: result.conversation.id,
    ai_intent: result.ai.intent,
    ai_reply: result.ai.reply
  }, null, 2));
  process.exit(0);
} catch (error) {
  logger.error('Reservation token test failed', {
    message: error.message
  });
  process.exit(1);
}
