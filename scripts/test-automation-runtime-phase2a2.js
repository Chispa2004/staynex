import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTOMATION_RUNTIME_VERSION,
  CERTIFICATION_STATUSES,
  EXECUTION_MODES,
  OPERATIONAL_STATUSES,
  getAutomationDefinition,
  getReservationDateDependenciesForAutomation
} from '../shared/automations/catalog.js';
import {
  buildReservationScheduleFingerprint,
  evaluateMessageScheduleStaleness,
  evaluateReservationLifecyclePolicy,
  getReservationDateChangedFields,
  hasReservationDateChanged,
  isCanonicalAutomationScheduledMessage,
  normalizeReservationStayDate
} from '../shared/automations/reservation-lifecycle.js';
import {
  evaluateAutomationDecision,
  scheduledForAutomation
} from '../shared/automations/runtime.js';
import { writeAutomationDecisionToQueue } from '../shared/automations/queue-writer.js';
import { reconcileReservationAutomationLifecycle } from '../src/services/automation-reconciliation.service.js';
import { createOrUpdateReservation } from '../src/services/reservation.service.js';
import {
  claimWebhookEventForProcessing,
  markLocalReservationStatus,
  parseApaleoWebhookEvent,
  processApaleoWebhookEvent
} from '../src/integrations/apaleo/apaleo-webhooks.service.js';
import {
  getReservationScheduleSendTimeGate,
  processScheduledMessage
} from '../src/services/message-queue.service.js';

process.env.SEND_AUTOMATIONS = 'false';
process.env.USE_MOCK_AI = 'true';
delete process.env.TEST_WHATSAPP_NUMBER;
delete process.env.UBIKOS_ENABLED;

const now = new Date('2026-08-12T10:00:00.000Z');
const hotel = {
  id: 'hotel-phase2a2',
  name: 'Staynex Phase 2A2 Hotel',
  default_language: 'es',
  timezone: 'Europe/Madrid',
  metadata: {
    automation_live_enabled: true,
    automation_execution_mode: EXECUTION_MODES.LIVE,
    automation_live_approved_at: '2026-08-12T08:00:00.000Z',
    automation_live_approved_by: 'ops-user'
  }
};
const baseReservation = {
  id: 'reservation-phase2a2',
  hotel_id: hotel.id,
  guest_id: 'guest-phase2a2',
  guest_name: 'Private Guest',
  guest_email: 'private@example.test',
  guest_phone: '+34911111111',
  arrival_date: '2026-08-13',
  departure_date: '2026-08-15',
  status: 'confirmed',
  metadata: {
    last_intent: 'airport transfer spa'
  }
};

const incrementCounter = (db, name) => {
  db.counters ||= {};
  db.counters[name] = (db.counters[name] || 0) + 1;
};

const hasPmsWebhookUniqueIdentity = (row) => row?.provider && row?.external_event_id;

const samePmsWebhookUniqueIdentity = (left, right) => (
  hasPmsWebhookUniqueIdentity(left)
  && hasPmsWebhookUniqueIdentity(right)
  && left.provider === right.provider
  && left.external_event_id === right.external_event_id
);

const pmsWebhookUniqueViolation = () => ({
  code: '23505',
  message: 'duplicate key value violates unique constraint "pms_webhook_events_provider_external_event_unique_idx"'
});

const waitForPromise = (promise, message) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(message)), 1000);
  promise.then(
    (value) => {
      clearTimeout(timeout);
      resolve(value);
    },
    (error) => {
      clearTimeout(timeout);
      reject(error);
    }
  );
});

const createControlledReservationFetch = (reservation) => {
  let releaseFetch = null;
  let startedResolve = null;
  let calls = 0;
  const started = new Promise((resolve) => {
    startedResolve = resolve;
  });

  return {
    fetch: async () => {
      calls += 1;
      const releaseSignal = new Promise((resolve) => {
        releaseFetch = resolve;
      });
      startedResolve();
      await releaseSignal;
      return structuredClone(reservation);
    },
    waitForCall: () => waitForPromise(started, 'controlled reservation fetch was not reached'),
    release: () => releaseFetch?.(),
    calls: () => calls
  };
};

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.insertRows = null;
    this.upsertOptions = {};
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

  upsert(rows, options = {}) {
    this.operation = 'upsert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    this.upsertOptions = options || {};
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  update(values) {
    this.operation = 'update';
    this.updateValues = values;
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column, values = []) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  lte(column, value) {
    this.filters.push((row) => String(row[column] || '') <= String(value));
    return this;
  }

  gte(column, value) {
    this.filters.push((row) => String(row[column] || '') >= String(value));
    return this;
  }

  lt(column, value) {
    this.filters.push((row) => String(row[column] || '') < String(value));
    return this;
  }

  not(column, operator, value) {
    if (operator === 'is' && value === null) {
      this.filters.push((row) => row[column] !== null && row[column] !== undefined);
      return this;
    }

    this.filters.push((row) => row[column] !== value);
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

    if (this.db.maybeSingleErrors?.[this.table]) {
      return Promise.resolve({
        data: null,
        error: this.db.maybeSingleErrors[this.table]
      });
    }

    if (this.db.throwMaybeSingleTables?.includes(this.table)) {
      throw new Error(`${this.table} maybeSingle failed`);
    }

    if (this.db.ambiguousMaybeSingleTables?.includes(this.table) && result.data?.length > 1) {
      return Promise.resolve({
        data: null,
        error: { message: 'JSON object requested, multiple rows returned' }
      });
    }

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

    if (this.operation === 'upsert') {
      if (this.table === 'reservations') {
        incrementCounter(this.db, 'reservationUpsertCalls');
      }

      const conflictColumns = String(this.upsertOptions.onConflict || 'id')
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean);
      const upserted = this.insertRows.map((row) => {
        const existing = this.db[this.table].find((current) => (
          conflictColumns.length > 0
          && conflictColumns.every((column) => current[column] === row[column])
        ));

        if (existing) {
          Object.assign(existing, row);
          return existing;
        }

        const next = {
          id: row.id || `${this.table}-${this.db.nextId++}`,
          created_at: row.created_at || now.toISOString(),
          ...row
        };
        this.db[this.table].push(next);
        return next;
      });

      return { data: upserted, error: null };
    }

    if (this.operation === 'insert') {
      if (this.table === 'scheduled_messages' && this.db.failScheduledInsertOnce) {
        this.db.failScheduledInsertOnce = false;
        return {
          data: null,
          error: { message: 'injected scheduled_messages insert failure' }
        };
      }

      if (this.table === 'pms_webhook_events') {
        const conflictingWebhookEvent = this.insertRows.find((row) => (
          hasPmsWebhookUniqueIdentity(row)
          && this.db[this.table].some((current) => samePmsWebhookUniqueIdentity(current, row))
        ));

        if (conflictingWebhookEvent) {
          incrementCounter(this.db, 'pmsWebhookUniqueConflicts');
          return {
            data: null,
            error: pmsWebhookUniqueViolation()
          };
        }
      }

      if (this.table === 'scheduled_messages') {
        incrementCounter(this.db, 'scheduledMessageInsertCalls');
      }

      if (this.table === 'automation_runs') {
        incrementCounter(this.db, 'automationRunInsertCalls');
      }

      const inserted = this.insertRows.map((row) => {
        const existing = row.id
          ? this.db[this.table].find((current) => current.id === row.id)
          : null;

        if (existing) {
          Object.assign(existing, row);
          return existing;
        }

        const next = {
          id: row.id || `${this.table}-${this.db.nextId++}`,
          created_at: row.created_at || now.toISOString(),
          ...row
        };
        this.db[this.table].push(next);
        return next;
      });
      return { data: inserted, error: null };
    }

    let rows = this.db[this.table].filter((row) => this.filters.every((filter) => filter(row)));

    if (this.operation === 'delete') {
      const deleted = rows;
      this.db[this.table] = this.db[this.table].filter((row) => !this.filters.every((filter) => filter(row)));
      return { data: deleted, error: null };
    }

    if (this.operation === 'update') {
      if (
        this.table === 'scheduled_messages'
        && this.updateValues?.status === OPERATIONAL_STATUSES.CANCELLED
        && this.db.failCancelUpdateOnce
      ) {
        this.db.failCancelUpdateOnce = false;
        return {
          data: null,
          error: { message: 'injected supersede cancellation failure' }
        };
      }

      if (this.table === 'reservations' && rows.length > 0) {
        incrementCounter(this.db, 'reservationUpdateCalls');
      }

      if (this.table === 'scheduled_messages' && this.updateValues?.status === OPERATIONAL_STATUSES.CANCELLED && rows.length > 0) {
        incrementCounter(this.db, 'scheduledMessageCancellationCalls');
      }

      if (this.table === 'pms_webhook_events' && this.updateValues?.status === 'processing') {
        incrementCounter(this.db, 'pmsWebhookClaimAttempts');

        if (rows.length > 0) {
          incrementCounter(this.db, 'pmsWebhookClaimsAcquired');
        }
      }

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
    hotels: [hotel],
    guests: [],
    reservations: [],
    scheduled_messages: [],
    automation_runs: [],
    automation_events: [],
    hotel_pms_connections: [],
    pms_webhook_events: [],
    guest_stay_context: [],
    room_status_snapshots: [],
    hotel_occupancy_snapshots: [],
    pms_operational_events: [],
    pms_intelligence_logs: [],
    counters: {},
    maybeSingleErrors: {},
    throwMaybeSingleTables: [],
    ambiguousMaybeSingleTables: [],
    ...structuredClone(initial)
  };

  return {
    db,
    from(table) {
      return new QueryBuilder(db, table);
    }
  };
};

