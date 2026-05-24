import {
  areResponsesSimilar,
  buildClarificationReply,
  buildRepairModeReply,
  chooseSmarterConciergeResponse,
  chooseNaturalConciergeResponse,
  countRecentFallbackResponses,
  detectGuestRepairIntent,
  detectRepeatedResponse,
  isGenericFallbackResponse,
  isSimpleGreetingMessage,
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

const badFallback = 'De acuerdo, lo reviso y te indico el siguiente paso.';
assert(isGenericFallbackResponse(badFallback), 'Generic fallback phrase should be classified');

const blockedRepeatedFallback = chooseSmarterConciergeResponse({
  message: 'hola',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.78,
    reply: badFallback,
    create_ticket: false
  },
  language: 'es',
  conversationState: {
    previousState: {
      last_ai_response: badFallback,
      state_metadata: {}
    }
  },
  humanEscalation: {
    needsHuman: false,
    humanReason: null
  },
  enhancedRisk: {
    hasRisk: false
  },
  recentMessages: []
});

assert(
  blockedRepeatedFallback.aiResponse.reply !== badFallback
  && blockedRepeatedFallback.metadata.fallback_blocked_due_to_repetition
  && blockedRepeatedFallback.metadata.concierge_greeting_returned
  && !blockedRepeatedFallback.metadata.repair_mode_activated,
  'If fallback was used once, a simple greeting must return normal concierge greeting'
);

const excursionsAfterFallback = chooseSmarterConciergeResponse({
  message: 'hola, que excursiones teneis?',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.8,
    reply: badFallback,
    create_ticket: false
  },
  language: 'es',
  conversationState: {
    previousState: {
      last_ai_response: badFallback,
      state_metadata: {}
    }
  },
  humanEscalation: { needsHuman: false, humanReason: null },
  enhancedRisk: { hasRisk: false },
  recentMessages: []
});

assert(
  /excursiones|experiencias|opciones/.test(excursionsAfterFallback.aiResponse.reply)
  && !isGenericFallbackResponse(excursionsAfterFallback.aiResponse.reply),
  'Excursion question after fallback should move to experience help, not repeat fallback'
);

const greetingAfterFallback = chooseSmarterConciergeResponse({
  message: 'hola',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.8,
    reply: badFallback,
    create_ticket: false
  },
  language: 'es',
  conversationState: {
    previousState: {
      last_ai_response: badFallback,
      state_metadata: {}
    }
  },
  humanEscalation: { needsHuman: false, humanReason: null },
  enhancedRisk: { hasRisk: false },
  recentMessages: []
});

assert(
  greetingAfterFallback.aiResponse.reply.includes('Hola')
  && greetingAfterFallback.aiResponse.reply.includes('ayud'),
  'Greeting after fallback should get useful greeting repair'
);

const residualProviderGreeting = chooseSmarterConciergeResponse({
  message: 'hola',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.8,
    reply: 'Vamos paso a paso: dime la excursion, fecha y numero de personas, y preparo de nuevo la solicitud al proveedor.',
    create_ticket: false
  },
  language: 'es',
  conversationState: {
    previousState: {
      last_ai_response: badFallback,
      state_metadata: {
        provider_booking_repair_mode: true,
        fallback_context: { reason: 'old_provider_flow' },
        experience_booking_state: {
          detected_experience: 'Essaouira Coastal Excursion',
          provider: 'Luxotour Morocco',
          awaiting_guest_details: true,
          awaiting_guest_confirmation: true
        }
      }
    }
  },
  humanEscalation: { needsHuman: false, humanReason: null },
  enhancedRisk: { hasRisk: false },
  recentMessages: []
});

assert(
  residualProviderGreeting.metadata.response_strategy === 'greeting'
  && residualProviderGreeting.metadata.concierge_greeting_returned
  && residualProviderGreeting.metadata.residual_provider_state_ignored_for_greeting
  && residualProviderGreeting.metadata.provider_repair_mode_suppressed_for_greeting
  && !residualProviderGreeting.metadata.repair_mode_activated
  && residualProviderGreeting.aiResponse.reply.includes('experiencias')
  && !residualProviderGreeting.aiResponse.reply.includes('excursion, fecha y numero de personas')
  && !residualProviderGreeting.aiResponse.reply.includes('Vamos paso a paso')
  && !residualProviderGreeting.aiResponse.reply.includes('solicitud al proveedor'),
  'Simple greeting must override residual provider booking state'
);

for (const greetingPhrase of ['buenas', 'hello']) {
  const greetingResult = chooseSmarterConciergeResponse({
    message: greetingPhrase,
    aiResponse: {
      intent: 'unknown',
      confidence: 0.8,
      reply: badFallback,
      create_ticket: false
    },
    language: greetingPhrase === 'hello' ? 'en' : 'es',
    conversationState: {
      previousState: {
        last_ai_response: badFallback,
        state_metadata: {
          repair_mode: true,
          experience_booking_state: {
            detected_experience: 'Essaouira Coastal Excursion',
            awaiting_guest_details: true
          }
        }
      }
    },
    humanEscalation: { needsHuman: false, humanReason: null },
    enhancedRisk: { hasRisk: false },
    recentMessages: []
  });
  assert(
    greetingResult.metadata.response_strategy === 'greeting'
    && greetingResult.metadata.concierge_greeting_returned
    && !greetingResult.aiResponse.reply.includes('solicitud al proveedor'),
    `${greetingPhrase} should return a normal concierge greeting`
  );
}

