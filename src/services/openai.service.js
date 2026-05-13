import OpenAI from 'openai';
import {
  aiResponseJsonSchema,
  validateAiResponse
} from '../schemas/ai-response.schema.js';
import {
  STAYNEX_SYSTEM_PROMPT,
  buildStaynexUserPrompt
} from '../prompts/staynex.prompt.js';
import { analyzeGuestMessageWithMockAi } from './mock-ai.service.js';

const isMockAiEnabled = () => process.env.USE_MOCK_AI === 'true';

const getOpenAiClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
};

export const analyzeGuestMessage = async ({
  hotel,
  guest,
  message,
  hotelKnowledge,
  conversationContext
}) => {
  if (isMockAiEnabled()) {
    return analyzeGuestMessageWithMockAi({
      hotel,
      guest,
      message,
      hotelKnowledge,
      conversationContext,
      knownRoom: conversationContext?.knownRoom,
      recentMessages: conversationContext?.recentMessages || []
    });
  }

  const openai = getOpenAiClient();

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: STAYNEX_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: buildStaynexUserPrompt({
          hotel,
          guest,
          message,
          hotelKnowledge
        })
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'staynex_ai_response',
        strict: true,
        schema: aiResponseJsonSchema
      }
    }
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  return validateAiResponse(JSON.parse(content));
};
