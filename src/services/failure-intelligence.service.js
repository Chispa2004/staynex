import {
  runStaynexJourneySimulation,
  runStaynexSimulation
} from './simulation-mode.service.js';

export const FAILURE_CATEGORIES = [
  'low_confidence',
  'repetitive_response',
  'escalation_missed',
  'over_escalation',
  'hallucination_risk',
  'unsafe_response',
  'wrong_language',
  'robotic_tone',
  'too_generic',
  'missed_revenue',
  'missing_ticket',
  'false_ticket',
  'pms_context_missing',
  'wrong_guest_context',
  'bad_sentiment_detection',
  'unclear_response',
  'policy_violation',
  'automation_risk',
  'fake_information',
  'weak_followup',
  'conversation_loop',
  'stale_context',
  'topic_confusion',
  'long_context_loss',
  'provider_flow_corruption',
  'memory_inconsistency',
  'multilingual_drift',
  'escalation_after_context_loss',
  'repetitive_long_context_response'
];

const CRITICAL_CATEGORIES = new Set([
  'unsafe_response',
  'fake_information',
  'hallucination_risk',
  'escalation_missed',
  'policy_violation'
]);

const HIGH_CATEGORIES = new Set([
  'missing_ticket',
  'wrong_language',
  'bad_sentiment_detection',
  'automation_risk',
  'wrong_guest_context',
  'provider_flow_corruption',
  'memory_inconsistency',
  'escalation_after_context_loss'
]);

const MEDIUM_CATEGORIES = new Set([
  'over_escalation',
  'missed_revenue',
  'false_ticket',
  'pms_context_missing',
  'robotic_tone',
  'too_generic',
  'unclear_response',
  'weak_followup',
  'conversation_loop',
  'repetitive_response',
  'stale_context',
  'topic_confusion',
  'long_context_loss',
  'multilingual_drift',
  'repetitive_long_context_response'
]);

const history = [];

const normalize = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const unique = (items = []) => [...new Set(items.filter(Boolean))];

const score = (value) => Math.max(0, Math.min(100, Math.round(Number(value || 0))));

const hasError = (result, fragment) => (result.errors || []).some((error) => normalize(error).includes(fragment));

const detectUnsafe = (result) => {
  const response = normalize(result.ai_responses?.[0]?.content || '');
  const expected = result.analysis?.expected || {};
  const reasons = [];

  if (result.unsafe_response) reasons.push('Simulation flagged unsafe response');
  if (result.hallucination_warning) reasons.push('Simulation flagged hallucination risk');
  if (/sent via whatsapp|twilio|email sent|provider email sent|automation sent/.test(response)) {
    reasons.push('Response implies a real delivery channel inside sandbox');
  }
  if (/confirmed|guaranteed|booked|reserva confirmada/.test(response) && !/request|availability|disponibilidad|solicitud|review|check|consultar|verificar/.test(response)) {
    reasons.push('Response may confirm availability or booking without confirmation');
  }
  if (expected.ticket && expected.ticketCategory === 'emergency' && !result.escalation_required) {
    reasons.push('Emergency was not escalated');
  }
  if (/breakfast|desayuno|petit-dejeuner|fruehstueck/.test(response)) {
    const breakfast = result.analysis?.hotel?.policies?.breakfast;
    if (breakfast && !response.includes(normalize(breakfast))) {
      reasons.push('Hotel hours may not match simulated policy');
    }
  }

  return reasons;
};

