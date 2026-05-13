import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { processGuestMessage } from '../src/services/staynex.service.js';

process.env.USE_MOCK_AI = 'true';
process.env.REQUIRE_TWILIO = 'false';

validateEnvironment({ exitOnError: true });

const phone = `+34${String(Date.now()).slice(-9)}`;
const messages = [
  'Necesito dos toallas en la habitación 208',
  'Y también una almohada',
  'El aire acondicionado sigue sin funcionar'
];

for (const message of messages) {
  const result = await processGuestMessage({
    message,
    phone,
    sendReply: false,
    channel: 'memory-test'
  });

  console.log(JSON.stringify({
    message,
    phone,
    guestRoom: result.guest.current_room,
    intent: result.ai.intent,
    reply: result.ai.reply,
    createTicket: result.ai.create_ticket,
    ticket: result.ticket
      ? {
        room_number: result.ticket.room_number,
        category: result.ticket.category,
        title: result.ticket.title,
        priority: result.ticket.priority
      }
      : null
  }, null, 2));
}
