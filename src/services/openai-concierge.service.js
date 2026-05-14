import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_TIMEOUT_MS = 12000;

const getModel = () => process.env.AI_CONCIERGE_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
const isEnabled = () => process.env.AI_CONCIERGE_ENABLED === 'true' && Boolean(process.env.OPENAI_API_KEY);
const isDebug = () => process.env.AI_CONCIERGE_DEBUG === 'true';

const getTimeoutMs = () => {
  const value = Number(process.env.AI_CONCIERGE_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
};

const getClient = () => new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: getTimeoutMs()
});

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'primary_intent',
    'secondary_intents',
    'sentiment',
    'confidence',
    'should_escalate',
    'escalation_level',
    'revenue_opportunity',
    'offer_type',
    'suggested_response',
    'guest_insights',
    'summary',
    'department_actions',
    'risk_flags',
    'satisfaction_estimate',
    'resolution_estimate',
    'reasoning'
  ],
  properties: {
    primary_intent: { type: ['string', 'null'] },
    secondary_intents: {
      type: 'array',
      items: { type: 'string' }
    },
    sentiment: {
      type: 'string',
      enum: ['positive', 'neutral', 'negative', 'urgent']
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    should_escalate: { type: 'boolean' },
    escalation_level: {
      type: 'string',
      enum: ['ai_handled', 'reception_required', 'manager_required', 'urgent']
    },
    revenue_opportunity: { type: 'boolean' },
    offer_type: { type: ['string', 'null'] },
    suggested_response: { type: 'string' },
    guest_insights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['memory_key', 'memory_value', 'memory_type', 'confidence'],
        properties: {
          memory_key: { type: 'string' },
          memory_value: { type: 'string' },
          memory_type: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    },
    summary: { type: 'string' },
    department_actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['department', 'title', 'priority'],
        properties: {
          department: { type: 'string' },
          title: { type: 'string' },
          priority: { type: 'string' }
        }
      }
    },
    risk_flags: {
      type: 'array',
      items: { type: 'string' }
    },
    satisfaction_estimate: {
      type: 'number',
      minimum: 0,
      maximum: 100
    },
    resolution_estimate: { type: 'boolean' },
    reasoning: { type: 'string' }
  }
};

const compactRows = (rows = [], fields = []) => rows.slice(-8).map((row) => fields.reduce((acc, field) => {
  acc[field] = row?.[field] ?? null;
  return acc;
}, {}));

const buildPromptPayload = ({
  hotel,
  guest,
  message,
  hotelKnowledge = [],
  conversationContext = {},
  conversationState = {},
  heuristic = {}
}) => ({
  hotel: {
    id: hotel?.id,
    name: hotel?.name,
    brand_name: hotel?.brand_name,
    timezone: hotel?.timezone,
    default_language: hotel?.default_language,
    check_in_time: hotel?.check_in_time,
    check_out_time: hotel?.check_out_time,
    description: hotel?.description
  },
  guest: {
    id: guest?.id,
    phone_number: guest?.phone_number,
    current_room: guest?.current_room,
    preferred_language: guest?.preferred_language
  },
  current_message: message,
  language: conversationContext.language || guest?.preferred_language || hotel?.default_language || 'es',
  recent_messages: compactRows(conversationContext.recentMessages || [], ['sender_type', 'content', 'created_at']),
  reservation: conversationContext.reservation || null,
  guest_memory: compactRows(conversationContext.guestMemory || [], ['memory_type', 'memory_key', 'memory_value', 'confidence']),
  open_tickets: compactRows(conversationContext.openTickets || [], ['category', 'priority', 'status', 'title']),
  hotel_knowledge: compactRows(hotelKnowledge, ['key', 'value', 'category', 'title']),
  conversation_state: {
    current_intent: conversationState.currentIntent || conversationState.current_intent || null,
    previous_intent: conversationState.previousIntent || conversationState.previous_intent || null,
    confidence: conversationState.primaryIntent?.confidence || conversationState.intent_confidence || null,
    sentiment: conversationState.sentiment || null,
    escalation_level: conversationState.escalationLevel || conversationState.escalation_level || null,
    suppressed_offer: Boolean(conversationState.suppressedOffer)
  },
  heuristic
});

const systemPrompt = `You are Staynex, a luxury hotel AI concierge intelligence layer.
You improve a deterministic heuristic engine, but you must not invent hotel facts, prices, availability, policies, or PMS data.
Use the provided hotel knowledge and reservation context. Keep WhatsApp replies short, warm, premium, and operationally useful.
If a guest changes topic, follow the latest relevant intent. Do not repeat an old offer.
Escalate complaints, cancellation/payment/legal issues, safety risks, and low-confidence situations.
Return only valid JSON following the schema.`;

const parseResult = (completion) => {
  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error('OpenAI Concierge returned empty content');
  }

  const parsed = JSON.parse(content);

  if (!parsed || typeof parsed !== 'object' || !('primary_intent' in parsed)) {
    throw new Error('OpenAI Concierge returned invalid JSON shape');
  }

  return parsed;
};

export const enhanceConciergeIntelligence = async ({
  hotel,
  guest,
  message,
  hotelKnowledge = [],
  conversationContext = {},
  conversationState = {},
  heuristic = {}
}) => {
  if (!isEnabled()) {
    return {
      ok: false,
      fallback: true,
      reason: process.env.AI_CONCIERGE_ENABLED === 'true' ? 'missing_openai_key' : 'disabled'
    };
  }

  const model = getModel();
  const payload = buildPromptPayload({
    hotel,
    guest,
    message,
    hotelKnowledge,
    conversationContext,
    conversationState,
    heuristic
  });

  try {
    logger.info('openai_concierge_using_openai', {
      model,
      timeoutMs: getTimeoutMs()
    });

    if (isDebug()) {
      logger.info('openai_concierge_payload', payload);
    }

    const completion = await getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload) }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'staynex_concierge_intelligence',
          strict: true,
          schema: responseSchema
        }
      }
    });

    const result = parseResult(completion);

    logger.info('openai_concierge_success', {
      model,
      intent: result.primary_intent,
      confidence: result.confidence,
      escalationLevel: result.escalation_level
    });

    return {
      ok: true,
      provider: 'openai',
      model,
      fallback: false,
      result
    };
  } catch (error) {
    logger.warn('openai_concierge_failed', {
      model,
      message: error.message,
      status: error.status || error.code || null
    });

    return {
      ok: false,
      provider: 'heuristic',
      model,
      fallback: true,
      reason: error.message
    };
  }
};

export const generateConciergeResponse = enhanceConciergeIntelligence;
export const analyzeConversationIntent = enhanceConciergeIntelligence;
export const generateConversationSummary = enhanceConciergeIntelligence;
export const generateGuestInsights = enhanceConciergeIntelligence;
export const detectOperationalRisk = enhanceConciergeIntelligence;
export const detectRevenueOpportunity = enhanceConciergeIntelligence;
