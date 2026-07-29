import assert from 'assert';
import fs from 'fs';
import express from 'express';
import twilio from 'twilio';
import {
  areTestRoutesEnabled,
  blockProductionTestRoute,
  blockUnverifiedApaleoWebhookInProduction,
  requireExplicitHotelId,
  requireInternalApiToken,
  requireTestRoutesEnabled,
  requestIdMiddleware,
  safeCompare,
  validateTwilioWebhook
} from '../src/middleware/security.middleware.js';
import { createDebugRouter } from '../src/routes/debug.routes.js';
import {
  sanitizeDebugAiLog,
  sanitizeDebugReservation
} from '../src/controllers/debug.controller.js';
import { maskPhoneForLogs } from '../src/utils/privacy.js';

const INTERNAL_TOKEN_SENTINEL = 'staynex-test-internal-token-sentinel';
const TWILIO_TOKEN_SENTINEL = 'twilio-test-auth-token-sentinel';
const originalEnv = { ...process.env };
const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!Object.prototype.hasOwnProperty.call(originalEnv, key)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
};

const createResponse = () => {
  const response = {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  return response;
};

const createRequest = (overrides = {}) => ({
  method: 'POST',
  originalUrl: '/internal',
  url: '/internal',
  protocol: 'https',
  headers: {},
  body: {},
  query: {},
  requestId: 'test-request-id',
  ...overrides
});

const runMiddleware = (middleware, req) => {
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  return {
    res,
    nextCalled
  };
};

const testRequestIdSanitization = () => {
  let req = createRequest({
    headers: {
      'x-request-id': 'valid.Request-123_:'
    }
  });
  let result = runMiddleware(requestIdMiddleware, req);
  assert.equal(result.nextCalled, true);
  assert.equal(req.requestId, 'valid.Request-123_:');
  assert.equal(result.res.headers['X-Request-Id'], 'valid.Request-123_:');

  req = createRequest({
    headers: {
      'x-request-id': 'bad-request-id\nwith-newline'
    }
  });
  result = runMiddleware(requestIdMiddleware, req);
  assert.equal(result.nextCalled, true);
  assert.match(req.requestId, requestIdPattern);
  assert.notEqual(req.requestId, 'bad-request-id\nwith-newline');

  req = createRequest({
    headers: {
      'x-correlation-id': 'x'.repeat(129)
    }
  });
  result = runMiddleware(requestIdMiddleware, req);
  assert.equal(result.nextCalled, true);
  assert.match(req.requestId, requestIdPattern);
  assert.notEqual(req.requestId, 'x'.repeat(129));
};

const testInternalAuth = () => {
  resetEnv();
  process.env.NODE_ENV = 'test';
  delete process.env.STAYNEX_INTERNAL_API_TOKEN;

  let result = runMiddleware(requireInternalApiToken, createRequest());
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 503);

  process.env.STAYNEX_INTERNAL_API_TOKEN = INTERNAL_TOKEN_SENTINEL;

  result = runMiddleware(requireInternalApiToken, createRequest());
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);

  result = runMiddleware(requireInternalApiToken, createRequest({
    headers: {
      'x-staynex-internal-token': 'wrong-token'
    }
  }));
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);

  result = runMiddleware(requireInternalApiToken, createRequest({
    headers: {
      'x-staynex-internal-token': INTERNAL_TOKEN_SENTINEL
    }
  }));
  assert.equal(result.nextCalled, true);
  assert.equal(result.res.statusCode, 200);
};

const testMissingInternalConfigFailsClosedInProduction = () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  delete process.env.STAYNEX_INTERNAL_API_TOKEN;

  const result = runMiddleware(requireInternalApiToken, createRequest());
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 503);
};

