import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPilotOnboardingSummary,
  canModifyPilotProtectedConfig,
  evaluatePilotHotelProfile,
  evaluatePilotPms,
  getPilotCompletionRedirect,
  isRealPilotPmsConnection,
  normalizePilotOnboardingStep,
  PILOT_STATUS
} from '../dashboard/lib/pilot-onboarding.js';
import { canAccessRoute } from '../dashboard/lib/permissions.js';
import {
  buildPilotFailureRehearsalMatrix,
  buildPilotHealthSnapshot
} from '../shared/pilot/operational-readiness.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');

const envOff = {
  GUEST_MEMORY_ENABLED: 'false',
  SEND_AUTOMATIONS: 'false',
  PILOT_SECURITY_BASELINE_PASSED: 'true',
  PILOT_HUMAN_FALLBACK_READY: 'true',
  PILOT_KILL_SWITCH_READY: 'true',
  TWILIO_AUTH_TOKEN: 'configured',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+10000000000',
  USE_MOCK_AI: 'true'
};

const baseHotel = {
  id: 'hotel-checkin',
  name: 'Checkin Pilot',
  country_code: 'MA',
  city: 'Marrakech',
  timezone: 'Africa/Casablanca',
  timezone_integrity_status: 'verified',
  whatsapp_number: '+212600000000',
  metadata: {
    security_baseline_passed: true,
    human_fallback_ready: true,
    kill_switch_ready: true,
    ai_auto_reply_enabled: true,
    whatsapp_inbound_ready: true,
    whatsapp_outbound_ready: true,
    openai_provider_configured: true
  }
};

const baseUsers = [
  { id: 'admin-1', email: 'admin@example.com', role: 'admin', status: 'active' }
];

const basePms = [
  {
    id: 'pms-1',
    provider: 'apaleo',
    enabled: true,
    sync_status: 'connected',
    last_sync_at: new Date().toISOString(),
    credential_configured: true,
    has_client_secret: true,
    connection_mode: 'live_api'
  }
];

const baseKnowledge = [
  { id: 'kb-1', key: 'wifi', value: 'WiFi disponible.', is_active: true }
];

const buildOperationalHealth = (overrides = {}) => buildPilotHealthSnapshot({
  hotel: overrides.hotel || baseHotel,
  pmsConnections: overrides.pmsConnections || basePms,
  tickets: overrides.tickets || [],
  conversations: overrides.conversations || [],
  conversationStates: overrides.conversationStates || [],
  scheduledMessages: overrides.scheduledMessages || [],
  aiLogs: overrides.aiLogs || [],
  env: overrides.env || envOff
});

const baseFailureRehearsal = {
  verified: true,
  rows: buildPilotFailureRehearsalMatrix()
};

const summary = (overrides = {}) => buildPilotOnboardingSummary({
  hotel: overrides.hotel || baseHotel,
  users: overrides.users || baseUsers,
  pmsConnections: overrides.pmsConnections || basePms,
  knowledgeEntries: overrides.knowledgeEntries || baseKnowledge,
  localKnowledge: overrides.localKnowledge || [],
  operationalHealth: overrides.operationalHealth === undefined ? buildOperationalHealth(overrides) : overrides.operationalHealth,
  failureRehearsal: overrides.failureRehearsal === undefined ? baseFailureRehearsal : overrides.failureRehearsal,
  env: overrides.env || envOff,
  preferredPmsProvider: overrides.preferredPmsProvider || 'ubikos',
  role: overrides.role || 'admin',
  platformRole: overrides.platformRole || 'none',
  fallback: overrides.fallback || false
});

const block = (pilot, id) => pilot.blocks.find((item) => item.id === id);
const gate = (pilot, id) => pilot.readinessChecks.find((item) => item.id === id);

const invalidHotel = {
  ...baseHotel,
  name: '',
  city: '',
  timezone_integrity_status: 'unverified'
};
const invalidHotelBlock = evaluatePilotHotelProfile(invalidHotel);
assert.equal(invalidHotelBlock.status, PILOT_STATUS.ACTION_REQUIRED, 'invalid hotel -> no ready');
assert.equal(summary({ hotel: invalidHotel }).readyForGoLive, false, 'invalid hotel blocks go-live');

