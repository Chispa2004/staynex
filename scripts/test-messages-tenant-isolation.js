import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMessage,
  resolveConversationHotelId
} from '../src/services/supabase.service.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const schema = read('supabase/schema.sql');
const stageA = read('supabase/sql/add_messages_tenant_isolation_p0_1_stage_a_expand.sql');
const stageAPreflight = read('supabase/sql/preflight_messages_tenant_isolation_p0_1_stage_a.sql');
const stageARollback = read('supabase/sql/rollback_messages_tenant_isolation_p0_1_stage_a.sql');
const stageB = read('supabase/sql/add_messages_tenant_isolation_p0_1_stage_b_contract.sql');
const stageBPreflight = read('supabase/sql/preflight_messages_tenant_isolation_p0_1_stage_b.sql');
const stageBRollback = read('supabase/sql/rollback_messages_tenant_isolation_p0_1_stage_b.sql');
const verification = read('supabase/sql/verify_messages_tenant_isolation_p0_1_stage_b.sql');
const docs = read('docs/messages-tenant-isolation-p0-1.md');
const supabaseService = read('src/services/supabase.service.js');
const messageService = read('src/services/message.service.js');
const staynexService = read('src/services/staynex.service.js');
const conversationContextService = read('src/services/conversation-context.service.js');
const inboxLib = read('dashboard/lib/inbox.js');
const inboxClient = read('dashboard/components/InboxClient.js');
const ticketDetail = read('dashboard/components/TicketDetail.js');
const ticketsLib = read('dashboard/lib/tickets.js');
const analyticsRoute = read('dashboard/app/api/analytics/route.js');
const guestMemoryRoute = read('dashboard/app/api/guest-memory/[guestId]/route.js');
const demoDataService = read('src/services/demo-data.service.js');
const onboardingDemoRoute = read('dashboard/app/api/onboarding/demo-data/route.js');
const packageJson = read('package.json');

const assertIncludes = (source, expected, message) => {
  assert.ok(source.includes(expected), message);
};

const assertNotIncludes = (source, unexpected, message) => {
  assert.equal(source.includes(unexpected), false, message);
};

const countMatches = (source, pattern) => source.match(pattern)?.length || 0;
const assertReadOnlySql = (source, label) => {
  const executableSql = source.replace(/^--.*$/gm, '');
  assert.equal(
    /(^|;)\s*(insert|update|delete|alter|create|drop|truncate)\b/i.test(executableSql),
    false,
    `${label} must not execute mutating statements`
  );
};
const quotedValues = (source) => [...source.matchAll(/'([^']+)'/g)].map((match) => match[1]);

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.insertRecord = null;
  }

  select(columns) {
    this.columns = columns;
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  insert(record) {
    this.insertRecord = record;
    return this;
  }

  async maybeSingle() {
    if (this.table !== 'conversations') {
      throw new Error(`Unexpected maybeSingle table ${this.table}`);
    }

    const id = this.filters.find((filter) => filter.column === 'id')?.value;
    const conversation = this.client.conversations.get(id) || null;
    return { data: conversation, error: this.client.conversationError || null };
  }

  async single() {
    if (this.table !== 'messages' || !this.insertRecord) {
      throw new Error(`Unexpected single operation for ${this.table}`);
    }

    if (this.client.insertError) {
      return { data: null, error: this.client.insertError };
    }

    const inserted = {
      id: `message-${this.client.insertedMessages.length + 1}`,
      ...this.insertRecord
    };
    this.client.insertedMessages.push(inserted);
    return { data: inserted, error: null };
  }
}

class FakeSupabase {
  constructor({ conversations = {}, insertError = null, conversationError = null } = {}) {
    this.conversations = new Map(Object.entries(conversations));
    this.insertedMessages = [];
    this.insertError = insertError;
    this.conversationError = conversationError;
  }

  from(table) {
    return new FakeQuery(this, table);
  }
}

