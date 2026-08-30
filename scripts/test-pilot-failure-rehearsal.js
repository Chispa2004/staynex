import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PILOT_AI_GATE_REASONS,
  PILOT_AI_SAFETY_RUNTIME,
  buildSuppressedAiResponse,
  shouldAiAutoRespond
} from '../shared/pilot/ai-safety.js';
import {
  PILOT_FAILURE_REHEARSAL_STATUS,
  PILOT_HEALTH_STATUS,
  buildPilotFailureRehearsalMatrix,
  buildPilotHealthSnapshot,
  sanitizePilotOperationalMessage,
  summarizePilotFailureRehearsal
} from '../shared/pilot/operational-readiness.js';
import { buildPilotOnboardingSummary, PILOT_STATUS } from '../dashboard/lib/pilot-onboarding.js';
import { evaluateAutomationDecision } from '../shared/automations/runtime.js';
import { statusForAutomationDecision } from '../shared/automations/queue-writer.js';
import { detectHumanEscalation, buildHumanHandoffReply } from '../src/services/human-escalation.service.js';
import { CONVERSATION_AI_MODES } from '../src/services/conversation-context.service.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');

for (const key of [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'OPENAI_API_KEY',
  'UBIKOS_ENABLED'
]) {
  delete process.env[key];
}
process.env.SEND_AUTOMATIONS = 'false';
process.env.GUEST_MEMORY_ENABLED = 'false';
process.env.USE_MOCK_AI = 'true';

const envSafe = {
  SEND_AUTOMATIONS: 'false',
  GUEST_MEMORY_ENABLED: 'false',
  USE_MOCK_AI: 'true',
  TWILIO_AUTH_TOKEN: 'configured_for_status_only',
  TWILIO_WHATSAPP_FROM: 'configured_for_status_only',
  PILOT_SECURITY_BASELINE_PASSED: 'true'
};

const now = new Date('2026-08-30T10:00:00.000Z');
const hotel = {
  id: 'hotel-pilot-health',
  name: 'Pilot Health Hotel',
  country_code: 'ES',
  city: 'Palma',
  timezone: 'Europe/Madrid',
  timezone_integrity_status: 'verified',
  whatsapp_number: 'configured',
  metadata: {
    security_baseline_passed: true,
    ai_auto_reply_enabled: true,
    whatsapp_inbound_ready: true,
    whatsapp_outbound_ready: true,
    openai_provider_configured: true
  }
};
const pmsConnection = {
  id: 'pms-1',
  hotel_id: hotel.id,
  provider: 'apaleo',
  enabled: true,
  sync_status: 'connected',
  last_sync_at: now.toISOString(),
  credential_configured: true,
  has_client_secret: true,
  connection_mode: 'live_api'
};
const users = [
  { id: 'admin-1', role: 'admin', status: 'active', email: 'admin@example.com' },
  { id: 'reception-1', role: 'receptionist', status: 'active', email: 'reception@example.com' }
];
const knowledgeEntries = [{ id: 'kb-1', key: 'wifi', value: 'Wifi confirmado.', is_active: true }];

const getComponent = (health, id) => health.components.find((item) => item.id === id);
const assertNoSensitiveText = (value, label) => {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /sk-live|Bearer|auth_token|client_secret|password|AC12345678901234567890/i, `${label} should hide secrets`);
  assert.doesNotMatch(text, /\+34\s?600\s?000\s?000/, `${label} should hide phone values`);
};

const healthyPreview = buildPilotHealthSnapshot({
  hotel,
  pmsConnections: [pmsConnection],
  tickets: [],
  conversations: [],
  conversationStates: [],
  scheduledMessages: [],
  aiLogs: [],
  env: envSafe,
  now
});
assert.equal(healthyPreview.readyForPilotDemo, true, 'baseline can be ready for pilot demo');
assert.equal(healthyPreview.readyForLiveAutomations, false, 'baseline is not ready for live automations');
assert.equal(getComponent(healthyPreview, 'automations').status, PILOT_HEALTH_STATUS.BLOCKED, 'SEND_AUTOMATIONS=false remains a visible live-send blocker');
assertNoSensitiveText(healthyPreview, 'baseline health');

const pmsDown = buildPilotHealthSnapshot({
  hotel,
  pmsConnections: [{
    ...pmsConnection,
    sync_status: 'failed',
    last_sync_error: 'Bearer sk-live-secret failed for +34 600 000 000'
  }],
  env: envSafe,
  now
});
assert.equal(getComponent(pmsDown, 'pms').status, PILOT_HEALTH_STATUS.DEGRADED, 'PMS failure degrades health');
assert.match(getComponent(pmsDown, 'pms').why, /fallo|error/i, 'PMS failure explains why');
assertNoSensitiveText(pmsDown, 'PMS down health');

const stalePms = buildPilotHealthSnapshot({
  hotel,
  pmsConnections: [{ ...pmsConnection, last_sync_at: '2026-08-27T00:00:00.000Z' }],
  env: envSafe,
  now
});
assert.equal(getComponent(stalePms, 'pms').status, PILOT_HEALTH_STATUS.ACTION_REQUIRED, 'stale PMS sync requires action');

