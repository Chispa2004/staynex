import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { getOrCreateLocalTestHotel } from '../src/services/supabase.service.js';
import { seedDemoKnowledge } from '../src/services/knowledge.service.js';
import { processGuestMessage } from '../src/services/staynex.service.js';
import { detectLanguage, translateForGuest, translateForStaff } from '../src/services/translation.service.js';

process.env.USE_MOCK_AI = 'true';
process.env.REQUIRE_TWILIO = 'false';

validateEnvironment({ exitOnError: true });

const hotel = await getOrCreateLocalTestHotel();
await seedDemoKnowledge(hotel);

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, received ${actual}`);
  }
};

const germanToSpanish = await translateForStaff({
  text: 'Wann beginnt das Fr\u00fchst\u00fcck?',
  guestLanguage: detectLanguage('Wann beginnt das Fr\u00fchst\u00fcck?'),
  staffLanguage: 'es'
});
assertEqual(germanToSpanish.sourceLanguage, 'de', 'German language detection failed');
assertEqual(germanToSpanish.targetLanguage, 'es', 'Staff translation target failed');

const spanishToGerman = await translateForGuest({
  text: 'El desayuno es de 7 a 10',
  staffLanguage: 'es',
  guestLanguage: 'de'
});
assertEqual(spanishToGerman.targetLanguage, 'de', 'Guest translation target failed');

const bulgarianToSpanish = await translateForStaff({
  text: '\u041a\u043e\u0433\u0430 \u0437\u0430\u043f\u043e\u0447\u0432\u0430 \u0437\u0430\u043a\u0443\u0441\u043a\u0430\u0442\u0430?',
  guestLanguage: detectLanguage('\u041a\u043e\u0433\u0430 \u0437\u0430\u043f\u043e\u0447\u0432\u0430 \u0437\u0430\u043a\u0443\u0441\u043a\u0430\u0442\u0430?'),
  staffLanguage: 'es'
});
assertEqual(bulgarianToSpanish.sourceLanguage, 'bg', 'Bulgarian language detection failed');
assertEqual(bulgarianToSpanish.targetLanguage, 'es', 'Bulgarian staff translation target failed');

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
