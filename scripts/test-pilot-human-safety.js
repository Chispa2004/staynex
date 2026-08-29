import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PILOT_AI_GATE_REASONS,
  PILOT_AI_SAFETY_RUNTIME,
  buildSuppressedAiResponse,
  getHotelAiAutoReplyStatus,
  shouldAiAutoRespond
} from '../shared/pilot/ai-safety.js';
import {
  CONVERSATION_AI_MODES
} from '../src/services/conversation-context.service.js';
import {
  canAccessPlatform,
  canManageHumanTakeover
} from '../dashboard/lib/permissions.js';
import {
  PILOT_STATUS,
  buildPilotOnboardingSummary,
  evaluatePilotHumanFallback,
  evaluatePilotKillSwitch,
  evaluatePilotSendAutomations
} from '../dashboard/lib/pilot-onboarding.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');

const envSafe = {
  GUEST_MEMORY_ENABLED: 'false',
  SEND_AUTOMATIONS: 'false',
  PILOT_SECURITY_BASELINE_PASSED: 'true'
};

const hotelOn = {
  id: 'hotel-pilot',
  name: 'Pilot Hotel',
  country_code: 'ES',
  city: 'Palma',
  timezone: 'Europe/Madrid',
  timezone_integrity_status: 'verified',
  whatsapp_number: '+34123456789',
  metadata: {
    security_baseline_passed: true,
    ai_auto_reply_enabled: true
  }
};

const hotelOff = {
  ...hotelOn,
  metadata: {
    ...hotelOn.metadata,
    ai_auto_reply_enabled: false
  }
};

const activeConversationState = {
  state_metadata: {
    conversation_ai_mode: CONVERSATION_AI_MODES.AI_ACTIVE
  }
};

const takeoverConversationState = {
  state_metadata: {
    conversation_ai_mode: CONVERSATION_AI_MODES.HUMAN_TAKEOVER,
    human_takeover: {
      activated_by: { user_id: 'user-1', role: 'receptionist' },
      activated_at: '2026-08-29T09:00:00.000Z'
    }
  }
};

const countAiCalls = (gate) => {
  let aiCalls = 0;

  if (gate.allowed) {
    aiCalls += 1;
  }

  return aiCalls;
};

const baseSummary = (hotel = hotelOn) => buildPilotOnboardingSummary({
  hotel,
  users: [{ id: 'admin-1', email: 'admin@example.com', role: 'admin', status: 'active' }],
  pmsConnections: [{
    id: 'pms-1',
    provider: 'apaleo',
    enabled: true,
    sync_status: 'connected',
    credential_configured: true,
    has_client_secret: true,
    connection_mode: 'live_api'
  }],
  knowledgeEntries: [{ id: 'kb-1', key: 'wifi', value: 'WiFi disponible.', is_active: true }],
  localKnowledge: [],
  env: envSafe,
  preferredPmsProvider: 'apaleo',
  role: 'admin',
  platformRole: 'none',
  fallback: false
});

const normalGate = shouldAiAutoRespond({
  hotel: hotelOn,
  conversationState: activeConversationState,
  env: envSafe
});
assert.equal(normalGate.allowed, true, '1. normal conversation AI allowed when all gates ON');
assert.equal(countAiCalls(normalGate), 1, '1. normal gate permits one AI call');

const takeoverGate = shouldAiAutoRespond({
  hotel: hotelOn,
  conversationState: takeoverConversationState,
  env: envSafe
});
assert.equal(takeoverGate.allowed, false, '2. human takeover blocks automatic AI');
assert.equal(takeoverGate.reason, PILOT_AI_GATE_REASONS.HUMAN_TAKEOVER_ACTIVE);
assert.equal(countAiCalls(takeoverGate), 0, '2. takeover -> AI count 0');

assert.equal(PILOT_AI_SAFETY_RUNTIME.manualRepliesBypassAutoReplyGate, true, '3. manual reply still allowed during takeover');

