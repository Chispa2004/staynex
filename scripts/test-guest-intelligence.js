import assert from 'node:assert/strict';
import {
  buildGuestIntelligenceProfile,
  calculateAffinities,
  calculateReviewRisk,
  calculateRevenuePotential,
  calculateVipScore,
  detectBehaviorSignals,
  detectGuestType
} from '../src/services/guest-intelligence.service.js';
import {
  calculateUpsellProbability,
  generateAutomationSuggestions,
  generateUpsellRecommendations,
  predictLikelyConversions
} from '../src/services/revenue-ai.service.js';

const baseInput = {
  hotelId: 'hotel-1',
  guestId: 'guest-1',
  reservationId: 'reservation-1',
  recentMessages: [],
  guestMemory: [],
  tickets: [],
  aiLogs: [],
  bookings: [],
  language: 'es',
  pmsIntelligenceContext: {
    stayPhase: 'in_house',
    upgradeEligible: true,
    lateCheckoutEligible: false,
    transferLikely: false,
    experienceLikely: true,
    vipScore: 30,
    revenuePotential: 120
  }
};

const run = () => {
  const cases = [];

  const wellness = buildGuestIntelligenceProfile({
    ...baseInput,
    message: 'Me interesa el hammam y un masaje relajante'
  });
  assert.equal(wellness.profileType, 'wellness_traveler');
  assert.ok(wellness.affinities.spa_affinity >= 65);
  cases.push('wellness traveler detected');

  const family = buildGuestIntelligenceProfile({
    ...baseInput,
    message: 'Viajamos con dos ninos y buscamos actividades familiares'
  });
  assert.equal(family.profileType, 'family_guest');
  assert.ok(family.affinities.family_affinity >= 65);
  cases.push('family guest detected');

  const vipSignals = detectBehaviorSignals({
    message: 'Queremos una suite premium privada con champagne'
  });
  const vipScore = calculateVipScore({
    signals: vipSignals,
    pmsIntelligenceContext: { vipScore: 45 },
    bookings: [{ estimated_revenue: 350 }],
    revenue: 350
  });
  assert.ok(vipScore >= 75);
  cases.push('VIP score calculation');

  const affinities = calculateAffinities({ signals: wellness.signals });
  const revenuePotential = calculateRevenuePotential({
    affinities,
    vipScore: 65,
    pmsIntelligenceContext: { upgradeEligible: true, revenuePotential: 150 },
    reviewRiskScore: 5
  });
  assert.ok(revenuePotential >= 60);
  cases.push('revenue potential calculation');

  assert.ok(wellness.affinities.spa_affinity > wellness.affinities.restaurant_affinity);
  cases.push('spa affinity');

  const adventure = buildGuestIntelligenceProfile({
    ...baseInput,
    message: 'Queremos excursiones, quad y Agafay Desert Dinner'
  });
  assert.ok(adventure.affinities.adventure_affinity >= 60);
  cases.push('adventure affinity');

  const riskSignals = detectBehaviorSignals({
    message: 'Esto es inaceptable, nadie responde y quiero poner una queja'
  });
  const reviewRisk = calculateReviewRisk({
    signals: riskSignals,
    tickets: [{ category: 'complaint', priority: 'urgent' }],
    aiLogs: [{ needs_human: true }]
  });
  assert.ok(reviewRisk >= 70);
  cases.push('review risk detection');

  const prediction = predictLikelyConversions({
    guestIntelligence: wellness,
    pmsIntelligenceContext: baseInput.pmsIntelligenceContext
  });
  const recommendations = generateUpsellRecommendations({
    guestIntelligence: wellness,
    revenuePrediction: prediction,
    pmsIntelligenceContext: baseInput.pmsIntelligenceContext
  });
  assert.ok(recommendations.some((item) => item.type === 'spa'));
  cases.push('upsell recommendation');

  const automationSuggestions = generateAutomationSuggestions({
    guestIntelligence: wellness,
    revenuePrediction: prediction,
    pmsIntelligenceContext: baseInput.pmsIntelligenceContext
  });
  assert.ok(automationSuggestions.some((item) => item.automationType === 'spa_upsell'));
  cases.push('automation personalization');

  const multilingual = buildGuestIntelligenceProfile({
    ...baseInput,
    language: 'fr',
    message: 'Je veux réserver un hammam relaxant'
  });
  assert.equal(multilingual.language, 'fr');
  assert.equal(detectGuestType({
    affinities: multilingual.affinities,
    signals: multilingual.signals,
    vipScore: multilingual.vipScore,
    reviewRiskScore: multilingual.reviewRiskScore
  }), 'wellness_traveler');
  assert.ok(calculateUpsellProbability({
    offerType: 'spa',
    guestIntelligence: multilingual,
    pmsIntelligenceContext: baseInput.pmsIntelligenceContext
  }) >= 0.45);
  cases.push('multilingual intelligence');

  console.log(JSON.stringify({ ok: true, cases }, null, 2));
};

try {
  run();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    stack: error.stack
  }, null, 2));
  process.exit(1);
}
