import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createIncomingWhatsAppHandler } from '../src/controllers/whatsapp.controller.js';
import { validateTwilioWebhook } from '../src/middleware/security.middleware.js';
import {
  attachMessageToTwilioInboundClaim,
  claimTwilioInboundMessage,
  completeTwilioInboundClaim,
  failTwilioInboundClaim,
  TWILIO_INBOUND_DEDUPE_STATUS,
  TWILIO_INBOUND_DEDUPE_TABLE
} from '../src/services/twilio-inbound-dedupe.service.js';

const rootUrl = new URL('../', import.meta.url);
const readSource = (path) => readFileSync(new URL(path, rootUrl), 'utf8');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (value) => JSON.parse(JSON.stringify(value));

const stripSqlCommentsAndStrings = (source) => source
  .replace(/--.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'([^']|'')*'/g, "''");

class FakeClaimQuery {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.operation = 'select';
    this.payload = null;
    this.filters = [];
    this.limitCount = null;
  }

  insert(payload) {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  select() {
    if (!['insert', 'update'].includes(this.operation)) {
      this.operation = 'select';
    }

    return this;
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    return this.execute();
  }

  single() {
    return this.execute();
  }

  execute() {
    assert.equal(this.table, TWILIO_INBOUND_DEDUPE_TABLE, 'Dedupe service should use the dedicated claim table');
    this.store.operations.push({
      operation: this.operation,
      table: this.table,
      payload: clone(this.payload),
      filters: clone(this.filters)
    });

    if (this.operation === 'insert') {
      const payload = {
        message_id: null,
        processed_at: null,
        failed_at: null,
        failure_code: null,
        ...this.payload
      };
      const hotelConflict = this.store.rows.find((row) => (
        row.hotel_id === payload.hotel_id
        && row.message_sid === payload.message_sid
      ));
      const accountConflict = payload.twilio_account_sid
        ? this.store.rows.find((row) => (
          row.twilio_account_sid === payload.twilio_account_sid
          && row.message_sid === payload.message_sid
        ))
        : null;

      if (hotelConflict || accountConflict) {
        return {
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint'
          }
        };
      }

      const row = {
        id: `claim-${this.store.rows.length + 1}`,
        ...payload
      };
      this.store.rows.push(row);

      return { data: clone(row), error: null };
    }

    const matches = this.store.rows.filter((row) => (
      this.filters.every(([column, value]) => row[column] === value)
    ));

    if (this.operation === 'update') {
      for (const row of matches) {
        Object.assign(row, this.payload);
      }
    }

    const limited = typeof this.limitCount === 'number' ? matches.slice(0, this.limitCount) : matches;
    const data = limited[0] ? clone(limited[0]) : null;

    return { data, error: null };
  }
}

const createFakeClaimClient = () => {
  const store = {
    rows: [],
    operations: []
  };

  return {
    store,
    from(table) {
      return new FakeClaimQuery(store, table);
    }
  };
};