const openAiDown = buildPilotHealthSnapshot({
  hotel,
  pmsConnections: [pmsConnection],
  aiLogs: [{ id: 'ai-fail-1', status: 'failed', openai_error: 'sk-live-secret raw provider body' }],
  env: envSafe,
  now
});
assert.equal(getComponent(openAiDown, 'ai').status, PILOT_HEALTH_STATUS.DEGRADED, 'OpenAI failure degrades AI health');
const suppressedAi = buildSuppressedAiResponse({ reason: PILOT_AI_GATE_REASONS.AI_PROVIDER_FAILURE });
assert.equal(suppressedAi.reply, null, 'OpenAI down does not invent a guest reply');
assert.equal(suppressedAi.escalate_to_human, true, 'OpenAI down requires human attention');
assertNoSensitiveText(openAiDown, 'OpenAI down health');

const twilioFailure = buildPilotHealthSnapshot({
  hotel,
  pmsConnections: [pmsConnection],
  scheduledMessages: [{
    id: 'scheduled-twilio-fail',
    channel: 'whatsapp',
    status: 'failed',
    metadata: {
      provider: 'twilio',
      twilio_error: 'Twilio auth_token failed for AC12345678901234567890 and +34 600 000 000'
    }
  }],
  env: envSafe,
  now
});
assert.equal(getComponent(twilioFailure, 'whatsapp').status, PILOT_HEALTH_STATUS.DEGRADED, 'Twilio outbound failure is visible operationally');
assert.equal(getComponent(twilioFailure, 'automations').status, PILOT_HEALTH_STATUS.DEGRADED, 'failed outbound does not become an automatic retry loop');
assertNoSensitiveText(twilioFailure, 'Twilio failure health');

const unknownQuestion = detectHumanEscalation({
  message: 'Cual es la politica exacta para aterrizar un helicoptero en la azotea?',
  aiResponse: {
    intent: 'unknown',
    confidence: 0.91,
    reply: 'No tengo ese dato confirmado para este hotel.'
  },
  knowledgeUsed: false
});
assert.equal(unknownQuestion.needsHuman, true, 'unsupported hotel question routes to human attention');
assert.equal(unknownQuestion.humanReason, 'fallback_response');
assert.match(buildHumanHandoffReply({ language: 'es', reason: unknownQuestion.humanReason }), /recepci/i, 'human handoff is available');

