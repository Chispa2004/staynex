import 'dotenv/config';
import { analyzeGuestMessage } from '../src/services/openai.service.js';
import { validateAiResponse } from '../src/schemas/ai-response.schema.js';
import { logger } from '../src/utils/logger.js';

const basePayload = {
  hotel: {
    name: 'Staynex Demo Hotel',
    whatsapp_number: 'local-test'
  },
  guest: {
    phone_number: '+34600000000',
    current_room: '208',
    preferred_language: 'es'
  },
  message: 'Necesito dos toallas en la habitacion 208',
  hotelKnowledge: [
    { key: 'desayuno', value: 'El desayuno es de 07:30 a 10:30.' }
  ],
  conversationContext: {
    knownRoom: '208',
    language: 'es',
    recentMessages: [],
    openTickets: [],
    reservation: {
      guest_name: 'Laura Garcia',
      arrival_date: '2026-07-15',
      departure_date: '2026-07-20',
      room_type: 'Deluxe',
      rate_plan: 'Breakfast included',
      board_basis: 'breakfast',
      reservation_status: 'confirmed'
    }
  }
};

const assertCompatibleResponse = (response) => {
  validateAiResponse({
    intent: response.intent,
    confidence: response.confidence,
    reply: response.reply,
    create_ticket: response.create_ticket,
    ticket: response.ticket,
    escalate_to_human: response.escalate_to_human,
    emergency: response.emergency,
    upsell_opportunity: response.upsell_opportunity
  });
};

try {
  process.env.USE_MOCK_AI = 'true';
  const mockResult = await analyzeGuestMessage(basePayload);
  assertCompatibleResponse(mockResult);

  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.USE_MOCK_AI = 'false';
  process.env.OPENAI_API_KEY = '';
  const fallbackResult = await analyzeGuestMessage(basePayload);
  assertCompatibleResponse(fallbackResult);

  const output = {
    mock: {
      provider: mockResult.ai_provider,
      model: mockResult.ai_model,
      fallback_used: mockResult.fallback_used,
      intent: mockResult.intent
    },
    fallback: {
      provider: fallbackResult.ai_provider,
      model: fallbackResult.ai_model,
      fallback_used: fallbackResult.fallback_used,
      intent: fallbackResult.intent
    }
  };

  if (originalApiKey && process.argv.includes('--real')) {
    process.env.OPENAI_API_KEY = originalApiKey;
    const openAiResult = await analyzeGuestMessage(basePayload);
    assertCompatibleResponse(openAiResult);
    output.openai = {
      provider: openAiResult.ai_provider,
      model: openAiResult.ai_model,
      fallback_used: openAiResult.fallback_used,
      intent: openAiResult.intent
    };
  }

  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
} catch (error) {
  logger.error('OpenAI service test failed', {
    message: error.message
  });
  process.exit(1);
}
