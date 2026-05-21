import {
  analyzeSimulationFailures,
  classifySimulationFailure,
  FAILURE_CATEGORIES,
  getFailureIntelligenceHistory
} from '../src/services/failure-intelligence.service.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const result = analyzeSimulationFailures({
  count: 50,
  hotelType: 'all',
  scenario: 'all',
  aiVersion: 'test-failure-intelligence'
});

assert(result.ok, 'Failure Intelligence should return ok=true');
assert(result.internalOnly, 'Failure Intelligence must be marked internal only');
assert(result.mode === 'failure_intelligence', 'Mode should be failure_intelligence');
assert(result.simulation.safety.noRealWhatsapp, 'Failure Intelligence must reuse safe Simulation Mode');
assert(result.simulation.safety.noProviderEmails, 'Failure Intelligence must not send provider emails');
assert(result.classifications.length === result.simulation.results.length, 'Each simulation result needs a classification');
assert(result.qualityMetrics.globalAiScore >= 0, 'Global AI score should exist');
assert(result.qualityMetrics.safetyScore >= 0, 'Safety score should exist');
assert(result.qualityMetrics.multilingualQuality >= 0, 'Multilingual quality should exist');
assert(Array.isArray(result.trends.topFailureCategories), 'Top failure categories should be an array');
assert(Array.isArray(result.suggestions), 'Suggestions should be an array');
assert(result.history.length >= 1, 'History should store the latest run');

const emergencyMiss = classifySimulationFailure({
  id: 'crafted-emergency-miss',
  scenario: 'real_urgency',
  detected_language: 'en',
  guest_type: 'urgent',
  hotel_type: 'urban',
  detected_intent: 'emergency',
  confidence: 0.91,
  ticket_created: false,
  escalation_required: false,
  revenue_opportunity: false,
  pass: false,
  errors: [
    'Ticket expectation mismatch for real_urgency',
    'Escalation expectation mismatch for real_urgency'
  ],
  warnings: [],
  ai_responses: [{ content: 'I can help you with that.', language: 'en' }],
  analysis: {
    expected: {
      ticket: true,
      ticketCategory: 'emergency',
      escalation: true,
      revenue: false
    },
    pms_context: {
      stayPhase: 'in_house',
      occupancy: { occupancyPercent: 80 }
    },
    guest_intelligence: {
      profileType: 'urgent'
    }
  }
});

assert(emergencyMiss.categories.includes('escalation_missed'), 'Missing emergency escalation should be classified');
assert(emergencyMiss.categories.includes('missing_ticket'), 'Missing emergency ticket should be classified');
assert(emergencyMiss.severity === 'CRITICAL', 'Missing emergency escalation must be critical');
assert(emergencyMiss.requiresManualReview, 'Critical failure must require manual review');

const wrongLanguage = classifySimulationFailure({
  id: 'crafted-language',
  scenario: 'french_guest',
  detected_language: 'en',
  guest_type: 'wellness',
  hotel_type: 'boutique',
  detected_intent: 'excursion_interest',
  confidence: 0.82,
  ticket_created: false,
  escalation_required: false,
  revenue_opportunity: true,
  pass: false,
  errors: ['Expected language fr, got en'],
  warnings: [],
  ai_responses: [{ content: 'Of course, I can help.', language: 'en' }],
  analysis: {
    expected: { language: 'fr', ticket: false, escalation: false, revenue: true },
    pms_context: { stayPhase: 'in_house', occupancy: { occupancyPercent: 70 } },
    guest_intelligence: { profileType: 'wellness_traveler' }
  }
});

assert(wrongLanguage.categories.includes('wrong_language'), 'Wrong language should be classified');
assert(FAILURE_CATEGORIES.includes('conversation_loop'), 'Category registry should include conversation_loop');

const history = getFailureIntelligenceHistory();
assert(history.ok, 'History endpoint payload should be ok');
assert(history.history[0]?.aiVersion === 'test-failure-intelligence', 'History should keep the latest AI version');

console.log(JSON.stringify({
  ok: true,
  metrics: result.qualityMetrics,
  failures: result.totalFailures,
  criticalFailures: result.criticalFailures,
  history: history.history.length
}, null, 2));
