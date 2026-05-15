import {
  chooseNaturalConciergeResponse,
  shouldSuppressOfferForNaturalConversation
} from '../src/services/natural-conversation.service.js';
import { detectUpsellOpportunities, UPSELL_TYPES } from '../src/services/upsell.service.js';

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

console.log(JSON.stringify({
  ok: true,
  cases: [
    'romantic memory does not hijack breakfast',
    'late checkout remains contextual',
    'complaint disables revenue',
    'offer language is stripped when suppressed'
  ]
}, null, 2));