const completedBookingAfterFallback = chooseSmarterConciergeResponse({
  message: 'hola',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.8,
    reply: badFallback,
    create_ticket: false
  },
  language: 'es',
  conversationState: {
    previousState: {
      last_ai_response: badFallback,
      state_metadata: {
        experience_booking_state: {
          status: 'completed',
          detected_experience: 'Essaouira Coastal Excursion',
          provider: 'Luxotour Morocco',
          requested_date: '2026-06-29',
          guest_count: 3,
          provider_request_sent: true,
          provider_email_sent: true,
          provider_flow_active: false,
          closed_at: '2026-06-28T10:00:00.000Z'
        }
      }
    }
  },
  humanEscalation: { needsHuman: false, humanReason: null },
  enhancedRisk: { hasRisk: false },
  recentMessages: []
});

assert(
  completedBookingAfterFallback.metadata.concierge_mode_restored
  && completedBookingAfterFallback.metadata.repair_mode_expired
  && completedBookingAfterFallback.metadata.fallback_state_cleared_after_booking
  && completedBookingAfterFallback.aiResponse.reply.includes('Hola')
  && completedBookingAfterFallback.aiResponse.reply.includes('experiencias')
  && !completedBookingAfterFallback.aiResponse.reply.includes('ya ha sido enviada')
  && !completedBookingAfterFallback.aiResponse.reply.includes('necesito la fecha')
  && !completedBookingAfterFallback.aiResponse.reply.includes('numero de personas'),
  'Completed provider request greeting should restore normal concierge mode'
);

const completedBookingStatusQuestion = chooseSmarterConciergeResponse({
  message: 'como va la excursion?',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.8,
    reply: badFallback,
    create_ticket: false
  },
  language: 'es',
  conversationState: completedBookingAfterFallback.metadata ? {
    previousState: {
      last_ai_response: badFallback,
      state_metadata: {
        experience_booking_state: {
          status: 'completed',
          detected_experience: 'Essaouira Coastal Excursion',
          provider: 'Luxotour Morocco',
          requested_date: '2026-06-29',
          guest_count: 3,
          provider_request_sent: true,
          provider_email_sent: true,
          provider_flow_active: false,
          closed_at: '2026-06-28T10:00:00.000Z'
        }
      }
    }
  } : {},
  humanEscalation: { needsHuman: false, humanReason: null },
  enhancedRisk: { hasRisk: false },
  recentMessages: []
});

assert(
  completedBookingStatusQuestion.metadata.provider_booking_summary_used
  && completedBookingStatusQuestion.aiResponse.reply.includes('Essaouira Coastal Excursion')
  && completedBookingStatusQuestion.aiResponse.reply.includes('Luxotour Morocco')
  && !completedBookingStatusQuestion.aiResponse.reply.includes('lo reviso')
  && !completedBookingStatusQuestion.aiResponse.reply.includes('equipo'),
  'Completed provider request status question should use provider booking summary'
);

const loopResponse = chooseSmarterConciergeResponse({
  message: 'no entiendo',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.8,
    reply: badFallback,
    create_ticket: false
  },
  language: 'es',
  conversationState: {
    previousState: {
      last_ai_response: badFallback,
      state_metadata: {}
    }
  },
  humanEscalation: { needsHuman: false, humanReason: null },
  enhancedRisk: { hasRisk: false },
  recentMessages: [
    { sender_type: 'ai', content: badFallback }
  ]
});

assert(
  loopResponse.metadata.conversation_loop_detected
  && loopResponse.metadata.repair_mode_activated
  && /excursiones|restaurante|late checkout|informacion|recepcion/.test(loopResponse.aiResponse.reply),
  'Two repeated fallbacks should activate repair mode with clear options'
);

assert(
  countRecentFallbackResponses({
    previousResponse: badFallback,
    recentMessages: [{ sender_type: 'ai', content: badFallback }]
  }) === 2,
  'Recent fallback counter should count repeated generic fallbacks'
);

assert(
  detectGuestRepairIntent({ message: 'hola, que excursiones recomendais?' }) === 'experience_fallback',
  'Repair intent should classify excursion questions'
);

assert(
  isSimpleGreetingMessage('hola')
  && isSimpleGreetingMessage('buenas tardes')
  && isSimpleGreetingMessage('hello')
  && !isSimpleGreetingMessage('hola, que excursiones teneis?')
  && !isSimpleGreetingMessage('hola, quiero reservar Agafay'),
  'Simple greeting detector should not swallow explicit guest intents'
);

assert(
  buildRepairModeReply({ language: 'es', message: 'hola', variantIndex: 0 }).repairIntent === 'greeting_fallback',
  'Repair mode should classify simple greetings'
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
    'repeated fallback is blocked',
    'repair mode handles excursion question after fallback',
    'repair mode handles greeting after fallback',
    'simple greeting overrides residual provider state',
    'simple greeting detector preserves explicit intents',
    'completed provider booking restores concierge greeting after fallback',
    'completed provider booking status question uses summary',
    'conversation loop activates repair options',
    'experience ambiguity asks info vs booking',
    'emergency still escalates',
    'copilot detects angry guests and escalation risk',
    'copilot detects VIP and revenue opportunity',
    'ticket copilot suggests maintenance without hallucinated compensation',
    'copilot keeps multilingual suggested replies'
  ]
}, null, 2));