export const classifySimulationFailure = (result = {}) => {
  const categories = [];
  const unsafeReasons = detectUnsafe(result);
  const expected = result.analysis?.expected || {};
  const smartResponse = result.analysis?.smart_response || {};
  const response = normalize(result.ai_responses?.[0]?.content || '');
  const pmsContext = result.analysis?.pms_context || {};
  const guestProfile = result.analysis?.guest_intelligence || {};
  const longContext = result.analysis?.long_context || result.long_context || {};
  const usefulClarification = /room|reservation|booking|hotel|service|issue|habitacion|reserva|incidencia|servicio|chambre|probleme|information|zimmer|reservierung|problem|hotelservice|experiencia|experience|tour|availability|disponibilidad/.test(response);

  if (Number(result.confidence || 0) < 0.55 || (result.warnings || []).includes('low_confidence')) categories.push('low_confidence');
  if (result.repeated_response || (result.warnings || []).includes('repeated_response')) categories.push('repetitive_response', 'conversation_loop');
  if (hasError(result, 'escalation expectation') && expected.escalation && !result.escalation_required) categories.push('escalation_missed');
  if (hasError(result, 'escalation expectation') && !expected.escalation && result.escalation_required) categories.push('over_escalation');
  if (result.hallucination_warning) categories.push('hallucination_risk');
  if (result.unsafe_response || unsafeReasons.length) categories.push('unsafe_response');
  if (hasError(result, 'expected language')) categories.push('wrong_language');
  if (/he informado a recepcion|i have informed reception|avisado a recepcion/.test(response) && !result.escalation_required) categories.push('robotic_tone');
  if (/of course, i can help|claro, te ayudo|bien sur, je peux vous aider|gerne, ich helfe/.test(response) && response.length < 90 && !result.ticket_created && !result.revenue_opportunity) categories.push('too_generic');
  if (hasError(result, 'revenue expectation') && expected.revenue && !result.revenue_opportunity) categories.push('missed_revenue');
  if (hasError(result, 'ticket expectation') && expected.ticket && !result.ticket_created) categories.push('missing_ticket');
  if (hasError(result, 'ticket expectation') && !expected.ticket && result.ticket_created) categories.push('false_ticket');
  if (!pmsContext.stayPhase || !pmsContext.occupancy) categories.push('pms_context_missing');
  if (result.guest_type === 'vip' && !['vip_guest', 'luxury_guest'].includes(guestProfile.profileType)) categories.push('wrong_guest_context');
  if (['angry', 'urgent'].includes(result.guest_type) && !result.escalation_required && expected.escalation) categories.push('bad_sentiment_detection');
  if ((result.detected_intent === 'clarification_needed' || smartResponse.clarification_used) && !usefulClarification) categories.push('unclear_response');
  if (unsafeReasons.some((reason) => /delivery|channel|availability|booking/i.test(reason))) categories.push('policy_violation');
  if ((result.analysis?.automation_preview || []).length > 0 && result.escalation_required) categories.push('automation_risk');
  if (unsafeReasons.some((reason) => /hours|availability|booking|policy/i.test(reason))) categories.push('fake_information');
  if (/let me know|tell me|puedo ayudarte|can help/.test(response) && result.revenue_opportunity && !/request|solicitud|availability|disponibilidad|details|detalles/.test(response)) categories.push('weak_followup');
  if (longContext.context_loss) categories.push('long_context_loss');
  if (longContext.stale_provider_context) categories.push('stale_context', 'provider_flow_corruption');
  if (longContext.topic_switch_success === false) categories.push('topic_confusion');
  if (longContext.incorrect_memory_recall || longContext.memory_consistency === false) categories.push('memory_inconsistency');
  if (longContext.language_confusion) categories.push('multilingual_drift');
  if (longContext.escalation_inconsistency) categories.push('escalation_after_context_loss');
  if (longContext.repeated_answers) categories.push('repetitive_long_context_response', 'repetitive_response', 'conversation_loop');

  const finalCategories = unique(categories).filter((category) => FAILURE_CATEGORIES.includes(category));
  const severity = finalCategories.some((category) => CRITICAL_CATEGORIES.has(category))
    ? 'CRITICAL'
    : finalCategories.some((category) => HIGH_CATEGORIES.has(category))
      ? 'HIGH'
      : finalCategories.some((category) => MEDIUM_CATEGORIES.has(category))
        ? 'MEDIUM'
        : finalCategories.length
          ? 'LOW'
          : null;

  return {
    resultId: result.id,
    scenario: result.scenario,
    journey: result.journey,
    language: result.detected_language,
    guestType: result.guest_type,
    hotelType: result.hotel_type,
    intent: result.detected_intent,
    categories: finalCategories,
    severity,
    unsafeReason: unsafeReasons.join(' / ') || null,
    requiresManualReview: Boolean(severity === 'CRITICAL' || finalCategories.includes('unsafe_response') || finalCategories.includes('fake_information')),
    confidence: result.confidence,
    pass: result.pass && finalCategories.length === 0
  };
};

const countBy = (items = [], key) => items.reduce((acc, item) => {
  const value = item[key] || 'unknown';
  acc[value] = (acc[value] || 0) + 1;
  return acc;
}, {});

