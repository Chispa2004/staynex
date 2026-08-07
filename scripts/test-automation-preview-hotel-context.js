import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAutomationEnvironmentDiagnostic,
  buildAutomationRunResponse,
  getSupabaseProjectRefFromUrl,
  handleAutomationRunPost
} from '../dashboard/lib/automation-run-api.js';
import { buildPreviewPassResultMessage } from '../dashboard/lib/automation-run-client.js';
import { getWorkspaceRequestHeaders } from '../dashboard/lib/workspace-context.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const hotelMarruecos = {
  id: '1b54fe61-d635-4644-b43f-d9717a26d457',
  name: 'Hotel Marruecos'
};
const hotelOther = {
  id: '22222222-2222-4222-9222-222222222222',
  name: 'Other Hotel'
};
const fixtureProjectRef = 'vblxmnqbatqrynfaasmf';
const otherProjectRef = 'otherprojectref12345';
const defaultEnv = {
  SUPABASE_URL: `https://${fixtureProjectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${fixtureProjectRef}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-should-not-appear',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-should-not-appear'
};
const silentLogger = { info: () => {} };

const requestForHotel = (hotelId, headers = {}) => new Request('https://dashboard.example/api/automations/run', {
  method: 'POST',
  headers: {
    ...(hotelId ? { 'x-staynex-hotel-id': hotelId } : {}),
    ...headers
  }
});

const createDeps = ({
  context,
  summary = {},
  canAccessResult = true,
  env = defaultEnv,
  logger = silentLogger,
  onRunner = null
} = {}) => {
  const calls = {
    context: 0,
    runner: 0,
    runnerHotelIds: [],
    log: 0
  };

  return {
    calls,
    getCurrentHotelForRequest: async () => {
      calls.context += 1;
      return context;
    },
    runDashboardAutomationScheduler: async ({ hotel }) => {
      calls.runner += 1;
      calls.runnerHotelIds.push(hotel.id);
      onRunner?.();
      return {
        summary: {
          mode: 'preview',
          evaluatedReservations: 3,
          eligible: 1,
          preview: 1,
          skipped: 2,
          duplicateCandidate: 0,
          duplicateExisting: 0,
          blocked: 0,
          skipReasons: {},
          ...summary
        },
        scheduledMessages: [{
          guest: { phone_number: '+34999999999' },
          reservation: { guest_name: 'Guest PII' }
        }]
      };
    },
    canAccess: () => canAccessResult,
    env,
    logger: {
      info: (payload) => {
        calls.log += 1;
        logger.info(payload);
      }
    }
  };
};

const authedContext = ({ hotel, role = 'owner', platformRole = 'none', fallback = false } = {}) => ({
  supabase: { mocked: true },
  hotel,
  role,
  platformRole,
  fallback,
  accessDenied: false,
  user: { id: 'user-1', email: 'redacted@example.test' }
});

{
  assert.equal(
    getSupabaseProjectRefFromUrl(`https://${fixtureProjectRef}.supabase.co`),
    fixtureProjectRef
  );
  assert.equal(
    getSupabaseProjectRefFromUrl(`  https://${fixtureProjectRef}.supabase.co  `),
    fixtureProjectRef
  );
  assert.equal(getSupabaseProjectRefFromUrl(undefined), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl(null), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl(''), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl('not-a-url'), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl(`http://${fixtureProjectRef}.supabase.co`), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl(`ftp://${fixtureProjectRef}.supabase.co`), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl(`https://${fixtureProjectRef}.supabase.co.evil.com`), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl('https://foo.bar.supabase.co'), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl('https://supabase.co'), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl('https://example.com'), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl(`https://user:pass@${fixtureProjectRef}.supabase.co`), 'unknown');
  assert.equal(getSupabaseProjectRefFromUrl(`https://${fixtureProjectRef}.supabase.co:5432`), 'unknown');
}

{
  assert.deepEqual(buildAutomationEnvironmentDiagnostic({
    env: {
      SUPABASE_URL: `https://${fixtureProjectRef}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_URL: `https://${fixtureProjectRef}.supabase.co`
    }
  }), {
    serverSupabaseProjectRef: fixtureProjectRef,
    publicSupabaseProjectRef: fixtureProjectRef,
    projectsMatch: true
  });
  assert.deepEqual(buildAutomationEnvironmentDiagnostic({
    env: {
      SUPABASE_URL: `https://${fixtureProjectRef}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_URL: `https://${otherProjectRef}.supabase.co`
    }
  }), {
    serverSupabaseProjectRef: fixtureProjectRef,
    publicSupabaseProjectRef: otherProjectRef,
    projectsMatch: false
  });
}

