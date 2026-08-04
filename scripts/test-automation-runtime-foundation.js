import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CERTIFICATION_STATUSES,
  getCanonicalAutomationDefinitions,
  getEngineAutomationTypesMap,
  normalizeAutomationType
} from '../shared/automations/catalog.js';
import {
  buildAutomationIdempotencyKey,
  evaluateAutomationDecision
} from '../shared/automations/runtime.js';
import { writeAutomationDecisionToQueue } from '../shared/automations/queue-writer.js';
import { runAutomationTestCenter } from '../dashboard/lib/automation-test-center.js';
import { runDashboardAutomationScheduler } from '../dashboard/lib/automation-runner.js';
import {
  isHotelAutomationLiveExplicitlyEnabled,
  processScheduledMessage
} from '../src/services/message-queue.service.js';
import { runAutomationScheduler } from '../src/services/scheduler.service.js';
import { runPreCheckoutFolioReminder } from '../src/services/pms-folio.service.js';
import { runPostStayReviewIntelligence } from '../src/services/post-stay-review-intelligence.service.js';

process.env.SEND_AUTOMATIONS = 'false';
process.env.AUTOMATION_TEST_CENTER_ENABLED = 'true';
process.env.AUTOMATION_TEST_SEND_ENABLED = 'false';
process.env.USE_MOCK_AI = 'true';
delete process.env.TEST_WHATSAPP_NUMBER;
delete process.env.UBIKOS_ENABLED;

const now = new Date('2026-08-03T12:00:00.000Z');
const hotelA = {
  id: 'hotel-a',
  name: 'Hotel A',
  default_language: 'es',
  timezone: 'Europe/Madrid',
  metadata: {}
};
const hotelB = {
  ...hotelA,
  id: 'hotel-b',
  name: 'Hotel B'
};
const reservationA = {
  id: 'reservation-a',
  hotel_id: hotelA.id,
  guest_id: 'guest-a',
  guest_name: 'Test Guest',
  guest_phone: '+34911111111',
  arrival_date: '2026-08-04',
  departure_date: '2026-08-06',
  status: 'confirmed',
  metadata: {
    last_intent: 'airport transfer'
  }
};
const runtimeOptionalColumns = new Set([
  'execution_mode',
  'idempotency_key',
  'runtime_version',
  'source',
  'creation_reason',
  'skip_reason'
]);