const canonicalMessage = ({
  id,
  reservation = baseReservation,
  fingerprintReservation = reservation,
  automationType = 'transfer',
  legacyType = automationType,
  status = OPERATIONAL_STATUSES.PREVIEW,
  hotelId = reservation.hotel_id,
  reservationId = reservation.id,
  metadata = {}
} = {}) => {
  const definition = getAutomationDefinition(automationType);
  const dependencies = getReservationDateDependenciesForAutomation(automationType);
  const fingerprint = buildReservationScheduleFingerprint({
    reservation: fingerprintReservation,
    automationType,
    dependencies
  });

  return {
    id: id || `message-${automationType}-${status}`,
    hotel_id: hotelId,
    reservation_id: reservationId,
    guest_id: reservation.guest_id,
    conversation_id: null,
    automation_type: automationType,
    channel: 'whatsapp',
    scheduled_for: '2026-08-12T09:00:00.000Z',
    send_to: '+34911111111',
    language: 'es',
    message_preview: 'Existing preview',
    status,
    execution_mode: EXECUTION_MODES.PREVIEW,
    idempotency_key: `automation:phase1:${hotelId}:${reservationId}:${automationType}:${id || status}`,
    runtime_version: AUTOMATION_RUNTIME_VERSION,
    certification_status: CERTIFICATION_STATUSES.UNCERTIFIED,
    metadata: {
      runtime_version: AUTOMATION_RUNTIME_VERSION,
      execution_mode: EXECUTION_MODES.PREVIEW,
      certification_status: CERTIFICATION_STATUSES.UNCERTIFIED,
      canonical_automation_type: automationType,
      legacy_automation_type: legacyType,
      trigger: definition?.trigger || automationType,
      rule_version: definition?.ruleVersion || `catalog-v1:${automationType}`,
      reservation_date_dependencies: dependencies,
      reservation_schedule_fingerprint: fingerprint,
      schedule_fingerprint_version: fingerprint ? 'reservation-schedule-fingerprint-v1' : null,
      ...(metadata || {})
    }
  };
};

const liveCanonicalMessage = (overrides = {}) => ({
  ...canonicalMessage({
    automationType: 'transfer',
    status: OPERATIONAL_STATUSES.SCHEDULED,
    ...overrides
  }),
  execution_mode: EXECUTION_MODES.LIVE,
  certification_status: CERTIFICATION_STATUSES.CERTIFIED,
  send_to: overrides.send_to ?? null,
  metadata: {
    ...canonicalMessage({
      automationType: 'transfer',
      status: OPERATIONAL_STATUSES.SCHEDULED,
      ...overrides
    }).metadata,
    execution_mode: EXECUTION_MODES.LIVE,
    certification_status: CERTIFICATION_STATUSES.CERTIFIED
  }
});

const reconcile = (supabase, previousReservation, currentReservation, extra = {}) => reconcileReservationAutomationLifecycle({
  previousReservation,
  currentReservation,
  source: 'phase2a2_test',
  sourceEventId: extra.sourceEventId ?? 'phase2a2-event',
  supabase
});

assert.equal(hasReservationDateChanged(
  { arrival_date: '2026-08-13', departure_date: '2026-08-15' },
  { arrival_date: '2026-08-13', departure_date: '2026-08-15' }
), false, 'same dates should not reschedule');
assert.equal(hasReservationDateChanged(
  { arrival_date: '2026-08-13T00:00:00.000Z', departure_date: '15/08/2026' },
  { arrival_date: '2026-08-13', departure_date: '2026-08-15T12:00:00.000Z' }
), false, 'equivalent real formats should not create false changes');
assert.deepEqual(getReservationDateChangedFields(
  baseReservation,
  { ...baseReservation, arrival_date: '2026-08-14' }
), ['arrival_date']);
assert.deepEqual(getReservationDateChangedFields(
  baseReservation,
  { ...baseReservation, departure_date: '2026-08-16' }
), ['departure_date']);
assert.deepEqual(getReservationDateChangedFields(
  baseReservation,
  { ...baseReservation, arrival_date: '2026-08-14', departure_date: '2026-08-16' }
), ['arrival_date', 'departure_date']);
assert.equal(normalizeReservationStayDate('13/08/2026'), '2026-08-13');
assert.equal(normalizeReservationStayDate('2026-08-13'), '2026-08-13');
assert.equal(normalizeReservationStayDate('2026/08/13'), '2026-08-13');
assert.equal(normalizeReservationStayDate('28-05-2026'), '2026-05-28');
assert.equal(normalizeReservationStayDate('2026-08-13T00:00:00.000Z'), '2026-08-13');
assert.equal(normalizeReservationStayDate('2026-08-23T00:00:00Z'), '2026-08-23');
assert.equal(normalizeReservationStayDate('2028-02-29'), '2028-02-29');
[
  'Feb 31 2026',
  '31/02/2026',
  '2026-02-29',
  '2026-04-31',
  '2026-13-01',
  '2026-00-10',
  '2026-08-00',
  '2026-08-13abc',
  '8/13/2026'
].forEach((value) => {
  assert.equal(normalizeReservationStayDate(value), null, `${value} should not normalize as a stay date`);
});

assert.deepEqual(getReservationDateDependenciesForAutomation('transfer'), ['arrival_date']);
assert.deepEqual(getReservationDateDependenciesForAutomation('post_checkout'), ['departure_date']);
assert.deepEqual(getReservationDateDependenciesForAutomation('spa'), ['arrival_date', 'departure_date']);
assert.deepEqual(getReservationDateDependenciesForAutomation('birthday'), ['arrival_date']);

const currentArrivalReservation = { ...baseReservation, arrival_date: '2026-08-14' };
const currentDepartureReservation = { ...baseReservation, departure_date: '2026-08-16', status: 'checked_out' };
const currentStayReservation = { ...baseReservation, departure_date: '2026-08-17' };

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
await assert.rejects(
  () => reconcileReservationAutomationLifecycle({
    previousReservation: baseReservation,
    currentReservation: currentArrivalReservation,
    source: 'phase2a2_missing_db_dependency',
    sourceEventId: 'missing-db-event'
  }),
  { message: 'Supabase environment variables are not configured' },
  'missing DB client should throw explicitly instead of succeeding as a no-op'
);
if (originalSupabaseUrl === undefined) {
  delete process.env.SUPABASE_URL;
} else {
  process.env.SUPABASE_URL = originalSupabaseUrl;
}
if (originalSupabaseServiceRoleKey === undefined) {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
} else {
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
}

