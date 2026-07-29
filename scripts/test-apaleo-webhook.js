import 'dotenv/config';

const requiredFlags = [
  'RUN_EXTERNAL_APALEO_TESTS',
  'RUN_MUTATING_INTEGRATION_TESTS'
];

if (process.env.NODE_ENV === 'production') {
  console.error('Apaleo webhook integration test is blocked in production.');
  process.exit(1);
}

const missingFlags = requiredFlags.filter((flag) => process.env[flag] !== 'true');

if (missingFlags.length > 0) {
  console.warn(JSON.stringify({
    ok: true,
    skipped: true,
    missing_flags: missingFlags,
    note: 'Set all required flags to true to run this external mutating integration test.'
  }, null, 2));
  process.exit(0);
}

const { processApaleoWebhookEvent } = await import('../src/integrations/apaleo/apaleo-webhooks.service.js');

const headers = {
  'x-apaleo-account-code': process.env.APALEO_ACCOUNT_CODE || 'staynex-demo'
};

const eventId = (suffix) => `evt-test-${suffix}-${Date.now()}`;

const payloads = [
  {
    id: eventId('created'),
    type: 'reservation.created',
    reservationId: process.env.APALEO_TEST_RESERVATION_ID || 'TEST-RES-CREATED',
    createdAt: new Date().toISOString()
  },
  {
    id: eventId('amended'),
    eventType: 'reservation.amended',
    resource: {
      id: process.env.APALEO_TEST_RESERVATION_ID || 'TEST-RES-AMENDED'
    },
    accountCode: process.env.APALEO_ACCOUNT_CODE || 'staynex-demo',
    createdAt: new Date().toISOString()
  },
  {
    id: eventId('canceled'),
    eventType: 'reservation.canceled',
    data: {
      id: process.env.APALEO_TEST_RESERVATION_ID || 'TEST-RES-CANCELED'
    },
    createdAt: new Date().toISOString()
  }
];

const run = async () => {
  console.log('Testing Apaleo webhook processor with sample reservation events.');

  for (const payload of payloads) {
    const result = await processApaleoWebhookEvent(payload, headers);

    console.log(JSON.stringify({
      input: payload.type || payload.eventType,
      status: result.status,
      ok: result.ok,
      error: result.error || null,
      reservationId: result.reservation?.pms_reservation_id || payload.reservationId || payload.resource?.id || payload.data?.id
    }, null, 2));
  }
};

run().catch((error) => {
  console.error('Apaleo webhook test failed unexpectedly', error);
  process.exitCode = 1;
});