// Schema and two-stage migration contract.
assertIncludes(schema, 'hotel_id uuid not null references hotels(id) on delete cascade', 'Final schema should define messages.hotel_id as NOT NULL');
assertIncludes(stageA, 'add column if not exists hotel_id uuid null references public.hotels(id) on delete cascade', 'Stage A should add nullable hotel_id');
assertNotIncludes(stageA, 'alter column hotel_id set not null', 'Stage A must not enforce NOT NULL');
assertNotIncludes(stageA, 'enable row level security', 'Stage A must not enable restrictive RLS');
assertIncludes(stageA, 'set hotel_id = c.hotel_id', 'Stage A backfill should derive hotel_id from conversations');
assertIncludes(stageA, 'from public.conversations c', 'Stage A should join conversations for backfill');
assertIncludes(stageA, 'messages_conversation_hotel_match_fk', 'Stage A should add composite FK infrastructure');
assertIncludes(stageA, 'messages_hotel_conversation_created_idx', 'Stage A should add tenant/history index');
assertIncludes(stageA, 'NULL legacy rows pass PostgreSQL FK semantics during expand', 'Stage A should document nullable FK semantics');
assert.equal(/staynex-demo|first hotel|metadata|phone/i.test(stageA), false, 'Stage A must not infer tenants from demo/default/metadata/phone');

assertIncludes(stageB, 'update public.messages m', 'Stage B should re-backfill before final guard');
assertIncludes(stageB, 'alter column hotel_id set not null', 'Stage B should enforce NOT NULL');
assertIncludes(stageB, 'alter table public.messages enable row level security', 'Stage B should enable RLS');
assertIncludes(stageB, 'staynex_tenant_read_messages', 'Stage B should create SELECT policy');
assertIncludes(stageB, 'public.staynex_can_read_hotel(hotel_id)', 'Stage B SELECT should use tenant read helper');
assertIncludes(stageB, 'Do not create authenticated INSERT/UPDATE/DELETE policies', 'Stage B should document server-only writes');
assertIncludes(stageB, 'drop policy if exists staynex_tenant_insert_messages', 'Stage B should remove legacy/authenticated insert policy if present');
assertNotIncludes(stageB, 'create policy staynex_tenant_insert_messages', 'Stage B must not create authenticated INSERT policy');
assertNotIncludes(stageB, 'create policy staynex_tenant_update_messages', 'Stage B must not create authenticated UPDATE policy');
assertNotIncludes(stageB, 'create policy staynex_tenant_delete_messages', 'Stage B must not create authenticated DELETE policy');
assertIncludes(stageB, 'grant select on public.messages to authenticated', 'Stage B should grant authenticated SELECT only');
assertNotIncludes(stageB, 'grant select, insert, update, delete on public.messages to authenticated', 'Stage B must not grant authenticated writes');

