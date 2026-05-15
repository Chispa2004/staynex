import {
  calculateOfferFatigueScore,
  detectContextualRevenueOpportunities,
  evaluateRevenueTiming
} from '../src/services/contextual-revenue.service.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const base = {
  reservation: {
    id: 'reservation-test',
    arrival_date: '2026-07-15',
    departure_date: '2026-07-20',
    room_type: 'Deluxe',
    board_basis: 'breakfast'
  },
  conversationState: {
    suppressedOffer: false,
    sentiment: 'neutral',
    previousState: null
  },
  risk: { hasRisk: false },
  sentiment: 'neutral',
  language: 'en'
};

const earlyArrival = detectContextualRevenueOpportunities({
  ...base,
  message: 'Our flight lands early, can we check in before noon?'
});

assert(
  earlyArrival.primaryOpportunity?.offerType === 'early_checkin',
  'Early arrival should detect early_checkin'
);
assert(
  earlyArrival.primaryOpportunity?.timing.allowed,
  'Early arrival timing should be allowed'
);

const lateDeparture = detectContextualRevenueOpportunities({
  ...base,
  message: 'Our flight is at night, can we leave later tomorrow?'
});

assert(
  lateDeparture.primaryOpportunity?.offerType === 'late_checkout',
  'Late departure should detect late_checkout'
);

const anniversary = detectContextualRevenueOpportunities({
  ...base,
  message: 'We are celebrating our anniversary'
});

assert(
  anniversary.primaryOpportunity?.offerType === 'romantic_package',
  'Anniversary should detect romantic_package'
);

const family = detectContextualRevenueOpportunities({
  ...base,
  message: 'We are traveling with two children'
});

assert(
  family.primaryOpportunity?.offerType === 'family_activities',
  'Family travel should detect family_activities'
);

const vip = detectContextualRevenueOpportunities({
  ...base,
  message: 'Thank you, that sounds good',
  guestMemory: [
    { memory_key: 'repeat_guest', memory_value: 'true' },
    { memory_key: 'accepted_upgrade_before', memory_value: 'true' }
  ]
});

assert(
  vip.primaryOpportunity?.offerType === 'room_upgrade',
  'VIP repeat guest memory should detect room_upgrade'
);

const complaintTiming = evaluateRevenueTiming({
  message: 'The room is noisy and I am upset',
  offerType: 'spa',
  risk: { hasRisk: true },
  sentiment: 'negative'
});

assert(
  !complaintTiming.allowed && complaintTiming.reason === 'operational_resolution_first',
  'Complaints should block contextual revenue timing'
);

const rejectedTiming = evaluateRevenueTiming({
  message: 'Can you help with spa hours?',
  offerType: 'spa',
  guestMemory: [{ memory_key: 'rejected_spa_recently', memory_value: 'true' }],
  risk: { hasRisk: false },
  sentiment: 'neutral'
});

assert(
  !rejectedTiming.allowed && ['offer_fatigue', 'recently_rejected'].includes(rejectedTiming.reason),
  'Rejected upsells should block repeated spa offers'
);

const fatigueScore = calculateOfferFatigueScore({
  message: 'No thanks',
  offerType: 'spa',
  conversationState: {
    suppressedOffer: true,
    previousState: {
      last_offer_type: 'spa'
    }
  },
  guestMemory: [{ memory_key: 'rejected_spa_recently', memory_value: 'true' }]
});

assert(fatigueScore >= 80, 'Offer fatigue should rise with rejection and cooldown');

console.log(JSON.stringify({
  ok: true,
  cases: [
    'early arrival',
    'late departure',
    'anniversary',
    'family travel',
    'vip repeat guest',
    'complaint timing block',
    'rejected upsell block',
    'fatigue score'
  ]
}, null, 2));