assert.equal(evaluateMessageScheduleStaleness({
  message: canonicalMessage({ id: 'arrival-old', automationType: 'transfer', fingerprintReservation: baseReservation }),
  reservation: currentArrivalReservation
}).stale, true, 'arrival change affects arrival-dependent messages');
assert.equal(evaluateMessageScheduleStaleness({
  message: canonicalMessage({ id: 'departure-only-current', automationType: 'post_checkout', fingerprintReservation: baseReservation }),
  reservation: currentArrivalReservation
}).stale, false, 'arrival change must not affect departure-only messages');
assert.equal(evaluateMessageScheduleStaleness({
  message: canonicalMessage({ id: 'departure-old', automationType: 'post_checkout', fingerprintReservation: baseReservation }),
  reservation: currentDepartureReservation
}).stale, true, 'departure change affects departure-dependent messages');
assert.equal(evaluateMessageScheduleStaleness({
  message: canonicalMessage({ id: 'arrival-only-current', automationType: 'transfer', fingerprintReservation: baseReservation }),
  reservation: currentDepartureReservation
}).stale, false, 'departure change must not affect arrival-only messages');
assert.equal(evaluateMessageScheduleStaleness({
  message: canonicalMessage({ id: 'stay-old', automationType: 'spa', fingerprintReservation: baseReservation }),
  reservation: currentStayReservation
}).stale, true, 'stay-dependent messages react to departure changes');
assert.equal(evaluateMessageScheduleStaleness({
  message: canonicalMessage({ id: 'birthday-old', automationType: 'birthday', fingerprintReservation: baseReservation }),
  reservation: currentArrivalReservation
}).stale, true, 'birthday messages should stale while anchored to arrival');
assert.equal(
  scheduledForAutomation({ automationType: 'birthday', reservation: baseReservation }),
  '2026-08-13T12:00:00.000Z'
);

