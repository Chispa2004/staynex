import {
  areResponsesSimilar,
  buildClarificationReply,
  chooseSmarterConciergeResponse,
  chooseNaturalConciergeResponse,
  detectRepeatedResponse,
  shouldSuppressOfferForNaturalConversation
} from '../src/services/natural-conversation.service.js';
import { detectUpsellOpportunities, UPSELL_TYPES } from '../src/services/upsell.service.js';
import { buildConversationCopilot, buildTicketCopilot } from '../dashboard/lib/ai-copilot.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const romanticMemory = [
  { memory_key: 'anniversary_trip', memory_value: 'true' },
  { memory_key: 'traveling_with_partner', memory_value: 'true' }
];

const breakfastUpsells = detectUpsellOpportunities({
  message: 'What time is breakfast?',
  language: 'en',
  guestMemory: romanticMemory,
  reservation: {
    arrival_date: '2026-07-15',
    departure_date: '2026-07-17',
    board_basis: 'breakfast',
    room_type: 'Deluxe'
  }
});

assert(
  !breakfastUpsells.some((item) => item.upsell_type === UPSELL_TYPES.ROMANTIC_PACKAGE),
  'Romantic memory should not create a romantic upsell for a breakfast question'
);

const romanticSuppression = shouldSuppressOfferForNaturalConversation({
  message: 'What time is breakfast?',
  offerType: UPSELL_TYPES.ROMANTIC_PACKAGE,
  intent: 'romantic_package_interest',
  opportunity: {
    offerType: UPSELL_TYPES.ROMANTIC_PACKAGE,
    triggerSource: 'guest_memory'
  },
  conversationState: { suppressedOffer: false, sentiment: 'neutral' },
  risk: { hasRisk: false },
  sentiment: 'neutral'
});

assert(
  romanticSuppression.suppress && romanticSuppression.reason === 'answer_question_first',
  'Informational questions should suppress unrelated offers'
);

const lateCheckoutSuppression = shouldSuppressOfferForNaturalConversation({
  message: 'Can we leave later tomorrow?',
  offerType: UPSELL_TYPES.LATE_CHECKOUT,
  intent: 'late_checkout_interest',
  opportunity: {
    offerType: UPSELL_TYPES.LATE_CHECKOUT,
    triggerSource: 'current_message'
  },
  conversationState: { suppressedOffer: false, sentiment: 'neutral' },
  risk: { hasRisk: false },
  sentiment: 'neutral'
});

assert(
  !lateCheckoutSuppression.suppress,
  'Explicit late checkout requests should allow a contextual offer'
);

const complaintSuppression = shouldSuppressOfferForNaturalConversation({
  message: 'The room is noisy and I am upset',
  offerType: UPSELL_TYPES.SPA,
  intent: 'spa_interest',
  opportunity: {
    offerType: UPSELL_TYPES.SPA,
    triggerSource: 'guest_memory'
  },
  conversationState: { suppressedOffer: false, sentiment: 'negative' },
  risk: { hasRisk: true },
  sentiment: 'negative'
});

assert(
  complaintSuppression.suppress && complaintSuppression.reason === 'guest_needs_resolution',
  'Complaints should suppress revenue language'
);

const cleanedResponse = chooseNaturalConciergeResponse({
  baseResponse: 'Breakfast is served from 7:00 to 10:30 in the main restaurant.',
  openAiSuggestedResponse: 'Breakfast is served from 7:00 to 10:30. We also offer a romantic package from EUR 150.',
  offerType: UPSELL_TYPES.ROMANTIC_PACKAGE,
  offerAllowed: false,
  risk: { hasRisk: false }
});

assert(
  cleanedResponse === 'Breakfast is served from 7:00 to 10:30 in the main restaurant.',
  'Natural response selector should fall back to direct answer when an offer is suppressed'
);

const ambiguousResponse = chooseSmarterConciergeResponse({
  message: 'eso de manana como va',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.42,
    reply: 'Perfecto, he avisado a recepcion para ponerse en contacto contigo lo antes posible.',
    escalate_to_human: true,
    create_ticket: true
  },
  language: 'es',
  conversationState: {
    previousState: {
      state_metadata: {}
    }
  },
  humanEscalation: {
    needsHuman: false,
    humanReason: 'fallback_response'
  },
  enhancedRisk: {
    hasRisk: false
  },
  recentMessages: []
});

assert(
  ambiguousResponse.metadata.response_strategy === 'clarification'
  && ambiguousResponse.humanEscalation.needsHuman === false
  && ambiguousResponse.aiResponse.intent === 'clarification_needed',
  'Ambiguous low-confidence messages should ask clarification instead of escalating immediately'
);

const repeatedUnclearResponse = chooseSmarterConciergeResponse({
  message: 'no eso',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.4,
    reply: 'I am forwarding this to reception so we can help you properly.',
    escalate_to_human: true,
    create_ticket: true
  },
  language: 'en',
  conversationState: {
    previousState: {
      state_metadata: {
        smart_response: {
          clarification_count: 1
        }
      }
    }
  },
  humanEscalation: {
    needsHuman: false,
    humanReason: 'fallback_response'
  },
  enhancedRisk: {
    hasRisk: false
  },
  recentMessages: []
});

