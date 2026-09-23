import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isGuestMemoryEnabled } from '../../shared/guest-memory/feature-flag.js';
import { canAccess } from '../../dashboard/lib/permissions.js';
import { buildConversationDashboard, loadConversationDashboardSources } from '../../dashboard/lib/hotel-operations-workspace.js';
import { loadAttentionDashboard } from '../../dashboard/lib/message-attention.js';
import { pmsConnectionSelectForSurface, serializePmsConnectionsSafe } from '../../shared/pms/safe-connection.js';
import { getPilotAiSafetyReadiness } from '../../shared/pilot/ai-safety.js';

const load = (file, bindings, names) => new Function(...Object.keys(bindings),
  readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replaceAll('export const ', 'const ').replaceAll('export async function ', 'async function ')
    + `\nreturn {${names.join(',')}};`)(...Object.values(bindings));
const logger = { info() {}, warn() {}, error() {} };
const NextResponse = { json: (body, options = {}) => ({ body, status: options.status || 200 }) };
const spyDb = () => {
  const calls = [];
  return { calls, rpc: async name => { calls.push({ table: name }); return { data: null, error: null }; }, from(table) {
    calls.push({ table }); assert.notEqual(table, 'guest_memory', 'OFF must never touch legacy memory');
    let payload = null, single = false;
    const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
      upsert(value) { payload = value; calls.push({ table, payload: value }); return query; },
      insert(value) { payload = value; calls.push({ table, payload: value }); return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) { return Promise.resolve({ data: payload || (single ? {} : []), count: 0, error: null }).then(resolve, reject); }
    }; return query;
  } };
};

export const assertExecutiveMemoryOff = async () => {
  const supabase = spyDb();
  const { GET } = load('dashboard/app/api/executive-dashboard/route.js', {
    NextResponse, canAccess, getCurrentHotelForRequest: async () => ({ supabase, hotel: { id: 'synthetic', timezone: 'UTC' }, role: 'admin' }),
    buildConversationDashboard, loadConversationDashboardSources, loadAttentionDashboard,
    pmsConnectionSelectForSurface, serializePmsConnectionsSafe, getPilotAiSafetyReadiness
  }, ['GET']);
  const result = await GET({ url: 'http://localhost/api/executive-dashboard' });
  assert.equal(result.status, 200); assert.ok(result.body.conversationDashboard);
  assert.ok(supabase.calls.length > 0); assert.ok(!supabase.calls.some(call => call.table === 'guest_memory'));
  assert.ok(!JSON.stringify(result.body).includes('dietary_gluten_allergy'));
};

export const assertMemoryOffBoundaries = async () => {
  assert.equal(isGuestMemoryEnabled(), false);
  // Execute real handlers with authorized context and a database trap. A 403
  // cannot accidentally satisfy the disabled-feature check.
  let touched = 0;
  const bindings = { NextResponse, canAccess, isGuestMemoryEnabled,
    getCurrentHotelForRequest: async () => ({ hotel: { id: 'synthetic' }, role: 'admin',
      supabase: { from() { touched++; throw new Error('OFF database trap'); } } }) };
  const handlers = load('dashboard/app/api/guest-memory/route.js', bindings, ['GET', 'PATCH', 'DELETE']);
  for (const handler of Object.values(handlers)) {
    const response = await handler({ json: async () => ({ id: 'legacy', memory_value: 'changed' }) });
    assert.equal(response.body.status, 'feature_disabled'); assert.equal(response.body.disabled, true);
  }
  const detail = load('dashboard/app/api/guest-memory/[guestId]/route.js', bindings, ['GET']);
  const result = await detail.GET({}, { params: Promise.resolve({ guestId: 'synthetic' }) });
  assert.equal(result.body.disabled, true); assert.deepEqual(result.body.raw.memories, []); assert.equal(touched, 0);
  console.log('PASS OFF: list/detail/PATCH/DELETE handlers block memory DB access');
  await assertExecutiveMemoryOff();
  console.log('PASS OFF: executive handler and real source loaders do not read legacy memory');

  // Captured provider request: OFF suppresses ONLY memory, not operational
  // guest content. Fake SDK and fake process env: never instantiate real OpenAI.
  let captured;
  class SimulatedOpenAI { chat = { completions: { create: async request => {
    captured = JSON.parse(request.messages[1].content);
    return { choices: [{ message: { content: JSON.stringify({ primary_intent: 'information' }) } }] };
  } } }; }
  const concierge = load('src/services/openai-concierge.service.js', { OpenAI: SimulatedOpenAI, logger, isGuestMemoryEnabled,
    process: { env: { AI_CONCIERGE_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-not-a-key' } }, getAiTimeoutMs: () => 100,
    isAiCircuitBreakerOpen: () => false, recordAiSuccess() {}, recordAiFailure() {}
  }, ['enhanceConciergeIntelligence']);
  const response = await concierge.enhanceConciergeIntelligence({ hotel: { id: 'h' }, guest: { phone_number: 'synthetic-phone', current_room: '101' },
    message: 'Synthetic current message', conversationContext: { guestMemory: [{ memory_key: 'dietary_gluten_allergy', memory_value: 'gluten' }],
      reservation: { id: 'synthetic-reservation' }, guestIntelligence: { profileSummary: 'Independent profile' } } });
  assert.equal(response.ok, true); assert.deepEqual(captured.guest_memory, []);
  assert.equal(captured.guest.phone_number, 'synthetic-phone'); assert.equal(captured.current_message, 'Synthetic current message');
  assert.equal(captured.reservation.id, 'synthetic-reservation'); assert.equal(captured.guest_intelligence.profileSummary, 'Independent profile');
  console.log('PASS OFF: simulated provider gets no Guest Memory, but still gets independent operational/profile context');

  const profileDb = spyDb();
  const intelligence = load('src/services/guest-intelligence.service.js', { getSupabase: () => profileDb, logger }, ['persistGuestIntelligenceProfile']);
  await intelligence.persistGuestIntelligenceProfile({ hotelId: 'h', guestId: 'g', affinities: {}, sentimentScore: 50,
    signals: [{ signalType: 'synthetic', detectedFrom: 'Synthetic message' }], metadata: { detected_from: 'Synthetic message' } });
  for (const table of ['guest_intelligence_profiles', 'guest_interest_affinities', 'guest_behavior_signals', 'guest_sentiment_history']) {
    assert.ok(profileDb.calls.some(call => call.table === table && call.payload), table);
  }
  assert.ok(profileDb.calls.some(call => call.payload?.detected_from === 'Synthetic message'));
  const profile = load('src/services/guest-memory-ai.service.js', { getSupabase: () => profileDb, logger, isGuestMemoryEnabled }, ['generateGuestProfile']);
  assert.deepEqual((await profile.generateGuestProfile({ hotelId: 'h', guestId: 'g' })).memories, []);
  assert.ok(profileDb.calls.some(call => call.table === 'reservations')); assert.ok(profileDb.calls.some(call => call.table === 'ai_logs'));
  console.log('PASS OFF: independent profile/affinity/signal/sentiment persistence and operational profile reads remain active');
};
