import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildHotelOperationalHealthSnapshot, getHotelOperationalHealth } from '../dashboard/lib/system-health.js';
import { HEALTH_SOURCES } from '../dashboard/lib/health-coverage.js';
import * as requestModule from '../dashboard/lib/health-request.js';
import { translatePhrase } from '../dashboard/lib/i18n/translations.js';
import * as styles from '../dashboard/lib/ui/styles.js';

const { createHealthRequest, emptyHealthState, presentHealth } = requestModule;
const hotel = { id: 'hotel-a', name: 'Synthetic health', whatsapp_number: 'configured', ai_auto_reply_enabled: false };
const now = new Date('2026-09-22T12:00:00Z');
const sources = Object.fromEntries(HEALTH_SOURCES.map((key) => [key, { status: 'complete', returned: 0, total: 0 }]));
const input = { hotel, sources, now, qrRooms: [{ active: true }], pmsConnections: [
  { provider: 'apaleo', enabled: true, sync_status: 'connected', last_sync_at: '2026-09-22T11:00:00Z' }
] };
const card = (snapshot, id) => snapshot.statusCards.find((item) => item.id === id);
const snapshot = buildHotelOperationalHealthSnapshot(input);
assert.equal(snapshot.coverage.status, 'complete');
assert.equal(card(snapshot, 'tickets').value, 0, 'complete empty tickets are a legitimate zero');
assert.equal(card(snapshot, 'pms').status, 'healthy');
assert.equal(card(snapshot, 'whatsapp').status, 'unverified', 'configuration is not verification');
assert.equal(snapshot.healthScore, null, 'unverified services cannot certify an aggregate score');
assert.equal(presentHealth({ status: 'success', payload: { health: {
  ...snapshot, healthScore: 0, warnings: []
} } }).score, '0%', 'a known zero score is not replaced by unknown');
assert.equal(presentHealth({ status: 'success', payload: { health: {
  ...snapshot, warnings: []
} } }).warnings, 0, 'a complete empty warning list is a known zero');
for (const pms of [
  { ...input.pmsConnections[0], provider: 'mock' },
  { ...input.pmsConnections[0], last_sync_at: '2026-01-01T00:00:00Z' },
  { ...input.pmsConnections[0], sync_status: 'configured' },
  { ...input.pmsConnections[0], last_sync_error: 'failed' }
]) assert.notEqual(card(buildHotelOperationalHealthSnapshot({ ...input, pmsConnections: [pms] }), 'pms').status, 'healthy');
const partial = buildHotelOperationalHealthSnapshot({ ...input, sources: { ...sources, tickets: { status: 'partial', returned: 250, total: 300 } } });
assert.equal(partial.overallStatus, 'partial');
assert.equal(partial.metrics.realOperationalTickets, null);
assert.equal(card(partial, 'tickets').coverage, 'partial');
assert.equal(card(partial, 'qr_rooms').value, 1, 'independent data is retained');
const denied = buildHotelOperationalHealthSnapshot({ ...input, dataIssues: [{ label: 'tickets', message: 'denied' }] });
assert.equal(card(denied, 'tickets').value, null);
assert.equal(denied.healthScore, null);
assert.equal(card(denied, 'pms').status, 'healthy');
assert.notEqual(buildHotelOperationalHealthSnapshot({ hotel }).coverage.status, 'complete', 'missing coverage is never assumed complete');

// Exercise actual loader: scoped queries, counts in the same request, individual errors/throws/caps.
const queries = [];
const makeDb = (mode) => ({ from(table) {
  const query = { table, filters: [] }; queries.push(query);
  const chain = {
    select(fields, options) { query.count = options?.count; return chain; },
    eq(key, value) { query.filters.push([key, value]); return chain; },
    order() { return chain; }, gte() { return chain; }, limit(value) { query.limit = value; return chain; },
    then(resolve, reject) {
      if (mode === 'throw' && table === 'tickets') return Promise.reject(new Error('network')).then(resolve, reject);
      const data = table === 'hotel_rooms' ? [{ active: true }] : [];
      const result = mode === 'denied' && table === 'tickets' ? { error: { code: '42501' } }
        : { data, count: mode === 'unknown' ? null : mode === 'cap' && table === 'tickets' ? 300 : data.length };
      return Promise.resolve(result).then(resolve, reject);
    }
  }; return chain;
} });
for (const mode of ['ok', 'denied', 'throw', 'unknown', 'cap']) {
  const result = await getHotelOperationalHealth({ supabase: makeDb(mode), hotel, hotelId: hotel.id });
  assert.equal(result.coverage.status, mode === 'ok' ? 'complete' : 'partial');
  assert.equal(card(result, 'qr_rooms').value, 1);
  if (['denied', 'throw'].includes(mode)) assert.equal(card(result, 'tickets').value, null);
}
assert.equal(queries.length, 45, 'no extra count queries');
assert(queries.every((query) => query.count === 'exact' && query.filters.some(([key, value]) => key === 'hotel_id' && value === hotel.id)));

const payload = { ok: true, hotelId: hotel.id, health: snapshot };
let state;
let tenant = hotel.id;
let response = () => Promise.resolve(new Response(JSON.stringify(payload)));
const request = createHealthRequest({ getHotelId: () => tenant, getHeaders: async () => ({}),
  fetchHealth: (...args) => response(...args), onChange: (next) => { state = next; }, timeoutMs: 30, now: () => now.toISOString() });