const staleStatusSupabase = createMockSupabase({
  reservations: [currentArrivalReservation],
  scheduled_messages: [
    canonicalMessage({ id: 'stale-preview', status: OPERATIONAL_STATUSES.PREVIEW, fingerprintReservation: baseReservation }),
    canonicalMessage({ id: 'stale-approval', status: OPERATIONAL_STATUSES.AWAITING_APPROVAL, fingerprintReservation: baseReservation }),
    canonicalMessage({ id: 'stale-scheduled', status: OPERATIONAL_STATUSES.SCHEDULED, fingerprintReservation: baseReservation }),
    canonicalMessage({ id: 'sent-history', status: OPERATIONAL_STATUSES.SENT, fingerprintReservation: baseReservation }),
    canonicalMessage({ id: 'failed-history', status: OPERATIONAL_STATUSES.FAILED, fingerprintReservation: baseReservation }),
    canonicalMessage({ id: 'processing-guard', status: OPERATIONAL_STATUSES.PROCESSING, fingerprintReservation: baseReservation })
  ]
});
const staleStatusResult = await reconcile(staleStatusSupabase, baseReservation, currentArrivalReservation);
assert.equal(staleStatusSupabase.db.scheduled_messages.find((row) => row.id === 'stale-preview').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(staleStatusSupabase.db.scheduled_messages.find((row) => row.id === 'stale-approval').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(staleStatusSupabase.db.scheduled_messages.find((row) => row.id === 'stale-scheduled').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(staleStatusSupabase.db.scheduled_messages.find((row) => row.id === 'sent-history').status, OPERATIONAL_STATUSES.SENT);
assert.equal(staleStatusSupabase.db.scheduled_messages.find((row) => row.id === 'failed-history').status, OPERATIONAL_STATUSES.FAILED);
assert.equal(staleStatusSupabase.db.scheduled_messages.find((row) => row.id === 'processing-guard').status, OPERATIONAL_STATUSES.PROCESSING);
assert.equal(staleStatusResult.processingRowsRequireSendTimeGuard, 1);

const writerSource = readFileSync(new URL('../src/services/automation-reconciliation.service.js', import.meta.url), 'utf8');
assert.match(writerSource, /writeAutomationDecisionToQueue/, 'replacements should use canonical writer');
assert.doesNotMatch(writerSource, /policy\.action !== 'cancel_pending' && !supabase/, 'future_reschedule must not silently no-op without a DB client');
const replacement = staleStatusSupabase.db.scheduled_messages.find((row) => (
  row.id !== 'stale-preview'
  && row.automation_type === 'transfer'
  && row.status === OPERATIONAL_STATUSES.PREVIEW
  && row.metadata?.reservation_schedule_fingerprint === buildReservationScheduleFingerprint({
    reservation: currentArrivalReservation,
    automationType: 'transfer'
  })
));
assert.ok(replacement, 'replacement should be created with current schedule fingerprint');
assert.ok(replacement.idempotency_key.includes('schedule:'), 'replacement idempotency should correspond to current occurrence');
assert.equal(staleStatusSupabase.db.scheduled_messages.find((row) => row.id === 'stale-preview').idempotency_key.includes('stale-preview'), true);
const retryStatusResult = await reconcile(staleStatusSupabase, currentArrivalReservation, currentArrivalReservation);
assert.equal(retryStatusResult.replacementsCreated, 0, 'retry should not duplicate replacement');
assert.equal(staleStatusSupabase.db.scheduled_messages.filter((row) => (
  row.automation_type === 'transfer'
  && row.status === OPERATIONAL_STATUSES.PREVIEW
  && row.metadata?.reservation_schedule_fingerprint === replacement.metadata.reservation_schedule_fingerprint
)).length, 1);

const failBeforeSupabase = createMockSupabase({
  failScheduledInsertOnce: true,
  reservations: [currentArrivalReservation],
  scheduled_messages: [canonicalMessage({ id: 'fail-before-old', fingerprintReservation: baseReservation })]
});
await assert.rejects(
  () => reconcile(failBeforeSupabase, baseReservation, currentArrivalReservation),
  { message: 'injected scheduled_messages insert failure' }
);
assert.equal(failBeforeSupabase.db.scheduled_messages.find((row) => row.id === 'fail-before-old').status, OPERATIONAL_STATUSES.PREVIEW);
const failBeforeRetry = await reconcile(failBeforeSupabase, currentArrivalReservation, currentArrivalReservation);
assert.equal(failBeforeRetry.replacementsCreated, 1);
assert.equal(failBeforeSupabase.db.scheduled_messages.find((row) => row.id === 'fail-before-old').status, OPERATIONAL_STATUSES.CANCELLED);

const failAfterSupabase = createMockSupabase({
  failCancelUpdateOnce: true,
  reservations: [currentArrivalReservation],
  scheduled_messages: [canonicalMessage({ id: 'fail-after-old', fingerprintReservation: baseReservation })]
});
await assert.rejects(
  () => reconcile(failAfterSupabase, baseReservation, currentArrivalReservation),
  { message: 'injected supersede cancellation failure' }
);
assert.equal(failAfterSupabase.db.scheduled_messages.find((row) => row.id === 'fail-after-old').status, OPERATIONAL_STATUSES.PREVIEW);
assert.equal(failAfterSupabase.db.scheduled_messages.filter((row) => row.id !== 'fail-after-old').length, 1);
const failAfterRetry = await reconcile(failAfterSupabase, currentArrivalReservation, currentArrivalReservation);
assert.equal(failAfterRetry.replacementsDuplicated, 1);
assert.equal(failAfterSupabase.db.scheduled_messages.find((row) => row.id === 'fail-after-old').status, OPERATIONAL_STATUSES.CANCELLED);

const stateDrivenSupabase = createMockSupabase({
  reservations: [currentArrivalReservation],
  scheduled_messages: [canonicalMessage({ id: 'state-driven-old', fingerprintReservation: baseReservation })]
});
const stateDrivenResult = await reconcile(stateDrivenSupabase, currentArrivalReservation, currentArrivalReservation);
assert.equal(stateDrivenResult.staleRows, 1, 'previous=current with stale queue should repair');
const thirdRetryResult = await reconcile(stateDrivenSupabase, currentArrivalReservation, currentArrivalReservation);
assert.equal(thirdRetryResult.rowsCancelled, 0, 'third retry should be stable');

const invalidDateReconcileSupabase = createMockSupabase({
  reservations: [{ ...baseReservation, arrival_date: '2026-08-13abc' }],
  scheduled_messages: [canonicalMessage({ id: 'invalid-date-old', fingerprintReservation: baseReservation })]
});
const invalidDateReconcileResult = await reconcile(
  invalidDateReconcileSupabase,
  baseReservation,
  { ...baseReservation, arrival_date: '2026-08-13abc' }
);
assert.equal(invalidDateReconcileResult.staleRows, 1);
assert.equal(invalidDateReconcileResult.replacementsCreated, 0, 'invalid current stay date must not create replacement');
assert.equal(invalidDateReconcileSupabase.db.scheduled_messages.find((row) => row.id === 'invalid-date-old').status, OPERATIONAL_STATUSES.CANCELLED);

const multi23 = { ...baseReservation, arrival_date: '2026-08-14' };
const multi25 = { ...baseReservation, arrival_date: '2026-08-15' };
const multiSupabase = createMockSupabase({
  reservations: [multi23],
  scheduled_messages: [canonicalMessage({ id: 'multi-20', fingerprintReservation: baseReservation })]
});
await reconcile(multiSupabase, baseReservation, multi23);
multiSupabase.db.reservations[0] = multi25;
await reconcile(multiSupabase, multi23, multi25);
assert.equal(multiSupabase.db.scheduled_messages.find((row) => row.id === 'multi-20').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(
  multiSupabase.db.scheduled_messages.filter((row) => row.status === OPERATIONAL_STATUSES.PREVIEW).length,
  1,
  '20->23->25 should leave one current pending preview'
);
assert.equal(
  multiSupabase.db.scheduled_messages.filter((row) => row.status === OPERATIONAL_STATUSES.PREVIEW)[0].metadata.reservation_schedule_fingerprint,
  buildReservationScheduleFingerprint({ reservation: multi25, automationType: 'transfer' })
);

const productPathReservation = {
  ...baseReservation,
  id: 'reservation-product-path',
  pms_provider: 'mock',
  pms_reservation_id: 'product-path-reservation',
  reservation_access_token: 'STX-PRODUCT1'
};
const productPathSupabase = createMockSupabase({
  reservations: [productPathReservation],
  scheduled_messages: [
    canonicalMessage({
      id: 'product-path-old',
      reservation: productPathReservation,
      fingerprintReservation: productPathReservation
    })
  ]
});
const productPathResult = await createOrUpdateReservation({
  ...productPathReservation,
  arrival_date: '2026-08-14'
}, {
  supabase: productPathSupabase,
  source: 'phase2a2_product_path',
  sourceEventId: 'product-path-event'
});
assert.equal(productPathResult.reservation.id, productPathReservation.id);
assert.equal(productPathResult.reservation.arrival_date, '2026-08-14');
assert.equal(productPathSupabase.db.scheduled_messages.find((row) => row.id === 'product-path-old').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(
  productPathSupabase.db.scheduled_messages.filter((row) => (
    row.status === OPERATIONAL_STATUSES.PREVIEW
    && row.metadata?.reservation_schedule_fingerprint === buildReservationScheduleFingerprint({
      reservation: { ...productPathReservation, arrival_date: '2026-08-14' },
      automationType: 'transfer'
    })
  )).length,
  1,
  'createOrUpdateReservation should reconcile using its active DB client'
);

const productPartialReservation = {
  ...baseReservation,
  id: 'reservation-product-partial',
  pms_provider: 'mock',
  pms_reservation_id: 'product-partial-reservation',
  reservation_access_token: 'STX-PARTIAL'
};
const productPartialSupabase = createMockSupabase({
  failCancelUpdateOnce: true,
  reservations: [productPartialReservation],
  scheduled_messages: [
    canonicalMessage({
      id: 'product-partial-old',
      reservation: productPartialReservation,
      fingerprintReservation: productPartialReservation
    })
  ]
});
await assert.rejects(
  () => createOrUpdateReservation({
    ...productPartialReservation,
    arrival_date: '2026-08-14'
  }, {
    supabase: productPartialSupabase,
    source: 'phase2a2_product_partial',
    sourceEventId: 'product-partial-event-1'
  }),
  { message: 'injected supersede cancellation failure' }
);
await createOrUpdateReservation({
  ...productPartialReservation,
  arrival_date: '2026-08-15'
}, {
  supabase: productPartialSupabase,
  source: 'phase2a2_product_partial',
  sourceEventId: 'product-partial-event-2'
});
assert.equal(productPartialSupabase.db.scheduled_messages.find((row) => row.id === 'product-partial-old').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(
  productPartialSupabase.db.scheduled_messages.filter((row) => row.status === OPERATIONAL_STATUSES.PREVIEW).length,
  1,
  'product path 13->14 failed then 15 should leave one current pending preview'
);
assert.equal(
  productPartialSupabase.db.scheduled_messages.filter((row) => row.status === OPERATIONAL_STATUSES.PREVIEW)[0].metadata.reservation_schedule_fingerprint,
  buildReservationScheduleFingerprint({
    reservation: { ...productPartialReservation, arrival_date: '2026-08-15' },
    automationType: 'transfer'
  })
);

const apaleoStatusReservation = {
  ...baseReservation,
  id: 'reservation-apaleo-status',
  pms_provider: 'apaleo',
  pms_reservation_id: 'apaleo-status-reservation',
  reservation_access_token: 'STX-STATUS1'
};
const apaleoStatusSupabase = createMockSupabase({
  reservations: [apaleoStatusReservation],
  scheduled_messages: [
    canonicalMessage({
      id: 'apaleo-status-old',
      reservation: apaleoStatusReservation,
      fingerprintReservation: apaleoStatusReservation
    })
  ]
});
const apaleoStatusResult = await markLocalReservationStatus({
  reservationId: 'apaleo-status-reservation',
  status: 'cancelled',
  hotelId: hotel.id,
  sourceEventId: 'apaleo-status-event',
  supabase: apaleoStatusSupabase
});
assert.equal(apaleoStatusResult.status, 'cancelled');
assert.equal(apaleoStatusSupabase.db.scheduled_messages.find((row) => row.id === 'apaleo-status-old').status, OPERATIONAL_STATUSES.CANCELLED);

const apaleoConnection = {
  id: 'apaleo-connection-phase2a2',
  hotel_id: hotel.id,
  provider: 'apaleo',
  account_code: 'phase2a2-account',
  enabled: true,
  encrypted_client_secret: null,
  updated_at: now.toISOString(),
  metadata: {}
};
const apaleoWebhookReservation = {
  ...baseReservation,
  id: 'reservation-apaleo-webhook',
  pms_provider: 'apaleo',
  pms_reservation_id: 'apaleo-webhook-reservation',
  reservation_access_token: 'STX-WEBHOOK'
};
const apaleoWebhookPayload = {
  id: 'apaleo-webhook-event',
  type: 'reservation.amended',
  reservationId: 'apaleo-webhook-reservation',
  accountCode: 'phase2a2-account',
  createdAt: '2026-08-12T09:00:00.000Z',
  guestName: 'Webhook Private Guest',
  guestEmail: 'webhook-private@example.test',
  guestPhone: '+34922222222',
  pmsPayload: {
    message: 'raw PMS payload should not be stored in durable webhook audit'
  }
};
const apaleoFetchedReservation = {
  id: 'apaleo-webhook-reservation',
  status: 'confirmed',
  arrival: '2026-08-14',
  departure: '2026-08-15',
  primaryGuest: {
    name: 'Private Guest',
    phone: '+34911111111',
    email: 'private@example.test'
  }
};
const fetchApaleoReservation = async () => structuredClone(apaleoFetchedReservation);
const apaleoWebhookSupabase = createMockSupabase({
  hotel_pms_connections: [apaleoConnection],
  reservations: [apaleoWebhookReservation],
  scheduled_messages: [
    canonicalMessage({
      id: 'apaleo-webhook-old',
      reservation: apaleoWebhookReservation,
      fingerprintReservation: apaleoWebhookReservation
    })
  ]
});
const apaleoWebhookResult = await processApaleoWebhookEvent(apaleoWebhookPayload, {}, {
  supabase: apaleoWebhookSupabase,
  fetchReservationById: fetchApaleoReservation
});
assert.equal(apaleoWebhookResult.status, 'processed');
assert.equal(apaleoWebhookSupabase.db.pms_webhook_events.find((row) => row.external_event_id === 'apaleo-webhook-event').status, 'processed');
assert.doesNotMatch(
  JSON.stringify(apaleoWebhookSupabase.db.pms_webhook_events.find((row) => row.external_event_id === 'apaleo-webhook-event').payload),
  /Webhook Private Guest|webhook-private@example\.test|\+34922222222|raw PMS payload/,
  'durable webhook audit payload must not store PII or raw PMS payload'
);
assert.equal(apaleoWebhookSupabase.db.scheduled_messages.find((row) => row.id === 'apaleo-webhook-old').status, OPERATIONAL_STATUSES.CANCELLED);
const apaleoWebhookDuplicate = await processApaleoWebhookEvent(apaleoWebhookPayload, {}, {
  supabase: apaleoWebhookSupabase,
  fetchReservationById: async () => {
    throw new Error('processed duplicate should not fetch reservation');
  }
});
assert.equal(apaleoWebhookDuplicate.status, 'ignored');
assert.equal(apaleoWebhookDuplicate.duplicate, true);

const concurrentNewReservation = {
  ...apaleoWebhookReservation,
  id: 'reservation-concurrent-new',
  pms_reservation_id: 'apaleo-concurrent-new-reservation',
  reservation_access_token: 'STX-CONNEW'
};
const concurrentNewPayload = {
  ...apaleoWebhookPayload,
  id: 'apaleo-concurrent-new-event',
  reservationId: 'apaleo-concurrent-new-reservation'
};
const concurrentNewSupabase = createMockSupabase({
  hotel_pms_connections: [apaleoConnection],
  reservations: [concurrentNewReservation],
  scheduled_messages: [
    canonicalMessage({
      id: 'concurrent-new-old',
      reservation: concurrentNewReservation,
      fingerprintReservation: concurrentNewReservation
    })
  ],
  pms_webhook_events: [
    {
      id: 'other-provider-same-event-id',
      hotel_id: hotel.id,
      provider: 'ubikos',
      connection_id: null,
      external_event_id: 'apaleo-concurrent-new-event',
      external_resource_id: 'ubikos-reservation',
      event_type: 'reservation.amended',
      event_action: 'amended',
      status: 'processed',
      payload: {}
    }
  ]
});
const concurrentNewFetch = createControlledReservationFetch({
  ...apaleoFetchedReservation,
  id: 'apaleo-concurrent-new-reservation'
});
const concurrentNewFirst = processApaleoWebhookEvent(concurrentNewPayload, {}, {
  supabase: concurrentNewSupabase,
  fetchReservationById: concurrentNewFetch.fetch
});
const concurrentNewSecond = processApaleoWebhookEvent(concurrentNewPayload, {}, {
  supabase: concurrentNewSupabase,
  fetchReservationById: concurrentNewFetch.fetch
});
await concurrentNewFetch.waitForCall();
const concurrentNewDuplicate = await waitForPromise(Promise.race([
  concurrentNewFirst.then((result) => ({ result })),
  concurrentNewSecond.then((result) => ({ result }))
]), 'concurrent new duplicate did not return while owner was processing');
assert.equal(concurrentNewDuplicate.result.status, 'duplicate_processing');
assert.equal(concurrentNewDuplicate.result.reason, 'already_processing');
assert.equal(concurrentNewDuplicate.result.duplicate, true);
assert.equal(concurrentNewFetch.calls(), 1, 'concurrent new event should fetch reservation once');
concurrentNewFetch.release();
const concurrentNewResults = await Promise.all([concurrentNewFirst, concurrentNewSecond]);
assert.deepEqual(concurrentNewResults.map((result) => result.status).sort(), ['duplicate_processing', 'processed']);
assert.equal(
  concurrentNewSupabase.db.pms_webhook_events.filter((row) => (
    row.provider === 'apaleo'
    && row.external_event_id === 'apaleo-concurrent-new-event'
  )).length,
  1,
  'concurrent new event should leave one durable apaleo webhook row'
);
assert.equal(
  concurrentNewSupabase.db.pms_webhook_events.find((row) => row.id === 'other-provider-same-event-id').status,
  'processed',
  'same external_event_id from another provider must remain isolated'
);
assert.equal(concurrentNewSupabase.db.counters.pmsWebhookUniqueConflicts, 1, 'new-event race should be resolved by unique constraint');
assert.equal(concurrentNewSupabase.db.counters.pmsWebhookClaimsAcquired, 1, 'new-event race should have one processing owner');
assert.equal(concurrentNewSupabase.db.counters.reservationUpsertCalls, 1, 'new-event race should mutate reservation once');
assert.equal(concurrentNewSupabase.db.scheduled_messages.find((row) => row.id === 'concurrent-new-old').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(
  concurrentNewSupabase.db.scheduled_messages.filter((row) => (
    row.id !== 'concurrent-new-old'
    && row.status === OPERATIONAL_STATUSES.PREVIEW
    && row.metadata?.reservation_schedule_fingerprint === buildReservationScheduleFingerprint({
      reservation: { ...concurrentNewReservation, arrival_date: '2026-08-14' },
      automationType: 'transfer'
    })
  )).length,
  1,
  'new-event race should create one logical replacement'
);

const concurrentFailedReservation = {
  ...apaleoWebhookReservation,
  id: 'reservation-concurrent-failed',
  pms_reservation_id: 'apaleo-concurrent-failed-reservation',
  reservation_access_token: 'STX-CONFAIL'
};
const concurrentFailedPayload = {
  ...apaleoWebhookPayload,
  id: 'apaleo-concurrent-failed-event',
  reservationId: 'apaleo-concurrent-failed-reservation'
};
const concurrentFailedSupabase = createMockSupabase({
  hotel_pms_connections: [apaleoConnection],
  reservations: [concurrentFailedReservation],
  scheduled_messages: [
    canonicalMessage({
      id: 'concurrent-failed-old',
      reservation: concurrentFailedReservation,
      fingerprintReservation: concurrentFailedReservation
    })
  ],
  pms_webhook_events: [
    {
      id: 'failed-retry-webhook-row',
      hotel_id: hotel.id,
      provider: 'apaleo',
      connection_id: apaleoConnection.id,
      external_event_id: 'apaleo-concurrent-failed-event',
      external_resource_id: 'apaleo-concurrent-failed-reservation',
      event_type: 'reservation.amended',
      event_action: 'amended',
      status: 'failed',
      payload: {},
      error: 'previous failure',
      processed_at: null
    }
  ]
});
const concurrentFailedFetch = createControlledReservationFetch({
  ...apaleoFetchedReservation,
  id: 'apaleo-concurrent-failed-reservation'
});
const concurrentFailedFirst = processApaleoWebhookEvent(concurrentFailedPayload, {}, {
  supabase: concurrentFailedSupabase,
  fetchReservationById: concurrentFailedFetch.fetch
});
const concurrentFailedSecond = processApaleoWebhookEvent(concurrentFailedPayload, {}, {
  supabase: concurrentFailedSupabase,
  fetchReservationById: concurrentFailedFetch.fetch
});
await concurrentFailedFetch.waitForCall();
const concurrentFailedDuplicate = await waitForPromise(Promise.race([
  concurrentFailedFirst.then((result) => ({ result })),
  concurrentFailedSecond.then((result) => ({ result }))
]), 'concurrent failed duplicate did not return while owner was processing');
assert.equal(concurrentFailedDuplicate.result.status, 'duplicate_processing');
assert.equal(concurrentFailedDuplicate.result.reason, 'already_processing');
assert.equal(concurrentFailedFetch.calls(), 1, 'concurrent failed retry should fetch reservation once');
concurrentFailedFetch.release();
const concurrentFailedResults = await Promise.all([concurrentFailedFirst, concurrentFailedSecond]);
assert.deepEqual(concurrentFailedResults.map((result) => result.status).sort(), ['duplicate_processing', 'processed']);
assert.equal(concurrentFailedSupabase.db.pms_webhook_events.find((row) => row.id === 'failed-retry-webhook-row').status, 'processed');
assert.equal(concurrentFailedSupabase.db.counters.pmsWebhookClaimsAcquired, 1, 'concurrent failed retry should have one owner');
assert.equal(concurrentFailedSupabase.db.counters.reservationUpsertCalls, 1, 'concurrent failed retry should mutate reservation once');
assert.equal(concurrentFailedSupabase.db.scheduled_messages.find((row) => row.id === 'concurrent-failed-old').status, OPERATIONAL_STATUSES.CANCELLED);

const activeProcessingPayload = {
  ...apaleoWebhookPayload,
  id: 'apaleo-active-processing-event',
  reservationId: 'apaleo-active-processing-reservation'
};
const activeProcessingSupabase = createMockSupabase({
  hotel_pms_connections: [apaleoConnection],
  reservations: [{
    ...apaleoWebhookReservation,
    id: 'reservation-active-processing',
    pms_reservation_id: 'apaleo-active-processing-reservation'
  }],
  scheduled_messages: [
    canonicalMessage({ id: 'active-processing-old' })
  ],
  pms_webhook_events: [
    {
      id: 'active-processing-webhook-row',
      hotel_id: hotel.id,
      provider: 'apaleo',
      connection_id: apaleoConnection.id,
      external_event_id: 'apaleo-active-processing-event',
      external_resource_id: 'apaleo-active-processing-reservation',
      event_type: 'reservation.amended',
      event_action: 'amended',
      status: 'processing',
      payload: {},
      error: null,
      processed_at: null
    }
  ]
});
const activeProcessingResult = await processApaleoWebhookEvent(activeProcessingPayload, {}, {
  supabase: activeProcessingSupabase,
  fetchReservationById: async () => {
    throw new Error('active processing duplicate should not fetch reservation');
  }
});
assert.equal(activeProcessingResult.status, 'duplicate_processing');
assert.equal(activeProcessingResult.reason, 'already_processing');
assert.equal(activeProcessingResult.duplicate, true);
assert.equal(activeProcessingSupabase.db.pms_webhook_events.find((row) => row.id === 'active-processing-webhook-row').status, 'processing');
assert.equal(activeProcessingSupabase.db.counters.pmsWebhookClaimAttempts, 1);
assert.equal(activeProcessingSupabase.db.counters.pmsWebhookClaimsAcquired || 0, 0);
assert.equal(activeProcessingSupabase.db.counters.reservationUpsertCalls || 0, 0);
assert.equal(activeProcessingSupabase.db.counters.automationRunInsertCalls || 0, 0);
assert.equal(activeProcessingSupabase.db.counters.scheduledMessageCancellationCalls || 0, 0);

const processedDuplicatePayload = {
  ...apaleoWebhookPayload,
  id: 'apaleo-processed-duplicate-event',
  reservationId: 'apaleo-processed-duplicate-reservation'
};
const processedDuplicateSupabase = createMockSupabase({
  hotel_pms_connections: [apaleoConnection],
  pms_webhook_events: [
    {
      id: 'processed-duplicate-webhook-row',
      hotel_id: hotel.id,
      provider: 'apaleo',
      connection_id: apaleoConnection.id,
      external_event_id: 'apaleo-processed-duplicate-event',
      external_resource_id: 'apaleo-processed-duplicate-reservation',
      event_type: 'reservation.amended',
      event_action: 'amended',
      status: 'processed',
      payload: {},
      error: null,
      processed_at: now.toISOString()
    }
  ]
});
const processedDuplicateResult = await processApaleoWebhookEvent(processedDuplicatePayload, {}, {
  supabase: processedDuplicateSupabase,
  fetchReservationById: async () => {
    throw new Error('processed duplicate should not fetch reservation');
  }
});
assert.equal(processedDuplicateResult.status, 'ignored');
assert.equal(processedDuplicateResult.reason, 'already_processed');
assert.equal(processedDuplicateResult.duplicate, true);
assert.equal(processedDuplicateSupabase.db.counters.pmsWebhookClaimAttempts || 0, 0);
assert.equal(processedDuplicateSupabase.db.counters.reservationUpsertCalls || 0, 0);

const ignoredDuplicatePayload = {
  ...apaleoWebhookPayload,
  id: 'apaleo-ignored-duplicate-event',
  reservationId: 'apaleo-ignored-duplicate-reservation'
};
const ignoredDuplicateSupabase = createMockSupabase({
  hotel_pms_connections: [apaleoConnection],
  pms_webhook_events: [
    {
      id: 'ignored-duplicate-webhook-row',
      hotel_id: hotel.id,
      provider: 'apaleo',
      connection_id: apaleoConnection.id,
      external_event_id: 'apaleo-ignored-duplicate-event',
      external_resource_id: 'apaleo-ignored-duplicate-reservation',
      event_type: 'reservation.unknown',
      event_action: null,
      status: 'ignored',
      payload: {},
      error: 'Unsupported or unknown Apaleo event action',
      processed_at: now.toISOString()
    }
  ]
});
const ignoredDuplicateResult = await processApaleoWebhookEvent(ignoredDuplicatePayload, {}, {
  supabase: ignoredDuplicateSupabase,
  fetchReservationById: async () => {
    throw new Error('ignored duplicate should not fetch reservation');
  }
});
assert.equal(ignoredDuplicateResult.status, 'ignored');
assert.equal(ignoredDuplicateResult.reason, 'already_ignored');
assert.equal(ignoredDuplicateResult.duplicate, true);
assert.equal(ignoredDuplicateSupabase.db.counters.pmsWebhookClaimAttempts || 0, 0);
assert.equal(ignoredDuplicateSupabase.db.counters.reservationUpsertCalls || 0, 0);

const atomicClaimPayload = {
  ...apaleoWebhookPayload,
  id: 'apaleo-atomic-claim-event',
  reservationId: 'apaleo-atomic-claim-reservation'
};
const atomicClaimParsed = parseApaleoWebhookEvent(atomicClaimPayload, {});
const atomicClaimSupabase = createMockSupabase({
  pms_webhook_events: [
    {
      id: 'atomic-claim-webhook-row',
      hotel_id: hotel.id,
      provider: 'apaleo',
      connection_id: apaleoConnection.id,
      external_event_id: 'apaleo-atomic-claim-event',
      external_resource_id: 'apaleo-atomic-claim-reservation',
      event_type: 'reservation.amended',
      event_action: 'amended',
      status: 'failed',
      payload: {},
      error: 'previous failure',
      processed_at: null
    }
  ]
});
const observedAtomicEvent = structuredClone(atomicClaimSupabase.db.pms_webhook_events[0]);
const atomicClaims = await Promise.all([
  claimWebhookEventForProcessing({
    event: observedAtomicEvent,
    parsed: atomicClaimParsed,
    connection: apaleoConnection,
    supabase: atomicClaimSupabase
  }),
  claimWebhookEventForProcessing({
    event: observedAtomicEvent,
    parsed: atomicClaimParsed,
    connection: apaleoConnection,
    supabase: atomicClaimSupabase
  })
]);
assert.equal(atomicClaims.filter((claim) => claim.claimed).length, 1, 'conditional update should yield one claim owner');
assert.equal(atomicClaims.filter((claim) => !claim.claimed && claim.reason === 'already_processing').length, 1);
assert.equal(atomicClaimSupabase.db.counters.pmsWebhookClaimAttempts, 2);
assert.equal(atomicClaimSupabase.db.counters.pmsWebhookClaimsAcquired, 1);
assert.equal(atomicClaimSupabase.db.pms_webhook_events[0].status, 'processing');

const webhookFailBeforeSupabase = createMockSupabase({
  failScheduledInsertOnce: true,
  hotel_pms_connections: [apaleoConnection],
  reservations: [{ ...apaleoWebhookReservation, id: 'reservation-webhook-fail-before' }],
  scheduled_messages: [
    canonicalMessage({
      id: 'webhook-fail-before-old',
      reservation: { ...apaleoWebhookReservation, id: 'reservation-webhook-fail-before' },
      fingerprintReservation: { ...apaleoWebhookReservation, id: 'reservation-webhook-fail-before' }
    })
  ]
});
const webhookFailBeforePayload = {
  ...apaleoWebhookPayload,
  id: 'apaleo-webhook-fail-before-event'
};
const webhookFailBeforeFirst = await processApaleoWebhookEvent(webhookFailBeforePayload, {}, {
  supabase: webhookFailBeforeSupabase,
  fetchReservationById: fetchApaleoReservation
});
assert.equal(webhookFailBeforeFirst.status, 'failed');
assert.equal(webhookFailBeforeSupabase.db.pms_webhook_events.find((row) => row.external_event_id === 'apaleo-webhook-fail-before-event').status, 'failed');
assert.equal(webhookFailBeforeSupabase.db.pms_webhook_events.find((row) => row.external_event_id === 'apaleo-webhook-fail-before-event').processed_at, null);
assert.equal(webhookFailBeforeSupabase.db.scheduled_messages.find((row) => row.id === 'webhook-fail-before-old').status, OPERATIONAL_STATUSES.PREVIEW);
const webhookFailBeforeRetry = await processApaleoWebhookEvent(webhookFailBeforePayload, {}, {
  supabase: webhookFailBeforeSupabase,
  fetchReservationById: fetchApaleoReservation
});
assert.equal(webhookFailBeforeRetry.status, 'processed');
assert.equal(webhookFailBeforeSupabase.db.scheduled_messages.find((row) => row.id === 'webhook-fail-before-old').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(webhookFailBeforeSupabase.db.counters.pmsWebhookClaimsAcquired, 2, 'failed webhook event should be claimable on later retry');

const webhookFailAfterSupabase = createMockSupabase({
  failCancelUpdateOnce: true,
  hotel_pms_connections: [apaleoConnection],
  reservations: [{ ...apaleoWebhookReservation, id: 'reservation-webhook-fail-after' }],
  scheduled_messages: [
    canonicalMessage({
      id: 'webhook-fail-after-old',
      reservation: { ...apaleoWebhookReservation, id: 'reservation-webhook-fail-after' },
      fingerprintReservation: { ...apaleoWebhookReservation, id: 'reservation-webhook-fail-after' }
    })
  ]
});
const webhookFailAfterPayload = {
  ...apaleoWebhookPayload,
  id: 'apaleo-webhook-fail-after-event'
};
const webhookFailAfterFirst = await processApaleoWebhookEvent(webhookFailAfterPayload, {}, {
  supabase: webhookFailAfterSupabase,
  fetchReservationById: fetchApaleoReservation
});
assert.equal(webhookFailAfterFirst.status, 'failed');
assert.equal(webhookFailAfterSupabase.db.scheduled_messages.find((row) => row.id === 'webhook-fail-after-old').status, OPERATIONAL_STATUSES.PREVIEW);
assert.equal(webhookFailAfterSupabase.db.scheduled_messages.filter((row) => row.id !== 'webhook-fail-after-old').length, 1);
const webhookFailAfterRetry = await processApaleoWebhookEvent(webhookFailAfterPayload, {}, {
  supabase: webhookFailAfterSupabase,
  fetchReservationById: fetchApaleoReservation
});
assert.equal(webhookFailAfterRetry.status, 'processed');
assert.equal(webhookFailAfterSupabase.db.scheduled_messages.find((row) => row.id === 'webhook-fail-after-old').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(webhookFailAfterSupabase.db.counters.pmsWebhookClaimsAcquired, 2, 'failed partial webhook event should be claimable on later retry');
assert.equal(
  webhookFailAfterSupabase.db.scheduled_messages.filter((row) => row.status === OPERATIONAL_STATUSES.PREVIEW).length,
  1,
  'webhook retry after partial replacement should not duplicate current preview'
);
const webhookFailAfterRunsForOld = webhookFailAfterSupabase.db.automation_runs.filter((run) => (
  run.metadata?.reconciliation?.superseded_message_id === 'webhook-fail-after-old'
));
assert.equal(
  webhookFailAfterRunsForOld.filter((run) => run.status === OPERATIONAL_STATUSES.PREVIEW).length,
  1,
  'webhook retry should not create duplicate replacement audit runs'
);
assert.equal(
  webhookFailAfterRunsForOld.filter((run) => run.status === OPERATIONAL_STATUSES.CANCELLED).length,
  1,
  'webhook retry should create exactly one stale cancellation audit run'
);

const extensionReservation = { ...baseReservation, status: 'checked_out', departure_date: '2026-08-17' };
const earlyDepartureReservation = { ...baseReservation, status: 'checked_out', departure_date: '2026-08-14' };
assert.equal(evaluateMessageScheduleStaleness({
  message: canonicalMessage({ id: 'extension-old', automationType: 'post_checkout', fingerprintReservation: baseReservation }),
  reservation: extensionReservation
}).stale, true, 'departure extension should stale departure-dependent messages');
assert.equal(evaluateMessageScheduleStaleness({
  message: canonicalMessage({ id: 'early-old', automationType: 'post_checkout', fingerprintReservation: baseReservation }),
  reservation: earlyDepartureReservation
}).stale, true, 'early departure should stale departure-dependent messages');

const terminalDateReservation = { ...currentArrivalReservation, status: 'cancelled' };
const terminalSupabase = createMockSupabase({
  reservations: [terminalDateReservation],
  scheduled_messages: [canonicalMessage({ id: 'terminal-old', fingerprintReservation: baseReservation })]
});
const terminalResult = await reconcile(terminalSupabase, baseReservation, terminalDateReservation);
assert.equal(terminalResult.action, 'cancel_pending');
assert.equal(terminalSupabase.db.scheduled_messages.filter((row) => row.id !== 'terminal-old').length, 0, 'terminal date change must not create replacements');

const isolationSupabase = createMockSupabase({
  reservations: [currentArrivalReservation],
  scheduled_messages: [
    canonicalMessage({ id: 'target-old', fingerprintReservation: baseReservation }),
    canonicalMessage({ id: 'other-hotel', hotelId: 'hotel-other', fingerprintReservation: baseReservation }),
    canonicalMessage({ id: 'other-reservation', reservationId: 'reservation-other', fingerprintReservation: baseReservation }),
    {
      id: 'legacy-row',
      hotel_id: hotel.id,
      reservation_id: baseReservation.id,
      automation_type: 'manual_followup',
      status: OPERATIONAL_STATUSES.PREVIEW,
      scheduled_for: '2026-08-12T09:00:00.000Z',
      metadata: { manually_created: true }
    }
  ]
});
const isolationResult = await reconcile(isolationSupabase, baseReservation, currentArrivalReservation);
assert.equal(isolationSupabase.db.scheduled_messages.find((row) => row.id === 'target-old').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(isolationSupabase.db.scheduled_messages.find((row) => row.id === 'other-hotel').status, OPERATIONAL_STATUSES.PREVIEW);
assert.equal(isolationSupabase.db.scheduled_messages.find((row) => row.id === 'other-reservation').status, OPERATIONAL_STATUSES.PREVIEW);
assert.equal(isolationSupabase.db.scheduled_messages.find((row) => row.id === 'legacy-row').status, OPERATIONAL_STATUSES.PREVIEW);
assert.equal(isolationResult.legacyRowsIgnored, 1);
const noHotelResult = await reconcileReservationAutomationLifecycle({
  previousReservation: { ...baseReservation, hotel_id: null },
  currentReservation: { ...currentArrivalReservation, hotel_id: null },
  source: 'phase2a2_test',
  supabase: isolationSupabase
});
assert.equal(noHotelResult.reason, 'reservation_identity_missing', 'missing hotel must not fall back');

const matchingLiveMessage = liveCanonicalMessage({
  id: 'matching-live',
  reservation: baseReservation,
  fingerprintReservation: baseReservation
});
const staleLiveMessage = liveCanonicalMessage({
  id: 'stale-live',
  reservation: currentArrivalReservation,
  fingerprintReservation: baseReservation
});
const missingFingerprintMessage = {
  ...liveCanonicalMessage({
    id: 'missing-fingerprint',
    reservation: baseReservation,
    fingerprintReservation: baseReservation
  }),
  metadata: {
    ...liveCanonicalMessage({
      id: 'missing-fingerprint-base',
      reservation: baseReservation,
      fingerprintReservation: baseReservation
    }).metadata,
    reservation_schedule_fingerprint: null
  }
};
assert.equal(getReservationScheduleSendTimeGate({
  scheduledMessage: matchingLiveMessage,
  reservation: baseReservation
}).allowed, true, 'matching fingerprint should pass schedule gate');
assert.equal(getReservationScheduleSendTimeGate({
  scheduledMessage: staleLiveMessage,
  reservation: currentArrivalReservation
}).reason, 'reservation_schedule_stale');
assert.equal(getReservationScheduleSendTimeGate({
  scheduledMessage: missingFingerprintMessage,
  reservation: baseReservation
}).reason, 'reservation_schedule_unverifiable');
assert.equal(getReservationScheduleSendTimeGate({
  scheduledMessage: matchingLiveMessage,
  reservation: { ...baseReservation, arrival_date: '2026-08-13abc' }
}).reason, 'reservation_schedule_unverifiable');

const processSupabase = createMockSupabase({
  hotels: [hotel],
  reservations: [baseReservation],
  scheduled_messages: [matchingLiveMessage]
});
process.env.SEND_AUTOMATIONS = 'true';
const matchingProcess = await processScheduledMessage(processSupabase.db.scheduled_messages[0], { supabase: processSupabase });
assert.equal(matchingProcess.error_message, 'Missing send_to', 'matching schedule should proceed to next gate');

const staleProcessSupabase = createMockSupabase({
  hotels: [hotel],
  reservations: [currentArrivalReservation],
  scheduled_messages: [staleLiveMessage]
});
const staleProcess = await processScheduledMessage(staleProcessSupabase.db.scheduled_messages[0], { supabase: staleProcessSupabase });
assert.equal(staleProcess.error_message, 'reservation_schedule_stale');
assert.equal(staleProcess.sent_at || null, null);

const missingProcessSupabase = createMockSupabase({
  hotels: [hotel],
  reservations: [baseReservation],
  scheduled_messages: [missingFingerprintMessage]
});
const missingProcess = await processScheduledMessage(missingProcessSupabase.db.scheduled_messages[0], { supabase: missingProcessSupabase });
assert.equal(missingProcess.error_message, 'reservation_schedule_unverifiable');

const invalidDateProcessSupabase = createMockSupabase({
  hotels: [hotel],
  reservations: [{ ...baseReservation, arrival_date: '2026-08-13abc' }],
  scheduled_messages: [matchingLiveMessage]
});
const invalidDateProcess = await processScheduledMessage(invalidDateProcessSupabase.db.scheduled_messages[0], { supabase: invalidDateProcessSupabase });
assert.equal(invalidDateProcess.error_message, 'reservation_schedule_unverifiable');

const lookupErrorSupabase = createMockSupabase({
  hotels: [hotel],
  reservations: [baseReservation],
  scheduled_messages: [matchingLiveMessage],
  maybeSingleErrors: {
    reservations: { message: 'reservation lookup failed' }
  }
});
const lookupErrorProcess = await processScheduledMessage(lookupErrorSupabase.db.scheduled_messages[0], { supabase: lookupErrorSupabase });
assert.equal(lookupErrorProcess.error_message, 'reservation_lookup_failed');

const ambiguousSupabase = createMockSupabase({
  hotels: [hotel],
  reservations: [baseReservation, { ...baseReservation }],
  scheduled_messages: [matchingLiveMessage],
  ambiguousMaybeSingleTables: ['reservations']
});
const ambiguousProcess = await processScheduledMessage(ambiguousSupabase.db.scheduled_messages[0], { supabase: ambiguousSupabase });
assert.equal(ambiguousProcess.error_message, 'reservation_lookup_failed');

const terminalProcessSupabase = createMockSupabase({
  hotels: [hotel],
  reservations: [{ ...baseReservation, status: 'cancelled' }],
  scheduled_messages: [matchingLiveMessage]
});
const terminalProcess = await processScheduledMessage(terminalProcessSupabase.db.scheduled_messages[0], { supabase: terminalProcessSupabase });
assert.equal(terminalProcess.error_message, 'reservation_cancelled');
assert.notEqual(staleProcess.status, OPERATIONAL_STATUSES.SENT, 'blocked stale should never be sent');
process.env.SEND_AUTOMATIONS = 'false';

assert.match(staleStatusResult.reconciliationEventId, /^[0-9a-f]{24}$/);
assert.deepEqual(staleStatusResult.changedFields, ['arrival_date']);
assert.equal(staleStatusResult.sourceEventId, 'phase2a2-event');
assert.doesNotMatch(
  JSON.stringify({
    result: staleStatusResult,
    runs: staleStatusSupabase.db.automation_runs.map((run) => run.metadata)
  }),
  /Private Guest|private@example\.test|\+34911111111|Existing preview/,
  'audit/result must not expose PII or message body'
);
assert.equal(staleStatusResult.staleRows, 3);
assert.equal(staleStatusResult.replacementsDesired, 3);
assert.equal(staleStatusResult.rowsCancelled, 3);

assert.equal(process.env.SEND_AUTOMATIONS, 'false');
const serverSource = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const integrationsRouteSource = readFileSync(new URL('../src/routes/integrations.routes.js', import.meta.url), 'utf8');
assert.doesNotMatch(serverSource, /scheduler\.service|processDueScheduledMessages|runAutomationScheduler/, 'No worker or cron should be registered');
assert.match(integrationsRouteSource, /result\.ok === false \? 500 : 200/, 'Apaleo webhook failures should return a retryable HTTP status');
assert.doesNotMatch(writerSource, /Twilio|OpenAI|Apaleo|Ubikos/, 'Phase 2A2 reconciler should not contact providers');
assert.doesNotMatch(writerSource, /timezone|time_zone/i, 'Phase 2B timezone handling must not be implemented in Phase 2A2');

const decision = evaluateAutomationDecision({
  hotel,
  reservation: baseReservation,
  automationType: 'transfer',
  executionMode: EXECUTION_MODES.PREVIEW,
  now,
  metadata: { source: 'phase2a2_writer_test', intent: 'transfer' }
});
const writerSupabase = createMockSupabase();
const writerResult = await writeAutomationDecisionToQueue({
  supabase: writerSupabase,
  decision,
  messagePreview: 'Writer preview',
  source: 'phase2a2_writer_test',
  creationReason: decision.triggerReason
});
assert.equal(writerResult.scheduledMessage.metadata.reservation_schedule_fingerprint, decision.reservationScheduleFingerprint);
assert.deepEqual(writerResult.scheduledMessage.metadata.reservation_date_dependencies, ['arrival_date']);
assert.equal(isCanonicalAutomationScheduledMessage(writerResult.scheduledMessage), true);

console.log(JSON.stringify({
  ok: true,
  staleRows: staleStatusResult.staleRows,
  replacementsCreated: staleStatusResult.replacementsCreated,
  retryRowsCancelled: retryStatusResult.rowsCancelled,
  sendAutomations: process.env.SEND_AUTOMATIONS
}, null, 2));