const verifiedHotelBlock = evaluatePilotHotelProfile(baseHotel);
assert.equal(verifiedHotelBlock.status, PILOT_STATUS.COMPLETED, 'verified hotel -> completed');

const noAdmin = summary({ users: [{ id: 'reception-1', role: 'receptionist', status: 'active' }] });
assert.equal(block(noAdmin, 'users').status, PILOT_STATUS.ACTION_REQUIRED, 'no manager/admin -> action required');
assert.equal(noAdmin.readyForGoLive, false, 'no manager/admin blocks go-live');

const ubikosWaiting = summary({ pmsConnections: [], preferredPmsProvider: 'ubikos' });
assert.equal(block(ubikosWaiting, 'pms').status, PILOT_STATUS.WAITING_EXTERNAL, 'Ubikos missing -> WAITING EXTERNAL');
assert.match(block(ubikosWaiting, 'pms').description, /Ubikos/i, 'Ubikos waiting state explains external dependency');
assert.equal(ubikosWaiting.readyForConfiguration, true, 'waiting Ubikos does not block READY FOR CONFIGURATION');
assert.equal(ubikosWaiting.readyForGoLive, false, 'waiting Ubikos blocks GO-LIVE');

const genericPmsMissing = summary({ pmsConnections: [], preferredPmsProvider: 'apaleo' });
assert.equal(block(genericPmsMissing, 'pms').status, PILOT_STATUS.ACTION_REQUIRED, 'PMS missing -> action state when no planned Ubikos wait');

const whatsappMissing = summary({ hotel: { ...baseHotel, whatsapp_number: '' } });
assert.equal(block(whatsappMissing, 'whatsapp').status, PILOT_STATUS.ACTION_REQUIRED, 'WhatsApp missing -> action required');
assert.equal(whatsappMissing.readyForGoLive, false, 'WhatsApp missing blocks GO-LIVE');

const knowledgeMissing = summary({ knowledgeEntries: [], localKnowledge: [] });
assert.equal(block(knowledgeMissing, 'knowledge').status, PILOT_STATUS.ACTION_REQUIRED, 'Knowledge missing -> action required');
assert.equal(knowledgeMissing.readyForGoLive, false, 'Knowledge missing blocks go-live');

const guestMemoryOff = summary();
assert.equal(gate(guestMemoryOff, 'guest_memory').value, PILOT_STATUS.COMPLETED, 'Guest Memory OFF recognized');

const guestMemoryOn = summary({ env: { ...envOff, GUEST_MEMORY_ENABLED: 'true' } });
assert.equal(gate(guestMemoryOn, 'guest_memory').value, PILOT_STATUS.ACTION_REQUIRED, 'Guest Memory ON blocks pilot');
assert.equal(guestMemoryOn.readyForGoLive, false, 'Guest Memory ON blocks go-live');

const legacyHumanFallbackFlagIgnored = summary({
  hotel: {
    ...baseHotel,
    metadata: { ...baseHotel.metadata, human_fallback_ready: false }
  },
  env: { ...envOff, PILOT_HUMAN_FALLBACK_READY: 'false' }
});
assert.equal(gate(legacyHumanFallbackFlagIgnored, 'human_fallback').value, PILOT_STATUS.COMPLETED, 'Human Fallback uses the real runtime gate, not the legacy readiness flag');

const observabilityMissing = summary({ operationalHealth: null });
assert.equal(gate(observabilityMissing, 'observability').value, PILOT_STATUS.ACTION_REQUIRED, 'Observability requires Pilot Health runtime status');
assert.equal(observabilityMissing.readyForPilotDemo, false, 'missing observability blocks pilot demo readiness');

const rehearsalUnverified = summary({
  failureRehearsal: {
    verified: false,
    rows: buildPilotFailureRehearsalMatrix()
  }
});
assert.equal(gate(rehearsalUnverified, 'failure_rehearsal').value, PILOT_STATUS.ACTION_REQUIRED, 'Failure Rehearsal is not completed just because tests exist');
assert.equal(rehearsalUnverified.readyForPilotDemo, false, 'unverified failure rehearsal blocks pilot demo readiness');

