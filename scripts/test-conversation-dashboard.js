import assert from 'node:assert/strict';
import { buildConversationDashboard, loadConversationDashboardSources, hotelCalendarDay, CONVERSATION_DASHBOARD_LIMIT } from '../dashboard/lib/hotel-operations-workspace.js';

const hotelId = 'hotel-a';
const yesterday = '2026-09-06T10:00:00Z';
const today = '2026-09-07T10:00:00Z';
const row = values => ({ hotel_id: hotelId, created_at: yesterday, ...values });
const base = () => Object.fromEntries(Object.entries({
  conversations: [row({ id: 'c1', guest_id: 'g1', status: 'active', last_message_at: today }), row({ id: 'c2', status: 'active', last_message_at: today })],
  states: [row({ id: 's1', conversation_id: 'c1', escalation_level: 'urgent', updated_at: today, state_metadata: { conversation_ai_mode: 'human_takeover' } })],
  guests: [row({ id: 'g1', name: 'Persona sintética', current_room: '103' })],
  messages: [row({ id: 'm1', conversation_id: 'c1', sender_type: 'guest', content: 'Mensaje de prueba' })],
  claims: [row({ id: 'claim1', message_id: 'm1', message_sid: 'SM-fixture' })],
  logs: [row({ id: 'l1', conversation_id: 'c1', message_id: 'm1', generated_response: 'Respuesta registrada', needs_human: true, ticket_created: true, ticket_id: 't1', created_at: today })],
  tickets: [row({ id: 't1', conversation_id: 'c1', status: 'open' }), row({ id: 'manual', conversation_id: 'c2', status: 'in_progress' }), row({ id: 'unlinked', status: 'open' })],
  offers: []
}).map(([key, rows]) => [key, { rows, complete: true }]));
const build = (sources = base(), extra = {}) => buildConversationDashboard({ hotelId, timezone: 'Europe/Madrid', now: today, activeCount: 2, sources, ...extra });
const get = (dto, key) => dto.counters[key].value;
let sources = base();
let dto = build(sources);
assert.equal(get(dto, 'activeConversations'), 2);
assert.equal(get(dto, 'humanControl'), 1);
assert.equal(get(dto, 'registeredResponsesToday'), 1);
assert.equal(get(dto, 'linkedOpenTickets'), 2);
assert.equal(dto.review.length, 1, 'multiple signals produce one conversation');
assert.equal(dto.review[0].room, '103');
assert.equal(dto.activity.filter(item => item.type === 'Ticket creado por IA').length, 1, 'manual tickets have no AI attribution');
assert.ok(!dto.review.some(item => item.id === 'c2'), 'active conversation plus open ticket does not establish a review signal');
assert.ok(!JSON.stringify(dto).includes('generated_response'), 'browser DTO has no log bodies');
assert.ok(dto.activity.every(item => !/enviad|entregad|resuelt/i.test(item.type)), 'recording never establishes delivery or resolution');

sources.logs.rows.push({ ...sources.logs.rows[0], id: 'retry' });
assert.equal(get(build(sources), 'registeredResponsesToday'), 1);
assert.equal(build(sources).activity.length, 3, 'response, referral and actual ticket dedupe on explicit identities');
sources.logs.rows[0].created_at = yesterday;
assert.equal(get(build(sources), 'registeredResponsesToday'), 0, 'retry today retains first valid record yesterday');
sources.logs.rows[0].ai_provider = 'demo';
assert.equal(get(build(sources), 'registeredResponsesToday'), 1, 'a demo log is excluded before determining the first valid traced registration');
delete sources.logs.rows[0].ai_provider;
sources.logs.complete = false;
sources.logs.reason = 'Cobertura incompleta';
assert.equal(get(build(sources), 'registeredResponsesToday'), null, 'partial history cannot certify first response');
assert.ok(build(sources).activity.length > 0, 'a visible activity sample is independent from totals');

sources = base();
sources.states.rows[0].state_metadata = { conversation_ai_mode: 'ai_active', human_takeover: { resumed_at: today } };
dto = build(sources);
assert.equal(get(dto, 'humanControl'), 0, 'resume overrides historical escalation');
assert.equal(dto.review[0].status, 'Vigencia por confirmar');
sources.logs.rows[0].needs_human = false;
assert.equal(build(sources).review.length, 0, 'stale escalation after resume is not a fresh review signal');
for (const mode of ['ai_paused', 'escalation_lock']) {
  sources.states.rows[0].state_metadata = { conversation_ai_mode: mode };
  assert.equal(get(build(sources), 'humanControl'), 1);
}
sources.states.rows = [];
assert.equal(get(build(sources), 'humanControl'), 0, 'global/hotel switch is not inferred as human control');
sources = base();
sources.conversations.rows[0].status = 'closed';
assert.equal(get(build(sources), 'humanControl'), 1, 'current persisted mode is resolved without inferring it from conversation status');

