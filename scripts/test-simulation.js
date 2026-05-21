import { runStaynexSimulation } from '../src/services/simulation-mode.service.js';

const args = new Set(process.argv.slice(2));
const countArg = process.argv.find((item) => /^--count=/.test(item));
const count = countArg ? Number(countArg.split('=')[1]) : args.has('--500') ? 500 : args.has('--100') ? 100 : 10;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const result = runStaynexSimulation({
  count,
  hotelType: 'all',
  scenario: 'all'
});

assert(result.ok, 'Simulation should return ok=true');
assert(result.safety.noRealWhatsapp, 'Simulation must disable real WhatsApp delivery');
assert(result.safety.noRealHotels, 'Simulation must not write to real hotels');
assert(result.safety.noLiveAutomations, 'Simulation must keep automations in preview mode');
assert(result.safety.noProviderEmails, 'Simulation must disable provider emails');
assert(result.safety.noRealPmsApis, 'Simulation must not call PMS APIs');
assert(result.results.length === count, `Expected ${count} simulation results`);
assert(result.metrics.total === count, 'Metrics total should match result count');
assert(result.metrics.successRate >= 70, `Simulation success rate too low: ${result.metrics.successRate}%`);
assert(result.metrics.unsafeResponses === 0, 'Simulation should not produce unsafe delivery responses');
assert(result.metrics.hallucinationWarnings === 0, 'Simulation should not produce hallucination warnings');

const requiredScenarios = [
  'late_checkout',
  'airport_transfer',
  'spa_booking',
  'restaurant',
  'noise_complaint',
  'broken_ac',
  'cleaning_request',
  'hours_question',
  'excursion_recommendation',
  'room_upgrade',
  'vip_guest',
  'angry_guest',
  'french_guest',
  'english_guest',
  'spanish_guest',
  'ambiguous_request',
  'real_urgency'
];

for (const scenario of requiredScenarios) {
  assert(
    result.catalog.scenarios.some((item) => item.id === scenario),
    `Missing simulation scenario ${scenario}`
  );
}

const french = result.results.find((item) => item.scenario === 'french_guest');
if (french) {
  assert(french.detected_language === 'fr', 'French scenario should detect FR');
}

const emergency = result.results.find((item) => item.scenario === 'real_urgency');
if (emergency) {
  assert(emergency.ticket_created, 'Emergency should create a simulated ticket');
  assert(emergency.escalation_required, 'Emergency should require escalation');
}

console.log(JSON.stringify({
  ok: true,
  count,
  metrics: result.metrics,
  safety: result.safety
}, null, 2));