const routeSource = readFileSync(join(root, 'dashboard/app/api/inbox/takeover/route.js'), 'utf8');
assert.match(routeSource, /action === 'takeover' \? AI_MODE\.HUMAN_TAKEOVER : AI_MODE\.ACTIVE/, '4. resume AI only changes state');
assert.doesNotMatch(routeSource, /processGuestMessageFn|processGuestMessage\(/, '4. resume AI does not process old messages');

const resumedGate = shouldAiAutoRespond({
  hotel: hotelOn,
  conversationState: {
    state_metadata: {
      conversation_ai_mode: CONVERSATION_AI_MODES.AI_ACTIVE,
      human_takeover: takeoverConversationState.state_metadata.human_takeover
    }
  },
  env: envSafe
});
assert.equal(resumedGate.allowed, true, '5. next inbound after resume can use AI');

const hotelOffGate = shouldAiAutoRespond({
  hotel: hotelOff,
  conversationState: activeConversationState,
  env: envSafe
});
assert.equal(hotelOffGate.allowed, false, '6. hotel kill OFF blocks automatic AI');
assert.equal(hotelOffGate.reason, PILOT_AI_GATE_REASONS.HOTEL_AI_AUTO_REPLY_OFF);
assert.equal(countAiCalls(hotelOffGate), 0, '6. hotel kill OFF -> AI count 0');

const globalOffGate = shouldAiAutoRespond({
  hotel: hotelOn,
  conversationState: activeConversationState,
  env: {
    ...envSafe,
    STAYNEX_GLOBAL_AI_AUTO_REPLY: 'off'
  }
});
assert.equal(globalOffGate.allowed, false, '7. global kill OFF blocks automatic AI');
assert.equal(globalOffGate.reason, PILOT_AI_GATE_REASONS.GLOBAL_KILL_SWITCH_OFF);
assert.equal(countAiCalls(globalOffGate), 0, '7. global kill OFF -> AI count 0 regardless hotel');

const stateFailureGate = shouldAiAutoRespond({
  hotel: hotelOn,
  conversationState: null,
  stateLookupFailed: true,
  env: envSafe
});
assert.equal(stateFailureGate.allowed, false, '8. state lookup failure blocks automatic AI');
assert.equal(stateFailureGate.reason, PILOT_AI_GATE_REASONS.STATE_LOOKUP_FAILED);
assert.equal(countAiCalls(stateFailureGate), 0, '8. state lookup failure -> AI count 0');

const aiFailure = buildSuppressedAiResponse({ reason: PILOT_AI_GATE_REASONS.AI_PROVIDER_FAILURE });
assert.equal(aiFailure.reply, null, '9. AI failure does not invent a guest reply');
assert.equal(aiFailure.escalate_to_human, true, '9. AI failure marks human attention required');

assert.match(routeSource, /\.eq\('hotel_id', hotel\.id\)/, '10. unauthorized cross-hotel takeover denied by hotel scope');
assert.equal(canManageHumanTakeover({ role: 'receptionist', platformRole: 'none' }), true, '11. receptionist own-hotel takeover permitted');
assert.equal(canManageHumanTakeover({ role: 'receptionist', platformRole: 'support' }), false, '11. support remains read-only');
assert.equal(canAccessPlatform('platform_admin', 'platform_console'), true, '11. platform admin has platform authority');

const fallbackReady = evaluatePilotHumanFallback({
  hotel: {
    ...hotelOn,
    metadata: {
      ...hotelOn.metadata,
      human_fallback_ready: false
    }
  },
  env: {
    ...envSafe,
    PILOT_HUMAN_FALLBACK_READY: 'false'
  }
});
assert.equal(fallbackReady.status, PILOT_STATUS.COMPLETED, '12. onboarding fallback readiness uses real runtime status');

const killReadyOn = evaluatePilotKillSwitch({ hotel: hotelOn, env: envSafe });
const killReadyOff = evaluatePilotKillSwitch({ hotel: hotelOff, env: envSafe });
const killMissing = evaluatePilotKillSwitch({
  hotel: {
    ...hotelOn,
    metadata: { security_baseline_passed: true }
  },
  env: envSafe
});
assert.equal(killReadyOn.status, PILOT_STATUS.COMPLETED, '13. onboarding kill-switch readiness accepts configured ON');
assert.equal(killReadyOff.status, PILOT_STATUS.COMPLETED, '13. onboarding kill-switch readiness accepts configured OFF');
assert.equal(killMissing.status, PILOT_STATUS.ACTION_REQUIRED, '13. onboarding kill-switch readiness requires durable hotel state');

assert.equal(evaluatePilotSendAutomations(envSafe).status, PILOT_STATUS.COMPLETED, '14. SEND_AUTOMATIONS remains false/unmodified');
assert.equal(envSafe.SEND_AUTOMATIONS, 'false', '14. test keeps SEND_AUTOMATIONS disabled');

const staynexSource = readFileSync(join(root, 'src/services/staynex.service.js'), 'utf8');
const prepareBlock = staynexSource.slice(
  staynexSource.indexOf('export const prepareInboundGuestMessageForProcessing'),
  staynexSource.indexOf('const buildGateDeliveryMetadata')
);
assert.ok(
  prepareBlock.indexOf('resolveAiAutoResponseGate') < prepareBlock.indexOf('translateForStaff'),
  '15. no real OpenAI translation before the central auto-response gate'
);
assert.ok(staynexSource.includes('failClosedOnProviderFailure: true'), '15. automatic inbound uses fail-closed OpenAI behavior');
assert.ok(staynexSource.includes('sent_via_twilio: false'), '15. blocked automatic inbound does not call Twilio');

const messageServiceSource = readFileSync(join(root, 'src/services/message.service.js'), 'utf8');
assert.ok(messageServiceSource.includes('sendStaffMessage'), '15. manual staff message path remains separate');

const fullSummary = baseSummary();
assert.equal(fullSummary.gates.humanFallback.status, PILOT_STATUS.COMPLETED, 'Human Fallback gate is closed for pilot');
assert.equal(fullSummary.gates.killSwitch.status, PILOT_STATUS.COMPLETED, 'Kill Switch gate is closed when hotel state is configured');
assert.equal(getHotelAiAutoReplyStatus({ id: 'hotel-missing', metadata: {} }).allowed, false, 'missing hotel kill switch state fails closed');

console.log('Pilot human safety tests passed');
