import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyAutomationProviderError, classifyAutomationProviderResult, requestAutomationRetry } from '../shared/automations/dispatch.js';

assert.equal(process.env.SEND_AUTOMATIONS, 'false');
const load = (file, bindings, exports) => {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replaceAll('export const ', 'const ').replaceAll('export async function ', 'async function ');
  return new Function(...Object.keys(bindings), source + `\nreturn {${exports.join(',')}};`)(...Object.values(bindings));
};
let sends = 0, options, payload;
const fakeEnv = { TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32), TWILIO_AUTH_TOKEN: 'synthetic', TWILIO_WHATSAPP_FROM: '+34900000001' };
const { sendAutomationWhatsAppMessage } = load('src/services/twilio.service.js', {
  process: { env: fakeEnv }, twilio: (_sid, _token, opts) => {
    options = opts;
    return { messages: { create: async data => { sends++; payload = data; return { sid: 'SM' + 'a'.repeat(32), status: 'queued' }; } } };
  }
}, ['sendAutomationWhatsAppMessage']);
await sendAutomationWhatsAppMessage({ to: '+34900000002', body: 'Synthetic' });
assert.deepEqual(options, { timeout: 15000, autoRetry: false });
assert.equal(payload.to, 'whatsapp:+34900000002'); assert.equal(sends, 1);
delete fakeEnv.TWILIO_WHATSAPP_FROM;
await assert.rejects(() => sendAutomationWhatsAppMessage({ to: '+34900000002', body: 'Synthetic' }), e => e.automationSendNotAttempted === true);
assert.equal(sends, 1);
assert.equal(classifyAutomationProviderError({ status: 429, code: 20429 }).retry, true);
assert.equal(classifyAutomationProviderError({ status: 503, code: 20500 }).phase, 'unknown');
assert.equal(classifyAutomationProviderError({ status: 429 }).phase, 'unknown', 'Transport-shaped errors without provider evidence stay unknown');
for (const status of ['queued', 'sent', 'delivered', 'failed', 'undelivered']) {
  const result = classifyAutomationProviderResult({ sid: 'SM' + 'a'.repeat(32), status });
  assert.equal(result.phase, 'accepted'); assert.equal(result.providerStatus, status); assert.equal(result.retry, false);
}
console.log('PASS Automation Twilio adapter: bounded timeout, no SDK retry, no provider on preflight failure, acceptance distinct from delivery');

// Execute the actual route with isolated platform authentication and DB adapters.
// The real RPC and races are covered by the disposable PostgreSQL suite.
let authorized = true, loggedIn = true, stored = null, rpcArgs, dbCalls = 0, auditCalls = 0;
const supabase = {
  from(table) {
    dbCalls++; assert.equal(table, 'scheduled_messages');
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: 'stored-id', hotel_id: 'stored-hotel' } }) };
    return query;
  },
  rpc: async (name, args) => { assert.equal(name, 'automation_dispatch_retry'); rpcArgs = args; return { data: stored }; }
};
const { POST } = load('dashboard/app/api/platform/monitoring/route.js', {
  requestAutomationRetry, NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) },
  getPlatformContext: async (_request, opts) => {
    assert.equal(opts.requireAdmin, true);
    if (!loggedIn) throw Object.assign(new Error('No session'), { status: 401 });
    return { supabase, platformRole: 'admin', user: { id: 'test-actor' }, role: 'admin' };
  },
  canAccessPlatform: () => authorized, writePlatformAuditLog: async () => { auditCalls++; },
  getPlatformMonitoring: async () => ({}), sanitizePilotOperationalMessage: (_message, fallback) => fallback
}, ['POST']);
const request = { json: async () => ({ action: 'retry_automation', id: 'stored-id', hotelId: 'untrusted-hotel' }) };
loggedIn = false; assert.equal((await POST(request)).status, 401);
loggedIn = true; authorized = false; assert.equal((await POST(request)).status, 403); assert.equal(dbCalls, 0);
authorized = true; assert.equal((await POST(request)).status, 409); assert.equal(auditCalls, 0);
assert.deepEqual(rpcArgs, { p_message_id: 'stored-id', p_hotel_id: 'stored-hotel' });
stored = { id: 'stored-id', hotel_id: 'stored-hotel', status: 'retry' };
assert.equal((await POST(request)).status, 200); assert.equal(auditCalls, 1);
supabase.rpc = async () => ({ error: new Error('Missing migration') });
assert.equal((await POST(request)).status, 500); assert.equal(auditCalls, 1);
console.log('PASS Existing monitoring authorization preserved; stored hotel scopes retry, no evidence is 409, missing RPC fails closed');