const takeoverGate = shouldAiAutoRespond({
  hotel,
  conversationState: {
    state_metadata: {
      conversation_ai_mode: CONVERSATION_AI_MODES.HUMAN_TAKEOVER,
      human_takeover: { activated_at: now.toISOString() }
    }
  },
  env: envSafe
});
assert.equal(takeoverGate.allowed, false, 'takeover ON blocks automatic AI');
assert.equal(takeoverGate.reason, PILOT_AI_GATE_REASONS.HUMAN_TAKEOVER_ACTIVE);
assert.equal(PILOT_AI_SAFETY_RUNTIME.manualRepliesBypassAutoReplyGate, true, 'manual reply remains allowed during takeover');
const takeoverRouteSource = readFileSync(join(root, 'dashboard/app/api/inbox/takeover/route.js'), 'utf8');
assert.doesNotMatch(takeoverRouteSource, /processGuestMessageFn|processGuestMessage\(/, 'release does not retrospectively process old inbound messages');

const resumedGate = shouldAiAutoRespond({
  hotel,
  conversationState: { state_metadata: { conversation_ai_mode: CONVERSATION_AI_MODES.AI_ACTIVE } },
  env: envSafe
});
assert.equal(resumedGate.allowed, true, 'next inbound after release can use AI');

const hotelKillGate = shouldAiAutoRespond({
  hotel: { ...hotel, metadata: { ...hotel.metadata, ai_auto_reply_enabled: false } },
  conversationState: { state_metadata: { conversation_ai_mode: CONVERSATION_AI_MODES.AI_ACTIVE } },
  env: envSafe
});
assert.equal(hotelKillGate.allowed, false, 'hotel kill OFF blocks automatic AI');
assert.equal(hotelKillGate.reason, PILOT_AI_GATE_REASONS.HOTEL_AI_AUTO_REPLY_OFF);

const globalKillGate = shouldAiAutoRespond({
  hotel,
  conversationState: { state_metadata: { conversation_ai_mode: CONVERSATION_AI_MODES.AI_ACTIVE } },
  env: { ...envSafe, STAYNEX_GLOBAL_AI_AUTO_REPLY: 'off' }
});
assert.equal(globalKillGate.allowed, false, 'global kill OFF blocks automatic AI');
assert.equal(globalKillGate.reason, PILOT_AI_GATE_REASONS.GLOBAL_KILL_SWITCH_OFF);

const blockedAutomation = evaluateAutomationDecision({
  hotel,
  reservation: {
    id: 'reservation-unsafe-upsell',
    hotel_id: hotel.id,
    guest_id: 'guest-1',
    guest_phone: '15550000000',
    status: 'checked_in',
    arrival_date: '2026-08-29',
    departure_date: '2026-09-02',
    metadata: { last_guest_message: 'me interesa el spa' }
  },
  automationType: 'upselling',
  now,
  env: envSafe
});
assert.equal(blockedAutomation.eligible, false, 'unsafe/ineligible automation blocks in preview');
assert.equal(blockedAutomation.skipReason, 'upsell_offer_not_configured');
assert.equal(blockedAutomation.sendable, false);
assert.equal(statusForAutomationDecision(blockedAutomation), null, 'blocked automation creates no scheduled send');

const healthDataUnavailable = buildPilotHealthSnapshot({
  hotel,
  pmsConnections: [pmsConnection],
  dataIssues: [{ label: 'pms', message: 'relation failed with password=secret and sk-live' }],
  env: envSafe,
  now
});
assert.equal(getComponent(healthDataUnavailable, 'backend').status, PILOT_HEALTH_STATUS.DEGRADED, 'partial health load does not false-green');
assert.notEqual(healthDataUnavailable.status, PILOT_HEALTH_STATUS.HEALTHY, 'health with data issue is not green');
assertNoSensitiveText(healthDataUnavailable, 'health data issue');

assert.equal(
  sanitizePilotOperationalMessage('Authorization Bearer sk-live-secret failed for +34 600 000 000'),
  'Detalle operativo ocultado por seguridad.',
  'safe error surface hides raw provider errors'
);

const rehearsalRows = buildPilotFailureRehearsalMatrix();
const rehearsalSummary = summarizePilotFailureRehearsal(rehearsalRows);
assert.equal(rehearsalSummary.status, PILOT_FAILURE_REHEARSAL_STATUS.PASS, 'all local rehearsal scenarios pass');
assert.equal(rehearsalSummary.total, 7, 'seven pilot failure scenarios are covered');

const readiness = buildPilotOnboardingSummary({
  hotel,
  users,
  pmsConnections: [pmsConnection],
  knowledgeEntries,
  localKnowledge: [],
  operationalHealth: healthyPreview,
  failureRehearsal: {
    verified: true,
    rows: rehearsalRows
  },
  env: envSafe,
  preferredPmsProvider: 'apaleo',
  role: 'admin',
  platformRole: 'none',
  fallback: false
});
assert.equal(readiness.readyForPilotDemo, true, 'readiness distinguishes ready for pilot demo');
assert.equal(readiness.readyForLiveAutomations, false, 'readiness keeps live automations blocked');
assert.equal(readiness.gates.observability.status, PILOT_STATUS.COMPLETED, 'observability uses Pilot Health status');
assert.equal(readiness.gates.failureRehearsal.status, PILOT_STATUS.COMPLETED, 'verified rehearsal closes the gate');
assert.ok(readiness.liveAutomationBlockers.includes('Quiet Hours/send-time runtime'), 'live blockers remain visible');

const unverifiedRehearsal = buildPilotOnboardingSummary({
  hotel,
  users,
  pmsConnections: [pmsConnection],
  knowledgeEntries,
  operationalHealth: healthyPreview,
  failureRehearsal: {
    verified: false,
    rows: rehearsalRows
  },
  env: envSafe,
  preferredPmsProvider: 'apaleo',
  role: 'admin',
  platformRole: 'none',
  fallback: false
});
assert.equal(unverifiedRehearsal.readyForPilotDemo, false, 'failure rehearsal is not complete just because tests exist');

const docs = [
  readFileSync(join(root, 'docs/pilot-failure-rehearsal.md'), 'utf8'),
  readFileSync(join(root, 'docs/pilot-war-room-playbook.md'), 'utf8')
].join('\n');
for (const label of [
  'PMS down',
  'OpenAI down',
  'WhatsApp outbound failure',
  'unsupported guest question',
  'Human Takeover',
  'Kill Switch',
  'automation blocked/problematic'
]) {
  assert.ok(docs.includes(label), `${label} documented`);
}
assert.match(docs, /P0: guest\/security\/cross-tenant\/unsafe automated behavior/, 'war room severity P0 documented');
assert.match(docs, /Quiet Hours\/send-time runtime/, 'live automation blockers documented');

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.equal(packageJson.scripts['test:pilot-failure-rehearsal'], 'node scripts/test-pilot-failure-rehearsal.js', 'package script registered');

assert.equal(process.env.SEND_AUTOMATIONS, 'false', 'test keeps SEND_AUTOMATIONS disabled');
assert.equal(process.env.SUPABASE_URL, undefined, 'test does not use real Supabase');
assert.equal(process.env.TWILIO_ACCOUNT_SID, undefined, 'test does not use real Twilio');
assert.equal(process.env.OPENAI_API_KEY, undefined, 'test does not use real OpenAI');

console.log('Pilot failure rehearsal tests passed');