const testTestRouteFlagPolicy = () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.ENABLE_TEST_ROUTES = 'true';

  let result = runMiddleware(requireTestRoutesEnabled, createRequest({
    originalUrl: '/test-message'
  }));
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 404);

  resetEnv();
  process.env.NODE_ENV = 'staging';
  delete process.env.ENABLE_TEST_ROUTES;

  result = runMiddleware(requireTestRoutesEnabled, createRequest({
    originalUrl: '/demo-data/luxury'
  }));
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 404);

  process.env.ENABLE_TEST_ROUTES = 'true';
  result = runMiddleware(requireTestRoutesEnabled, createRequest({
    originalUrl: '/demo-data/luxury'
  }));
  assert.equal(result.nextCalled, true);
};

const listen = (app) => new Promise((resolve, reject) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
  server.on('error', reject);
});

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => {
    if (error) {
      reject(error);
      return;
    }

    resolve();
  });
});

const withServer = async (app, callback) => {
  const server = await listen(app);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await closeServer(server);
  }
};

const buildTwilioWebhookApp = ({ calls }) => {
  const app = express();
  const router = express.Router();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(requestIdMiddleware);

  router.post('/whatsapp', validateTwilioWebhook, (req, res) => {
    calls.push({
      body: req.body,
      originalUrl: req.originalUrl,
      path: req.path,
      query: req.query,
      requestId: req.requestId
    });

    res.status(204).send();
  });

  app.use('/webhooks', router);
  return app;
};

const formBody = {
  Body: 'hola',
  From: 'whatsapp:+34123456789',
  To: 'whatsapp:+34987654321',
  MessageSid: 'SM00000000000000000000000000000000'
};

const postTwilioForm = async ({ url, signature, body = formBody }) => fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'x-twilio-signature': signature
  },
  body: new URLSearchParams(body).toString()
});

const testTwilioValidationThroughExpress = async () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.TWILIO_AUTH_TOKEN = TWILIO_TOKEN_SENTINEL;
  delete process.env.TWILIO_WEBHOOK_PUBLIC_URL;
  delete process.env.TWILIO_WEBHOOK_VALIDATION_BYPASS;

  const calls = [];
  const app = buildTwilioWebhookApp({ calls });

  await withServer(app, async (baseUrl) => {
    const webhookUrl = `${baseUrl}/webhooks/whatsapp?hotelId=hotel-123&mode=form`;

    let response = await postTwilioForm({
      url: webhookUrl,
      signature: 'invalid-signature'
    });
    assert.equal(response.status, 403);
    assert.equal(calls.length, 0);

    const signature = twilio.getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      webhookUrl,
      formBody
    );

    response = await postTwilioForm({
      url: webhookUrl,
      signature
    });
    assert.equal(response.status, 204);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.Body, formBody.Body);
    assert.equal(calls[0].body.From, formBody.From);
    assert.equal(calls[0].originalUrl, '/webhooks/whatsapp?hotelId=hotel-123&mode=form');
    assert.equal(calls[0].path, '/whatsapp');
    assert.equal(calls[0].query.hotelId, 'hotel-123');
    assert.equal(calls[0].query.mode, 'form');
    assert.match(calls[0].requestId, requestIdPattern);
  });
};

const testTwilioConfiguredPublicUrlExactMatch = async () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.TWILIO_AUTH_TOKEN = TWILIO_TOKEN_SENTINEL;

  const calls = [];
  const app = buildTwilioWebhookApp({ calls });

  await withServer(app, async (baseUrl) => {
    const webhookUrl = `${baseUrl}/webhooks/whatsapp`;
    process.env.TWILIO_WEBHOOK_PUBLIC_URL = webhookUrl;
    const signature = twilio.getExpectedTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN,
      webhookUrl,
      formBody
    );
    const response = await postTwilioForm({
      url: webhookUrl,
      signature
    });

    assert.equal(response.status, 204);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].originalUrl, '/webhooks/whatsapp');
  });
};

const testTwilioMissingConfigFailsClosedInProduction = async () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  delete process.env.TWILIO_AUTH_TOKEN;

  const calls = [];
  const app = buildTwilioWebhookApp({ calls });

  await withServer(app, async (baseUrl) => {
    const response = await postTwilioForm({
      url: `${baseUrl}/webhooks/whatsapp`,
      signature: 'anything'
    });

    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  });
};

