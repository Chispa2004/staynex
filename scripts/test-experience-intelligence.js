import assert from 'node:assert/strict';
import {
  detectExperienceOpportunities,
  evaluateExperienceTiming
} from '../src/services/experience-intelligence.service.js';

const base = {
  hotel: {
    id: 'hotel-1',
    name: 'Hotel Riu Mallorca',
    description: 'Beach hotel in Mallorca close to Palma, calas and catamaran tours.'
  },
  hotelKnowledge: [
    { key: 'destination', value: 'Mallorca offers boat trips, Palma old town and local gastronomy.' }
  ],
  reservation: {
    id: 'reservation-1',
    arrival_date: '2026-07-15',
    departure_date: '2026-07-20'
  },
  guestMemory: [],
  conversationState: {},
  risk: { hasRisk: false },
  sentiment: 'neutral',
  language: 'en'
};

const family = detectExperienceOpportunities({
  ...base,
  message: 'What activities do you recommend with children?'
});
assert.equal(family.opportunities.some((item) => item.offerType === 'family_activities'), true);
assert.equal(family.primaryOpportunity.timing.allowed, true);

const honeymoon = detectExperienceOpportunities({
  ...base,
  message: 'We are on our honeymoon and would love a nice sunset plan'
});
assert.equal(honeymoon.opportunities.some((item) => ['romantic_dinner', 'boat_tour'].includes(item.offerType)), true);

const vip = detectExperienceOpportunities({
  ...base,
  guestMemory: [
    { memory_key: 'high_spender' },
    { memory_key: 'repeat_guest' }
  ],
  message: 'We would like something private and premium'
});
assert.equal(vip.opportunities.some((item) => ['yacht_experience', 'premium_dining'].includes(item.offerType)), true);

const rainy = detectExperienceOpportunities({
  ...base,
  message: 'It looks rainy tomorrow. Any indoor plans?'
});
assert.equal(rainy.opportunities.some((item) => item.offerType === 'indoor_spa'), true);

const beach = detectExperienceOpportunities({
  ...base,
  message: 'Can you recommend beaches or a catamaran?'
});
assert.equal(beach.opportunities.some((item) => item.offerType === 'boat_tour'), true);

const complaint = detectExperienceOpportunities({
  ...base,
  message: 'The room is noisy and I am upset',
  risk: { hasRisk: true },
  sentiment: 'negative'
});
assert.equal(complaint.primaryOpportunity?.timing.allowed, false);

const rejected = evaluateExperienceTiming({
  message: 'Any beach clubs?',
  offerType: 'beach_club',
  guestMemory: [{ memory_key: 'beach_club_declined' }],
  risk: { hasRisk: false },
  sentiment: 'neutral'
});
assert.equal(rejected.allowed, false);

console.log(JSON.stringify({
  ok: true,
  cases: [
    'family activities',
    'honeymoon couple',
    'vip private experience',
    'rainy weather future-ready',
    'beach recommendation',
    'complaint blocks experiences',
    'rejected experience block'
  ]
}, null, 2));
