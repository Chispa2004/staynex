import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanupExpiredGuestData, ANONYMIZED_MESSAGE } from '../src/jobs/cleanupExpiredGuestData.js';
import { fixture, memoryDb, id, NOW } from './fixtures/retention-fixture.js';

const run = (db, extra = {}) => cleanupExpiredGuestData({ supabase: db, hotelId: id(1), now: NOW, limit: 2, ...extra });
let passed = 0;
const test = async (name, fn) => { await fn(); console.log(`PASS retention: ${name}`); passed++; };
await test('dry run reads every page, exact plan, zero writes', async () => {
  const db = memoryDb(fixture(507), { cap: 31 }); const before = structuredClone(db.data);
  const result = await run(db, { dryRun: true, limit: 500 });
  assert.equal(result.complete, true); assert.equal(result.results[0].planned.guestMemory, 507);
  assert.deepEqual(db.data, before); assert.ok(db.calls.every(call => call.action === 'select'));
});
await test('507 memories, derived labels and summaries cleared; hotel/age/operation protection; repeat safe', async () => {
  const db = memoryDb(fixture(507), { cap: 31 }); const before = structuredClone(db.data);
  const result = await run(db, { limit: 500 }); assert.equal(result.complete, true);
  assert.equal(result.results[0].changed.guestMemory, 507);
  for (const row of db.data.guest_memory.filter(row => row.guest_id === id(11))) {
    assert.equal(row.memory_value, '[anonymized]'); assert.equal(row.memory_key, `anonymized:${row.id}`);
    assert.equal(row.memory_type, 'anonymized'); assert.equal(row.source_message_id, null); assert.equal(row.reservation_id, null);
    assert.equal(row.is_active, false); assert.ok(!JSON.stringify(row).includes('gluten'));
  }
  for (const table of Object.keys(before)) {
    assert.deepEqual(db.data[table].filter(row => row.hotel_id === id(2)), before[table].filter(row => row.hotel_id === id(2)), table);
  }
  assert.deepEqual(db.data.guest_memory.slice(-3), before.guest_memory.slice(-3));
  assert.deepEqual(db.data.guests.slice(1), before.guests.slice(1));
  assert.deepEqual(db.data.messages[1], before.messages[1]); assert.equal(db.data.messages[0].content, ANONYMIZED_MESSAGE);
  assert.deepEqual(db.data.experience_booking_requests[1], before.experience_booking_requests[1]);
  assert.deepEqual(db.data.tickets, before.tickets); assert.deepEqual(db.data.guest_intelligence_profiles, before.guest_intelligence_profiles);
  assert.deepEqual(db.data.ai_logs[0].memory_keys_used, []); assert.equal(db.data.ai_logs[0].ai_summary, null);
  assert.equal(db.data.ai_logs[0].ticket_id, id(70)); assert.equal(db.data.ai_logs[0].delivery_status, 'delivered');
  const snapshot = structuredClone(db.data); const second = await run(db, { now: new Date('2026-09-24T12:00:00Z') });
  assert.equal(second.complete, true); assert.ok(Object.values(second.results[0].changed).every(count => count === 0));
  for (const table of Object.keys(snapshot).filter(table => !['hotels', 'data_retention_audit_logs'].includes(table))) assert.deepEqual(db.data[table], snapshot[table]);
});
await test('partial write failure visible, no success marker, resumable after interruption', async () => {
  let updates = 0, enabled = true;
  const db = memoryDb(fixture(), { fail: s => enabled && s.table === 'guest_memory' && s.action === 'update' && ++updates === 3 });
  const failed = await run(db); assert.equal(failed.complete, false); assert.equal(failed.status, 'partial');
  assert.equal(failed.results[0].changed.guestMemory, 2); assert.equal(db.data.hotels[0].last_data_retention_cleanup_at, null);
  assert.equal(db.data.data_retention_audit_logs[0].status, 'partial'); assert.ok(!JSON.stringify(failed).includes('PRIVATE'));
  enabled = false; const recovered = await run(db); assert.equal(recovered.complete, true); assert.equal(recovered.results[0].changed.guestMemory, 5);
});
await test('reservations, conversations and messages continue beyond a batch', async () => {
  const data = fixture();
  for (let i = 0; i < 5; i++) {
    data.guests.push({ ...data.guests[0], id: id(2000 + i), phone_number: `synthetic-volume-${i}` });
    data.reservations.push({ ...data.reservations[0], id: id(2100 + i), guest_id: id(2000 + i) });
    data.conversations.push({ ...data.conversations[0], id: id(2200 + i) });
    data.messages.push({ ...data.messages[0], id: id(2300 + i), conversation_id: id(2200 + i) });
  }
  const result = await run(memoryDb(data, { cap: 1 }));
  assert.equal(result.complete, true); assert.equal(result.results[0].changed.reservations, 7);
  assert.equal(result.results[0].changed.guests, 6); assert.equal(result.results[0].conversationsScanned, 6);
  assert.equal(result.results[0].changed.messages, 6);
});
await test('cutoff boundary stays protected and read failure is not an empty successful scope', async () => {
  const data = fixture(); data.reservations[0].departure_date = '2026-08-24';
  const before = structuredClone(data.guest_memory); const db = memoryDb(data);
  assert.equal((await run(db)).complete, true); assert.deepEqual(data.guest_memory, before);
  const broken = memoryDb(fixture()); delete broken.data.guest_memory;
  const failed = await run(broken, { dryRun: true }); assert.equal(failed.complete, false);
  assert.deepEqual(failed.results[0].errors, [{ stage: 'guest_memory', code: '42P01' }]);
});
await test('missing schema, audit failure and completion-marker failure never succeed', async () => {
  for (const table of ['guest_memory', 'data_retention_audit_logs', 'hotels']) {
    const db = memoryDb(fixture(), { fail: s => s.table === table && (table === 'guest_memory' || s.action !== 'select') });
    const result = await run(db); assert.equal(result.complete, false, table); assert.equal(db.data.hotels[0].last_data_retention_cleanup_at, null);
  }
});
await test('one failed hotel does not hide another hotel result; hotel list paginated', async () => {
  const db = memoryDb(fixture(), { cap: 1, fail: s => s.table === 'guest_memory' && s.action === 'update' && s.filters.every(fn => fn(db.data.guest_memory[0])) });
  const result = await run(db, { hotelId: null }); assert.equal(result.complete, false); assert.equal(result.hotelsProcessed, 2);
  assert.equal(result.results[0].status, 'partial'); assert.equal(result.results[1].status, 'complete');
});
await test('CLI returns nonzero for partial result, rather than announcing completion', async () => {
  const source = readFileSync(new URL('./jobs-cleanup.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '');
  for (const complete of [false, true]) {
    const processStub = { argv: ['node', 'job', '--dry-run', '--hotel-id=synthetic'], env: {}, exitCode: 0, exit(code) { this.exitCode = code; } };
    await new Function('cleanupExpiredGuestData', 'process', 'console', source.replace('main().catch', 'return main().catch'))(
      async args => { assert.equal(args.dryRun, true); return { complete }; }, processStub, { log() {}, error() {} });
    assert.equal(processStub.exitCode, complete ? 0 : 1);
  }
});
console.log(`${passed} Guest Memory retention behavior scenarios passed`);
