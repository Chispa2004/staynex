import assert from 'node:assert/strict';
import {
  detectExperienceOpportunities,
  evaluateExperienceTiming
} from '../src/services/experience-intelligence.service.js';
import {
  buildProviderExperienceRecommendationReply,
  buildLastProviderExperienceState,
  classifyProviderExperienceConversation,
  detectExperienceBookingIntent,
  isProviderBookingConfirmation,
  resolveCurrentProviderExperienceForBooking,
  calculatePartnerRevenue,
  PROVIDER_EXPERIENCE_INTENTS
} from '../src/services/experience-booking.service.js';
import { buildStrictHotelExperienceCatalog } from '../src/services/experience-catalog-isolation.service.js';

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
    id: 'provider-agafay-dinner',
    hotel_id: 'hotel-morocco',
    provider_assignment_hotel_id: 'hotel-morocco',
    provider_experience_id: 'provider-agafay-dinner',
    provider_id: 'luxotour',
    provider_source: 'Luxotour Morocco',
    title: 'Agafay Desert Dinner',
    slug: 'agafay-desert-dinner',
    category: 'romantic',
    short_description: 'Dinner experience in the Agafay desert.',
    price: 110,
    currency: 'EUR',
    duration: 'Evening',
    active: true,
    tags: ['agafay', 'desert dinner', 'marrakech'],
    target_guest_types: ['couples', 'romantic'],
    revenue_owner: 'staynex',
    revenue_type: 'partner_marketplace',
    platform_commission_percent: 12,
    hotel_visible_revenue: false,
    metadata: { experience_provider: true }
  },
  {
    id: 'provider-agafay',
    hotel_id: 'hotel-morocco',
    provider_assignment_hotel_id: 'hotel-morocco',
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
    hotel_id: 'hotel-morocco',
    provider_assignment_hotel_id: 'hotel-morocco',
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
  },
  {
    id: 'provider-hammam',
    hotel_id: 'hotel-morocco',
    provider_assignment_hotel_id: 'hotel-morocco',
    provider_experience_id: 'provider-hammam',
    provider_id: 'luxotour',
    provider_source: 'Luxotour Morocco',
    title: 'Marrakech Hammam Experience',
    slug: 'marrakech-hammam',
    category: 'wellness',
    short_description: 'Traditional hammam and spa experience in Marrakech.',
    price: 45,
    currency: 'EUR',
    duration: '2 hours',
    active: true,
    tags: ['hammam', 'spa', 'marrakech'],
    target_guest_types: ['couples', 'wellness'],
    metadata: { experience_provider: true }
  },
  {
    id: 'provider-quad',
    hotel_id: 'hotel-morocco',
    provider_assignment_hotel_id: 'hotel-morocco',
    provider_experience_id: 'provider-quad',
    provider_id: 'luxotour',
    provider_source: 'Luxotour Morocco',
    title: 'Marrakech Quad Adventure',
    slug: 'marrakech-quad-adventure',
    category: 'adventure',
    short_description: 'Quad experience around Marrakech landscapes.',
    price: 80,
    currency: 'EUR',
    duration: 'Half day',
    active: true,
    tags: ['quad', 'adventure', 'marrakech'],
    target_guest_types: ['adventure'],
    metadata: { experience_provider: true }
  }
];
const strictMoroccoCatalog = buildStrictHotelExperienceCatalog({
  hotel: {
    id: 'hotel-morocco',
    name: 'Hotel Marruecos',
    slug: 'hotel-marruecos'
  },
  providerExperiences: providerCatalog,
  hotelExperiences: [
    {
      id: 'mallorca-demo-leak',
      hotel_id: 'hotel-morocco',
      title: 'Catamaran Sunset',
      partner_name: 'Mallorca Sea Concierge',
      active: true,
      metadata: {
        demo_seed: true,
        tenant_demo: 'Riu Mallorca'
      }
    }
  ]
});
assert.equal(strictMoroccoCatalog.providerExperiences.length, 5);
assert.equal(strictMoroccoCatalog.hotelExperiences.length, 0);
assert.equal(strictMoroccoCatalog.blockedCrossTenantExperiences, true);
assert.equal(strictMoroccoCatalog.providerNames.includes('Luxotour Morocco'), true);

