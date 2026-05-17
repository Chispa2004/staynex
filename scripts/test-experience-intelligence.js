import assert from 'node:assert/strict';
import {
  detectExperienceOpportunities,
  evaluateExperienceTiming
} from '../src/services/experience-intelligence.service.js';
import {
  buildProviderExperienceRecommendationReply,
  classifyProviderExperienceConversation,
  detectExperienceBookingIntent,
  PROVIDER_EXPERIENCE_INTENTS
} from '../src/services/experience-booking.service.js';

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

const providerCatalog = [
  {
    id: 'provider-agafay',
    provider_experience_id: 'provider-agafay',
    provider_id: 'luxotour',
    provider_source: 'Luxotour Morocco',
    title: 'Excursion al desierto de Agafay',
    slug: 'agafay-desert',
    category: 'adventure',
    short_description: 'Sunset desert experience near Marrakech.',
    price: 95,
    currency: 'EUR',
    duration: 'Half day',
    active: true,
    tags: ['agafay', 'desert', 'marrakech'],
    target_guest_types: ['couples', 'family'],
    metadata: { experience_provider: true }
  },
  {
    id: 'provider-atlas',
    provider_experience_id: 'provider-atlas',
    provider_id: 'luxotour',
    provider_source: 'Luxotour Morocco',
    title: 'Atlas Mountains Day Trip',
    slug: 'atlas-mountains',
    category: 'culture',
    short_description: 'A full-day Atlas Mountains excursion.',
    price: 70,
    currency: 'EUR',
    duration: 'Full day',
    active: true,
    tags: ['atlas', 'mountains', 'marrakech'],
    target_guest_types: ['culture'],
    metadata: { experience_provider: true }
  }
];

const providerInquiry = await classifyProviderExperienceConversation({
  message: 'Que excursiones o actividades teneis?',
  hotelExperiences: providerCatalog
});
assert.equal(providerInquiry.intentType, PROVIDER_EXPERIENCE_INTENTS.INQUIRY);
assert.equal(providerInquiry.bookingReady, false);

const providerReply = buildProviderExperienceRecommendationReply({
  intent: providerInquiry,
  hotelExperiences: providerCatalog,
  language: 'es'
});
assert.equal(providerReply.includes('Luxotour Morocco'), true);
assert.equal(providerReply.includes('Excursion al desierto de Agafay'), true);
assert.equal(providerReply.includes('He avisado'), false);

const providerInterest = await classifyProviderExperienceConversation({
  message: 'Cuentame mas de Agafay',
  hotelExperiences: providerCatalog
});
assert.equal(providerInterest.intentType, PROVIDER_EXPERIENCE_INTENTS.INTEREST);
assert.equal(providerInterest.bookingReady, false);

const prematureBooking = await detectExperienceBookingIntent({
  message: 'Me interesa Agafay',
  hotelExperiences: providerCatalog
});
assert.equal(prematureBooking.detected, false);
assert.equal(prematureBooking.conversationIntent.intentType, PROVIDER_EXPERIENCE_INTENTS.INTEREST);

const realBooking = await detectExperienceBookingIntent({
  message: 'Queremos reservar Agafay para manana',
  hotelExperiences: providerCatalog
});
assert.equal(realBooking.detected, true);
assert.equal(realBooking.conversationIntent.intentType, PROVIDER_EXPERIENCE_INTENTS.BOOKING_INTENT);

console.log(JSON.stringify({
  ok: true,
  cases: [
    'family activities',
    'honeymoon couple',
    'vip private experience',
    'rainy weather future-ready',
    'beach recommendation',
    'complaint blocks experiences',
    'rejected experience block',
    'provider excursion inquiry does not create booking',
    'provider excursion interest stays conversational',
    'provider excursion booking requires explicit action'
  ]
}, null, 2));