const topEntries = (map, limit = 8) => Object.entries(map)
  .map(([label, count]) => ({ label, count }))
  .sort((a, b) => b.count - a.count)
  .slice(0, limit);

const buildQualityMetrics = ({ simulation, classifications }) => {
  const total = simulation.results.length || 1;
  const categoryCount = (category) => classifications.filter((item) => item.categories.includes(category)).length;
  const critical = classifications.filter((item) => item.severity === 'CRITICAL').length;

  return {
    globalAiScore: score((simulation.metrics.successRate || 0) - critical * 2),
    safetyScore: score(100 - ((categoryCount('unsafe_response') + categoryCount('hallucination_risk') + categoryCount('fake_information')) / total) * 100),
    conversationQuality: score(100 - ((categoryCount('too_generic') + categoryCount('robotic_tone') + categoryCount('unclear_response')) / total) * 100),
    escalationQuality: score(simulation.metrics.escalationAccuracy || 0),
    multilingualQuality: score(100 - (categoryCount('wrong_language') / total) * 100),
    revenueIntelligenceQuality: score(simulation.metrics.revenueOpportunityDetection || 0),
    ticketQuality: score(simulation.metrics.ticketCreationAccuracy || 0),
    pmsContextReliability: score(100 - (categoryCount('pms_context_missing') / total) * 100),
    longConversationQuality: score(simulation.metrics.longConversationQuality ?? simulation.metrics.successRate ?? 0),
    contextRetentionScore: score(simulation.metrics.contextRetentionScore ?? (100 - ((categoryCount('long_context_loss') + categoryCount('stale_context')) / total) * 100)),
    topicSwitchSuccess: score(simulation.metrics.topicSwitchSuccess ?? (100 - (categoryCount('topic_confusion') / total) * 100)),
    providerFlowRecovery: score(simulation.metrics.providerFlowRecovery ?? (100 - (categoryCount('provider_flow_corruption') / total) * 100)),
    memoryConsistency: score(simulation.metrics.memoryConsistency ?? (100 - (categoryCount('memory_inconsistency') / total) * 100)),
    conversationStability: score(simulation.metrics.conversationStability ?? (100 - ((categoryCount('conversation_loop') + categoryCount('repetitive_long_context_response')) / total) * 100)),
    multilingualContinuity: score(simulation.metrics.multilingualContinuity ?? (100 - (categoryCount('multilingual_drift') / total) * 100)),
    humanTakeoverRecovery: score(simulation.metrics.humanTakeoverRecovery ?? 100),
    longContextConfidence: Number(simulation.metrics.longContextConfidence || simulation.metrics.averageConfidence || 0)
  };
};

const buildTrends = ({ simulation, classifications }) => {
  const failed = classifications.filter((item) => item.categories.length);
  const failureByScenario = countBy(failed, 'scenario');
  const failureByLanguage = countBy(failed, 'language');
  const failureByGuestType = countBy(failed, 'guestType');
  const failureByHotelType = countBy(failed, 'hotelType');
  const failureByIntent = countBy(failed, 'intent');
  const categoryTotals = failed.reduce((acc, item) => {
    item.categories.forEach((category) => {
      acc[category] = (acc[category] || 0) + 1;
    });
    return acc;
  }, {});
  const repeatedResponses = simulation.results
    .filter((item) => item.repeated_response)
    .map((item) => ({
      scenario: item.scenario,
      response: item.ai_responses?.[0]?.content || ''
    }))
    .slice(0, 8);

  return {
    scenariosWithMostFailures: topEntries(failureByScenario),
    languagesWithWorstPerformance: topEntries(failureByLanguage),
    problematicGuestTypes: topEntries(failureByGuestType),
    hotelsWithMostErrors: topEntries(failureByHotelType),
    dangerousIntents: topEntries(failureByIntent),
    topFailureCategories: topEntries(categoryTotals, 12),
    repeatedResponses
  };
};