const testTwilioBypassDoesNotWorkInProduction = async () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.TWILIO_WEBHOOK_VALIDATION_BYPASS = 'true';
  delete process.env.TWILIO_AUTH_TOKEN;

  const calls = [];
  const app = buildTwilioWebhookApp({ calls });

  await withServer(app, async (baseUrl) => {
    const response = await postTwilioForm({
      url: `${baseUrl}/webhooks/whatsapp`,
      signature: 'anything'
    });

    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  });
};

const testApaleoLiveBlockedWithoutOfficialValidation = () => {
  resetEnv();
  process.env.NODE_ENV = 'production';

  const result = runMiddleware(blockUnverifiedApaleoWebhookInProduction, createRequest({
    originalUrl: '/integrations/apaleo/webhook'
  }));
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 503);
};

const testProductionTestRoutesBlocked = () => {
  resetEnv();
  process.env.NODE_ENV = 'production';

  const result = runMiddleware(blockProductionTestRoute, createRequest({
    originalUrl: '/test-message'
  }));
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 404);
};

const testExplicitHotelContextRequired = () => {
  resetEnv();
  process.env.NODE_ENV = 'test';

  let req = createRequest({
    originalUrl: '/integrations/pms-connections/sync',
    body: {}
  });
  let result = runMiddleware(requireExplicitHotelId, req);
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 400);
  assert.equal(req.explicitHotelId, undefined);

  req = createRequest({
    originalUrl: '/integrations/pms-connections/sync',
    body: {
      hotelId: 'hotel-123'
    }
  });
  result = runMiddleware(requireExplicitHotelId, req);
  assert.equal(result.nextCalled, true);
  assert.equal(req.explicitHotelId, 'hotel-123');
};

const testSafeCompareUsesFixedLengthDigests = () => {
  assert.equal(safeCompare('same-token', 'same-token'), true);
  assert.equal(safeCompare('same-length-a', 'same-length-b'), false);
  assert.equal(safeCompare('short', 'a-much-longer-token-value'), false);
};

const getDebug = async ({ baseUrl, token = null, authorization = null } = {}) => {
  const headers = {};

  if (token) {
    headers['x-staynex-internal-token'] = token;
  }

  if (authorization) {
    headers.authorization = authorization;
  }

  return fetch(`${baseUrl}/debug/ai-logs`, { headers });
};

const buildDebugTestApp = ({ platformAdminGuard } = {}) => {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);

  if (areTestRoutesEnabled()) {
    app.use('/debug', createDebugRouter({
      platformAdminGuard,
      controllers: {
        handleGetAiLogs: (req, res) => res.status(200).json({ ok: true, controller: 'ai-logs' }),
        handleGetReservations: (req, res) => res.status(200).json({ ok: true, controller: 'reservations' })
      }
    }));
  }

  return app;
};

