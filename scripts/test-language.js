import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { getOrCreateLocalTestHotel } from '../src/services/supabase.service.js';
import { seedDemoKnowledge } from '../src/services/knowledge.service.js';
import { processGuestMessage } from '../src/services/staynex.service.js';

process.env.USE_MOCK_AI = 'true';
process.env.REQUIRE_TWILIO = 'false';

validateEnvironment({ exitOnError: true });

const hotel = await getOrCreateLocalTestHotel();
await seedDemoKnowledge(hotel);

const examples = [
  {
    language: 'es',
    message: 'Necesito dos toallas en la habitación 208'
  },
  {
    language: 'en',
    message: 'Can you bring two towels to room 208?'
  },
  {
    language: 'fr',
    message: 'J’ai besoin de deux serviettes dans la chambre 208'
  },
  {
    language: 'de',
    message: 'Ich brauche zwei Handtücher in Zimmer 208'
  },
  {
    language: 'en',
    message: 'What is the WiFi password?'
  },
  {
    language: 'fr',
    message: 'Quelle est le mot de passe du WiFi?'
  },
  {
    language: 'de',
    message: 'Wie lautet das WLAN-Passwort?'
  }
];

for (const [index, example] of examples.entries()) {
  const phone = `+34988${String(Date.now()).slice(-5)}${index}`;
  const result = await processGuestMessage({
    hotel,
    message: example.message,
    phone,
    sendReply: false,
    channel: 'language-test'
  });

  console.log(JSON.stringify({
    expectedLanguage: example.language,
    message: example.message,
    detectedLanguage: result.guest.preferred_language,
    intent: result.ai.intent,
    reply: result.ai.reply,
    createTicket: result.ai.create_ticket,
    ticketCategory: result.ticket?.category || null
  }, null, 2));
}