const duplicateProviderCatalog = [
  ...providerCatalog,
  {
    ...providerCatalog[0],
    id: 'duplicate-agafay-hotel-experience',
    provider_experience_id: null,
    provider_source: null,
    metadata: {}
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
assert.equal((providerReply.match(/Excursion al desierto de Agafay/g) || []).length, 1);

const providerReplyDeduped = buildProviderExperienceRecommendationReply({
  intent: providerInquiry,
  hotelExperiences: duplicateProviderCatalog,
  language: 'es'
});
assert.equal((providerReplyDeduped.match(/Excursion al desierto de Agafay/g) || []).length, 1);

const providerReplyEnglish = buildProviderExperienceRecommendationReply({
  intent: await classifyProviderExperienceConversation({
    message: 'What tours do you recommend?',
    hotelExperiences: providerCatalog
  }),
  hotelExperiences: providerCatalog,
  language: 'en'
});
assert.equal(providerReplyEnglish.startsWith('Of course.'), true);

const providerReplyFrench = buildProviderExperienceRecommendationReply({
  intent: await classifyProviderExperienceConversation({
    message: 'Quelles excursions recommandez-vous ?',
    hotelExperiences: providerCatalog
  }),
  hotelExperiences: providerCatalog,
  language: 'fr'
});
assert.equal(providerReplyFrench.startsWith('Bien sur.'), true);

const emptyReply = buildProviderExperienceRecommendationReply({
  intent: providerInquiry,
  hotelExperiences: [],
  language: 'es'
});
assert.equal(emptyReply.includes('no tengo experiencias configuradas'), true);

const providerInterest = await classifyProviderExperienceConversation({
  message: 'Cuentame mas de Agafay',
  hotelExperiences: providerCatalog
});
assert.equal(providerInterest.intentType, PROVIDER_EXPERIENCE_INTENTS.INTEREST);
assert.equal(providerInterest.bookingReady, false);

const exactAgafayInterest = await classifyProviderExperienceConversation({
  message: 'Me interesa Agafay Desert Dinner',
  hotelExperiences: providerCatalog,
  latestProviderContext: {
    provider_experience_id: 'provider-quad',
    provider_id: 'luxotour',
    provider_name: 'Luxotour Morocco',
    title: 'Marrakech Quad Adventure'
  }
});
assert.equal(exactAgafayInterest.intentType, PROVIDER_EXPERIENCE_INTENTS.INTEREST);
assert.equal(exactAgafayInterest.matchedExperience.title, 'Agafay Desert Dinner');
const lastAgafay = buildLastProviderExperienceState({
  providerExperience: exactAgafayInterest.matchedExperience,
  reason: 'explicit_guest_detail_request',
  message: 'Me interesa Agafay Desert Dinner',
  callsite: 'test'
});
assert.equal(lastAgafay.last_provider_experience_title, 'Agafay Desert Dinner');
assert.equal(lastAgafay.last_provider_experience_id, 'provider-agafay-dinner');

const exactQuadInterest = await classifyProviderExperienceConversation({
  message: 'Me interesa Marrakech Quad Adventure',
  hotelExperiences: providerCatalog,
  latestProviderContext: {
    provider_experience_id: 'provider-agafay-dinner',
    provider_id: 'luxotour',
    provider_name: 'Luxotour Morocco',
    title: 'Agafay Desert Dinner'
  }
});
assert.equal(exactQuadInterest.intentType, PROVIDER_EXPERIENCE_INTENTS.INTEREST);
assert.equal(exactQuadInterest.matchedExperience.title, 'Marrakech Quad Adventure');
const lastQuad = buildLastProviderExperienceState({
  providerExperience: exactQuadInterest.matchedExperience,
  reason: 'explicit_guest_detail_request',
  message: 'Me interesa Marrakech Quad Adventure',
  callsite: 'test'
});
assert.equal(lastQuad.last_provider_experience_title, 'Marrakech Quad Adventure');

const hammamInterest = await classifyProviderExperienceConversation({
  message: 'Me interesa Hammam',
  hotelExperiences: providerCatalog
});
assert.equal(hammamInterest.matchedExperience.title, 'Marrakech Hammam Experience');

const recommendationListWrite = buildLastProviderExperienceState({
  providerExperience: providerCatalog[0],
  reason: 'recommendation_list',
  message: 'Que excursiones recomendais?',
  callsite: 'test'
});
assert.equal(recommendationListWrite, null);

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
assert.equal(realBooking.matchedExperience.title, 'Agafay Desert Dinner');

const directProviderBooking = await detectExperienceBookingIntent({
  message: 'Quiero reservar Atlas Mountains para manana para 2 personas',
  hotelExperiences: providerCatalog
});
assert.equal(directProviderBooking.detected, true);
assert.equal(directProviderBooking.conversationIntent.bookingReady, true);
assert.equal(directProviderBooking.guestsCount, 2);
assert.equal(directProviderBooking.matchedExperience.title, 'Atlas Mountains Day Trip');

const missingExperienceBooking = await classifyProviderExperienceConversation({
  message: 'Quiero reservar',
  hotelExperiences: providerCatalog
});
assert.equal(missingExperienceBooking.intentType, PROVIDER_EXPERIENCE_INTENTS.BOOKING_INTENT);
assert.equal(missingExperienceBooking.bookingReady, false);
assert.equal(missingExperienceBooking.reason, 'booking_missing_experience');

const missingExperienceReply = buildProviderExperienceRecommendationReply({
  intent: missingExperienceBooking,
  hotelExperiences: providerCatalog,
  language: 'es'
});
assert.equal(missingExperienceReply.includes('experiencia quieres reservar'), true);

assert.equal(isProviderBookingConfirmation('Vale, envia la solicitud'), true);
assert.equal(isProviderBookingConfirmation('adelante'), true);
assert.equal(isProviderBookingConfirmation('send request'), true);

const hammamContext = {
  provider_experience_id: 'provider-hammam',
  provider_id: 'luxotour',
  provider_name: 'Luxotour Morocco',
  title: 'Marrakech Hammam Experience'
};
const contextBooking = await detectExperienceBookingIntent({
  message: 'Vale, envia la solicitud',
  hotelExperiences: providerCatalog,
  latestProviderContext: {
    provider_experience_id: 'provider-agafay-dinner',
    provider_id: 'luxotour',
    provider_name: 'Luxotour Morocco',
    title: 'Agafay Desert Dinner'
  }
});
assert.equal(contextBooking.detected, true);
assert.equal(['provider_booking_confirmation_override', 'explicit_booking_action', 'confirmed_recent_experience_offer'].includes(contextBooking.reason), true);
assert.equal(contextBooking.matchedExperience.title, 'Agafay Desert Dinner');

const hammamContextBooking = await detectExperienceBookingIntent({
  message: 'Vale, envia la solicitud',
  hotelExperiences: providerCatalog,
  latestProviderContext: hammamContext
});
assert.equal(hammamContextBooking.detected, true);
assert.equal(hammamContextBooking.matchedExperience.title, 'Marrakech Hammam Experience');

const quadContextBooking = await detectExperienceBookingIntent({
  message: 'adelante',
  hotelExperiences: providerCatalog,
  latestProviderContext: {
    provider_experience_id: 'provider-quad',
    provider_id: 'luxotour',
    provider_name: 'Luxotour Morocco',
    title: 'Marrakech Quad Adventure'
  }
});
assert.equal(quadContextBooking.detected, true);
assert.equal(quadContextBooking.matchedExperience.title, 'Marrakech Quad Adventure');

const confirmationWithoutContext = await detectExperienceBookingIntent({
  message: 'envia la solicitud',
  hotelExperiences: providerCatalog
});
assert.equal(confirmationWithoutContext.detected, false);
assert.equal(confirmationWithoutContext.conversationIntent.reason, 'booking_missing_experience');

const recentAgafayBeatsQuad = resolveCurrentProviderExperienceForBooking({
  message: 'Vale, envia la solicitud',
  recentMessages: [
    { sender_type: 'guest', content: 'Me interesa Quad' },
    { sender_type: 'guest', content: 'Me interesa Agafay Desert Dinner' }
  ],
  providerExperiences: providerCatalog,
  lastProviderExperience: {
    provider_experience_id: 'provider-quad',
    title: 'Marrakech Quad Adventure'
  }
});
assert.equal(recentAgafayBeatsQuad.resolvedExperience.title, 'Agafay Desert Dinner');
assert.equal(recentAgafayBeatsQuad.resolvedSource, 'recent_guest_message');

const recentAgafayBookingBeatsLastQuad = await detectExperienceBookingIntent({
  message: 'envia la solicitud',
  recentMessages: [
    { sender_type: 'guest', content: 'Me interesa Agafay' }
  ],
  hotelExperiences: providerCatalog,
  latestProviderContext: {
    provider_experience_id: 'provider-quad',
    title: 'Marrakech Quad Adventure'
  }
});
assert.equal(recentAgafayBookingBeatsLastQuad.detected, true);
assert.equal(recentAgafayBookingBeatsLastQuad.matchedExperience.title, 'Agafay Desert Dinner');
assert.equal(recentAgafayBookingBeatsLastQuad.experienceResolution.resolvedSource, 'recent_guest_message');

const directAgafayBooking = await detectExperienceBookingIntent({
  message: 'Quiero reservar Agafay Desert Dinner',
  recentMessages: [
    { sender_type: 'guest', content: 'Me interesa Quad' }
  ],
  hotelExperiences: providerCatalog,
  latestProviderContext: {
    provider_experience_id: 'provider-quad',
    title: 'Marrakech Quad Adventure'
  }
});
assert.equal(directAgafayBooking.detected, true);
assert.equal(directAgafayBooking.matchedExperience.title, 'Agafay Desert Dinner');
assert.equal(directAgafayBooking.experienceResolution.resolvedSource, 'current_message');

const noRecentUsesLastQuad = resolveCurrentProviderExperienceForBooking({
  message: 'envia la solicitud',
  recentMessages: [],
  providerExperiences: providerCatalog,
  lastProviderExperience: {
    provider_experience_id: 'provider-quad',
    title: 'Marrakech Quad Adventure'
  }
});
assert.equal(noRecentUsesLastQuad.resolvedExperience.title, 'Marrakech Quad Adventure');
assert.equal(noRecentUsesLastQuad.resolvedSource, 'last_provider_experience');

const dessertTypo = resolveCurrentProviderExperienceForBooking({
  message: 'Me interesa dessert dinner',
  recentMessages: [],
  providerExperiences: providerCatalog,
  lastProviderExperience: {
    provider_experience_id: 'provider-quad',
    title: 'Marrakech Quad Adventure'
  }
});
assert.equal(dessertTypo.resolvedExperience.title, 'Agafay Desert Dinner');

const luxotourRevenue = calculatePartnerRevenue({
  experience: providerCatalog[0],
  estimatedRevenue: 110,
  commissionEstimate: 13,
  providerId: 'luxotour',
  source: 'ai_concierge'
});
assert.equal(luxotourRevenue.revenueOwner, 'staynex');
assert.equal(luxotourRevenue.revenueType, 'partner_marketplace');
assert.equal(luxotourRevenue.hotelVisibleRevenue, false);
assert.equal(luxotourRevenue.platformCommissionAmount, 13);
assert.equal(luxotourRevenue.hotelRevenueAmount, 0);

const hotelServiceRevenue = calculatePartnerRevenue({
  experience: {
    id: 'hotel-spa',
    title: 'Hotel Spa',
    price: 80,
    commission_percentage: 0
  },
  estimatedRevenue: 80,
  commissionEstimate: 0
});
assert.equal(hotelServiceRevenue.revenueOwner, 'hotel');
assert.equal(hotelServiceRevenue.revenueType, 'hotel_service');
assert.equal(hotelServiceRevenue.hotelVisibleRevenue, true);
assert.equal(hotelServiceRevenue.hotelRevenueAmount, 80);

const sharedRevenue = calculatePartnerRevenue({
  experience: {
    provider_id: 'transfer-partner',
    title: 'Shared Transfer',
    revenue_owner: 'shared',
    revenue_type: 'external_provider',
    platform_commission_percent: 10,
    hotel_commission_percent: 5
  },
  estimatedRevenue: 100,
  providerId: 'transfer-partner'
});
assert.equal(sharedRevenue.revenueOwner, 'shared');
assert.equal(sharedRevenue.platformCommissionAmount, 10);
assert.equal(sharedRevenue.hotelCommissionAmount, 5);
assert.equal(sharedRevenue.hotelRevenueAmount, 5);

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
    'provider excursion booking requires explicit action',
    'exact provider experience mention overrides previous last context',
    'last provider experience persists only on explicit experience interest',
    'generic recommendation list does not overwrite last provider experience',
    'direct provider booking creates booking-ready intent',
    'booking without exact experience asks follow-up',
    'provider confirmation override creates booking-ready intent from last context',
    'provider confirmation without context stays blocked',
    'recent explicit Agafay beats stale Quad context',
    'current explicit experience beats stale context',
    'last provider experience is fallback when no recent explicit mention exists',
    'dessert dinner typo resolves to Agafay Desert Dinner',
    'provider replies follow guest language',
    'provider recommendations are deduplicated',
    'empty hotel experience catalog does not invent fallback',
    'strict hotel catalog blocks demo cross-tenant experiences',
    'partner marketplace revenue belongs to Staynex',
    'hotel service revenue remains hotel owned',
    'shared revenue exposes only hotel share'
  ]
}, null, 2));