const testDebugRoutesMountPolicyAndGuards = async () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.ENABLE_TEST_ROUTES = 'true';
  process.env.STAYNEX_INTERNAL_API_TOKEN = INTERNAL_TOKEN_SENTINEL;

  await withServer(buildDebugTestApp({
    platformAdminGuard: (req, res, next) => next()
  }), async (baseUrl) => {
    const response = await getDebug({ baseUrl, token: INTERNAL_TOKEN_SENTINEL, authorization: 'Bearer platform' });
    assert.equal(response.status, 404);
  });

  resetEnv();
  process.env.NODE_ENV = 'staging';
  delete process.env.ENABLE_TEST_ROUTES;
  process.env.STAYNEX_INTERNAL_API_TOKEN = INTERNAL_TOKEN_SENTINEL;

  await withServer(buildDebugTestApp({
    platformAdminGuard: (req, res, next) => next()
  }), async (baseUrl) => {
    const response = await getDebug({ baseUrl, token: INTERNAL_TOKEN_SENTINEL, authorization: 'Bearer platform' });
    assert.equal(response.status, 404);
  });

  resetEnv();
  process.env.NODE_ENV = 'staging';
  process.env.ENABLE_TEST_ROUTES = 'true';
  delete process.env.STAYNEX_INTERNAL_API_TOKEN;

  await withServer(buildDebugTestApp({
    platformAdminGuard: (req, res, next) => next()
  }), async (baseUrl) => {
    const response = await getDebug({ baseUrl });
    assert.equal(response.status, 503);
  });

  process.env.STAYNEX_INTERNAL_API_TOKEN = INTERNAL_TOKEN_SENTINEL;

  const platformOnlyGuard = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer platform-admin') {
      res.status(403).json({ ok: false, error: 'Platform admin access required' });
      return;
    }

    next();
  };

  await withServer(buildDebugTestApp({
    platformAdminGuard: platformOnlyGuard
  }), async (baseUrl) => {
    let response = await getDebug({ baseUrl, token: 'wrong-token' });
    assert.equal(response.status, 403);

    response = await getDebug({
      baseUrl,
      token: INTERNAL_TOKEN_SENTINEL,
      authorization: 'Bearer hotel-user'
    });
    assert.equal(response.status, 403);

    response = await getDebug({
      baseUrl,
      token: INTERNAL_TOKEN_SENTINEL,
      authorization: 'Bearer platform-admin'
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.controller, 'ai-logs');
  });
};

const testDemoRouteBlockingFixes = () => {
  const statsRoute = fs.readFileSync('dashboard/app/api/demo/stats/route.js', 'utf8');
  assert(statsRoute.includes('areServerTestRoutesEnabled'));
  assert(statsRoute.includes('getDemoPlatformAdminContext'));
  assert(statsRoute.includes('getExplicitDemoStatsHotelId'));
  assert(statsRoute.includes('hotelId is required'));
  assert(!statsRoute.includes('getDemoStats(request)'));

  const cleanRoute = fs.readFileSync('dashboard/app/api/demo/clean/route.js', 'utf8');
  assert(cleanRoute.includes('areServerTestRoutesEnabled'));
  assert(cleanRoute.includes('getDemoPlatformAdminContext'));
  assert(cleanRoute.includes('getExplicitDemoCleanHotelId'));
  assert(cleanRoute.includes('hotelId is required'));
  assert(!cleanRoute.includes('cleanDemoData(request)'));

  const demoLib = fs.readFileSync('dashboard/lib/demo.js', 'utf8');
  assert(!demoLib.includes('getCurrentHotelForRequest'));
  assert(demoLib.includes('getPlatformContext'));
  assert(demoLib.includes('getValidatedDemoHotel'));
  assert(demoLib.includes("query.eq('hotel_id', hotelId)"));
  assert(demoLib.includes(".delete()\n    .eq('hotel_id', hotelId)"));

  for (const routePath of [
    'dashboard/app/api/demo/generate/route.js',
    'dashboard/app/api/demo/run/route.js',
    'dashboard/app/api/onboarding/demo-data/route.js',
    'dashboard/app/api/reservations/create-test/route.js'
  ]) {
    const source = fs.readFileSync(routePath, 'utf8');
    assert(source.includes('assertDemoHotelContext'), `${routePath} should reject fallback hotel context`);
  }

  const demoClient = fs.readFileSync('dashboard/components/DemoControlCenter.js', 'utf8');
  assert(demoClient.includes('/api/demo/stats?hotelId='));
  assert(demoClient.includes('body: JSON.stringify({ hotelId })'));
};