{
  const deps = createDeps({
    context: authedContext({ hotel: hotelMarruecos, platformRole: 'platform_admin' })
  });
  const result = await handleAutomationRunPost({
    request: requestForHotel(hotelMarruecos.id),
    ...deps
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.hotel.id, hotelMarruecos.id);
  assert.deepEqual(result.body.environmentDiagnostic, {
    serverSupabaseProjectRef: fixtureProjectRef,
    publicSupabaseProjectRef: fixtureProjectRef,
    projectsMatch: true
  });
  assert.equal(deps.calls.runner, 1);
  assert.equal(deps.calls.log, 1);
  assert.deepEqual(deps.calls.runnerHotelIds, [hotelMarruecos.id]);
}

{
  const deps = createDeps({
    context: authedContext({ hotel: hotelOther, platformRole: 'platform_admin' })
  });
  const result = await handleAutomationRunPost({
    request: requestForHotel(hotelOther.id),
    ...deps
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.hotel.id, hotelOther.id);
  assert.deepEqual(deps.calls.runnerHotelIds, [hotelOther.id]);
}

{
  const deps = createDeps({
    context: authedContext({ hotel: hotelMarruecos })
  });
  const result = await handleAutomationRunPost({
    request: requestForHotel(null),
    ...deps
  });

  assert.equal(result.status, 400);
  assert.equal(deps.calls.context, 0);
  assert.equal(deps.calls.runner, 0);
  assert.equal(deps.calls.log, 0);
}

{
  const deps = createDeps({
    context: authedContext({ hotel: hotelMarruecos })
  });
  const result = await handleAutomationRunPost({
    request: requestForHotel(hotelOther.id),
    ...deps
  });

  assert.equal(result.status, 403);
  assert.equal(deps.calls.runner, 0);
  assert.equal(deps.calls.log, 0);
}

{
  const ownHotelDeps = createDeps({
    context: authedContext({ hotel: hotelMarruecos, role: 'admin' })
  });
  const ownHotelResult = await handleAutomationRunPost({
    request: requestForHotel(hotelMarruecos.id),
    ...ownHotelDeps
  });

  assert.equal(ownHotelResult.status, 200);
  assert.equal(ownHotelDeps.calls.runner, 1);

  const otherHotelDeps = createDeps({
    context: authedContext({ hotel: hotelMarruecos, role: 'admin' })
  });
  const otherHotelResult = await handleAutomationRunPost({
    request: requestForHotel(hotelOther.id),
    ...otherHotelDeps
  });

  assert.equal(otherHotelResult.status, 403);
  assert.equal(otherHotelDeps.calls.runner, 0);
  assert.equal(otherHotelDeps.calls.log, 0);
}

{
  const deps = createDeps({
    context: authedContext({ hotel: hotelMarruecos, role: 'receptionist' }),
    canAccessResult: false
  });
  const result = await handleAutomationRunPost({
    request: requestForHotel(hotelMarruecos.id),
    ...deps
  });

  assert.equal(result.status, 403);
  assert.equal(deps.calls.runner, 0);
  assert.equal(deps.calls.log, 0);
}

{
  const response = buildAutomationRunResponse({
    hotel: hotelMarruecos,
    summary: {
      mode: 'preview',
      evaluatedReservations: 0,
      eligible: 0,
      preview: 0,
      skipped: 0,
      duplicateCandidate: 0,
      duplicateExisting: 0,
      blocked: 0,
      skipReasons: {}
    },
    request: requestForHotel(hotelMarruecos.id, { 'x-request-id': 'req-1' }),
    environmentDiagnostic: buildAutomationEnvironmentDiagnostic({ env: defaultEnv })
  });

  assert.equal(response.hotel.id, hotelMarruecos.id);
  assert.equal(response.evaluatedReservations, 0);
  assert.equal(response.preview, 0);
  assert.equal(response.runtimeVersion, 'automation-runtime-foundation-phase1');
  assert.equal(response.executionMode, 'preview');
  assert.equal(response.requestId, 'req-1');
  assert.deepEqual(response.environmentDiagnostic, {
    serverSupabaseProjectRef: fixtureProjectRef,
    publicSupabaseProjectRef: fixtureProjectRef,
    projectsMatch: true
  });

  const message = buildPreviewPassResultMessage(response);
  assert.match(message, /Hotel Marruecos/);
  assert.match(message, /0 reservations evaluated/);
  assert.match(message, /No guest messages were sent\./);
}

{
  const deps = createDeps({
    context: authedContext({ hotel: hotelMarruecos }),
    summary: {
      evaluatedReservations: 1,
      eligible: 1,
      preview: 1,
      skipped: 0
    }
  });
  const result = await handleAutomationRunPost({
    request: requestForHotel(hotelMarruecos.id),
    ...deps
  });
  const serialized = JSON.stringify(result.body);

  assert.equal(result.status, 200);
  assert.equal(result.body.preview, 1);
  assert.equal(result.body.scheduled, 1);
  assert.equal(result.body.previewGenerated, 1);
  assert.equal(serialized.includes('+34999999999'), false);
  assert.equal(serialized.includes('Guest PII'), false);
}

{
  const observed = [];
  let loggedPayload = null;
  const sensitiveEnv = {
    SUPABASE_URL: `https://${fixtureProjectRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${otherProjectRef}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: 'SERVICE_ROLE_KEY_SHOULD_NOT_LEAK',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ANON_KEY_SHOULD_NOT_LEAK'
  };
  const deps = createDeps({
    context: authedContext({ hotel: hotelMarruecos }),
    env: sensitiveEnv,
    logger: {
      info: (payload) => {
        observed.push('log');
        loggedPayload = payload;
      }
    },
    onRunner: () => observed.push('runner')
  });
  const result = await handleAutomationRunPost({
    request: requestForHotel(hotelMarruecos.id, { 'x-request-id': 'diag-req' }),
    ...deps
  });
  const serialized = JSON.stringify(result.body);

  assert.equal(result.status, 200);
  assert.deepEqual(observed, ['log', 'runner']);
  assert.deepEqual(loggedPayload, {
    event: 'automation_preview_environment',
    requestId: 'diag-req',
    hotelId: hotelMarruecos.id,
    serverSupabaseProjectRef: fixtureProjectRef,
    publicSupabaseProjectRef: otherProjectRef,
    supabaseProjectsMatch: false
  });
  assert.deepEqual(result.body.environmentDiagnostic, {
    serverSupabaseProjectRef: fixtureProjectRef,
    publicSupabaseProjectRef: otherProjectRef,
    projectsMatch: false
  });
  assert.equal(serialized.includes('https://'), false);
  assert.equal(serialized.includes('supabase.co'), false);
  assert.equal(serialized.includes('SERVICE_ROLE_KEY_SHOULD_NOT_LEAK'), false);
  assert.equal(serialized.includes('ANON_KEY_SHOULD_NOT_LEAK'), false);
  assert.equal(serialized.includes('token'), false);
}

{
  assert.deepEqual(getWorkspaceRequestHeaders({ hotelId: hotelMarruecos.id }), {
    'x-staynex-hotel-id': hotelMarruecos.id
  });
}

{
  const automationsClientSource = readFileSync(join(root, 'dashboard/components/AutomationsClient.js'), 'utf8');
  const automationsClientHelperSource = readFileSync(join(root, 'dashboard/lib/automation-run-client.js'), 'utf8');
  const routeSource = readFileSync(join(root, 'dashboard/app/api/automations/run/route.js'), 'utf8');

  assert.ok(
    automationsClientSource.includes('getAuthHeaders({ hotelId: hotel.id })'),
    'Generate preview pass should send the visible hotel id explicitly'
  );
  assert.ok(
    automationsClientHelperSource.includes('No guest messages were sent.'),
    'UI summary should explicitly state that no guest messages were sent'
  );
  assert.ok(
    routeSource.includes('handleAutomationRunPost'),
    'API route should use the explicit hotel context handler'
  );
  assert.equal(routeSource.includes('scheduledMessages: result.scheduledMessages'), false);
  const runnerSource = readFileSync(join(root, 'dashboard/lib/automation-runner.js'), 'utf8');
  assert.equal(runnerSource.includes('environmentDiagnostic'), false);
  assert.equal(runnerSource.includes('SUPABASE_URL'), false);
}

console.log('Automation preview hotel context tests passed');
