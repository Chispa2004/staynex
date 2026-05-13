import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';
import { getOrCreateLocalTestHotel } from '../src/services/supabase.service.js';
import {
  findKnowledgeAnswer,
  seedDemoKnowledge
} from '../src/services/knowledge.service.js';

process.env.USE_MOCK_AI = 'true';

validateEnvironment({ exitOnError: true });

const examples = [
  '¿A qué hora es el desayuno?',
  '¿Cuál es la contraseña del wifi?',
  '¿A qué hora es el checkout?',
  '¿Tenéis parking?',
  '¿A qué hora abre la piscina?'
];

const hotel = await getOrCreateLocalTestHotel();
await seedDemoKnowledge(hotel);

for (const message of examples) {
  const answer = await findKnowledgeAnswer(hotel.id, message);

  console.log(JSON.stringify({
    message,
    answer
  }, null, 2));
}
