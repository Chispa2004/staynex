import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAutomationRunResponse,
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
  canAccessResult = true
} = {}) => {
  const calls = {
    context: 0,
    runner: 0,
    runnerHotelIds: []
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
    canAccess: () => canAccessResult
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
  const deps = createDeps({
    context: authedContext({ hotel: hotelMarruecos, platformRole: 'platform_admin' })
  });
  const result = await handleAutomationRunPost({
    request: requestForHotel(hotelMarruecos.id),
    ...deps
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.hotel.id, hotelMarruecos.id);
  assert.equal(deps.calls.runner, 1);
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
    request: requestForHotel(hotelMarruecos.id, { 'x-request-id': 'req-1' })
  });

  assert.equal(response.hotel.id, hotelMarruecos.id);
  assert.equal(response.evaluatedReservations, 0);
  assert.equal(response.preview, 0);
  assert.equal(response.runtimeVersion, 'automation-runtime-foundation-phase1');
  assert.equal(response.executionMode, 'preview');
  assert.equal(response.requestId, 'req-1');

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
  assert.equal(runnerSource.includes('SUPABASE_URL'), false);
}

console.log('Automation preview hotel context tests passed');
