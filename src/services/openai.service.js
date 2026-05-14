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
import { logger } from '../utils/logger.js';

const isMockAiEnabled = () => process.env.USE_MOCK_AI === 'true';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_TIMEOUT_MS = 15000;

const getOpenAiModel = () => process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

const getOpenAiTimeoutMs = () => {
  const timeout = Number(process.env.OPENAI_TIMEOUT_MS || DEFAULT_OPENAI_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_OPENAI_TIMEOUT_MS;
};

const getOpenAiClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: getOpenAiTimeoutMs()
  });
};

const withAiMetadata = (aiResponse, {
  provider,
  model,
  fallbackUsed = false
}) => ({
  ...aiResponse,
  aiProvider: provider,
  aiModel: model,
  fallbackUsed,
  ai_provider: provider,
  ai_model: model,
  fallback_used: fallbackUsed
});

const analyzeWithMockAi = async ({
  hotel,
  guest,
  message,
  hotelKnowledge,
  conversationContext,
  fallbackUsed = false
}) => {
  const aiResponse = await analyzeGuestMessageWithMockAi({
    hotel,
    guest,
    message,
    hotelKnowledge,
    conversationContext,
    knownRoom: conversationContext?.knownRoom,
    recentMessages: conversationContext?.recentMessages || []
  });

  return withAiMetadata(aiResponse, {
    provider: 'mock',
    model: 'mock-ai',
    fallbackUsed
  });
};

const parseOpenAiResponse = (completion) => {
  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  return validateAiResponse(JSON.parse(content));
};

export const analyzeGuestMessage = async ({
  hotel,
  guest,
  message,
  hotelKnowledge,
  conversationContext,
  fallbackAiResponse = null,
  fallbackMetadata = null
}) => {
  if (isMockAiEnabled()) {
    return analyzeWithMockAi({
      hotel,
      guest,
      message,
      hotelKnowledge,
      conversationContext
    });
  }

  const model = getOpenAiModel();

  try {
    logger.info('using_openai', {
      model,
      timeoutMs: getOpenAiTimeoutMs()
    });

    const openai = getOpenAiClient();
    const completion = await openai.chat.completions.create({
      model,
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
            hotelKnowledge,
            conversationContext
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

    const aiResponse = parseOpenAiResponse(completion);

    logger.info('openai_success', {
      model,
      intent: aiResponse.intent,
      confidence: aiResponse.confidence
    });

    return withAiMetadata(aiResponse, {
      provider: 'openai',
      model,
      fallbackUsed: false
    });
  } catch (error) {
    logger.warn('openai_failed', {
      model,
      message: error.message,
      status: error.status || error.code || null
    });

    logger.warn('fallback_to_mock', {
      reason: error.message
    });

    if (fallbackAiResponse) {
      return withAiMetadata(fallbackAiResponse, {
        provider: fallbackMetadata?.provider || 'mock',
        model: fallbackMetadata?.model || 'knowledge-base',
        fallbackUsed: true
      });
    }

    return analyzeWithMockAi({
      hotel,
      guest,
      message,
      hotelKnowledge,
      conversationContext,
      fallbackUsed: true
    });
  }
};