const createResponse = () => ({
  statusCode: null,
  body: null,
  contentType: null,
  type(value) {
    this.contentType = value;
    return this;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

const defaultBody = ({
  to = 'whatsapp:+15550000002',
  messageSid = 'SM11111111111111111111111111111111',
  accountSid = 'AC11111111111111111111111111111111',
  body = 'Hola'
} = {}) => ({
  Body: body,
  From: 'whatsapp:+15550000001',
  To: to,
  MessageSid: messageSid,
  AccountSid: accountSid
});

const runHandler = async (handler, body = defaultBody()) => {
  const req = {
    body,
    headers: {},
    method: 'POST',
    originalUrl: '/webhooks/whatsapp'
  };
  const res = createResponse();
  let nextError = null;

  await handler(req, res, (error) => {
    nextError = error;
  });

  return { res, nextError };
};

const createCounters = () => ({
  messageCreates: 0,
  pipelineRuns: 0,
  aiRuns: 0,
  ticketsCreated: 0,
  outboundReplies: 0
});

const errorWithCode = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

const buildPreparedInbound = ({ hotel, messageId }) => ({
  activeHotel: hotel,
  hotelContextSource: 'whatsapp_number',
  cleanPhone: '+15550000001',
  phoneForLogs: '+1***0001',
  reservation: null,
  guest: {
    id: `guest-${hotel.id}`,
    hotel_id: hotel.id,
    preferred_language: hotel.default_language || 'es',
    current_room: null
  },
  conversation: {
    id: `conversation-${hotel.id}`,
    hotel_id: hotel.id,
    guest_id: `guest-${hotel.id}`
  },
  guestLanguage: hotel.default_language || 'es',
  staffTranslationLanguage: hotel.staff_translation_language || hotel.default_language || 'es',
  staffTranslation: {
    sourceLanguage: hotel.default_language || 'es',
    targetLanguage: hotel.staff_translation_language || hotel.default_language || 'es',
    translatedText: null,
    provider: 'none',
    confidence: 1
  },
  guestMessage: {
    id: messageId,
    hotel_id: hotel.id,
    conversation_id: `conversation-${hotel.id}`,
    sender_type: 'guest'
  }
});

const buildProcessedResult = ({ preparedInbound, ticketId = 'ticket-1' }) => ({
  ai: { intent: 'test_intent' },
  hotel: preparedInbound.activeHotel,
  guest: preparedInbound.guest,
  conversation: preparedInbound.conversation,
  messages: {
    guest: preparedInbound.guestMessage,
    ai: { id: `ai-${preparedInbound.guestMessage.id}` }
  },
  ticket: ticketId ? { id: ticketId } : null,
  delivery: {
    sent_via_twilio: true,
    twilio_sid: 'SM_OUTBOUND'
  }
});

const createPrepareInboundFn = (counters, {
  messageIdPrefix = 'message',
  delayMs = 0
} = {}) => async ({ hotel }) => {
  counters.messageCreates += 1;

  if (delayMs) {
    await delay(delayMs);
  }

  return buildPreparedInbound({
    hotel,
    messageId: `${messageIdPrefix}-${counters.messageCreates}`
  });
};

const createProcessGuestMessageFn = (counters, {
  failAfter = null,
  createTicket = true,
  delayMs = 0
} = {}) => async ({
  channel,
  allowHotelContextSwitch,
  inboundDedupe,
  preparedInbound
}) => {
  counters.pipelineRuns += 1;
  assert.equal(channel, 'twilio-whatsapp', 'Twilio inbound channel should be explicit');
  assert.equal(allowHotelContextSwitch, false, 'Twilio inbound should lock tenant context after hotel resolution');
  assert.ok(preparedInbound?.guestMessage?.id, 'Twilio processing should receive a prepared inbound guest message');
  assert.equal(
    inboundDedupe?.messageId,
    preparedInbound.guestMessage.id,
    'Twilio processing should start only after the claim records message_id'
  );

  if (delayMs) {
    await delay(delayMs);
  }

  if (failAfter === 'pipeline_start') {
    throw errorWithCode('PIPELINE_START_FAILURE');
  }

  counters.aiRuns += 1;

  if (failAfter === 'ai') {
    throw errorWithCode('POST_AI_FAILURE');
  }

  if (createTicket) {
    counters.ticketsCreated += 1;
  }

  if (failAfter === 'ticket') {
    throw errorWithCode('POST_TICKET_FAILURE');
  }

  counters.outboundReplies += 1;

  if (failAfter === 'outbound') {
    throw errorWithCode('POST_OUTBOUND_FAILURE');
  }

  return buildProcessedResult({
    preparedInbound,
    ticketId: createTicket ? `ticket-${counters.ticketsCreated}` : null
  });
};

const createHandlerWithDedupeStore = ({
  client,
  counters = createCounters(),
  resolveHotel = (number) => (
    number === 'whatsapp:+15550000003'
      ? { id: 'hotel-b', name: 'Hotel B', default_language: 'es' }
      : { id: 'hotel-a', name: 'Hotel A', default_language: 'es' }
  ),
  prepareInboundGuestMessageForProcessingFn = createPrepareInboundFn(counters),
  processGuestMessageFn = createProcessGuestMessageFn(counters),
  attachMessageToTwilioInboundClaimFn = (args) => attachMessageToTwilioInboundClaim({ ...args, client }),
  completeTwilioInboundClaimFn = (args) => completeTwilioInboundClaim({ ...args, client }),
  failTwilioInboundClaimFn = (args) => failTwilioInboundClaim({ ...args, client })
}) => createIncomingWhatsAppHandler({
  findHotelByWhatsappNumberFn: async (number) => resolveHotel(number),
  prepareInboundGuestMessageForProcessingFn,
  processGuestMessageFn,
  claimTwilioInboundMessageFn: (args) => claimTwilioInboundMessage({ ...args, client }),
  attachMessageToTwilioInboundClaimFn,
  completeTwilioInboundClaimFn,
  failTwilioInboundClaimFn
});

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  const handler = createHandlerWithDedupeStore({ client, counters });

  const first = await runHandler(handler);

  assert.equal(first.nextError, null, 'First valid webhook should not error');
  assert.equal(first.res.statusCode, 200, 'First valid webhook should receive a safe Twilio ack');
  assert.equal(first.res.contentType, 'text/xml', 'Twilio ack should be XML');
  assert.equal(counters.messageCreates, 1, 'First valid webhook should create one inbound guest message');
  assert.equal(counters.pipelineRuns, 1, 'First valid webhook should process exactly once');
  assert.equal(counters.aiRuns, 1, 'First valid webhook should run AI once');
  assert.equal(counters.ticketsCreated, 1, 'First valid webhook should create one ticket in this scenario');
  assert.equal(counters.outboundReplies, 1, 'First valid webhook should send one outbound reply in this scenario');
  assert.equal(client.store.rows.length, 1, 'First valid webhook should create one durable claim');
  assert.equal(client.store.rows[0].status, TWILIO_INBOUND_DEDUPE_STATUS.PROCESSED, 'Claim should be marked processed');
  assert.equal(client.store.rows[0].message_id, 'message-1', 'Processed claim should reference the inbound message');

  const second = await runHandler(handler);

  assert.equal(second.nextError, null, 'Processed duplicate delivery should not error');
  assert.equal(second.res.statusCode, 200, 'Processed duplicate delivery should receive a safe Twilio ack');
  assert.equal(counters.messageCreates, 1, 'Processed duplicate should not create a second message');
  assert.equal(counters.pipelineRuns, 1, 'Processed duplicate should not reprocess guest message');
  assert.equal(counters.aiRuns, 1, 'Processed duplicate should not rerun AI');
  assert.equal(counters.ticketsCreated, 1, 'Processed duplicate should not create a second ticket');
  assert.equal(counters.outboundReplies, 1, 'Processed duplicate should not send a second reply');
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  const handler = createHandlerWithDedupeStore({
    client,
    counters,
    processGuestMessageFn: createProcessGuestMessageFn(counters, {
      createTicket: false,
      delayMs: 20
    })
  });

  const [first, second] = await Promise.all([
    runHandler(handler, defaultBody({ messageSid: 'SM22222222222222222222222222222222' })),
    runHandler(handler, defaultBody({ messageSid: 'SM22222222222222222222222222222222' }))
  ]);

  assert.equal(first.res.statusCode, 200, 'Concurrent winner should ack safely');
  assert.equal(second.res.statusCode, 200, 'Concurrent loser should ack safely as duplicate');
  assert.equal(counters.pipelineRuns, 1, 'Concurrent duplicate requests should have exactly one processing winner');
  assert.equal(counters.messageCreates, 1, 'Concurrent duplicate requests should create one inbound message');
  assert.equal(client.store.rows.length, 1, 'Concurrent duplicate requests should leave one durable claim');
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  client.store.rows.push({
    id: 'claim-failed',
    hotel_id: 'hotel-a',
    message_sid: 'SM33333333333333333333333333333333',
    twilio_account_sid: 'AC11111111111111111111111111111111',
    status: TWILIO_INBOUND_DEDUPE_STATUS.FAILED,
    message_id: 'message-consumed',
    attempt_count: 1,
    first_received_at: new Date().toISOString(),
    last_received_at: new Date().toISOString(),
    processed_at: null,
    failed_at: new Date().toISOString(),
    failure_code: 'POST_AI_FAILURE'
  });
  const handler = createHandlerWithDedupeStore({ client, counters });

  const duplicate = await runHandler(handler, defaultBody({ messageSid: 'SM33333333333333333333333333333333' }));

  assert.equal(duplicate.nextError, null, 'Failed duplicate delivery should not error');
  assert.equal(duplicate.res.statusCode, 200, 'Failed duplicate should receive a safe Twilio ack');
  assert.equal(counters.messageCreates, 0, 'Failed duplicate should not create/reuse an inbound message automatically');
  assert.equal(counters.pipelineRuns, 0, 'Failed duplicate should not enter processGuestMessage again');
  assert.equal(client.store.rows[0].status, TWILIO_INBOUND_DEDUPE_STATUS.FAILED, 'Failed claim should remain terminal for automatic delivery');
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  const handler = createHandlerWithDedupeStore({
    client,
    counters,
    processGuestMessageFn: createProcessGuestMessageFn(counters, {
      failAfter: 'pipeline_start',
      createTicket: false
    })
  });

  const first = await runHandler(handler, defaultBody({ messageSid: 'SM44444444444444444444444444444444' }));
  assert.ok(first.nextError, 'Failure after inbound message creation should surface for Twilio retry');
  assert.equal(client.store.rows[0].status, TWILIO_INBOUND_DEDUPE_STATUS.FAILED, 'Failure after message creation should mark claim failed');

  const retry = await runHandler(handler, defaultBody({ messageSid: 'SM44444444444444444444444444444444' }));

  assert.equal(retry.nextError, null, 'Retry for failed claim should be safely acknowledged');
  assert.equal(retry.res.statusCode, 200, 'Retry for failed claim should ack without processing');
  assert.equal(counters.messageCreates, 1, 'Automatic retry should not create a second inbound message');
  assert.equal(counters.pipelineRuns, 1, 'Automatic retry should not re-enter the failed pipeline');
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  let attachCalls = 0;
  const handler = createHandlerWithDedupeStore({
    client,
    counters,
    attachMessageToTwilioInboundClaimFn: async () => {
      attachCalls += 1;
      throw errorWithCode('CLAIM_ATTACH_FAILED');
    }
  });

  const first = await runHandler(handler, defaultBody({ messageSid: 'SM55555555555555555555555555555555' }));
  assert.ok(first.nextError, 'Claim message_id attach failure should stop the current delivery');
  assert.equal(client.store.rows[0].status, TWILIO_INBOUND_DEDUPE_STATUS.FAILED, 'Attach failure should mark claim failed when possible');

  const retry = await runHandler(handler, defaultBody({ messageSid: 'SM55555555555555555555555555555555' }));

  assert.equal(retry.nextError, null, 'Retry after attach failure should be safely acknowledged');
  assert.equal(retry.res.statusCode, 200, 'Retry after attach failure should not cause a retry storm');
  assert.equal(attachCalls, 1, 'Attach should not be attempted again for the consumed MessageSid');
  assert.equal(counters.messageCreates, 1, 'Attach failure should not allow a second automatic message create');
  assert.equal(counters.pipelineRuns, 0, 'Attach failure should not enter processGuestMessage');
  assert.equal(counters.aiRuns, 0, 'Attach failure should not run AI');
  assert.equal(counters.ticketsCreated, 0, 'Attach failure should not create a ticket');
  assert.equal(counters.outboundReplies, 0, 'Attach failure should not send an outbound reply');
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  const handler = createHandlerWithDedupeStore({
    client,
    counters,
    processGuestMessageFn: createProcessGuestMessageFn(counters, {
      failAfter: 'ai',
      createTicket: false
    })
  });

  const first = await runHandler(handler, defaultBody({ messageSid: 'SM66666666666666666666666666666666' }));
  assert.ok(first.nextError, 'Partial failure after AI should surface');
  assert.equal(client.store.rows[0].status, TWILIO_INBOUND_DEDUPE_STATUS.FAILED, 'Partial AI failure should mark claim failed');

  const retry = await runHandler(handler, defaultBody({ messageSid: 'SM66666666666666666666666666666666' }));

  assert.equal(retry.nextError, null, 'Retry after partial AI failure should be acknowledged');
  assert.equal(counters.pipelineRuns, 1, 'Partial AI failure should not re-enter processGuestMessage');
  assert.equal(counters.aiRuns, 1, 'Partial AI failure should not run AI again on retry');
  assert.equal(counters.ticketsCreated, 0, 'Partial AI failure should not create a ticket on retry');
  assert.equal(counters.outboundReplies, 0, 'Partial AI failure should not send a reply on retry');
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  const handler = createHandlerWithDedupeStore({
    client,
    counters,
    processGuestMessageFn: createProcessGuestMessageFn(counters, {
      failAfter: 'ticket'
    })
  });

  const first = await runHandler(handler, defaultBody({ messageSid: 'SM77777777777777777777777777777777' }));
  assert.ok(first.nextError, 'Partial failure after ticket should surface');
  assert.equal(client.store.rows[0].status, TWILIO_INBOUND_DEDUPE_STATUS.FAILED, 'Partial ticket failure should mark claim failed');

  const retry = await runHandler(handler, defaultBody({ messageSid: 'SM77777777777777777777777777777777' }));

  assert.equal(retry.nextError, null, 'Retry after partial ticket failure should be acknowledged');
  assert.equal(counters.pipelineRuns, 1, 'Partial ticket failure should not re-enter processGuestMessage');
  assert.equal(counters.aiRuns, 1, 'Partial ticket failure should not rerun AI');
  assert.equal(counters.ticketsCreated, 1, 'Partial ticket failure should not create a second ticket');
  assert.equal(counters.outboundReplies, 0, 'Partial ticket failure should not send a reply on retry');
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  let completeCalls = 0;
  const handler = createHandlerWithDedupeStore({
    client,
    counters,
    completeTwilioInboundClaimFn: async (args) => {
      completeCalls += 1;
      if (completeCalls === 1) {
        throw errorWithCode('CLAIM_COMPLETE_FAILED');
      }

      return completeTwilioInboundClaim({ ...args, client });
    }
  });

  const first = await runHandler(handler, defaultBody({ messageSid: 'SM88888888888888888888888888888888' }));
  assert.ok(first.nextError, 'Failure before processed mark should surface');
  assert.equal(client.store.rows[0].status, TWILIO_INBOUND_DEDUPE_STATUS.FAILED, 'Completion failure should mark claim failed');

  const retry = await runHandler(handler, defaultBody({ messageSid: 'SM88888888888888888888888888888888' }));

  assert.equal(retry.nextError, null, 'Retry after completion failure should be acknowledged');
  assert.equal(completeCalls, 1, 'Processed-mark update should not be retried automatically');
  assert.equal(counters.pipelineRuns, 1, 'Completion failure should not re-enter processGuestMessage');
  assert.equal(counters.aiRuns, 1, 'Completion failure should not rerun AI');
  assert.equal(counters.ticketsCreated, 1, 'Completion failure should not create a second ticket');
  assert.equal(counters.outboundReplies, 1, 'Completion failure should not send a second outbound reply');
}

{
  const previousToken = process.env.TWILIO_AUTH_TOKEN;
  const previousBypass = process.env.TWILIO_WEBHOOK_VALIDATION_BYPASS;
  process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
  delete process.env.TWILIO_WEBHOOK_VALIDATION_BYPASS;

  const client = createFakeClaimClient();
  const counters = createCounters();
  const handler = createHandlerWithDedupeStore({ client, counters });
  const req = {
    body: defaultBody({ messageSid: 'SM99999999999999999999999999999999' }),
    headers: {
      'x-twilio-signature': 'invalid'
    },
    method: 'POST',
    protocol: 'https',
    originalUrl: '/webhooks/whatsapp'
  };
  const res = createResponse();
  let nextCalled = false;

  validateTwilioWebhook(req, res, () => {
    nextCalled = true;
    return handler(req, res, () => null);
  });

  assert.equal(nextCalled, false, 'Invalid Twilio signature should stop before controller processing');
  assert.equal(res.statusCode, 403, 'Invalid Twilio signature should fail closed');
  assert.equal(client.store.rows.length, 0, 'Invalid Twilio signature should not create a claim');
  assert.equal(counters.pipelineRuns, 0, 'Invalid Twilio signature should not enter the pipeline');

  if (previousToken === undefined) {
    delete process.env.TWILIO_AUTH_TOKEN;
  } else {
    process.env.TWILIO_AUTH_TOKEN = previousToken;
  }

  if (previousBypass === undefined) {
    delete process.env.TWILIO_WEBHOOK_VALIDATION_BYPASS;
  } else {
    process.env.TWILIO_WEBHOOK_VALIDATION_BYPASS = previousBypass;
  }
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  const handler = createHandlerWithDedupeStore({ client, counters });
  const bodyWithoutSid = defaultBody();
  delete bodyWithoutSid.MessageSid;

  const missingSid = await runHandler(handler, bodyWithoutSid);

  assert.equal(missingSid.nextError, null, 'Missing MessageSid should be handled as a safe request error');
  assert.equal(missingSid.res.statusCode, 400, 'Missing MessageSid should fail closed');
  assert.equal(counters.messageCreates, 0, 'Missing MessageSid should not prepare an inbound message');
  assert.equal(counters.pipelineRuns, 0, 'Missing MessageSid should not process guest message');
  assert.equal(client.store.rows.length, 0, 'Missing MessageSid should not create a claim');
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  const handler = createHandlerWithDedupeStore({ client, counters });

  await runHandler(handler, defaultBody({
    to: 'whatsapp:+15550000002',
    messageSid: 'SMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  }));
  const crossTenant = await runHandler(
    handler,
    defaultBody({
      to: 'whatsapp:+15550000003',
      messageSid: 'SMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      accountSid: 'AC11111111111111111111111111111111'
    })
  );

  assert.equal(crossTenant.nextError, null, 'Cross-tenant MessageSid reuse should be safely acknowledged');
  assert.equal(crossTenant.res.statusCode, 200, 'Cross-tenant MessageSid reuse should not expose an error to Twilio');
  assert.equal(counters.messageCreates, 1, 'Cross-tenant duplicate should not create/reuse a message in Hotel B');
  assert.equal(counters.pipelineRuns, 1, 'Same AccountSid + MessageSid should not process in a second tenant');
  assert.equal(client.store.rows.length, 1, 'Cross-tenant duplicate should not create a second claim');
  assert.equal(client.store.rows[0].hotel_id, 'hotel-a', 'Original tenant claim should remain Hotel A scoped');
  assert.equal(client.store.rows[0].message_id, 'message-1', 'Hotel B should not receive Hotel A message_id for processing');
}

{
  const client = createFakeClaimClient();
  const counters = createCounters();
  client.store.rows.push({
    id: 'claim-processing',
    hotel_id: 'hotel-a',
    message_sid: 'SMBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    twilio_account_sid: 'AC11111111111111111111111111111111',
    status: TWILIO_INBOUND_DEDUPE_STATUS.PROCESSING,
    message_id: null,
    attempt_count: 1,
    first_received_at: new Date().toISOString(),
    last_received_at: new Date().toISOString(),
    processed_at: null,
    failed_at: null,
    failure_code: null
  });
  const handler = createHandlerWithDedupeStore({ client, counters });

  const duplicate = await runHandler(handler, defaultBody({ messageSid: 'SMBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' }));

  assert.equal(duplicate.nextError, null, 'Stale processing duplicate should be acknowledged');
  assert.equal(duplicate.res.statusCode, 200, 'Stale processing duplicate should receive safe Twilio ack');
  assert.equal(counters.messageCreates, 0, 'Stale processing duplicate should not create an inbound message');
  assert.equal(counters.pipelineRuns, 0, 'Stale processing duplicate should not run the pipeline');
}

const routeSource = readSource('src/routes/whatsapp.routes.js');
const controllerSource = readSource('src/controllers/whatsapp.controller.js');
const staynexSource = readSource('src/services/staynex.service.js');
const serviceSource = readSource('src/services/twilio-inbound-dedupe.service.js');
const migration = readSource('supabase/sql/twilio_inbound_messagesid_dedupe.sql');
const preflight = readSource('supabase/sql/preflight_twilio_inbound_messagesid_dedupe.sql');
const rollback = readSource('supabase/sql/rollback_twilio_inbound_messagesid_dedupe.sql');
const packageJson = JSON.parse(readSource('package.json'));

assert.equal(
  packageJson.scripts['test:twilio-inbound-dedupe'],
  'node scripts/test-twilio-inbound-dedupe.js',
  'Permanent Twilio inbound dedupe npm test should exist'
);
assert.match(
  routeSource,
  /router\.post\('\/whatsapp',\s*validateTwilioWebhook,\s*handleIncomingWhatsApp\)/,
  'Twilio route should validate the official signature before the inbound handler'
);
assert.ok(
  controllerSource.indexOf('findHotelByWhatsappNumberFn') < controllerSource.indexOf('claimTwilioInboundMessageFn'),
  'Controller should resolve the hotel before creating a MessageSid claim'
);
assert.ok(
  controllerSource.indexOf('const preparedInbound = await prepareInboundGuestMessageForProcessingFn') < controllerSource.indexOf('activeClaim = await attachMessageToTwilioInboundClaimFn'),
  'Controller should prepare the inbound message before attaching message_id to the claim'
);
assert.ok(
  controllerSource.indexOf('activeClaim = await attachMessageToTwilioInboundClaimFn') < controllerSource.indexOf('const result = await processGuestMessageFn'),
  'Controller should attach message_id before processGuestMessage runs'
);
assert.match(controllerSource, /allowHotelContextSwitch:\s*false/, 'Twilio inbound should not allow message text to switch tenant');
assert.match(staynexSource, /prepareInboundGuestMessageForProcessing/, 'Twilio inbound should have a prepared message phase before full processing');
assert.match(staynexSource, /preparedInbound/, 'Guest processing should support a prepared inbound message context');
assert.match(staynexSource, /twilio_inbound_dedupe_message_context_mismatch/, 'Existing inbound message reuse should verify conversation context');
assert.match(serviceSource, /TWILIO_MESSAGE_SID_REQUIRED/, 'Missing MessageSid should fail closed without synthetic fallback');
assert.match(serviceSource, /failed_consumed/, 'Failed claims should be consumed and not automatically reclaimed');
assert.doesNotMatch(serviceSource, /outcome:\s*'retry'/, 'Twilio retry path must not reclaim failed claims automatically');
assert.doesNotMatch(serviceSource, /attempt_count:\s*Number\(existingClaim\.attempt_count/, 'Failed duplicate should not increment attempts as an automatic retry');
assert.doesNotMatch(serviceSource, /new Set\(/, 'Dedupe must not use in-memory Sets');

assert.match(migration, /create table if not exists public\.twilio_inbound_message_claims/i, 'Migration should create a durable claim table');
assert.match(migration, /hotel_id uuid not null references public\.hotels\(id\)/i, 'Claim table should be tenant-owned');
assert.match(migration, /message_sid text not null/i, 'Claim table should require MessageSid');
assert.match(migration, /status text not null default 'processing'/i, 'Claim table should track processing status');
assert.match(migration, /status in \('processing', 'processed', 'failed'\)/i, 'Claim table should support terminal consumed states');
assert.match(migration, /at-most-once/i, 'Migration comments should document pilot at-most-once semantics');
assert.match(migration, /twilio_inbound_message_claims_hotel_sid_unique_idx[\s\S]*\(hotel_id, message_sid\)/i, 'Claim table should have tenant-scoped unique MessageSid invariant');
assert.match(migration, /twilio_inbound_message_claims_account_sid_unique_idx[\s\S]*\(twilio_account_sid, message_sid\)[\s\S]*where twilio_account_sid is not null/i, 'Claim table should block AccountSid-scoped cross-tenant reuse');
assert.match(migration, /alter table public\.twilio_inbound_message_claims enable row level security/i, 'Claim table should enable RLS');
assert.match(migration, /revoke all privileges on table public\.twilio_inbound_message_claims from public/i, 'Claim table should revoke PUBLIC');
assert.match(migration, /revoke all privileges on table public\.twilio_inbound_message_claims from anon/i, 'Claim table should revoke anon');
assert.match(migration, /revoke all privileges on table public\.twilio_inbound_message_claims from authenticated/i, 'Claim table should revoke authenticated');
assert.match(migration, /grant select, insert, update, delete on table public\.twilio_inbound_message_claims to service_role/i, 'Claim table should preserve service_role CRUD');
assert.doesNotMatch(migration, /\bcreate\s+(or\s+replace\s+)?policy\b/i, 'Claim table should not create browser policies');
assert.doesNotMatch(
  migration,
  /\b(raw_body|request_body|raw_payload|payload_json|message_content|from_number|to_number|phone_number)\b/i,
  'Claim table must not store raw webhook data, contacts, or message contents'
);

assert.doesNotMatch(
  stripSqlCommentsAndStrings(preflight),
  /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|vacuum|call)\b/i,
  'Preflight must be read-only'
);
assert.match(preflight, /ready_for_twilio_inbound_messagesid_dedupe/i, 'Preflight should emit readiness boolean');
assert.match(preflight, /readiness/i, 'Preflight should emit readiness');
assert.match(preflight, /duplicate_messagesid_diagnostic/i, 'Preflight should report duplicate MessageSid diagnostics');
assert.match(preflight, /null_tenant_diagnostic/i, 'Preflight should report null tenant diagnostics');
assert.doesNotMatch(
  preflight,
  /\b(email|phone_number|from_number|to_number|content|message_body|raw_body|raw_payload)\b/i,
  'Preflight must not expose names, emails, contacts, or message contents'
);

assert.match(rollback, /select count\(\*\)[\s\S]*from public\.twilio_inbound_message_claims/i, 'Rollback should inspect claim row count');
assert.match(rollback, /claim_count > 0[\s\S]*raise exception/i, 'Rollback should abort if operational claims exist');
assert.ok(
  rollback.indexOf('raise exception') < rollback.indexOf('drop table if exists public.twilio_inbound_message_claims'),
  'Rollback should fail closed before any table drop can happen'
);
assert.doesNotMatch(rollback, /\bmessages\b/i, 'Rollback should not touch inbox messages');
assert.doesNotMatch(rollback, /\bguests\b/i, 'Rollback should not touch guests');

const testSource = readSource('scripts/test-twilio-inbound-dedupe.js');
assert.doesNotMatch(testSource, /\bcreateClient\b|fetch\(/, 'Dedupe test should not use real Supabase or network calls');
assert.doesNotMatch(
  testSource,
  new RegExp(`SUPABASE_${'URL'}|SUPABASE_${'SERVICE_ROLE_KEY'}`),
  'Dedupe test should not use real Supabase environment variables'
);

console.log('Twilio inbound MessageSid dedupe checks passed');
