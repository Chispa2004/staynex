import {
  PILOT_AI_GATE_REASONS,
  getSkippedStaffTranslation,
  shouldAiAutoRespond
} from '../../shared/pilot/ai-safety.js';
import { getConversationContext } from './conversation-context.service.js';
import { logger } from '../utils/logger.js';

export const resolveAiAutoResponseGate = async ({
  hotel = null,
  conversationId = null,
  env = process.env,
  getConversationContextFn = getConversationContext
} = {}) => {
  let conversationState = null;
  let stateLookupFailed = false;
  let stateLookupError = null;

  if (hotel?.id && conversationId) {
    try {
      conversationState = await getConversationContextFn({
        hotelId: hotel.id,
        conversationId,
        throwOnError: true
      });
    } catch (error) {
      stateLookupFailed = true;
      stateLookupError = error;
      logger.warn('ai_auto_response_gate_state_lookup_failed', {
        hotelId: hotel.id,
        conversationId,
        message: error.message
      });
    }
  }

  const gate = shouldAiAutoRespond({
    hotel,
    conversationState,
    stateLookupFailed,
    env
  });

  return {
    ...gate,
    conversationState,
    stateLookupFailed,
    stateLookupError
  };
};

export const buildSuppressedAiResponse = ({
  reason = PILOT_AI_GATE_REASONS.HOTEL_AI_AUTO_REPLY_OFF,
  model = 'pilot-ai-safety-gate'
} = {}) => ({
  intent: reason,
  confidence: 1,
  reply: null,
  create_ticket: false,
  ticket: {
    category: null,
    title: null,
    description: null,
    priority: null
  },
  escalate_to_human: true,
  emergency: false,
  upsell_opportunity: false,
  fallbackUsed: false,
  aiProvider: 'system',
  aiModel: model,
  ai_provider: 'system',
  ai_model: model,
  fallback_used: false,
  silent: true,
  suppressed: true,
  suppressionReason: reason
});

export const buildSkippedTranslationForGate = ({
  guestLanguage = 'es',
  staffTranslationLanguage = 'es',
  reason = null
} = {}) => getSkippedStaffTranslation({
  sourceLanguage: guestLanguage,
  targetLanguage: staffTranslationLanguage,
  reason
});
