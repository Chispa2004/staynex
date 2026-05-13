import 'dotenv/config';
import { analyzeGuestMessageWithMockAi } from '../src/services/mock-ai.service.js';

process.env.USE_MOCK_AI = 'true';

const messages = [
  'Necesito dos toallas en la habitación 208',
  'El aire acondicionado no funciona en la habitación 312',
  'Quiero reservar mesa para cenar habitación 410',
  'Necesito un taxi al aeropuerto habitación 501',
  'Estoy muy enfadado, nadie me ayuda',
  'Hay humo en mi habitación 109'
];

for (const message of messages) {
  const result = await analyzeGuestMessageWithMockAi({ message });

  console.log(JSON.stringify({
    message,
    result
  }, null, 2));
}
