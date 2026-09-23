import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { cleanupExpiredGuestData } from '../src/jobs/cleanupExpiredGuestData.js';
import { fixture, id, NOW } from './fixtures/retention-fixture.js';

// Real typed PostgreSQL, isolated through the same container guard as the
// existing dispatch tests. This adapter exercises the job, not a SQL rewrite.
assert.equal(process.env.SEND_AUTOMATIONS, 'false');
assert.match(process.env.NODE_OPTIONS || '', /isolate\.cjs/);
const require = createRequire(import.meta.url);
const db = require('./ci/disposable-postgres.cjs').createDisposablePostgres({ env: process.env });
const ident = value => { assert.match(value, /^[a-z_]+$/); return `"${value}"`; };
const literal = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const sql = text => execFileSync(db.docker, [...db.host, 'exec', '-i', db.container, 'psql', '-XqAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: text, env: process.env, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const json = statement => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(r), '[]') FROM (${statement}) r;`));
const data = fixture(7);
const audit = { hotel_id: id(1), job_name: '', run_at: null, records_scanned: 0, records_anonymized: 0, records_deleted: 0,
  status: '', error: null, metadata: {} };
const type = key => key === 'id' || key.endsWith('_id') ? 'uuid' : key === 'metadata' ? 'jsonb' : key === 'memory_keys_used' ? 'text[]'
  : ['is_active', 'memory_used'].includes(key) ? 'boolean' : key === 'confidence' ? 'numeric'
    : key.endsWith('_days') || key.startsWith('records_') ? 'integer' : key === 'departure_date' ? 'date'
      : key.endsWith('_at') || key === 'run_at' ? 'timestamptz' : 'text';
const insert = (table, row) => {
  const keys = Object.keys(row).map(ident).join(',');
  return `INSERT INTO ${ident(table)} (${keys}) SELECT ${keys} FROM jsonb_populate_record(NULL::${ident(table)}, ${literal(JSON.stringify(row))}::jsonb);`;
};
const from = table => {
  const state = { action: 'select', fields: '*', where: [], limit: null, order: null };
  const query = {
    select(fields = '*') { state.fields = fields === '*' ? '*' : fields.split(',').map(ident).join(','); return query; },
    update(values) { state.action = 'update'; state.values = values; return query; },
    insert(values) { state.action = 'insert'; state.values = values; return query; },
    eq(key, value) { state.where.push(`${ident(key)} = ${literal(value)}`); return query; },
    gt(key, value) { state.where.push(`${ident(key)} > ${literal(value)}`); return query; },
    lt(key, value) { state.where.push(`${ident(key)} < ${literal(value)}`); return query; },
    in(key, values) { state.where.push(`${ident(key)} IN (${values.map(literal).join(',')})`); return query; },
    order(key) { state.order = ident(key); return query; },
    limit(value) { assert.ok(Number.isInteger(value) && value > 0); state.limit = value; return query; },
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        const where = state.where.length ? ` WHERE ${state.where.join(' AND ')}` : '';
        try {
          if (state.action === 'insert') { sql(insert(table, state.values)); return { data: [], error: null }; }
          if (state.action === 'update') {
            const record = `jsonb_populate_record(NULL::${ident(table)}, ${literal(JSON.stringify(state.values))}::jsonb)`;
            const set = Object.keys(state.values).map(key => `${ident(key)} = (${record}).${ident(key)}`).join(',');
            const result = sql(`WITH updated AS (UPDATE ${ident(table)} SET ${set}${where} RETURNING ${state.fields}) SELECT COALESCE(jsonb_agg(updated), '[]') FROM updated;`);
            return { data: JSON.parse(result), error: null };
          }
          return { data: json(`SELECT ${state.fields} FROM ${ident(table)}${where}${state.order ? ` ORDER BY ${state.order}` : ''}${state.limit ? ` LIMIT ${state.limit}` : ''}`), error: null };
        } catch { return { data: null, error: { code: 'PG_TEST_FAILURE' } }; }
      }).then(resolve, reject);
    }
  };
  return query;
};
const run = extra => cleanupExpiredGuestData({ supabase: { from }, hotelId: id(1), now: NOW, limit: 2, ...extra });
try {
  for (const [table, rows] of Object.entries(data)) {
    const sample = rows[0] || audit;
    sql(`CREATE TABLE ${ident(table)} (${Object.keys(sample).map(key => `${ident(key)} ${type(key)}${key === 'id' ? ' PRIMARY KEY' : ''}`).join(',')});`);
    for (const row of rows) sql(insert(table, row));
  }
  // Contract from create_guest_memory.sql: keys remain NOT NULL and unique per guest.
  sql('ALTER TABLE guest_memory ALTER COLUMN memory_type SET NOT NULL, ALTER COLUMN memory_key SET NOT NULL, ALTER COLUMN memory_value SET NOT NULL, ADD UNIQUE (hotel_id,guest_id,memory_key);');
  const original = json('SELECT * FROM guest_memory ORDER BY id');
  const preview = await run({ dryRun: true }); assert.equal(preview.complete, true); assert.equal(preview.results[0].planned.guestMemory, 7);
  assert.deepEqual(json('SELECT * FROM guest_memory ORDER BY id'), original);
  console.log('PASS PostgreSQL: exact multi-page preview, no writes');
  // Fail AFTER the first batch to exercise committed progress and recovery.
  sql(`CREATE FUNCTION fail_retention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${id(102)}' THEN RAISE EXCEPTION 'synthetic interruption'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER synthetic_failure BEFORE UPDATE ON guest_memory FOR EACH ROW EXECUTE FUNCTION fail_retention();`);
  const failed = await run(); assert.equal(failed.complete, false); assert.equal(failed.results[0].changed.guestMemory, 2);
  assert.equal(json('SELECT last_data_retention_cleanup_at FROM hotels ORDER BY id')[0].last_data_retention_cleanup_at, null);
  console.log('PASS PostgreSQL: trigger interruption reported partial, completion marker absent');
  sql('DROP TRIGGER synthetic_failure ON guest_memory; DROP FUNCTION fail_retention();');
  const recovered = await run(); assert.equal(recovered.complete, true); assert.equal(recovered.results[0].changed.guestMemory, 5);
  const memories = json('SELECT * FROM guest_memory ORDER BY id');
  assert.ok(memories.filter(row => row.guest_id === id(11)).every(row => row.memory_key === `anonymized:${row.id}` && !JSON.stringify(row).includes('gluten')));
  assert.deepEqual(memories.slice(-3), original.slice(-3));
  const logs = json('SELECT * FROM ai_logs'); assert.deepEqual(logs[0].memory_keys_used, []); assert.equal(logs[0].ai_summary, null); assert.equal(logs[0].ticket_id, id(70));
  assert.equal(json(`SELECT * FROM messages WHERE id = '${id(51)}'`)[0].content, 'Recent operational question');
  assert.equal(json(`SELECT * FROM experience_booking_requests WHERE id = '${id(81)}'`)[0].notes, 'gluten');
  console.log('PASS PostgreSQL: derived references cleared, other hotel and newer/unknown stays and operational rows protected');
  const repeat = await run(); assert.equal(repeat.complete, true); assert.ok(Object.values(repeat.results[0].changed).every(value => value === 0));
  assert.deepEqual(json('SELECT * FROM guest_memory ORDER BY id'), memories);
  console.log('PASS PostgreSQL: idempotent repeat, unique keys preserved');
  // A required column disappearing must not turn into a successful empty scan.
  sql('ALTER TABLE ai_logs DROP COLUMN memory_keys_used;');
  assert.equal((await run({ dryRun: true })).complete, false);
  console.log('PASS PostgreSQL: incompatible schema fails visibly');
  console.log('5 Guest Memory retention PostgreSQL scenarios passed');
} finally { db.cleanup(); }