assertIncludes(stageAPreflight, 'ready_for_stage_a', 'Stage A preflight should summarize readiness');
assertIncludes(stageAPreflight, 'staynex_can_read_hotel_exists', 'Stage A preflight should diagnose read helper');
assertIncludes(stageAPreflight, 'staynex_can_write_hotel_exists', 'Stage A preflight should diagnose write helper');
assertIncludes(stageBPreflight, 'ready_for_stage_b', 'Stage B preflight should summarize readiness');
assertIncludes(stageBPreflight, 'hotel_id_null_count', 'Stage B preflight should report NULL hotel_id rows');
assertIncludes(stageBPreflight, 'tenant_mismatch_count', 'Stage B preflight should report tenant mismatches');
assertIncludes(stageBPreflight, 'realtime_publication_exists', 'Stage B preflight should diagnose Realtime publication');
assertIncludes(stageBPreflight, 'messages_rls_enabled_before_stage_b', 'Stage B preflight should expose the pre-contract RLS baseline');
assertIncludes(stageBPreflight, "pubname = 'supabase_realtime'", 'Stage B preflight should check the Supabase Realtime publication specifically');
assertIncludes(stageBPreflight, "'realtime_publication_exists', checks.realtime_publication_exists", 'Stage B preflight summary should expose Realtime readiness');
const stageBReadyExpression = stageBPreflight.match(/'ready_for_stage_b',([\s\S]*?)\) as stage_b_summary/)?.[1] || '';
assertIncludes(stageBReadyExpression, 'checks.realtime_publication_exists', 'Stage B readiness must fail closed when messages is missing from Realtime publication');
assertReadOnlySql(stageBPreflight, 'Stage B preflight');
assertIncludes(verification, 'authenticated_write_policy_absent', 'Verification should assert write policies are absent');
assertIncludes(verification, 'select_policy_authenticated_exists', 'Verification should assert SELECT policy applies to authenticated');
assertIncludes(verification, "roles && array['authenticated']::name[]", 'Verification should inspect authenticated SELECT policy roles using array membership');
assertIncludes(verification, "cmd in ('INSERT', 'UPDATE', 'DELETE')", 'Verification should inspect authenticated write policy commands');
assertIncludes(verification, "roles && array['authenticated', 'public']::name[]", 'Verification should treat authenticated and public write policies as browser-write exposure');
const writePolicyClause = verification.match(/cmd in \(([^)]+)\)\s+and roles && array\[([^\]]+)\]::name\[\]/s);
assert.ok(writePolicyClause, 'Verification should bind write policy commands to dangerous browser roles');
const dangerousWriteCommands = new Set(quotedValues(writePolicyClause[1]));
const dangerousWriteRoles = new Set(quotedValues(writePolicyClause[2]));
['INSERT', 'UPDATE', 'DELETE'].forEach((command) => {
  assert.ok(dangerousWriteCommands.has(command), `Verification should flag ${command} write policies`);
  assert.ok(dangerousWriteRoles.has('authenticated'), `Verification should flag ${command} TO authenticated`);
  assert.ok(dangerousWriteRoles.has('public'), `Verification should flag ${command} TO public`);
});
assert.equal(dangerousWriteRoles.has('service_role'), false, 'Verification should not confuse service_role with browser write exposure');
assertIncludes(verification, "pubname = 'supabase_realtime'", 'Verification should check the Supabase Realtime publication specifically');
assertReadOnlySql(verification, 'Stage B verification');
assertIncludes(verification, 'stage_b_verification', 'Verification SQL should provide a post-contract summary');
assertIncludes(stageARollback, 'drop column if exists hotel_id', 'Stage A rollback should remove hotel_id only after code rollback');
assertIncludes(stageBRollback, 'alter column hotel_id drop not null', 'Stage B rollback should return to nullable Stage A state');
assertIncludes(stageBRollback, 'alter table public.messages enable row level security', 'Stage B rollback should preserve the production RLS-enabled baseline');
assertNotIncludes(stageBRollback, 'disable row level security', 'Stage B rollback must not open messages by disabling RLS');
assertNotIncludes(stageBRollback, 'drop column if exists hotel_id', 'Stage B rollback must keep hotel_id for new code');
assertIncludes(docs, '`messages` RLS is already enabled', 'Docs should record production RLS drift baseline');
assertIncludes(docs, 'Do not disable RLS', 'Docs should preserve fail-closed Realtime guidance');