assert(
  repeatedUnclearResponse.metadata.response_strategy === 'escalate_after_repeated_unclear'
  && repeatedUnclearResponse.humanEscalation.needsHuman === true
  && repeatedUnclearResponse.humanEscalation.humanReason === 'repeated_unclear_request',
  'Second unclear message in the same conversation should escalate'
);

const repeatedDetected = detectRepeatedResponse({
  response: 'Disculpa, no estoy seguro de haber entendido bien. Te refieres a una reserva?',
  recentMessages: [
    {
      sender_type: 'ai',
      content: 'Disculpa, no estoy seguro de haber entendido bien. Te refieres a una reserva, una incidencia o informacion del hotel?'
    }
  ]
});

assert(repeatedDetected, 'Similar repeated replies should be detected');

assert(
  !areResponsesSimilar('Breakfast is from 7 to 10.', 'I can help with an Agafay request.'),
  'Different replies should not be treated as repeated'
);

const spanishClarification = buildClarificationReply({
  language: 'es',
  message: 'algo de excursion',
  providerIntent: { intentType: 'excursion_interest' },
  variantIndex: 0
});

assert(
  spanishClarification.includes('experiencia') || spanishClarification.includes('excursion'),
  'Experience ambiguity should ask whether the guest wants information or booking'
);

const emergencyResponse = chooseSmarterConciergeResponse({
  message: 'There is smoke in the corridor',
  aiResponse: {
    intent: 'emergency',
    confidence: 0.96,
    reply: 'We are handling this.',
    escalate_to_human: true,
    create_ticket: true
  },
  language: 'en',
  conversationState: { previousState: null },
  humanEscalation: {
    needsHuman: true,
    humanReason: 'emergency_detected'
  },
  enhancedRisk: {
    hasRisk: true,
    reason: 'emergency_detected'
  },
  recentMessages: []
});

assert(
  emergencyResponse.humanEscalation.needsHuman === true
  && emergencyResponse.metadata.response_strategy === 'human_escalation',
  'Emergencies should still escalate immediately'
);

const angryCopilot = buildConversationCopilot({
  guest: { current_room: '208', phone_number: '+49123', preferred_language: 'en' },
  messages: [
    { sender_type: 'guest', content: 'This is unacceptable, nobody helps and I want to complain.', original_language: 'en' }
  ],
  guestMemory: [],
  offers: [],
  upsells: [],
  experienceBookings: []
});

assert(
  angryCopilot.sentiment.label === 'angry'
  && angryCopilot.priority.level === 'high'
  && angryCopilot.escalationRisk.level === 'high',
  'AI Copilot should detect angry guest sentiment and high escalation risk'
);

const vipCopilot = buildConversationCopilot({
  guest: { current_room: 'Suite 501', preferred_language: 'es' },
  messages: [
    { sender_type: 'guest', content: 'Nos interesa el spa privado.', original_language: 'es' }
  ],
  guestMemory: [
    { memory_key: 'vip_guest', memory_value: 'true' },
    { memory_key: 'high_spender', memory_value: 'spa and suites' }
  ],
  offers: [{ offer_type: 'spa', suggested_price: 180, currency: 'EUR', confidence: 0.86 }],
  upsells: [],
  experienceBookings: []
});

assert(
  vipCopilot.vip.probability >= 0.7
  && vipCopilot.revenueOpportunity.source === 'ai_offer'
  && vipCopilot.suggestedReply.language === 'es',
  'AI Copilot should detect VIP/revenue context and keep guest language'
);

const maintenanceCopilot = buildTicketCopilot({
  id: 'ticket-maintenance',
  category: 'maintenance',
  priority: 'high',
  title: 'AC not working',
  description: 'The guest says the air conditioning is broken.'
});

assert(
  maintenanceCopilot.suggestedDepartment === 'Maintenance'
  && maintenanceCopilot.aiPriority.level === 'high'
  && !/free|compensation|refund/i.test(maintenanceCopilot.suggestedResolution),
  'Ticket Copilot should prioritize maintenance without inventing compensation or policy promises'
);

const multilingualCopilot = buildConversationCopilot({
  guest: { preferred_language: 'fr' },
  messages: [
    { sender_type: 'guest', content: 'Bonjour, je voudrais reserver une excursion.', original_language: 'fr' }
  ],
  offers: [],
  upsells: [{ id: 'upsell-1', upsell_type: 'experience', confidence: 0.76 }],
  experienceBookings: []
});

assert(
  multilingualCopilot.suggestedReply.language === 'fr'
  && multilingualCopilot.summary.bullets.some((item) => item.includes('Latest guest message')),
  'AI Copilot should generate multilingual suggested replies and summaries'
);

console.log(JSON.stringify({
  ok: true,
  cases: [
    'romantic memory does not hijack breakfast',
    'late checkout remains contextual',
    'complaint disables revenue',
    'offer language is stripped when suppressed',
    'ambiguous low confidence asks clarification',
    'second unclear request escalates',
    'repeated response is detected',
    'experience ambiguity asks info vs booking',
    'emergency still escalates',
    'copilot detects angry guests and escalation risk',
    'copilot detects VIP and revenue opportunity',
    'ticket copilot suggests maintenance without hallucinated compensation',
    'copilot keeps multilingual suggested replies'
  ]
}, null, 2));
