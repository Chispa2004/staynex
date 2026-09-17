import { buildReservationScheduleFingerprint } from '../shared/automations/reservation-lifecycle.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createAutomationQueueProcessor, getDueScheduledMessages } from '../src/services/message-queue.service.js';
import { dispatchRpc, requestAutomationRetry } from '../shared/automations/dispatch.js';
import { AUTOMATION_RUNTIME_VERSION } from '../shared/automations/catalog.js';
import { DEMO_RESERVED_SLOTS, demoMessageStageId } from '../shared/demo-message-stages/server-provenance.js';

assert.equal(process.env.SEND_AUTOMATIONS, 'false', 'Use ci:postgres; never enable the real configuration');
assert.ok(process.env.NODE_OPTIONS?.includes('isolate.cjs'), 'Network and dotenv isolation required');
const { createDisposablePostgres } = createRequire(import.meta.url)('./ci/disposable-postgres.cjs');
const pg = createDisposablePostgres({ env: process.env });
const q = value => value == null ? 'null' : `'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
const ident = value => { assert.match(value, /^[a-z_]+$/); return `"${value}"`; };
let connections = 0;
// Each query/RPC opens an independent psql connection inside a networkless,
// labelled disposable container. No connection or transaction spans send().
const sql = (input, role = 'postgres') => new Promise((resolve, reject) => {
  connections++;
  const child = spawn(pg.docker, [...pg.host, 'exec', '-i', pg.container,
    'psql', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', x => { out += x; }); child.stderr.on('data', x => { err += x; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
  child.stdin.end(`set role ${ident(role)};\n${input}`);
});
const json = async (input, role = 'postgres') => JSON.parse(await sql(input, role) || 'null');
const db = {
  async rpc(name, args) {
    try {
      const data = await json(`select public.${ident(name)}(${Object.entries(args).map(([k, v]) => `${ident(k)} => ${q(v)}`).join(',')});`, 'service_role');
      return { data, error: null };
    } catch (error) { return { data: null, error }; }
  },
  from(table) {
    const filters = []; let order = '', limit = '';
    const execute = async single => {
      const data = await json(`select coalesce(jsonb_agg(t), '[]') from (select * from public.${ident(table)}
        ${filters.length ? `where ${filters.join(' and ')}` : ''} ${order} ${limit}) t;`, 'service_role');
      return { data: single ? data[0] || null : data, error: null };
    };
    const query = {
      select: () => query,
      eq: (k, v) => { filters.push(`${ident(k)} = ${q(v)}`); return query; },
      lte: (k, v) => { filters.push(`${ident(k)} <= ${q(v)}`); return query; },
      in: (k, v) => { filters.push(`${ident(k)} in (${v.map(q).join(',')})`); return query; },
      not: (k, op, v) => { assert.equal(op, 'is'); assert.equal(v, null); filters.push(`${ident(k)} is not null`); return query; },
      order: k => { order = `order by ${ident(k)}`; return query; },
      limit: n => { assert.ok(Number.isInteger(n)); limit = `limit ${n}`; return query; },
      maybeSingle: () => execute(true), then: (a, b) => execute(false).then(a, b)
    };
    return query;
  }
};
const H = randomUUID(), B = randomUUID();
const active = { SEND_AUTOMATIONS: 'true' }; // Injected only; process.env stays false.
const accepted = { sid: 'SM' + 'a'.repeat(32), status: 'queued' };
let sends = 0;
const provider = async () => { sends++; return accepted; };
const readConversation = async ({ hotelId, conversationId }) => json(`select to_jsonb(t) from conversation_ai_state t
  where hotel_id=${q(hotelId)} and conversation_id=${q(conversationId)};`, 'service_role');
const processor = overrides => createAutomationQueueProcessor({ env: active, send: provider, readConversation, audit: async () => {}, ...overrides });
const run = (row, overrides, client = db) => processor(overrides)(row, { supabase: client });
const rowFor = id => json(`select to_jsonb(t) from scheduled_messages t where id=${q(id)};`);
const dispatchFor = id => json(`select to_jsonb(t) from automation_dispatches t where message_id=${q(id)};`);
const claim = row => dispatchRpc(db, 'claim', { p_message_id: row.id, p_hotel_id: row.hotel_id });
const identity = c => ({ p_message_id: c.message.id, p_hotel_id: c.message.hotel_id, p_attempt_id: c.attempt_id });
const checks = async row => ({
  hotel: (await db.from('hotels').select('*').eq('id', row.hotel_id).maybeSingle()).data,
  reservation: (await db.from('reservations').select('*').eq('id', row.reservation_id).eq('hotel_id', row.hotel_id).maybeSingle()).data,
  conversation: await readConversation({ hotelId: row.hotel_id, conversationId: row.conversation_id })
});
const begin = async c => dispatchRpc(db, 'begin', { ...identity(c), p_expected: c.message, p_checks: await checks(c.message) });
const finish = (c, result = { phase: 'accepted', sid: accepted.sid }) => dispatchRpc(db, 'finish', { ...identity(c), p_result: result });
const retry = row => requestAutomationRetry({ supabase: db, messageId: row.id, hotelId: row.hotel_id });
const expire = row => sql(`update automation_dispatches set lease_until=clock_timestamp()-interval '1 second' where message_id=${q(row.id)};`);
const due = row => sql(`update scheduled_messages set scheduled_for=clock_timestamp()-interval '1 second' where id=${q(row.id)};`);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const seed = async (overrides = {}) => {
  const h = overrides.hotel_id || H;
  const reservation = overrides.reservation_id || randomUUID(), guest = overrides.guest_id || randomUUID(), conversation = overrides.conversation_id || randomUUID();
  await sql(`insert into guests(id,hotel_id) values(${q(guest)},${q(h)}) on conflict do nothing;
    insert into reservations(id,hotel_id,status,arrival_date,departure_date) values(${q(reservation)},${q(h)},'confirmed','2026-09-18','2026-09-21') on conflict do nothing;
    insert into conversations(id,hotel_id) values(${q(conversation)},${q(h)}) on conflict do nothing;`);
  const row = { id: randomUUID(), hotel_id: h, reservation_id: reservation, guest_id: guest, conversation_id: conversation,
    automation_type: 'transfer', channel: 'whatsapp', scheduled_for: '2026-01-01T00:00:00Z',
    send_to: '+34900000001', message_preview: 'Disposable synthetic automation', status: 'scheduled',
    execution_mode: 'live', idempotency_key: randomUUID(), runtime_version: AUTOMATION_RUNTIME_VERSION,
    metadata: { certification_status: 'certified', reservation_schedule_fingerprint: buildReservationScheduleFingerprint({
      reservation: { arrival_date: '2026-09-18', departure_date: '2026-09-21' }, automationType: 'transfer' }) }, ...overrides };
  await sql(`insert into scheduled_messages(${Object.keys(row).map(ident)}) values(${Object.values(row).map(q)});`);
  return rowFor(row.id);
};
const tests = [];
const test = async (name, fn) => { await fn(); tests.push(name); console.log(`PASS ${name}`); };

try {
  await sql(`create role anon; create role authenticated; create role service_role;
    create table hotels(id uuid primary key, metadata jsonb, ai_auto_reply_enabled boolean);
    create table reservations(id uuid primary key, hotel_id uuid, status text, arrival_date date, departure_date date);
    create table guests(id uuid primary key, hotel_id uuid);
    create table conversations(id uuid primary key, hotel_id uuid);
    create table conversation_ai_state(hotel_id uuid, conversation_id uuid, state_metadata jsonb);
    create table automation_rules(id uuid primary key); create table ai_logs(id uuid);
    create table automation_runs(id uuid, hotel_id uuid); create table automation_events(id uuid);`);
  for (const file of ['create_scheduled_messages.sql', 'add_automation_runtime_foundation_phase1.sql']) {
    await sql(readFileSync(new URL('../supabase/sql/' + file, import.meta.url), 'utf8'));
  }
  await sql('grant select on all tables in schema public to service_role;');
  for (const h of [H, B]) await sql(`insert into hotels values(${q(h)}, ${q({ automation_live_enabled: true,
    automation_execution_mode: 'live', automation_live_approved_at: '2026-01-01', automation_live_approved_by: 'disposable-test' })},true);`);

  await test('Missing migration fails closed before provider', async () => {
    const row = await seed(); await assert.rejects(() => run(row)); assert.equal(sends, 0);
  });
  const migration = readFileSync(new URL('../supabase/sql/add_automation_dispatch_exclusion.sql', import.meta.url), 'utf8');
  await sql(migration); await sql(migration); // Additive/re-runnable.
  await test('RPCs and dispatch writes are server-only; service role cannot rewrite evidence directly', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const fn of ['claim(uuid,uuid)', 'begin(uuid,uuid,uuid,jsonb,jsonb)', 'block(uuid,uuid,uuid,jsonb)', 'finish(uuid,uuid,uuid,jsonb)', 'retry(uuid,uuid)']) {
        assert.equal(await sql(`select has_function_privilege(${q(role)},${q('automation_dispatch_' + fn)},'EXECUTE');`), 'f');
      }
      await assert.rejects(() => sql('select * from automation_dispatches;', role), /permission denied/);
    }
    await assert.rejects(() => sql('delete from automation_dispatches;', 'service_role'), /permission denied/);
  });
  await test('Two independent workers racing one message make one provider call', async () => {
    const row = await seed(), before = sends;
    await Promise.all([run(row), run(row)]);
    assert.equal(sends - before, 1); assert.equal((await dispatchFor(row.id)).phase, 'accepted');
    assert.equal((await dispatchFor(row.id)).provider_sid, accepted.sid);
    assert.equal((await dispatchFor(row.id)).provider_status, 'queued');
    await run(row); assert.equal(sends - before, 1);
  });
  await test('Provider wait holds no global/DB transaction lock; other messages and hotels progress', async () => {
    const first = await seed(), same = await seed(), other = await seed({ hotel_id: B });
    const entered = deferred(), release = deferred();
    const pending = run(first, { send: async () => { sends++; entered.resolve(); await release.promise; return accepted; } });
    await entered.promise;
    try {
      const results = await Promise.all([run(same), run(other)]);
      assert.ok(results.every(r => r.dispatchOutcome === 'accepted'));
      assert.equal(await sql("select count(*) from pg_stat_activity where state='idle in transaction';"), '0');
      assert.equal(await claim({ ...first, hotel_id: B }), null);
      assert.equal((await dispatchFor(other.id)).hotel_id, B);
    } finally { release.resolve(); await pending; }
  });
  await test('Pre-send crash safely reclaims; stale worker cannot begin, block or finish', async () => {
    const row = await seed(), old = await claim(row); await expire(row);
    const current = await claim(row); assert.notEqual(current.attempt_id, old.attempt_id);
    assert.equal(await begin(old), null);
    assert.equal(await dispatchRpc(db, 'block', { ...identity(old), p_updates: { status: 'failed' } }), null);
    assert.equal(await finish(old), null);
    assert.ok(await begin(current)); assert.ok(await finish(current));
  });
  await test('Paused old worker loses lease while another completes; cannot reach provider later', async () => {
    const row = await seed(), entered = deferred(), release = deferred(), before = sends;
    const old = run(row, { readConversation: async () => { entered.resolve(); await release.promise; return null; } });
    await entered.promise; await expire(row); await run(row); release.resolve();
    assert.equal((await old).reason, 'dispatch_fence_lost'); assert.equal(sends - before, 1);
  });
  await test('Failure to persist begin makes zero provider calls; lost begin response never redispatches', async () => {
    const before = sends;
    for (const committed of [false, true]) {
      const row = await seed();
      const client = { ...db, rpc: async (name, args) => {
        if (name === 'automation_dispatch_begin') {
          if (committed) await db.rpc(name, args);
          return { error: new Error('Injected begin persistence failure') };
        }
        return db.rpc(name, args);
      } };
      await assert.rejects(() => run(row, {}, client)); assert.equal(sends, before);
      if (committed) { await expire(row); await run(row); assert.equal((await dispatchFor(row.id)).phase, 'unknown'); }
    }
  });
  await test('Crash after durable begin becomes unknown on expiry and cannot retry, even if queue status reset', async () => {
    const row = await seed(), c = await claim(row), before = sends; await begin(c); await expire(row);
    await run(row); assert.equal((await dispatchFor(row.id)).phase, 'unknown');
    assert.equal(await retry(row), null); assert.equal(await finish(c), null);
    await sql(`update scheduled_messages set status='scheduled' where id=${q(row.id)};`);
    await run(row); assert.equal(sends, before);
  });
  await test('Timeout, connection loss, 5xx and missing SID remain unknown without automatic retry', async () => {
    for (const error of [new Error('timeout'), Object.assign(new Error('reset'), { code: 'ECONNRESET' }), { status: 503, code: 20500 }, { status: 408, code: 20408 }, null]) {
      const row = await seed();
      await run(row, { send: async () => { if (error) throw error; return { status: 'queued' }; } });
      assert.equal((await dispatchFor(row.id)).phase, 'unknown'); assert.equal(await retry(row), null);
    }
  });
  await test('Acceptance followed by failed persistence/audit never becomes a retryable failure', async () => {
    for (const committed of [false, true]) {
      const row = await seed(), before = sends;
      const client = { ...db, rpc: async (name, args) => {
        if (name === 'automation_dispatch_finish') {
          if (committed) await db.rpc(name, args);
          return { error: new Error('Injected response loss') };
        }
        return db.rpc(name, args);
      } };
      const result = await run(row, {}, client); assert.equal(result.reconciliationRequired, true);
      assert.equal(result.providerSid, accepted.sid);
      await expire(row); await run(row); assert.equal(sends - before, 1); assert.equal(await retry(row), null);
      assert.equal((await dispatchFor(row.id)).phase, committed ? 'accepted' : 'unknown');
    }
    const row = await seed(); await run(row, { audit: async () => { throw new Error('audit down'); } });
    assert.equal((await dispatchFor(row.id)).phase, 'accepted'); assert.equal(await retry(row), null);
  });
  await test('Proven 429 rejection allows backed-off explicit retry; consumer/retry overlap sends only once', async () => {
    const row = await seed();
    await run(row, { send: async () => { throw { status: 429, code: 20429 }; } });
    assert.equal((await dispatchFor(row.id)).phase, 'rejected'); assert.equal((await dispatchFor(row.id)).retry_allowed, true);
    const before = sends;
    const [queued] = await Promise.all([retry(row), run(row)]);
    assert.equal(queued.status, 'retry'); assert.equal(sends, before); assert.equal(await claim(row), null);
    await due(row);
    await Promise.all([run(row), retry(row), run(row)]);
    assert.equal(sends - before, 1); assert.equal((await dispatchFor(row.id)).previous_attempts[0].phase, 'rejected');
    const terminal = await seed(); await run(terminal, { send: async () => { throw { status: 400, code: 21211 }; } });
    assert.equal((await dispatchFor(terminal.id)).phase, 'rejected'); assert.equal(await retry(terminal), null);
    const preflight = await seed(); await run(preflight, { send: async () => { throw { automationSendNotAttempted: true }; } });
    assert.ok(await retry(preflight));
    assert.equal(await retry(await seed({ status: 'failed' })), null, 'Legacy failed is not evidence');
    assert.equal(await claim(await seed({ status: 'retry' })), null, 'Legacy retry is quarantined');
  });
  await test('Claim reads stored recipient; edits after validation invalidate durable begin', async () => {
    const row = await seed(); let recipient;
    await run({ ...row, send_to: '+34999999999' }, { send: async data => { recipient = data.to; return accepted; } });
    assert.equal(recipient, row.send_to);
    const changed = await seed(), c = await claim(changed);
    await sql(`update scheduled_messages set send_to='+34900000002' where id=${q(changed.id)};`);
    assert.equal(await begin(c), null);
  });
  await test('Hotel, reservation and human-state changes during validation fail the durable boundary', async () => {
    const before = sends;
    for (const change of ['hotel', 'reservation', 'human']) {
      const row = await seed();
      const result = await run(row, { readConversation: async () => {
        if (change === 'hotel') await sql(`update hotels set ai_auto_reply_enabled=false where id=${q(row.hotel_id)};`);
        if (change === 'reservation') await sql(`update reservations set status='cancelled' where id=${q(row.reservation_id)};`);
        if (change === 'human') await sql(`insert into conversation_ai_state values(${q(row.hotel_id)},${q(row.conversation_id)},'{"conversation_ai_mode":"human_takeover"}');`);
        return null; // Snapshot obtained before the concurrent change committed.
      } });
      assert.equal(result.reason, 'dispatch_fence_lost');
      await sql(`update hotels set ai_auto_reply_enabled=true where id=${q(H)};`);
    }
    assert.equal(sends, before);
  });
  await test('Disabled flags, hotel kill switch, human controls, state failure, eligibility and demo yield zero provider calls', async () => {
    const before = sends;
    await run(await seed(), { env: { SEND_AUTOMATIONS: 'false' } });
    await run(await seed(), { env: { ...active, STAYNEX_GLOBAL_AI_KILL_SWITCH: 'true' } });
    await sql(`update hotels set ai_auto_reply_enabled=false where id=${q(H)};`);
    await run(await seed()); await sql(`update hotels set ai_auto_reply_enabled=true where id=${q(H)};`);
    for (const mode of ['human_takeover', 'ai_paused', 'escalation_lock']) {
      const row = await seed(); await sql(`insert into conversation_ai_state values(${q(H)},${q(row.conversation_id)},${q({ conversation_ai_mode: mode })});`);
      assert.equal((await run(row)).error_message, 'human_takeover_active');
    }
    await run(await seed(), { readConversation: async () => { throw new Error('state unavailable'); } });
    for (const overrides of [{ execution_mode: 'preview' }, { metadata: {} }, { send_to: null }, { runtime_version: 'legacy' }, { automation_type: 'review_request' }]) await run(await seed(overrides));
    const cancelled = await seed(); await sql(`update reservations set status='cancelled' where id=${q(cancelled.reservation_id)};`); await run(cancelled);
    for (const slot of DEMO_RESERVED_SLOTS) {
      for (const entity of ['reservation', 'guest', 'conversation']) {
        await run(await seed({ [entity + '_id']: demoMessageStageId(H, slot, entity) }));
      }
    }
    // Stale non-demo caller cannot hide the reserved persisted recipient context.
    const demo = await seed({ guest_id: demoMessageStageId(H, DEMO_RESERVED_SLOTS[0], 'guest') });
    await run({ ...demo, guest_id: randomUUID() });
    assert.equal(sends, before); assert.equal(process.env.SEND_AUTOMATIONS, 'false');
  });
  await test('Due selector includes retry and recovery candidates without selecting failed/unknown', async () => {
    const rows = await getDueScheduledMessages({ supabase: db, limit: 1000 });
    assert.ok(rows.length); assert.ok(rows.every(r => ['scheduled', 'retry', 'processing'].includes(r.status)));
  });
  console.log(`Automation dispatch PostgreSQL PASS: ${tests.length} scenarios, ${connections} independent connections; only simulated provider calls.`);
} finally { pg.cleanup(); }