// Insert paths and app-side contract.
assertIncludes(supabaseService, 'resolveConversationHotelId', 'Message service should centralize tenant resolution');
assertIncludes(supabaseService, ".from('conversations')", 'Message service should read conversation before insert');
assertIncludes(supabaseService, ".select('hotel_id')", 'Message service should select conversation.hotel_id');
assertIncludes(supabaseService, 'expectedHotelId', 'Message service should check caller hotel context when supplied');
assertIncludes(supabaseService, 'Conversation tenant could not be resolved', 'Missing conversation hotel must fail closed');
assertIncludes(supabaseService, 'Conversation not found in active workspace', 'Mismatched hotel must fail closed');
assertIncludes(supabaseService, 'hotel_id: conversationHotelId', 'Message inserts must use derived conversation hotel_id');
assertIncludes(supabaseService, 'client = getSupabase()', 'createMessage should support injectable client while defaulting to production Supabase');
assertIncludes(messageService, 'hotelId is required', 'Manual staff send should require hotelId');
assertIncludes(messageService, 'hotelId,', 'Manual staff send should pass hotelId into createMessage');
assert.ok(countMatches(staynexService, /createMessage\(\{\s*conversationId: conversation\.id,\s*hotelId: activeHotel\.id/gs) >= 3, 'Inbound, system AI event and AI reply should pass activeHotel.id');
assertIncludes(demoDataService, 'hotel_id: hotelId', 'Demo message inserts should include hotel_id');
assertIncludes(onboardingDemoRoute, 'hotel_id: hotelId', 'Onboarding demo message inserts should include hotel_id');

// Read paths and compatibility with temporary legacy NULL rows.
assertIncludes(supabaseService, 'getRecentMessages = async ({ conversationId, hotelId = null', 'Recent message reads should require hotel context');
assertIncludes(supabaseService, ".eq('hotel_id', hotelId)", 'Recent message reads should filter by hotel_id');
assertIncludes(conversationContextService, 'hotelId: hotel?.id || null', 'Conversation context should pass hotelId to recent messages');
assertIncludes(inboxLib, 'getMessagesForConversations = async ({ supabase, conversationIds, hotelId })', 'Inbox message loader should require hotelId');
assertIncludes(inboxLib, ".eq('hotel_id', hotelId)", 'Inbox message loader should filter messages by hotel_id');
assertIncludes(ticketsLib, ".eq('hotel_id', hotelId)", 'Ticket detail messages should filter by hotel_id');
assertIncludes(analyticsRoute, ".eq('hotel_id', hotelId)", 'Analytics message reads should filter by hotel_id');
assertIncludes(guestMemoryRoute, ".eq('hotel_id', hotel.id)", 'Guest memory message reads should filter by hotel_id');

// Realtime and payload defense.
assertIncludes(inboxClient, 'const activeHotelId = currentHotel?.id || null', 'Inbox Realtime should resolve active hotel once per channel');
assertIncludes(inboxClient, 'active hotel is required', 'Inbox should avoid global messages subscription without current hotel');
assertIncludes(inboxClient, 'filter: `hotel_id=eq.${activeHotelId}`', 'Inbox Realtime should filter messages by hotel_id');
assertIncludes(inboxClient, 'payloadHotelId !== activeHotelId', 'Inbox should ignore payloads outside active hotel');
assertIncludes(inboxClient, 'supabase.removeChannel(channel)', 'Inbox hotel switch should cleanup previous channel');
assert.equal(inboxClient.includes("dashboard-inbox-${currentHotel?.id || 'all'}"), false, 'Inbox must not keep global fallback channel');
assertIncludes(ticketDetail, 'filter: `hotel_id=eq.${activeHotelId}`', 'Ticket Realtime should filter messages by hotel_id');
assertIncludes(ticketDetail, 'payload?.new?.hotel_id !== activeHotelId', 'Ticket Realtime should ignore cross-hotel payloads');
assertIncludes(ticketDetail, 'supabase.removeChannel(messagesChannel)', 'Ticket Realtime should cleanup messages channel');

// Documentation and regression hooks.
assertIncludes(docs, 'Phase A - Expand', 'Docs should describe Stage A rollout');
assertIncludes(docs, 'Phase B - Contract', 'Docs should describe Stage B rollout');
assertIncludes(docs, 'Real DB RLS behavior must be verified after Stage B', 'Docs should not overstate static SQL tests');
assertIncludes(packageJson, '"test:messages-tenant-isolation": "node scripts/test-messages-tenant-isolation.js"', 'Package script should expose P0-1 test');
assertIncludes(inboxLib, 'return conversations.map((conversation) =>', 'Inbox should still assemble own conversations');
assertIncludes(messageService, 'sendWhatsAppMessage', 'Manual staff send should still send WhatsApp logically');
assertIncludes(staynexService, 'sendReply', 'Inbound Twilio path should still support replies');

// Functional createMessage tests using product code with a fake Supabase client.
const happyClient = new FakeSupabase({
  conversations: {
    'conversation-a': { id: 'conversation-a', hotel_id: 'hotel-a' }
  }
});
assert.equal(
  await resolveConversationHotelId({
    conversationId: 'conversation-a',
    expectedHotelId: 'hotel-a',
    client: happyClient
  }),
  'hotel-a',
  'resolveConversationHotelId should return conversation.hotel_id'
);
const happyMessage = await createMessage({
  conversationId: 'conversation-a',
  hotelId: 'hotel-a',
  senderType: 'guest',
  content: 'Hola',
  client: happyClient
});
assert.equal(happyMessage.hotel_id, 'hotel-a', 'createMessage should insert derived Hotel A');
assert.equal(happyClient.insertedMessages[0].hotel_id, 'hotel-a', 'Inserted record should use derived Hotel A');

const internalClient = new FakeSupabase({
  conversations: {
    'conversation-a': { id: 'conversation-a', hotel_id: 'hotel-a' }
  }
});
const internalMessage = await createMessage({
  conversationId: 'conversation-a',
  senderType: 'ai',
  content: 'Respuesta',
  metadata: { hotel_id: 'hotel-b' },
  client: internalClient
});
assert.equal(internalMessage.hotel_id, 'hotel-a', 'Missing expected hotel should still derive tenant from conversation');
assert.equal(internalClient.insertedMessages[0].metadata.hotel_id, 'hotel-b', 'Metadata may contain arbitrary data but cannot override top-level hotel_id');

await assert.rejects(
  () => resolveConversationHotelId({
    conversationId: 'missing-conversation',
    expectedHotelId: 'hotel-a',
    client: new FakeSupabase()
  }),
  /Conversation not found/,
  'Missing conversation should fail closed'
);

await assert.rejects(
  () => createMessage({
    conversationId: 'conversation-null-hotel',
    senderType: 'guest',
    content: 'Hola',
    client: new FakeSupabase({
      conversations: {
        'conversation-null-hotel': { id: 'conversation-null-hotel', hotel_id: null }
      }
    })
  }),
  /Conversation tenant could not be resolved/,
  'Conversation with NULL hotel_id should fail closed'
);

const mismatchClient = new FakeSupabase({
  conversations: {
    'conversation-a': { id: 'conversation-a', hotel_id: 'hotel-a' }
  }
});
await assert.rejects(
  () => createMessage({
    conversationId: 'conversation-a',
    hotelId: 'hotel-b',
    senderType: 'staff',
    content: 'Wrong hotel',
    client: mismatchClient
  }),
  /Conversation not found in active workspace/,
  'Expected hotel mismatch should fail closed'
);
assert.equal(mismatchClient.insertedMessages.length, 0, 'Mismatch should not insert');

const insertError = new Error('insert failed');
await assert.rejects(
  () => createMessage({
    conversationId: 'conversation-a',
    hotelId: 'hotel-a',
    senderType: 'guest',
    content: 'Hola',
    client: new FakeSupabase({
      conversations: {
        'conversation-a': { id: 'conversation-a', hotel_id: 'hotel-a' }
      },
      insertError
    })
  }),
  /insert failed/,
  'Supabase insert errors should propagate'
);

console.log('Messages tenant isolation checks passed');