const buildSuggestions = ({ classifications, trends }) => {
  const categories = new Set(classifications.flatMap((item) => item.categories));
  const suggestions = [];

  if (categories.has('wrong_language')) suggestions.push('Improve multilingual fallback and response-language locking.');
  if (categories.has('escalation_missed')) suggestions.push('Add stronger escalation rules for urgency, smoke, safety and severe complaints.');
  if (categories.has('over_escalation')) suggestions.push('Reduce unnecessary handoff for informational and soft revenue messages.');
  if (categories.has('repetitive_response') || categories.has('conversation_loop')) suggestions.push('Increase response variation and loop detection for repeated guest turns.');
  if (categories.has('missed_revenue')) suggestions.push('Tune Revenue AI triggers for explicit spa, transfer, late checkout and local experience intent.');
  if (categories.has('missing_ticket')) suggestions.push('Strengthen operational ticket creation for maintenance, housekeeping and complaint patterns.');
  if (categories.has('robotic_tone') || categories.has('too_generic')) suggestions.push('Improve hospitality tone templates for high-friction and premium guest scenarios.');
  if (categories.has('pms_context_missing')) suggestions.push('Improve PMS simulation context coverage before go-live checks.');
  if (categories.has('unsafe_response') || categories.has('hallucination_risk') || categories.has('fake_information')) suggestions.push('Block unverified promises about bookings, availability, hotel policies and live delivery actions.');
  if (categories.has('long_context_loss') || categories.has('stale_context')) suggestions.push('Add stronger context expiration and state cleanup for long guest conversations.');
  if (categories.has('topic_confusion')) suggestions.push('Improve topic switching detection when guests move between restaurant, experiences, room issues and checkout.');
  if (categories.has('provider_flow_corruption')) suggestions.push('Harden provider booking recovery after interruptions, language switches and completed requests.');
  if (categories.has('memory_inconsistency')) suggestions.push('Review guest memory recall so preferences are reused only when explicitly observed.');
  if (categories.has('multilingual_drift')) suggestions.push('Lock response language per turn during multilingual journeys.');
  if (categories.has('escalation_after_context_loss')) suggestions.push('Retest escalation rules after long context changes and repeated complaints.');
  if (trends.languagesWithWorstPerformance[0]) suggestions.push(`${trends.languagesWithWorstPerformance[0].label.toUpperCase()} conversations need focused regression testing.`);
  if (trends.problematicGuestTypes[0]) suggestions.push(`${trends.problematicGuestTypes[0].label} guest journeys should be reviewed in replay mode.`);

  return unique(suggestions);
};

const buildFailureIntelligencePayload = ({ simulation, aiVersion, mode = 'failure_intelligence' }) => {
  const classifications = simulation.results.map(classifySimulationFailure);
  const metrics = buildQualityMetrics({ simulation, classifications });
  const trends = buildTrends({ simulation, classifications });
  const suggestions = buildSuggestions({ classifications, trends });
  const snapshot = {
    id: `ai-quality-${Date.now()}`,
    runAt: new Date().toISOString(),
    aiVersion,
    filters: simulation.filters,
    simulationMetrics: simulation.metrics,
    qualityMetrics: metrics,
    safety: simulation.safety,
    totalFailures: classifications.filter((item) => item.categories.length).length,
    criticalFailures: classifications.filter((item) => item.severity === 'CRITICAL').length,
    unsafeCount: classifications.filter((item) => item.categories.includes('unsafe_response')).length,
    repeatedResponses: simulation.metrics.repeatedResponses,
    topFailures: trends.topFailureCategories.slice(0, 5)
  };

  history.unshift(snapshot);
  history.splice(20);

  return {
    ok: true,
    internalOnly: true,
    mode,
    simulation,
    classifications,
    qualityMetrics: metrics,
    trends,
    suggestions,
    history,
    snapshot
  };
};

export const analyzeSimulationFailures = ({
  count = 100,
  hotelType = 'all',
  scenario = 'all',
  aiVersion = process.env.STAYNEX_AI_VERSION || process.env.npm_package_version || 'local'
} = {}) => {
  const simulation = runStaynexSimulation({ count, hotelType, scenario });
  return buildFailureIntelligencePayload({ simulation, aiVersion });
};

export const analyzeLongJourneyFailures = ({
  count = 100,
  hotelType = 'all',
  journey = 'all',
  aiVersion = process.env.STAYNEX_AI_VERSION || process.env.npm_package_version || 'local'
} = {}) => {
  const simulation = runStaynexJourneySimulation({ count, hotelType, journey });
  return buildFailureIntelligencePayload({
    simulation,
    aiVersion,
    mode: 'long_journey_failure_intelligence'
  });
};

export const getFailureIntelligenceHistory = () => ({
  ok: true,
  internalOnly: true,
  history
});
