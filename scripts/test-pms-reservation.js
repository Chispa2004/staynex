import 'dotenv/config';
import { scheduleReservationAutomations } from '../src/services/automation.service.js';
import { logReservationConfirmationEmail } from '../src/services/email-mock.service.js';
import { createOrUpdateReservation } from '../src/services/reservation.service.js';
import { validateEnvironment } from '../src/config/env.js';
import { logger } from '../src/utils/logger.js';

validateEnvironment({ exitOnError: true });

const payload = {
  pms_provider: 'mock',
  pms_reservation_id: process.argv[2] || 'RES-1001',
  guest_name: 'Laura Garcia',
  guest_email: 'laura@example.com',
  guest_phone: '+34600000000',
  arrival_date: '2026-07-15',
  departure_date: '2026-07-20',
  room_type: 'Deluxe',
  rate_plan: 'Breakfast included',
  board_basis: 'breakfast'
};

try {
  const { reservation } = await createOrUpdateReservation(payload);
  const automationEvents = await scheduleReservationAutomations(reservation);

  logReservationConfirmationEmail(reservation);

  console.log(JSON.stringify({
    ok: true,
    reservation,
    automation_events: automationEvents
  }, null, 2));
  process.exit(0);
} catch (error) {
  logger.error('Local PMS reservation test failed', {
    message: error.message
  });
  process.exit(1);
}