const missingRuntimeColumnError = (column) => ({
  code: '42703',
  message: `column "${column}" does not exist`
});

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.filterColumns = [];
    this.insertRows = null;
    this.updateValues = null;
    this.orderBy = null;
    this.limitCount = null;
  }

  select() {
    return this;
  }

  insert(rows) {
    this.operation = 'insert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(values) {
    this.operation = 'update';
    this.updateValues = values;
    return this;
  }

  eq(column, value) {
    this.filterColumns.push(column);
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column, values = []) {
    this.filterColumns.push(column);
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  gte(column, value) {
    this.filterColumns.push(column);
    this.filters.push((row) => String(row[column] || '') >= String(value));
    return this;
  }

  lt(column, value) {
    this.filterColumns.push(column);
    this.filters.push((row) => String(row[column] || '') < String(value));
    return this;
  }

  lte(column, value) {
    this.filterColumns.push(column);
    this.filters.push((row) => String(row[column] || '') <= String(value));
    return this;
  }

  contains(column, value = {}) {
    this.filters.push((row) => Object.entries(value).every(([key, expected]) => row[column]?.[key] === expected));
    return this;
  }

  order(column, options = {}) {
    this.orderBy = { column, ascending: options.ascending !== false };
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    const result = this.execute();
    return Promise.resolve({
      data: result.data?.[0] || null,
      error: result.error
    });
  }

  single() {
    const result = this.execute();
    return Promise.resolve({
      data: result.data?.[0] || null,
      error: result.error
    });
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  execute() {
    this.db[this.table] ||= [];

    if (this.operation === 'insert') {
      if (this.db.missingRuntimeColumns && ['scheduled_messages', 'automation_runs'].includes(this.table)) {
        const missingColumn = this.insertRows
          .flatMap((row) => Object.keys(row))
          .find((column) => runtimeOptionalColumns.has(column));

        if (missingColumn) {
          return {
            data: null,
            error: missingRuntimeColumnError(missingColumn)
          };
        }
      }

      if (this.table === 'scheduled_messages' && this.db.uniqueScheduledIdempotency) {
        const duplicate = this.insertRows.find((row) => (
          row.idempotency_key
          && this.db.scheduled_messages.some((existing) => (
            existing.hotel_id === row.hotel_id
            && existing.idempotency_key === row.idempotency_key
          ))
        ));

        if (duplicate) {
          return {
            data: null,
            error: {
              code: '23505',
              message: 'duplicate key value violates unique constraint "scheduled_messages_hotel_idempotency_unique"'
            }
          };
        }
      }

      const inserted = this.insertRows.map((row) => ({
        id: row.id || `${this.table}-${this.db.nextId++}`,
        created_at: row.created_at || now.toISOString(),
        ...row
      }));
      this.db[this.table].push(...inserted);
      return { data: inserted, error: null };
    }

    if (this.db.missingRuntimeColumns && ['scheduled_messages', 'automation_runs'].includes(this.table)) {
      const missingColumn = this.filterColumns.find((column) => runtimeOptionalColumns.has(column));
      if (missingColumn) {
        return {
          data: null,
          error: missingRuntimeColumnError(missingColumn)
        };
      }
    }

    let rows = this.db[this.table].filter((row) => this.filters.every((filter) => filter(row)));

    if (this.operation === 'update') {
      rows = rows.map((row) => {
        Object.assign(row, this.updateValues);
        return row;
      });
    }

    if (this.orderBy) {
      rows = [...rows].sort((left, right) => {
        const leftValue = left[this.orderBy.column] || '';
        const rightValue = right[this.orderBy.column] || '';
        return this.orderBy.ascending
          ? String(leftValue).localeCompare(String(rightValue))
          : String(rightValue).localeCompare(String(leftValue));
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }
}

const createMockSupabase = (initial = {}) => {
  const db = {
    nextId: 1,
    uniqueScheduledIdempotency: false,
    missingRuntimeColumns: false,
    reservations: [],
    hotels: [],
    guests: [],
    conversations: [],
    conversation_ai_state: [],
    hotel_pms_connections: [],
    messages: [],
    tickets: [],
    ai_logs: [],
    guest_memory: [],
    guest_intelligence_profiles: [],
    automation_rules: [],
    automations: [],
    scheduled_messages: [],
    automation_runs: [],
    ...structuredClone(initial)
  };

  return {
    db,
    from(table) {
      return new QueryBuilder(db, table);
    }
  };
};

const definitions = getCanonicalAutomationDefinitions();
const requiredTypes = [
  'welcome',
  'pre_checkin',
  'checkin',
  'during_stay',
  'upselling',
  'transfer',
  'restaurant',
  'spa',
  'experience',
  'late_checkout',
  'checkout',
  'pre_checkout_folio',
  'post_checkout',
  'review_request',
  'vip_followup',
  'birthday'
];

requiredTypes.forEach((type) => {
  assert.ok(definitions.some((definition) => definition.type === type), `${type} should be in the canonical catalog`);
});
assert.ok(
  definitions.every((definition) => definition.certificationStatus === CERTIFICATION_STATUSES.UNCERTIFIED),
  'No automation should be certified in Phase 1'
);

assert.equal(normalizeAutomationType('pre_arrival_7d').canonicalType, 'pre_checkin');
assert.equal(normalizeAutomationType('pre_arrival_1d').canonicalType, 'pre_checkin');
assert.equal(normalizeAutomationType('in_stay_upsell').canonicalType, 'upselling');
assert.equal(normalizeAutomationType('post_stay_review').canonicalType, 'review_request');

const runtimeTypeMap = getEngineAutomationTypesMap();
assert.equal(runtimeTypeMap.WELCOME_MESSAGE, 'welcome_message');
assert.equal(runtimeTypeMap.ABANDONED_INTEREST_FOLLOWUP, 'abandoned_interest_followup');
assert.equal(runtimeTypeMap.POST_STAY_REVIEW_INTELLIGENCE, 'post_stay_review_intelligence');

const automationIntelligenceSource = readFileSync(new URL('../src/services/automation-intelligence.service.js', import.meta.url), 'utf8');
assert.doesNotMatch(
  automationIntelligenceSource,
  /intelligentAutomationTypeEntries|\['WELCOME_MESSAGE'/,
  'Automation Intelligence should derive intelligent automation types from the shared catalog'
);

const transferDecisionA = evaluateAutomationDecision({
  hotel: hotelA,
  reservation: reservationA,
  automationType: 'transfer_offer',
  legacyType: 'transfer_offer',
  executionMode: 'preview',
  now,
  metadata: { source: 'runtime_test' }
});
const transferDecisionB = evaluateAutomationDecision({
  hotel: hotelA,
  reservation: reservationA,
  automationType: 'transfer_offer',
  legacyType: 'transfer_offer',
  executionMode: 'preview',
  now,
  metadata: { source: 'runtime_test' }
});

assert.deepEqual(
  {
    eligible: transferDecisionA.eligible,
    skipReason: transferDecisionA.skipReason,
    scheduledFor: transferDecisionA.scheduledFor,
    idempotencyKey: transferDecisionA.idempotencyKey
  },
  {
    eligible: transferDecisionB.eligible,
    skipReason: transferDecisionB.skipReason,
    scheduledFor: transferDecisionB.scheduledFor,
    idempotencyKey: transferDecisionB.idempotencyKey
  },
  'Evaluator should be deterministic for the same context'
);

const testCenterResult = runAutomationTestCenter({
  hotel: hotelA,
  scenarioId: 'guest_requested_transfer',
  simulatedNow: now.toISOString(),
  dryRun: true,
  sendTest: false
});
const testCenterTransferLog = testCenterResult.logs.find((log) => log.automation_type === 'transfer_offer');
const runtimeTransfer = evaluateAutomationDecision({
  hotel: hotelA,
  reservation: testCenterResult.reservation,
  guest: testCenterResult.simulatedGuest,
  automationType: 'transfer_offer',
  legacyType: 'transfer_offer',
  trigger: 'transfer_need',
  executionMode: 'preview',
  now: new Date(testCenterResult.scenario.simulatedNow),
  metadata: {
    source: 'automation_test_center',
    test_mode: true,
    scenario_id: testCenterResult.scenario.id
  }
});
assert.equal(testCenterTransferLog.metadata.canonical_automation_type, runtimeTransfer.automationType);
assert.equal(testCenterTransferLog.metadata.idempotency_key, runtimeTransfer.idempotencyKey);
assert.equal(Boolean(testCenterTransferLog.message_preview), runtimeTransfer.eligible);

const writerSupabase = createMockSupabase();
const writeResult = await writeAutomationDecisionToQueue({
  supabase: writerSupabase,
  decision: transferDecisionA,
  messagePreview: 'Preview only transfer message',
  source: 'runtime_test',
  creationReason: transferDecisionA.triggerReason
});
assert.equal(writeResult.status, 'preview', 'A preview hotel must not create a live message');
assert.equal(writerSupabase.db.scheduled_messages[0].status, 'preview');
assert.equal(writerSupabase.db.scheduled_messages[0].send_to, null);

const liveRequestedDecision = evaluateAutomationDecision({
  hotel: { ...hotelA, metadata: { automation_mode: 'live' } },
  reservation: reservationA,
  automationType: 'transfer_offer',
  legacyType: 'transfer_offer',
  executionMode: 'live',
  now,
  metadata: { source: 'runtime_test' }
});
assert.equal(liveRequestedDecision.executionMode, 'preview', 'Uncertified automation should be capped at preview');
const liveRequestedWrite = await writeAutomationDecisionToQueue({
  supabase: createMockSupabase(),
  decision: liveRequestedDecision,
  messagePreview: 'Still preview',
  source: 'runtime_test',
  creationReason: liveRequestedDecision.triggerReason
});
assert.equal(liveRequestedWrite.status, 'preview', 'Uncertified automation must not create a live scheduled record');

process.env.SEND_AUTOMATIONS = 'true';
const accidentalSendSupabase = createMockSupabase();
const accidentalSendWrite = await writeAutomationDecisionToQueue({
  supabase: accidentalSendSupabase,
  decision: liveRequestedDecision,
  messagePreview: 'Still preview with accidental SEND_AUTOMATIONS=true',
  source: 'runtime_test',
  creationReason: liveRequestedDecision.triggerReason,
  extraMetadata: {
    send_to: '+34911111111'
  }
});
assert.equal(accidentalSendWrite.status, 'preview', 'SEND_AUTOMATIONS=true must still respect preview-only capped status');
assert.equal(
  accidentalSendSupabase.db.scheduled_messages[0].send_to,
  null,
  'SEND_AUTOMATIONS=true must not persist send target for uncertified preview automations'
);
process.env.SEND_AUTOMATIONS = 'false';

const sendBlocked = await processScheduledMessage({
  id: 'scheduled-message-test',
  automation_type: 'transfer',
  status: 'scheduled',
  hotel_id: hotelA.id,
  reservation_id: reservationA.id,
  scheduled_for: now.toISOString(),
  send_to: '+34911111111',
  message_preview: 'Should not send'
});
assert.equal(sendBlocked.skipped, true, 'SEND_AUTOMATIONS=false should prevent any send');
assert.equal(
  isHotelAutomationLiveExplicitlyEnabled({
    metadata: {
      automation_live_enabled: true,
      automation_execution_mode: 'live_limited',
      automation_live_approved_at: '2026-08-03T10:00:00.000Z',
      automation_live_approved_by: 'ops-user'
    }
  }),
  true,
  'Live hotel gate requires explicit audited approval'
);
assert.equal(
  isHotelAutomationLiveExplicitlyEnabled({
    metadata: {
      automation_live_enabled: true,
      automation_execution_mode: 'live'
    }
  }),
  false,
  'Live hotel gate must reject unaudited live config'
);

const reviewDashboardReservation = {
  id: 'dashboard-review-reservation',
  hotel_id: hotelA.id,
  guest_id: 'dashboard-review-guest',
  guest_name: 'Review Alias Guest',
  guest_phone: '+34944444444',
  arrival_date: '2026-07-30',
  departure_date: '2026-08-02',
  status: 'checked_out'
};
const dashboardSupabase = createMockSupabase({
  missingRuntimeColumns: true,
  reservations: [reservationA, reviewDashboardReservation],
  scheduled_messages: [],
  automation_runs: [],
  automations: [],
  automation_rules: []
});
const dashboardResult = await runDashboardAutomationScheduler({
  supabase: dashboardSupabase,
  hotel: hotelA,
  now
});
assert.ok(dashboardResult.summary.preview > 0, 'Dashboard runner should generate previews');
assert.equal(
  dashboardSupabase.db.scheduled_messages.some((message) => message.status === 'scheduled'),
  false,
  'Dashboard runner must not create scheduled live messages'
);
assert.ok(
  dashboardSupabase.db.scheduled_messages.every((message) => message.send_to === null),
  'Dashboard runner preview records should not store send targets'
);
const dashboardDuplicateKeys = dashboardSupabase.db.scheduled_messages
  .map((message) => message.metadata?.idempotency_key)
  .filter(Boolean);
assert.equal(
  dashboardDuplicateKeys.length,
  new Set(dashboardDuplicateKeys).size,
  'Dashboard runner must not create duplicate previews for the same idempotency key before migration'
);
assert.ok(
  dashboardResult.summary.duplicateCandidate >= 2,
  'Dashboard runner should count duplicate candidate aliases before writing'
);
assert.equal(
  dashboardSupabase.db.scheduled_messages.filter((message) => message.automation_type === 'upselling').length,
  1,
  'Upselling candidate aliases should produce one preview before migration'
);
assert.equal(
  dashboardSupabase.db.automation_runs.filter((run) => (
    run.automation_type === 'upselling'
    && run.reservation_id === reservationA.id
    && run.status === 'preview'
  )).length,
  1,
  'Upselling candidate aliases should produce one run before migration'
);
assert.equal(
  dashboardSupabase.db.scheduled_messages.filter((message) => message.automation_type === 'review_request').length,
  1,
  'Review request candidate aliases should produce one preview before migration'
);
assert.equal(
  dashboardSupabase.db.automation_runs.filter((run) => (
    run.automation_type === 'review_request'
    && run.reservation_id === reviewDashboardReservation.id
    && run.status === 'preview'
  )).length,
  1,
  'Review request candidate aliases should produce one run before migration'
);

const existingMetadataSupabase = createMockSupabase({
  missingRuntimeColumns: true,
  scheduled_messages: [{
    id: 'existing-transfer-preview',
    hotel_id: hotelA.id,
    reservation_id: reservationA.id,
    guest_id: reservationA.guest_id,
    automation_type: 'transfer',
    status: 'preview',
    metadata: {
      idempotency_key: transferDecisionA.idempotencyKey
    }
  }]
});
const existingMetadataWrite = await writeAutomationDecisionToQueue({
  supabase: existingMetadataSupabase,
  decision: transferDecisionA,
  messagePreview: 'Should resolve existing preview',
  source: 'runtime_test',
  creationReason: transferDecisionA.triggerReason
});
assert.equal(existingMetadataWrite.duplicate, true, 'Existing metadata idempotency key should block duplicate before migration');
assert.equal(existingMetadataSupabase.db.scheduled_messages.length, 1, 'Metadata duplicate must not create another message');
assert.equal(existingMetadataSupabase.db.automation_runs.length, 0, 'Metadata duplicate must not create another run');

const duplicateSupabase = createMockSupabase({ uniqueScheduledIdempotency: true });
await writeAutomationDecisionToQueue({
  supabase: duplicateSupabase,
  decision: transferDecisionA,
  messagePreview: 'First',
  source: 'runtime_test',
  creationReason: transferDecisionA.triggerReason
});
const duplicateWrite = await writeAutomationDecisionToQueue({
  supabase: duplicateSupabase,
  decision: transferDecisionA,
  messagePreview: 'Second',
  source: 'runtime_test',
  creationReason: transferDecisionA.triggerReason
});
assert.equal(duplicateWrite.duplicate, true, 'Duplicate idempotency key should be blocked');
assert.equal(duplicateSupabase.db.scheduled_messages.length, 1, 'Duplicate idempotency key must not create another message');
assert.equal(duplicateSupabase.db.automation_runs.length, 1, 'Duplicate idempotency key must not create a second run');

const hotelAKey = buildAutomationIdempotencyKey({
  hotelId: hotelA.id,
  reservationId: reservationA.id,
  automationType: 'transfer',
  trigger: 'transfer_need',
  triggerOccurrence: transferDecisionA.scheduledFor,
  ruleVersion: 'catalog-v1:transfer'
});
const hotelBKey = buildAutomationIdempotencyKey({
  hotelId: hotelB.id,
  reservationId: reservationA.id,
  automationType: 'transfer',
  trigger: 'transfer_need',
  triggerOccurrence: transferDecisionA.scheduledFor,
  ruleVersion: 'catalog-v1:transfer'
});
assert.notEqual(hotelAKey, hotelBKey, 'Different hotels should generate different idempotency keys');

assert.throws(
  () => evaluateAutomationDecision({
    hotel: {},
    reservation: { ...reservationA, hotel_id: null },
    automationType: 'transfer',
    now
  }),
  /hotelId is required/,
  'Missing hotelId should fail explicitly'
);

const messageQueueSource = readFileSync(new URL('../src/services/message-queue.service.js', import.meta.url), 'utf8');
assert.match(messageQueueSource, /from\('scheduled_messages'\)/, 'Message queue must process scheduled_messages');
assert.doesNotMatch(messageQueueSource, /from\('automation_events'\)/, 'automation_events must not be processed as a send queue');

const serverSource = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
assert.doesNotMatch(serverSource, /scheduler\.service|processDueScheduledMessages|runAutomationScheduler/, 'Legacy scheduler should not be registered by the server');
assert.deepEqual(await runAutomationScheduler({ hotelId: hotelA.id, now }), [], 'Legacy scheduler should be non-operational by default');

const folioDecision = evaluateAutomationDecision({
  hotel: hotelA,
  reservation: {
    ...reservationA,
    arrival_date: '2026-08-01',
    departure_date: '2026-08-04',
    status: 'checked_in'
  },
  guest: {
    id: 'guest-a',
    phone_number: '+34911111111',
    folio: {
      available: true,
      outstandingBalance: 132,
      currency: 'EUR'
    }
  },
  automationType: 'pre_checkout_folio_reminder',
  legacyType: 'pre_checkout_folio_reminder',
  executionMode: 'live',
  now,
  metadata: {
    source: 'runtime_test',
    folio: {
      available: true,
      outstandingBalance: 132,
      currency: 'EUR'
    }
  }
});
assert.equal(folioDecision.executionMode, 'preview', 'Folio stays preview-only in Phase 1');

const folioSupabase = createMockSupabase({
  reservations: [{
    id: 'folio-reservation',
    hotel_id: hotelA.id,
    guest_id: 'folio-guest',
    guest_name: 'Folio Guest',
    guest_phone: '+34922222222',
    arrival_date: '2026-08-01',
    departure_date: '2026-08-04',
    status: 'checked_in',
    room_number: '401'
  }],
  hotels: [hotelA],
  guests: [{
    id: 'folio-guest',
    hotel_id: hotelA.id,
    name: 'Folio Guest',
    phone_number: '+34922222222',
    preferred_language: 'es',
    current_room: '401'
  }],
  conversations: [{
    id: 'folio-conversation',
    hotel_id: hotelA.id,
    guest_id: 'folio-guest'
  }],
  hotel_pms_connections: [{
    id: 'pms-connection',
    hotel_id: hotelA.id,
    enabled: true,
    provider: 'mock',
    metadata: {}
  }]
});
const folioRun = await runPreCheckoutFolioReminder({
  supabase: folioSupabase,
  hotelId: hotelA.id,
  now,
  folioProvider: async () => ({
    available: true,
    currency: 'EUR',
    lineItems: [{ description: 'Room charge', amount: 200 }],
    totalCharges: 200,
    totalPaid: 50,
    outstandingBalance: 150,
    dataQuality: 'high',
    warnings: []
  })
});
assert.equal(folioRun.previewsGenerated, 1, 'Folio job should generate one local preview');
assert.equal(folioSupabase.db.scheduled_messages[0].automation_type, 'pre_checkout_folio');
assert.equal(folioSupabase.db.scheduled_messages[0].send_to, null, 'Folio preview must not persist phone targets');
assert.ok(folioSupabase.db.scheduled_messages[0].idempotency_key, 'Folio preview should persist an idempotency key');
assert.equal(folioSupabase.db.automation_runs[0].automation_type, 'pre_checkout_folio');

const reviewDecision = evaluateAutomationDecision({
  hotel: hotelA,
  reservation: {
    ...reservationA,
    departure_date: '2026-08-02',
    status: 'checked_out'
  },
  guest: {
    id: 'guest-a',
    phone_number: '+34911111111',
    sentiment: 'positive'
  },
  automationType: 'post_stay_review_intelligence',
  legacyType: 'post_stay_review_intelligence',
  executionMode: 'live',
  now,
  metadata: { source: 'runtime_test' }
});
assert.equal(reviewDecision.executionMode, 'preview', 'Post-stay review stays preview-only in Phase 1');

const reviewSupabase = createMockSupabase({
  reservations: [{
    id: 'review-reservation',
    hotel_id: hotelA.id,
    guest_id: 'review-guest',
    guest_name: 'Review Guest',
    guest_phone: '+34933333333',
    arrival_date: '2026-07-30',
    departure_date: '2026-08-02',
    status: 'checked_out'
  }],
  hotels: [{
    ...hotelA,
    metadata: {
      public_review_link: 'https://reviews.example/hotel-a'
    }
  }],
  guests: [{
    id: 'review-guest',
    hotel_id: hotelA.id,
    name: 'Review Guest',
    phone_number: '+34933333333',
    preferred_language: 'en'
  }],
  conversations: [{
    id: 'review-conversation',
    hotel_id: hotelA.id,
    guest_id: 'review-guest'
  }],
  messages: [{
    id: 'review-message',
    guest_id: 'review-guest',
    content: 'Thank you, everything was excellent and perfect.'
  }]
});
const reviewRun = await runPostStayReviewIntelligence({
  supabase: reviewSupabase,
  hotelId: hotelA.id,
  now
});
assert.equal(reviewRun.publicReviewPreviews, 1, 'Post-stay job should generate one local review preview');
assert.equal(reviewSupabase.db.scheduled_messages[0].automation_type, 'review_request');
assert.equal(reviewSupabase.db.scheduled_messages[0].send_to, null, 'Post-stay preview must not persist phone targets');
assert.ok(reviewSupabase.db.scheduled_messages[0].idempotency_key, 'Post-stay preview should persist an idempotency key');
assert.equal(reviewSupabase.db.automation_runs[0].automation_type, 'review_request');

const writerSource = readFileSync(new URL('../shared/automations/queue-writer.js', import.meta.url), 'utf8');
assert.match(writerSource, /from\('scheduled_messages'\)[\s\S]{0,180}\.insert/, 'Shared writer must own scheduled_messages inserts');
[
  '../src/services/pms-folio.service.js',
  '../src/services/post-stay-review-intelligence.service.js',
  '../src/services/automation.service.js'
].forEach((filePath) => {
  const source = readFileSync(new URL(filePath, import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /from\('scheduled_messages'\)[\s\S]{0,180}\.insert/,
    `${filePath} must delegate scheduled_messages writes to the shared writer`
  );
});

assert.equal(testCenterResult.safety.pmsTouched, false, 'Automation Test Center must not touch PMS');
assert.equal(testCenterResult.safety.ubikosTouched, false, 'Automation Test Center must not touch Ubikos');
assert.equal(testCenterResult.safety.liveSendingBlocked, true, 'Automation Test Center must block live sending');

console.log(JSON.stringify({
  ok: true,
  catalogTypes: definitions.length,
  dashboardPreviewGenerated: dashboardResult.summary.preview,
  dashboardSkipped: dashboardResult.summary.skipped,
  dashboardDuplicateCandidate: dashboardResult.summary.duplicateCandidate,
  duplicateBlocked: duplicateWrite.duplicate,
  metadataDuplicateBlocked: existingMetadataWrite.duplicate,
  sendAutomations: process.env.SEND_AUTOMATIONS
}, null, 2));
