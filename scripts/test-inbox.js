import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONVERSATION_AI_MODES,
  getConversationAiMode,
  getHumanTakeoverState,
  isHumanControlledConversation
} from '../src/services/conversation-context.service.js';

const loadInboxModuleForTest = () => {
  const source = readFileSync(new URL('../dashboard/lib/inbox.js', import.meta.url), 'utf8')
    .replace("import { getSupabaseAdmin } from './supabase';\n", '')
    .replace("import { buildConversationCopilot } from './ai-copilot';\n", '')
    .replace("import { isGuestMemoryEnabled } from '../../shared/guest-memory/feature-flag.js';\n", '')
    .replace('export const getInboxConversations', 'const getInboxConversations');

  return new Function(
    'getSupabaseAdmin',
    'buildConversationCopilot',
    'isGuestMemoryEnabled',
    `${source}\nreturn { getInboxConversations };`
  )(
    () => {
      throw new Error('Unexpected default Supabase admin access in inbox test');
    },
    () => null,
    () => false
  );
};

const sortRows = (rows, field, { ascending = true } = {}) => [...rows].sort((left, right) => {
  const leftValue = left[field] ?? '';
  const rightValue = right[field] ?? '';

  if (leftValue === rightValue) {
    return 0;
  }

  return (leftValue > rightValue ? 1 : -1) * (ascending ? 1 : -1);
});

class FakeSupabaseQuery {
  constructor(tableName, rows, options) {
    this.tableName = tableName;
    this.rows = rows;
    this.options = options;
    this.filters = [];
    this.orderBy = null;
    this.limitCount = null;
    this.selectClause = '';
  }

  select(selectClause) {
    this.selectClause = selectClause;
    return this;
  }

  eq(field, value) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field, values) {
    const allowed = new Set(values || []);
    this.filters.push((row) => allowed.has(row[field]));
    return this;
  }

  order(field, options = {}) {
    this.orderBy = { field, options };
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  then(resolve, reject) {
    try {
      resolve(this.execute());
    } catch (error) {
      reject(error);
    }
  }

  execute() {
    if (
      this.tableName === 'guests'
      && this.options.guestIdentityColumnsMissing
      && /(?:^|,\s*)(?:name|full_name)(?:\s*,|$)/.test(this.selectClause)
    ) {
      return {
        data: null,
        error: { message: "Could not find the 'name' column of 'guests' in the schema cache" }
      };
    }

    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.orderBy) {
      data = sortRows(data, this.orderBy.field, this.orderBy.options);
    }

    if (Number.isFinite(this.limitCount)) {
      data = data.slice(0, this.limitCount);
    }

    return { data, error: null };
  }
}

const createFakeSupabase = (tables, options = {}) => ({
  from(tableName) {
    return new FakeSupabaseQuery(tableName, tables[tableName] || [], options);
  }
});

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
assert.match(takeoverRoute, /canManageHumanTakeover/, 'Takeover API should require human takeover permission');
assert.match(takeoverRoute, /platformRole === 'support'/, 'Support sessions should remain read-only');
assert.match(takeoverRoute, /writeEnterpriseAuditLog/, 'Takeover changes should write a PII-safe audit event');

const { getInboxConversations } = loadInboxModuleForTest();
const luciaName = 'Luc\u00eda Mart\u00edn';
const hotelA = 'hotel-checkin';
const hotelB = 'hotel-other';

const baseTables = {
  conversations: [
    {
      id: 'conversation-lucia',
      hotel_id: hotelA,
      guest_id: 'guest-lucia',
      status: 'active',
      last_message_at: '2026-09-01T10:00:00.000Z',
      created_at: '2026-09-01T09:00:00.000Z'
    }
  ],
  guests: [
    {
      id: 'guest-lucia',
      hotel_id: hotelA,
      phone_number: '+15005550001',
      current_room: null,
      preferred_language: 'es'
    }
  ],
  messages: [
    {
      id: 'message-lucia',
      conversation_id: 'conversation-lucia',
      hotel_id: hotelA,
      sender_type: 'guest',
      content: 'Necesito dos toallas',
      created_at: '2026-09-01T10:00:00.000Z'
    }
  ],
  reservations: [
    {
      id: 'reservation-lucia',
      hotel_id: hotelA,
      guest_id: 'legacy-guest-link',
      guest_name: luciaName,
      guest_phone: '+15005550001',
      room_number: '208',
      room_type: 'Double',
      arrival_date: '2026-09-01',
      departure_date: '2026-09-04',
      status: 'checked_in',
      pms_provider: 'ubikos',
      pms_reservation_id: 'CHECKIN-DEMO-LUCIA',
      source: 'checkin_demo'
    },
    {
      id: 'reservation-other-tenant',
      hotel_id: hotelB,
      guest_id: 'guest-lucia',
      guest_name: 'Wrong Tenant',
      guest_phone: '+15005550001',
      room_number: '999',
      arrival_date: '2026-09-01',
      departure_date: '2026-09-04',
      status: 'checked_in'
    }
  ]
};

const inboxConversations = await getInboxConversations({
  supabase: createFakeSupabase(baseTables, { guestIdentityColumnsMissing: true }),
  hotelId: hotelA
});

assert.equal(inboxConversations.length, 1, 'Inbox should return the same-tenant conversation');
assert.equal(inboxConversations[0].guest.name, luciaName, 'Inbox should resolve guest identity from same-tenant reservation data');
assert.equal(inboxConversations[0].guest.current_room, '208', 'Lucia fixture should resolve room 208 from reservation data');
assert.equal(inboxConversations[0].guest.phone_number, '+15005550001', 'Phone should remain available as secondary identity');
assert.notEqual(inboxConversations[0].guest.name, 'Wrong Tenant', 'Inbox must never resolve identity from another tenant');

const phoneFallbackConversations = await getInboxConversations({
  supabase: createFakeSupabase({
    ...baseTables,
    reservations: baseTables.reservations.filter((reservation) => reservation.hotel_id !== hotelA)
  }, { guestIdentityColumnsMissing: true }),
  hotelId: hotelA
});

assert.equal(phoneFallbackConversations[0].guest.name, null, 'Missing same-tenant name should not invent an identity');
assert.equal(phoneFallbackConversations[0].guest.phone_number, '+15005550001', 'Phone remains the safe fallback when no name exists');

const inboxSource = readFileSync(new URL('../dashboard/lib/inbox.js', import.meta.url), 'utf8');
const inboxComponentSource = readFileSync(new URL('../dashboard/components/InboxClient.js', import.meta.url), 'utf8');
assert.match(inboxSource, /getReservationIdentityLookups/, 'Inbox should use reservation identity lookups');
assert.match(inboxSource, /\.eq\('hotel_id', hotelId\)[\s\S]*?\.in\('guest_phone', phoneValues\)/, 'Reservation phone fallback must stay scoped to the active hotel');
assert.match(inboxSource, /guest\?\.name \|\| guest\?\.full_name \|\| reservation\?\.guest_name/, 'Guest and reservation names should outrank phone fallback');
assert.doesNotMatch(inboxComponentSource, /Luc(?:i|\\u00ed)a Mart(?:i|\\u00ed)n/, 'Inbox UI must not hardcode the demo guest name');

console.log('Inbox human takeover checks passed');
