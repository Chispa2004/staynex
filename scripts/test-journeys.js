import {
  runStaynexJourneySimulation,
  SIMULATION_JOURNEYS
} from '../src/services/simulation-mode.service.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const getArgValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
};

const count = Number(getArgValue('count', 10));

const result = runStaynexJourneySimulation({
  count,
  hotelType: 'all',
  journey: 'all'
});

assert(result.ok, 'Long Journey Simulation should return ok=true');
assert(result.mode === 'long_journey_simulation', 'Simulation mode should be long_journey_simulation');
assert(result.safety.noRealWhatsapp, 'Journeys must not send real WhatsApp messages');
assert(result.safety.noProviderEmails, 'Journeys must not send provider emails');
assert(result.safety.noRealHotels, 'Journeys must not write to real hotels');
assert(result.results.length === count, `Expected ${count} journey results`);
assert(result.catalog.journeys.length >= 5, 'Journey catalog should expose realistic journeys');

const requiredJourneys = [
  'guest_standard_journey',
  'language_switching',
  'room_issue_frustration',
  'chaotic_guest',
  'checkout_journey'
];

requiredJourneys.forEach((journeyId) => {
  assert(SIMULATION_JOURNEYS.some((journey) => journey.id === journeyId), `${journeyId} should be registered`);
});

result.results.forEach((item) => {
  assert(item.turn_count >= 5, `${item.journey} should include at least 5 turns`);
  assert(Array.isArray(item.intent_timeline), `${item.journey} should include an intent timeline`);
  assert(Array.isArray(item.language_timeline), `${item.journey} should include a language timeline`);
  assert(Array.isArray(item.provider_state_timeline), `${item.journey} should include a provider timeline`);
  assert(Array.isArray(item.memory_state_timeline), `${item.journey} should include a memory timeline`);
  assert(item.analysis?.long_context, `${item.journey} should include long context analysis`);
});

const one = (journeyId) => runStaynexJourneySimulation({ count: 1, journey: journeyId }).results[0];

const standard = one('guest_standard_journey');
assert(standard.provider_state_timeline.some((item) => item.status === 'completed'), 'Standard journey should complete provider request');
assert(!standard.analysis.long_context.repeated_answers, 'Standard journey should not loop');

const multilingual = one('language_switching');
assert(new Set(multilingual.language_timeline.map((item) => item.language)).size >= 2, 'Language switching should detect multiple languages');
assert(!multilingual.analysis.long_context.language_confusion, 'Language switching should avoid multilingual drift');

const roomIssue = one('room_issue_frustration');
assert(roomIssue.ticket_created, 'Room issue journey should create a ticket');
assert(roomIssue.escalation_required, 'Room issue frustration should escalate');

const chaotic = one('chaotic_guest');
assert(chaotic.analysis.long_context.topic_switch_success, 'Chaotic guest should keep topic switching stable');

const takeover = one('human_takeover_interruption');
assert(takeover.ai_mode_timeline.some((item) => item.mode === 'human_takeover'), 'Takeover journey should include human takeover');
assert(takeover.analysis.long_context.human_takeover_recovery, 'Takeover journey should recover after AI resumes');

const memory = one('guest_memory_consistency');
assert(memory.analysis.long_context.memory_consistency, 'Memory journey should recall observed guest preference');

assert(result.metrics.longConversationQuality >= 70, 'Long conversation quality should be available');
assert(result.metrics.contextRetentionScore >= 70, 'Context retention score should be available');
assert(result.metrics.topicSwitchSuccess >= 70, 'Topic switching score should be available');
assert(result.metrics.providerFlowRecovery >= 70, 'Provider flow recovery should be available');
assert(result.metrics.conversationStability >= 70, 'Conversation stability should be available');

console.log(JSON.stringify({
  ok: true,
  count,
  metrics: result.metrics,
  journeys: result.catalog.journeys.map((item) => item.id)
}, null, 2));