const killSwitchMissing = summary({
  hotel: {
    ...baseHotel,
    metadata: {
      security_baseline_passed: true,
      human_fallback_ready: true,
      kill_switch_ready: false
    }
  }
});
assert.equal(gate(killSwitchMissing, 'kill_switch').value, PILOT_STATUS.ACTION_REQUIRED, 'Kill Switch missing blocks GO-LIVE');
assert.equal(killSwitchMissing.readyForGoLive, false);

const killSwitchOffConfigured = summary({
  hotel: {
    ...baseHotel,
    metadata: { ...baseHotel.metadata, ai_auto_reply_enabled: false }
  }
});
assert.equal(gate(killSwitchOffConfigured, 'kill_switch').value, PILOT_STATUS.COMPLETED, 'Kill Switch OFF is a configured pilot-safe state');

assert.equal(canModifyPilotProtectedConfig({ role: 'receptionist', platformRole: 'none' }), false, 'receptionist cannot modify protected config');
assert.equal(canAccessRoute('receptionist', '/dashboard/onboarding'), false, 'receptionist cannot access onboarding route');
assert.equal(canModifyPilotProtectedConfig({ role: 'manager', platformRole: 'none' }), true, 'manager can complete permitted pilot setup');
assert.equal(canAccessRoute('manager', '/dashboard/onboarding'), true, 'manager can access pilot onboarding');

const ready = summary();
assert.equal(ready.readyForConfiguration, true, 'complete data is ready for configuration');
assert.equal(ready.readyForPilotDemo, true, 'complete data can be pilot-demo ready');
assert.equal(ready.readyForLiveAutomations, false, 'live automations remain blocked separately from pilot demo');
assert.equal(ready.readyForGoLive, true, 'legacy readyForGoLive mirrors pilot demo readiness');
assert.equal(getPilotCompletionRedirect(ready), '/dashboard/health', 'completion redirects to Pilot Readiness/Health');
assert.equal(getPilotCompletionRedirect(ubikosWaiting), '/dashboard/health', 'configuration completion redirects even while Ubikos waits');

const falseReadyCases = [
  summary({ hotel: invalidHotel }),
  noAdmin,
  ubikosWaiting,
  whatsappMissing,
  knowledgeMissing,
  guestMemoryOn,
  killSwitchMissing
];
assert.equal(falseReadyCases.some((item) => item.readyForPilotDemo), false, 'no false pilot-demo ready');

assert.equal(isRealPilotPmsConnection(basePms[0]), true, 'live PMS connection is real for go-live');
assert.equal(isRealPilotPmsConnection({ provider: 'ubikos', enabled: true, sync_status: 'pending_setup' }), false, 'Ubikos pending setup is not real go-live PMS');
assert.equal(evaluatePilotPms({ pmsConnections: [], preferredProvider: 'ubikos' }).status, PILOT_STATUS.WAITING_EXTERNAL);
assert.equal(normalizePilotOnboardingStep('hotel_setup'), 'hotel', 'legacy onboarding step maps to pilot hotel block');
assert.equal(normalizePilotOnboardingStep('completion'), 'readiness', 'legacy completion does not create dead wizard step');

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.equal(packageJson.scripts['test:pilot-onboarding'], 'node scripts/test-pilot-onboarding.js', 'package script registered');

const wizardSource = readFileSync(join(root, 'dashboard/components/onboarding/OnboardingWizard.js'), 'utf8');
assert.ok(wizardSource.includes('Ready for Configuration'), 'UI distinguishes Ready for Configuration');
assert.ok(wizardSource.includes('Ready for Pilot Demo'), 'UI distinguishes Ready for Pilot Demo');
assert.ok(wizardSource.includes('Ready for Live Automations'), 'UI distinguishes Ready for Live Automations');
assert.ok(wizardSource.includes('router.push'), 'completion redirects instead of leaving a dead wizard');
assert.ok(wizardSource.includes('Configurar PMS'), 'PMS blocker has CTA');
assert.ok(wizardSource.includes('Configurar Knowledge'), 'Knowledge blocker has CTA');
assert.ok(!wizardSource.includes('Generate starter knowledge base'), 'onboarding must not autogenerate Knowledge');

const onboardingApiSource = readFileSync(join(root, 'dashboard/app/api/onboarding/state/route.js'), 'utf8');
assert.ok(onboardingApiSource.includes('canModifyPilotProtectedConfig'), 'onboarding state writes are permission guarded');

console.log('Pilot onboarding tests passed');
