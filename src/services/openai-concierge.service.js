import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import {
  getAiTimeoutMs,
  isAiCircuitBreakerOpen,
  recordAiFailure,
  recordAiSuccess
} from './scalability-guard.service.js';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_TIMEOUT_MS = 12000;

const getModel = () => process.env.AI_CONCIERGE_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
const isEnabled = () => process.env.AI_CONCIERGE_ENABLED === 'true' && Boolean(process.env.OPENAI_API_KEY);
const isDebug = () => process.env.AI_CONCIERGE_DEBUG === 'true';

const getTimeoutMs = () => {
  const value = Number(process.env.AI_CONCIERGE_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
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

const compactTopRows = (rows = [], fields = []) => rows.slice(0, 8).map((row) => fields.reduce((acc, field) => {
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
  local_knowledge: compactRows(conversationContext.localKnowledge || [], ['title', 'short_description', 'description', 'category', 'tags', 'audience_tags', 'recommendation_contexts', 'weather_tags', 'featured', 'priority']),
  hotel_experiences: compactTopRows(conversationContext.hotelExperiences || [], ['title', 'description', 'category', 'tags', 'target_guest_types', 'price', 'currency', 'partner_name', 'provider_source', 'provider_slug']),
  conversation_state: {
    current_intent: conversationState.currentIntent || conversationState.current_intent || null,
    previous_intent: conversationState.previousIntent || conversationState.previous_intent || null,
    confidence: conversationState.primaryIntent?.confidence || conversationState.intent_confidence || null,
    sentiment: conversationState.sentiment || null,
    escalation_level: conversationState.escalationLevel || conversationState.escalation_level || null,
    suppressed_offer: Boolean(conversationState.suppressedOffer)
  },
  response_guidance: conversationContext.responseGuidance || null,
  contextual_revenue: conversationContext.concierge?.contextualRevenue || null,
  experience_intelligence: conversationContext.concierge?.experienceIntelligence || null,
  provider_experience_conversation: conversationContext.concierge?.providerExperienceConversation || null,
  heuristic
});

const systemPrompt = `You are Staynex, a luxury hotel AI concierge intelligence layer.
You improve a deterministic heuristic engine, but you must not invent hotel facts, prices, availability, policies, or PMS data.
Use the provided hotel knowledge and reservation context. Keep WhatsApp replies short, warm, premium, and operationally useful.
Always respond in the language of current_message as provided in payload.language. Do not switch to English unless the guest wrote in English.
Always answer the guest's current question first. Memory is passive context, not the main topic.
If a guest changes topic, follow the latest relevant intent. Do not repeat an old offer.
Do not mention romantic stays, spa, upgrades, transfers or other offers unless the current message clearly asks for that service or the response_guidance says the offer is not suppressed.
If response_guidance.offer_suppressed is true, do not include that offer in suggested_response even if guest memory contains related signals.
Use contextual_revenue only as a concierge moment: early arrival, late departure, family planning, honeymoon, VIP repeat guest. Suggest softly only if timing.allowed is true.
Use local_knowledge as staff-curated destination intelligence. Prefer it over generic destination knowledge. Never invent places if the hotel has not provided them.
Use experience_intelligence and hotel_experiences as the only allowed experience catalog for this hotel: activities, restaurants, beach clubs, excursions, culture, bad-weather plans or local experiences. Provider experiences in hotel_experiences have priority over normal hotel experiences. Never mention a provider, partner or experience that is not present in hotel_experiences or local_knowledge.
For provider excursions and activities, distinguish clearly between exploration, soft interest, and booking confirmation. Exploratory questions such as "what excursions do you recommend?" or "what activities do you have?" must list relevant options and must not say reception/provider was notified. Soft interest such as "tell me more" or "I am interested in Agafay" should give details only. Only explicit booking language such as "can you book it", "we want to reserve", or "confirm it" may trigger a booking request.
Never sound like a marketplace or travel agency. Avoid phrases such as "buy", "special deal", "limited offer" or "book now".
If the guest asks a simple informational question such as breakfast hours, checkout, WiFi, parking or location, answer only that question.
If sentiment is negative, complaint or urgent, disable revenue language and prioritize empathy, resolution and escalation.
Sound like a real premium hotel concierge: natural, concise, calm, and never salesy.
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
  const circuitContext = {
    hotelId: hotel?.id || null,
    guestId: guest?.id || null,
    model,
    service: 'openai_concierge'
  };

  if (isAiCircuitBreakerOpen(circuitContext)) {
    return {
      ok: false,
      provider: 'heuristic',
      model,
      fallback: true,
      reason: 'ai_circuit_breaker_open'
    };
  }

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
      timeoutMs: getAiTimeoutMs()
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
    recordAiSuccess();

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
    recordAiFailure(error, circuitContext);

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