const testLogRedactionRegressions = () => {
  assert.equal(maskPhoneForLogs('whatsapp:+34600111122'), '***1122');
  assert.equal(maskPhoneForLogs('local-test:hotel-123'), '***123');

  const redactedReservation = sanitizeDebugReservation({
    guest_phone: '+34600111122',
    guest_email: 'guest@example.com',
    reservation_access_token: 'STX-SUPERSECRET',
    payload: { Body: 'hello from guest' }
  });
  const redactedAiLog = sanitizeDebugAiLog({
    raw_guest_message: 'My phone is +34600111122',
    generated_response: 'full response',
    authorization: 'Bearer secret'
  });
  const redactedText = JSON.stringify({ redactedReservation, redactedAiLog });

  assert(!redactedText.includes('+34600111122'));
  assert(!redactedText.includes('guest@example.com'));
  assert(!redactedText.includes('STX-SUPERSECRET'));
  assert(!redactedText.includes('hello from guest'));
  assert(redactedText.includes('***1122'));
  assert(redactedText.includes('hasReservationAccessToken'));

  const guestService = fs.readFileSync('src/services/guest.service.js', 'utf8');
  assert(guestService.includes('phone: phoneForLogs'));

  const staynexService = fs.readFileSync('src/services/staynex.service.js', 'utf8');
  assert(staynexService.includes('hasReservationAccessToken'));
  assert(!/logger\.(info|warn|error)\([\s\S]{0,260}reservationAccessToken/.test(staynexService));

  const conversationContextService = fs.readFileSync('src/services/conversation-context.service.js', 'utf8');
  assert(conversationContextService.includes('hasReservationAccessToken'));
  assert(!/logger\.(info|warn|error)\([\s\S]{0,260}reservationAccessToken/.test(conversationContextService));
};

const testDashboardTenantGuardsRemainInPlace = () => {
  const sendRoute = fs.readFileSync('dashboard/app/api/messages/send/route.js', 'utf8');
  assert(sendRoute.includes(".eq('hotel_id', hotel.id)"));
  assert(sendRoute.includes('hotelId: hotel.id'));
  assert(!sendRoute.includes('hotelId: body.hotelId'));

  const translateRoute = fs.readFileSync('dashboard/app/api/translate/route.js', 'utf8');
  assert(translateRoute.includes(".eq('hotel_id', hotel.id)"));
  assert(translateRoute.includes('hotelId: hotel.id'));
  assert(!translateRoute.includes('hotelId: body.hotelId'));

  const demoGenerateRoute = fs.readFileSync('dashboard/app/api/demo/generate/route.js', 'utf8');
  assert(demoGenerateRoute.includes('areServerTestRoutesEnabled'));
  assert(demoGenerateRoute.includes('getInternalApiHeaders'));
  assert(!demoGenerateRoute.includes("'x-staynex-internal-token'"));
};

const testPmsDefaultFallbackRemoved = () => {
  const pmsService = fs.readFileSync('src/services/pms-connections.service.js', 'utf8');
  assert(!pmsService.includes('getDefaultHotel'));
  assert(!pmsService.includes('resolveHotelId'));
  assert(pmsService.includes('PmsHotelContextRequiredError'));

  const pmsDashboardRoute = fs.readFileSync('dashboard/app/api/pms-connections/route.js', 'utf8');
  assert(pmsDashboardRoute.includes('assertPmsHotelContext'));
  assert(pmsDashboardRoute.includes('fallback'));
};

testRequestIdSanitization();
testInternalAuth();
testMissingInternalConfigFailsClosedInProduction();
testTestRouteFlagPolicy();
await testTwilioValidationThroughExpress();
await testTwilioConfiguredPublicUrlExactMatch();
await testTwilioMissingConfigFailsClosedInProduction();
await testTwilioBypassDoesNotWorkInProduction();
testApaleoLiveBlockedWithoutOfficialValidation();
testProductionTestRoutesBlocked();
testExplicitHotelContextRequired();
testSafeCompareUsesFixedLengthDigests();
await testDebugRoutesMountPolicyAndGuards();
testDemoRouteBlockingFixes();
testLogRedactionRegressions();
testDashboardTenantGuardsRemainInPlace();
testPmsDefaultFallbackRemoved();
resetEnv();

console.log('HTTP security perimeter tests passed');