sources = base();
sources.messages.rows[0].metadata = { demo: true };
assert.equal(get(build(sources), 'registeredResponsesToday'), 0);
assert.ok(build(sources).activity.every(item => item.origin === 'simulated'));
sources.messages.rows[0].metadata = {};
sources.claims.rows = [];
assert.equal(get(build(sources), 'registeredResponsesToday'), 0, 'unknown origin excluded from traced count');
assert.ok(build(sources).activity.every(item => item.origin === 'unknown'));
sources.logs.rows[0].automation_triggered = true;
assert.equal(build(sources).activity.length, 0, 'automation does not enter direct conversation response activity');
sources.logs.rows[0].automation_triggered = false;
sources.logs.rows[0].ai_model = 'local-test-preview';
assert.equal(build(sources).activity.length, 0);
sources = base();
sources.messages.rows[0].sender_type = 'ai';
sources.messages.rows[0].metadata = { system_event: 'experience_booking_request_created' };
assert.equal(get(build(sources), 'registeredResponsesToday'), 0, 'system ai message is not a guest query');
assert.equal(build(sources).activity.length, 0);

sources = base();
for (const key of ['conversations', 'states', 'tickets', 'messages', 'claims', 'logs', 'guests']) {
  const changed = structuredClone(sources);
  changed[key].rows[0].hotel_id = 'hotel-b';
  const result = build(changed);
  assert.equal(result.coverage, 'incomplete', `${key}: cross-hotel data invalidates coverage`);
  if (key !== 'guests') assert.ok(result.activity.every(item => item.guest !== 'Foreign guest'));
}
sources.guests.rows[0].hotel_id = 'hotel-b';
sources.guests.rows[0].name = 'Foreign guest';
assert.ok(!JSON.stringify(build(sources)).includes('Foreign guest'));
sources = base();
sources.tickets.rows[0].conversation_id = 'foreign-conversation';
assert.equal(get(build(sources), 'linkedOpenTickets'), 1);
assert.equal(build(sources).activity.filter(item => item.type === 'Ticket creado por IA').length, 0);
sources = base();
sources.messages.rows[0].conversation_id = 'c2';
assert.equal(get(build(sources), 'registeredResponsesToday'), null, 'mismatched explicit relationship is not enough evidence');
sources = base();
sources.logs.rows[0].created_at = null;
assert.equal(get(build(sources), 'registeredResponsesToday'), null);
assert.equal(get(build(base(), { timezone: null }), 'registeredResponsesToday'), null);
assert.equal(get(build(base(), { timezone: 'invalid-zone' }), 'registeredResponsesToday'), null);
assert.equal(hotelCalendarDay('2026-03-28T23:30:00Z', 'Europe/Madrid'), '2026-03-29');
assert.equal(hotelCalendarDay('2026-03-29T22:30:00Z', 'Europe/Madrid'), '2026-03-30');
assert.equal(hotelCalendarDay('2026-10-25T00:30:00Z', 'Europe/Madrid'), '2026-10-25');
assert.equal(hotelCalendarDay('2026-10-25T01:30:00Z', 'Europe/Madrid'), '2026-10-25');
assert.equal(hotelCalendarDay('2026-10-25T23:30:00Z', 'Europe/Madrid'), '2026-10-26');

const tables = { conversations: 'conversations', states: 'conversation_ai_state', guests: 'guests', messages: 'messages', claims: 'twilio_inbound_message_claims', logs: 'ai_logs', tickets: 'tickets', offers: 'ai_offers' };
const fakeDatabase = (fixtures, failure, cap = Infinity) => ({
  calls: [],
  from(table) {
    const call = { table, filters: [], limit: null }; this.calls.push(call);
    return {
      select(fields, options) { assert.notEqual(fields, '*'); assert.equal(options.count, 'exact'); return this; },
      eq(field, value) { call.filters.push([field, value]); return this; },
      order() { return this; },
      limit(value) { call.limit = value; return this; },
      then(resolve, reject) {
        assert.deepEqual(call.filters, [['hotel_id', hotelId]]);
        assert.equal(call.limit, CONVERSATION_DASHBOARD_LIMIT);
        const key = Object.keys(tables).find(key => tables[key] === table);
        const data = fixtures[key].rows.filter(row => row.hotel_id === hotelId);
        return Promise.resolve(table === failure ? { error: { message: 'internal secret error' } } : { data: data.slice(0, Math.min(cap, call.limit)), count: data.length }).then(resolve, reject);
      }
    };
  }
});
let db = fakeDatabase(base());
assert.equal(get(build(await loadConversationDashboardSources(db, hotelId)), 'registeredResponsesToday'), 1);
assert.equal(db.calls.length, 8, 'fixed batch count independent of visible rows');
db = fakeDatabase(base(), 'ai_logs');
dto = build(await loadConversationDashboardSources(db, hotelId));
assert.equal(get(dto, 'registeredResponsesToday'), null);
assert.ok(!JSON.stringify(dto).includes('internal secret'));
dto = build(await loadConversationDashboardSources(fakeDatabase(base(), null, 1), hotelId));
assert.equal(get(dto, 'linkedOpenTickets'), null, 'server cap is not a subtotal');
assert.equal(get(dto, 'activeConversations'), 2, 'exact canonical count is independent from sample cap');
const empty = Object.fromEntries(Object.keys(tables).map(key => [key, { rows: [], complete: true }]));
dto = build(await loadConversationDashboardSources(fakeDatabase(empty), hotelId), { activeCount: 0 });
assert.ok(Object.values(dto.counters).every(metric => metric.value === 0), 'complete empty sources demonstrate zero');
await assert.rejects(loadConversationDashboardSources(fakeDatabase(base()), null), /Authorized hotel/);
console.log('Conversation dashboard: functional sources, provenance, tenant isolation, retries, DST and coverage PASS');