await request.load();
assert.equal(state.status, 'success');
const first = state;
for (const [kind, fn] of [
  ['network', () => Promise.reject(new TypeError('fetch failed'))],
  ['denied', () => Promise.resolve(new Response('', { status: 403 }))],
  ['timeout', () => Promise.resolve(new Response('', { status: 504 }))]
]) {
  response = fn; await request.load({ reset: true });
  assert.equal(state.status, 'error'); assert.equal(state.error, kind);
  assert.deepEqual([presentHealth(state).score, presentHealth(state).warnings], ['—', '—']);
}
let signal;
response = (_, init) => { signal = init.signal; return new Promise(() => {}); };
await request.load();
assert.equal(signal.aborted, true, 'real client timer aborts transport');
assert.equal(state.error, 'timeout');
response = () => Promise.resolve(new Response(JSON.stringify(payload)));
await request.load();
response = () => Promise.reject(new Error('network'));
await request.load();
assert.equal(state.status, 'stale'); assert.equal(state.obtainedAt, now.toISOString());
assert.deepEqual(state.payload.health, snapshot);
assert.equal(presentHealth(state).allOperational, false);
const stale = state;
response = () => Promise.resolve(new Response(JSON.stringify(payload)));
await request.load(); assert.equal(state.status, 'success');
const recovered = state;
// A transport ignoring abort must still not overwrite the newer response.
let finishOld;
response = () => new Promise((resolve) => { finishOld = resolve; });
const old = request.load(); await Promise.resolve();
response = () => Promise.resolve(new Response(JSON.stringify({ ...payload, marker: 'new' })));
await request.load(); finishOld(new Response(JSON.stringify({ ...payload, marker: 'old' }))); await old;
assert.equal(state.payload.marker, 'new');
response = () => new Promise((resolve) => { finishOld = resolve; });
const oldHotel = request.load(); await Promise.resolve(); tenant = 'hotel-b';
response = () => Promise.resolve(new Response(JSON.stringify({ ...payload, hotelId: tenant })));
await request.load({ reset: true }); finishOld(new Response(JSON.stringify(payload))); await oldHotel;
assert.equal(state.payload.hotelId, 'hotel-b');
response = () => Promise.resolve(new Response(JSON.stringify(payload)));
await request.load({ reset: true }); assert.equal(state.status, 'error'); assert.equal(state.payload, null);
request.cancel();
const noSession = createHealthRequest({ getHotelId: () => hotel.id, getHeaders: () => new Promise(() => {}),
  fetchHealth: () => { throw new Error('must not fetch without headers'); },
  onChange: (next) => { state = next; }, timeoutMs: 20 });
await noSession.load(); assert.equal(state.error, 'timeout'); noSession.cancel();
const malformed = createHealthRequest({ getHotelId: () => hotel.id, getHeaders: async () => ({}),
  fetchHealth: async () => new Response(JSON.stringify({ ok: true, hotelId: hotel.id, health: {} })),
  onChange: (next) => { state = next; } });
await malformed.load(); assert.equal(state.error, 'invalid'); malformed.cancel();

// Render the actual production view with React/SWC, not source-text expectations.
const requireDashboard = createRequire(new URL('../dashboard/package.json', import.meta.url));
const React = requireDashboard('react');
const { renderToStaticMarkup } = requireDashboard('react-dom/server');
const swc = requireDashboard('next/dist/build/swc');
const source = readFileSync(new URL('../dashboard/components/HotelHealthClient.js', import.meta.url), 'utf8');
const compiled = await swc.transform(source, { filename: 'HotelHealthClient.js', jsc: {
  parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }
}, module: { type: 'commonjs' } });
const module = { exports: {} };
const mocks = {
  '@/lib/auth-headers': {}, '@/lib/tenant-client': {}, '@/lib/workspace-context': {},
  '@/lib/health-request': requestModule, '@/lib/ui/styles': styles,
  '@/lib/theme/useDashboardTheme': { useDashboardTheme: () => ({ theme: 'light' }) },
  '@/lib/i18n/useDashboardLanguage': { useDashboardLanguage: () => ({ language: 'es', tx: (value, replacements) => translatePhrase('es', value, replacements) }) },
  'next/link': ({ children, ...props }) => React.createElement('a', props, children)
};
new Function('require', 'module', 'exports', compiled.code)((id) => mocks[id] || requireDashboard(id), module, module.exports);
const render = (requestState) => renderToStaticMarkup(React.createElement(module.exports.HotelHealthView, { requestState }));
for (const bad of [emptyHealthState(), { ...emptyHealthState(), status: 'error', error: 'network' }]) {
  const html = render(bad);
  assert(!html.includes('>Operativo<')); assert(!html.includes('Todo operativo')); assert(!html.includes('0%'));
  assert(html.includes('—'));
}
assert(render({ ...emptyHealthState(), status: 'error', error: 'denied' }).includes('role="alert"'));
assert(render(first).includes('>0<'), 'legitimate zero is rendered');
assert(render(stale).includes('Última información disponible'));
assert(render(stale).includes('Datos obtenidos:'));
assert(!render(stale).includes('>Operativo<'));
assert(!render(recovered).includes('Última información disponible'));
assert(render({ ...first, payload: { ...payload, health: partial } }).includes('Muestra parcial; total no acreditado'));
assert(render({ ...first, payload: { ...payload, health: denied } }).includes('Fuente no disponible'));
console.log('Health truthful status: coverage, independent sources, services, network/403/504, real deadline, refresh/recovery, ordering, tenant and React rendering PASS');
