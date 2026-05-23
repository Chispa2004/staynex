import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONVERSATION_AI_MODES,
  getConversationAiMode,
  getHumanTakeoverState,
  isHumanControlledConversation
} from '../src/services/conversation-context.service.js';

const takeoverState = {
  state_metadata: {
    conversation_ai_mode: CONVERSATION_AI_MODES.HUMAN_TAKEOVER,
    human_takeover: {
      activated_by: { email: 'reception@example.com', role: 'receptionist' },
      activated_at: '2026-05-23T10:00:00.000Z',
      reason: 'angry_guest'
    }
  }
};

assert.equal(getConversationAiMode(null), CONVERSATION_AI_MODES.AI_ACTIVE, 'Default mode should be AI active');
assert.equal(getConversationAiMode(takeoverState), CONVERSATION_AI_MODES.HUMAN_TAKEOVER, 'Takeover mode should be read from state metadata');
assert.equal(isHumanControlledConversation(takeoverState), true, 'Human takeover should block automatic AI');
assert.equal(isHumanControlledConversation({ state_metadata: { conversation_ai_mode: CONVERSATION_AI_MODES.AI_PAUSED } }), true, 'AI paused should block automatic AI');
assert.equal(isHumanControlledConversation({ state_metadata: { conversation_ai_mode: CONVERSATION_AI_MODES.ESCALATION_LOCK } }), true, 'Escalation lock should block automatic AI');
assert.equal(isHumanControlledConversation({ state_metadata: { conversation_ai_mode: CONVERSATION_AI_MODES.AI_ACTIVE } }), false, 'AI active should allow automatic AI');

const parsedTakeover = getHumanTakeoverState(takeoverState);
assert.equal(parsedTakeover.activatedBy.email, 'reception@example.com', 'Takeover actor should persist');
assert.equal(parsedTakeover.reason, 'angry_guest', 'Takeover reason should persist');

const staynexService = readFileSync(new URL('../src/services/staynex.service.js', import.meta.url), 'utf8');
assert.match(staynexService, /human_takeover_ai_response_suppressed/, 'Guest processing should log suppressed AI replies');
assert.match(staynexService, /ai_suppressed_by_human_takeover/, 'Guest processing should return delivery metadata when AI is suppressed');

const messageQueueService = readFileSync(new URL('../src/services/message-queue.service.js', import.meta.url), 'utf8');
assert.match(messageQueueService, /automation_blocked_by_human_takeover/, 'Scheduled automations should be blocked during takeover');

const takeoverRoute = readFileSync(new URL('../dashboard/app/api/inbox/takeover/route.js', import.meta.url), 'utf8');
assert.match(takeoverRoute, /canAccess\(role, 'inbox'\)/, 'Takeover API should require inbox access');
assert.match(takeoverRoute, /platformRole === 'support'/, 'Support sessions should remain read-only');

console.log('Inbox human takeover checks passed');
