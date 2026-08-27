import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  markLocalReservationStatus,
  parseApaleoWebhookEvent,
  processApaleoWebhookEvent
} from '../src/integrations/apaleo/apaleo-webhooks.service.js';
import {
  PmsReservationTenantCollisionError,
  createOrUpdateReservation
} from '../src/services/reservation.service.js';
import { syncReservationsFromApaleo } from '../src/integrations/apaleo/apaleo-sync.service.js';

process.env.SEND_AUTOMATIONS = 'false';
process.env.USE_MOCK_AI = 'true';

const now = new Date('2026-08-27T10:00:00.000Z');
const hotelId = 'hotel-b2';
const otherHotelId = 'hotel-other-b2';
const connectionId = '11111111-1111-4111-8111-111111111111';
const otherConnectionId = '22222222-2222-4222-8222-222222222222';
const validationOk = {
  ok: true,
  safeFlags: {
    validation_configured: true,
    validation_result: 'valid'
  }
};

const uniqueViolation = (constraint) => ({
  code: '23505',
  message: `duplicate key value violates unique constraint "${constraint}"`
});

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.insertRows = [];
    this.updateValues = null;
    this.upsertOptions = {};
    this.limitCount = null;
    this.orderBy = null;
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
    this.upsertOptions = options;
    return this;
  }

  update(values) {
    this.operation = 'update';
    this.updateValues = values;
    return this;
  }

  delete() {
    this.operation = 'delete';
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
      if (this.table === 'pms_webhook_events') {
        const conflict = this.insertRows.find((row) => (
          row.provider
          && row.external_event_id
          && this.db.pms_webhook_events.some((current) => (
            current.provider === row.provider
            && current.external_event_id === row.external_event_id
          ))
        ));

        if (conflict) {
          this.db.counters.pmsWebhookUniqueConflicts += 1;
          return {
            data: null,
            error: uniqueViolation('pms_webhook_events_provider_external_event_unique_idx')
          };
        }
      }

      if (this.table === 'reservations') {
        this.db.counters.reservationInsertCalls += this.insertRows.length;
        const conflict = this.insertRows.find((row) => (
          row.pms_provider
          && row.pms_reservation_id
          && this.db.reservations.some((current) => (
            current.pms_provider === row.pms_provider
            && current.pms_reservation_id === row.pms_reservation_id
          ))
        ));

        if (conflict) {
          return {
            data: null,
            error: uniqueViolation('reservations_pms_unique')
          };
        }
      }

      if (this.table === 'pms_webhook_quarantine') {
        this.db.counters.quarantineInsertCalls += this.insertRows.length;

        if (this.db.failQuarantineInserts) {
          return {
            data: null,
            error: {
              code: '42501',
              message: 'synthetic quarantine insert failure with token=private'
            }
          };
        }
      }

      const inserted = this.insertRows.map((row) => {
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

    if (this.operation === 'upsert') {
      if (this.table === 'reservations') {
        this.db.counters.reservationUpsertCalls += this.insertRows.length;
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

    let rows = this.db[this.table].filter((row) => this.filters.every((filter) => filter(row)));

    if (this.operation === 'delete') {
      this.db.counters.deleteCalls += rows.length;
      this.db[this.table] = this.db[this.table].filter((row) => !this.filters.every((filter) => filter(row)));
      return { data: rows, error: null };
    }

    if (this.operation === 'update') {
      if (this.table === 'reservations') {
        this.db.counters.reservationUpdateCalls += rows.length;
      }

      if (this.table === 'pms_webhook_events' && this.updateValues?.status === 'processing') {
        this.db.counters.webhookClaimAttempts += 1;
        this.db.counters.webhookClaimsAcquired += rows.length > 0 ? 1 : 0;
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
    hotels: [
      { id: hotelId, name: 'Hotel B2', whatsapp_number: null },
      { id: otherHotelId, name: 'Other Hotel', whatsapp_number: null }
    ],
    hotel_pms_connections: [],
    pms_webhook_events: [],
    pms_webhook_quarantine: [],
    reservations: [],
    guests: [],
    guest_stay_context: [],
    room_status_snapshots: [],
    pms_operational_events: [],
    automation_events: [],
    scheduled_messages: [],
    automation_runs: [],
    counters: {
      deleteCalls: 0,
      pmsWebhookUniqueConflicts: 0,
      quarantineInsertCalls: 0,
      reservationInsertCalls: 0,
      reservationUpdateCalls: 0,
      reservationUpsertCalls: 0,
      webhookClaimAttempts: 0,
      webhookClaimsAcquired: 0
    },
    ...structuredClone(initial)
  };

  return {
    db,
    from(table) {
      return new QueryBuilder(db, table);
    }
  };
};

const apaleoConnection = (overrides = {}) => ({
  id: connectionId,
  hotel_id: hotelId,
  provider: 'apaleo',
  account_code: 'acct-b2',
  enabled: true,
  client_id: 'client-b2',
  encrypted_client_secret: null,
  base_url: 'https://api.apaleo.example',
  metadata: {},
  updated_at: now.toISOString(),
  ...overrides
});

const webhookPayload = (id, reservationId = 'reservation-b2') => ({
  id,
  type: 'reservation.amended',
  reservationId,
  accountCode: 'acct-b2',
  createdAt: now.toISOString(),
  rawPayload: {
    guestEmail: 'private@example.test'
  }
});

const fetchedReservation = (id = 'reservation-b2') => ({
  id,
  status: 'confirmed',
  arrival: '2026-09-01',
  departure: '2026-09-03',
  primaryGuest: {
    name: 'Private Guest'
  }
});

const assertNoCanonicalMutation = (supabase) => {
  assert.equal(supabase.db.pms_webhook_events.length, 0);
  assert.equal(supabase.db.counters.reservationInsertCalls, 0);
  assert.equal(supabase.db.counters.reservationUpdateCalls, 0);
  assert.equal(supabase.db.counters.reservationUpsertCalls, 0);
};

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

let checks = 0;
const check = (name, fn) => {
  checks += 1;
  return fn();
};

await check('validation not configured quarantines before canonical event', async () => {
  let fetchCalls = 0;
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-no-validation'), {}, {
    supabase,
    fetchReservationById: async () => {
      fetchCalls += 1;
      return fetchedReservation();
    }
  });

  assert.equal(result.status, 'quarantined');
  assert.equal(result.reason, 'VALIDATION_NOT_CONFIGURED');
  assert.equal(supabase.db.pms_webhook_quarantine[0].reason_code, 'VALIDATION_NOT_CONFIGURED');
  assert.equal(fetchCalls, 0);
  assertNoCanonicalMutation(supabase);
});

await check('missing signature quarantines before canonical event', async () => {
  let fetchCalls = 0;
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-missing-signature'), {}, {
    supabase,
    validateWebhookRequest: async () => ({
      ok: false,
      reasonCode: 'MISSING_SIGNATURE'
    }),
    fetchReservationById: async () => {
      fetchCalls += 1;
      return fetchedReservation();
    }
  });

  assert.equal(result.status, 'quarantined');
  assert.equal(result.reason, 'MISSING_SIGNATURE');
  assert.equal(supabase.db.pms_webhook_quarantine[0].reason_code, 'MISSING_SIGNATURE');
  assert.equal(fetchCalls, 0);
  assertNoCanonicalMutation(supabase);
});

await check('invalid signature quarantines before canonical event', async () => {
  let fetchCalls = 0;
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-invalid-signature'), {}, {
    supabase,
    validateWebhookRequest: async () => ({
      ok: false,
      reasonCode: 'INVALID_SIGNATURE'
    }),
    fetchReservationById: async () => {
      fetchCalls += 1;
      return fetchedReservation();
    }
  });

  assert.equal(result.status, 'quarantined');
  assert.equal(result.reason, 'INVALID_SIGNATURE');
  assert.equal(supabase.db.pms_webhook_quarantine[0].reason_code, 'INVALID_SIGNATURE');
  assert.equal(fetchCalls, 0);
  assertNoCanonicalMutation(supabase);
});

await check('malformed payload quarantines before canonical event', async () => {
  let fetchCalls = 0;
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()]
  });
  const result = await processApaleoWebhookEvent('not-an-object', {}, {
    supabase,
    fetchReservationById: async () => {
      fetchCalls += 1;
      return fetchedReservation();
    }
  });

  assert.equal(result.status, 'quarantined');
  assert.equal(result.reason, 'VALIDATION_NOT_CONFIGURED');
  assert.equal(fetchCalls, 0);
  assertNoCanonicalMutation(supabase);
});

await check('quarantine insert failure remains fail closed', async () => {
  let fetchCalls = 0;
  const supabase = createMockSupabase({
    failQuarantineInserts: true,
    hotel_pms_connections: [apaleoConnection()]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-quarantine-failure'), {}, {
    supabase,
    fetchReservationById: async () => {
      fetchCalls += 1;
      return fetchedReservation();
    }
  });

  assert.equal(result.status, 'quarantine_failed');
  assert.equal(result.reason, 'VALIDATION_NOT_CONFIGURED');
  assert.equal(result.error, 'runtime_error');
  assert.equal(supabase.db.pms_webhook_quarantine.length, 0);
  assert.equal(supabase.db.counters.quarantineInsertCalls, 1);
  assert.equal(fetchCalls, 0);
  assertNoCanonicalMutation(supabase);
});

await check('missing event id quarantines without hash fallback', async () => {
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()]
  });
  const payload = webhookPayload(null);
  delete payload.id;
  const parsed = parseApaleoWebhookEvent(payload, {});
  assert.equal(parsed.externalEventId, null);

  const result = await processApaleoWebhookEvent(payload, {}, {
    supabase,
    validationResult: validationOk
  });

  assert.equal(result.reason, 'MISSING_EVENT_ID');
  assertNoCanonicalMutation(supabase);
});

await check('unknown connection quarantines after validation', async () => {
  const supabase = createMockSupabase();
  const result = await processApaleoWebhookEvent(webhookPayload('evt-unknown'), {}, {
    supabase,
    validationResult: validationOk
  });

  assert.equal(result.reason, 'UNKNOWN_CONNECTION');
  assertNoCanonicalMutation(supabase);
});

await check('ambiguous connection quarantines after validation', async () => {
  const supabase = createMockSupabase({
    hotel_pms_connections: [
      apaleoConnection(),
      apaleoConnection({ id: otherConnectionId, hotel_id: otherHotelId })
    ]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-ambiguous'), {}, {
    supabase,
    validationResult: validationOk
  });

  assert.equal(result.reason, 'AMBIGUOUS_CONNECTION');
  assertNoCanonicalMutation(supabase);
});

await check('disabled connection quarantines after validation', async () => {
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection({ enabled: false })]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-disabled'), {}, {
    supabase,
    validationResult: validationOk
  });

  assert.equal(result.reason, 'CONNECTION_DISABLED');
  assertNoCanonicalMutation(supabase);
});

await check('unsupported valid event creates scoped canonical row without raw payload', async () => {
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()]
  });
  const payload = {
    ...webhookPayload('evt-ignored'),
    type: 'reservation.unmapped'
  };
  const result = await processApaleoWebhookEvent(payload, {}, {
    supabase,
    validationResult: validationOk
  });
  const storedEvent = supabase.db.pms_webhook_events[0];

  assert.equal(result.status, 'ignored');
  assert.equal(storedEvent.hotel_id, hotelId);
  assert.equal(storedEvent.connection_id, connectionId);
  assert.equal(storedEvent.external_event_id, 'evt-ignored');
  assert.doesNotMatch(JSON.stringify(storedEvent.payload), /private@example\.test|rawPayload|guestEmail/);
});

await check('processed scoped duplicate does not fetch or mutate', async () => {
  let fetchCalls = 0;
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()],
    pms_webhook_events: [{
      id: 'event-processed',
      hotel_id: hotelId,
      provider: 'apaleo',
      connection_id: connectionId,
      external_event_id: 'evt-processed',
      status: 'processed',
      payload: {},
      processed_at: now.toISOString()
    }]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-processed'), {}, {
    supabase,
    validationResult: validationOk,
    fetchReservationById: async () => {
      fetchCalls += 1;
      return fetchedReservation();
    }
  });

  assert.equal(result.status, 'ignored');
  assert.equal(result.duplicate, true);
  assert.equal(fetchCalls, 0);
  assert.equal(supabase.db.counters.webhookClaimAttempts, 0);
});

await check('legacy null event identity collision quarantines before claim', async () => {
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()],
    pms_webhook_events: [{
      id: 'legacy-event',
      hotel_id: null,
      provider: 'apaleo',
      connection_id: null,
      external_event_id: 'evt-legacy-null',
      status: 'received',
      payload: {}
    }]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-legacy-null'), {}, {
    supabase,
    validationResult: validationOk
  });

  assert.equal(result.reason, 'LEGACY_GLOBAL_EVENT_COLLISION');
  assert.equal(supabase.db.pms_webhook_events.length, 1);
  assert.equal(supabase.db.counters.webhookClaimAttempts, 0);
});

await check('other tenant event identity collision quarantines before claim', async () => {
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()],
    pms_webhook_events: [{
      id: 'other-tenant-event',
      hotel_id: otherHotelId,
      provider: 'apaleo',
      connection_id: otherConnectionId,
      external_event_id: 'evt-other-tenant',
      status: 'received',
      payload: {}
    }]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-other-tenant'), {}, {
    supabase,
    validationResult: validationOk
  });

  assert.equal(result.reason, 'LEGACY_GLOBAL_EVENT_COLLISION');
  assert.equal(supabase.db.pms_webhook_events.length, 1);
  assert.equal(supabase.db.counters.webhookClaimAttempts, 0);
});

await check('reservation global collision quarantines before event insert', async () => {
  let fetchCalls = 0;
  const supabase = createMockSupabase({
    hotel_pms_connections: [apaleoConnection()],
    reservations: [{
      id: 'reservation-other-tenant',
      hotel_id: otherHotelId,
      pms_provider: 'apaleo',
      pms_reservation_id: 'reservation-collision',
      status: 'confirmed'
    }]
  });
  const result = await processApaleoWebhookEvent(webhookPayload('evt-reservation-collision', 'reservation-collision'), {}, {
    supabase,
    validationResult: validationOk,
    fetchReservationById: async () => {
      fetchCalls += 1;
      return fetchedReservation('reservation-collision');
    }
  });

  assert.equal(result.reason, 'LEGACY_GLOBAL_RESERVATION_COLLISION');
  assert.equal(fetchCalls, 0);
  assertNoCanonicalMutation(supabase);
});

await check('markLocalReservationStatus requires hotel id', async () => {
  await assert.rejects(
    () => markLocalReservationStatus({
      reservationId: 'reservation-status',
      status: 'cancelled',
      supabase: createMockSupabase()
    }),
    { reasonCode: 'TENANT_MISMATCH' }
  );
});

await check('markLocalReservationStatus updates only the scoped hotel row', async () => {
  const supabase = createMockSupabase({
    reservations: [
      {
        id: 'reservation-status-target',
        hotel_id: hotelId,
        pms_provider: 'apaleo',
        pms_reservation_id: 'reservation-status',
        status: 'confirmed'
      },
      {
        id: 'reservation-status-other',
        hotel_id: otherHotelId,
        pms_provider: 'apaleo',
        pms_reservation_id: 'reservation-status',
        status: 'confirmed'
      }
    ]
  });
  const updated = await markLocalReservationStatus({
    reservationId: 'reservation-status',
    status: 'cancelled',
    hotelId,
    supabase
  });

  assert.equal(updated.id, 'reservation-status-target');
  assert.equal(supabase.db.reservations.find((row) => row.id === 'reservation-status-target').status, 'cancelled');
  assert.equal(supabase.db.reservations.find((row) => row.id === 'reservation-status-other').status, 'confirmed');
});

await check('tenant-scoped reservation mutation rejects missing hotel id', async () => {
  await assert.rejects(
    () => createOrUpdateReservation({
      pms_provider: 'apaleo',
      pms_reservation_id: 'reservation-no-hotel',
      guest_name: 'Private Guest'
    }, {
      tenantScopedPmsIdentity: true,
      requireExplicitHotelId: true,
      supabase: createMockSupabase()
    }),
    { name: 'PmsReservationHotelContextRequiredError' }
  );
});

await check('tenant-scoped reservation update avoids global upsert', async () => {
  const supabase = createMockSupabase({
    reservations: [{
      id: 'reservation-existing',
      hotel_id: hotelId,
      pms_provider: 'apaleo',
      pms_reservation_id: 'reservation-existing',
      guest_name: 'Private Guest',
      status: 'confirmed',
      reservation_access_token: 'STX-B2EXIST'
    }]
  });
  const { reservation } = await createOrUpdateReservation({
    hotel_id: hotelId,
    pms_provider: 'apaleo',
    pms_reservation_id: 'reservation-existing',
    guest_name: 'Private Guest',
    status: 'cancelled'
  }, {
    tenantScopedPmsIdentity: true,
    requireExplicitHotelId: true,
    supabase
  });

  assert.equal(reservation.id, 'reservation-existing');
  assert.equal(reservation.status, 'cancelled');
  assert.equal(supabase.db.counters.reservationUpdateCalls, 1);
  assert.equal(supabase.db.counters.reservationUpsertCalls, 0);
});

await check('tenant-scoped reservation insert avoids global upsert', async () => {
  const supabase = createMockSupabase();
  const { reservation } = await createOrUpdateReservation({
    hotel_id: hotelId,
    pms_provider: 'apaleo',
    pms_reservation_id: 'reservation-new',
    guest_name: 'Private Guest',
    status: 'confirmed'
  }, {
    tenantScopedPmsIdentity: true,
    requireExplicitHotelId: true,
    supabase
  });

  assert.equal(reservation.hotel_id, hotelId);
  assert.equal(reservation.pms_reservation_id, 'reservation-new');
  assert.equal(supabase.db.counters.reservationInsertCalls, 1);
  assert.equal(supabase.db.counters.reservationUpsertCalls, 0);
});

await check('tenant-scoped same-hotel reservation insert race recovers without global upsert', async () => {
  const supabase = createMockSupabase();
  const reservationPayload = {
    hotel_id: hotelId,
    pms_provider: 'apaleo',
    pms_reservation_id: 'reservation-race',
    guest_name: 'Private Guest',
    status: 'confirmed'
  };
  const [firstResult, secondResult] = await Promise.all([
    createOrUpdateReservation(reservationPayload, {
      tenantScopedPmsIdentity: true,
      requireExplicitHotelId: true,
      supabase
    }),
    createOrUpdateReservation({
      ...reservationPayload,
      status: 'amended'
    }, {
      tenantScopedPmsIdentity: true,
      requireExplicitHotelId: true,
      supabase
    })
  ]);
  const storedRows = supabase.db.reservations.filter((row) => (
    row.hotel_id === hotelId
    && row.pms_provider === 'apaleo'
    && row.pms_reservation_id === 'reservation-race'
  ));

  assert.equal(storedRows.length, 1);
  assert.equal(firstResult.reservation.id, secondResult.reservation.id);
  assert.equal(supabase.db.counters.reservationInsertCalls, 2);
  assert.equal(supabase.db.counters.reservationUpdateCalls, 1);
  assert.equal(supabase.db.counters.reservationUpsertCalls, 0);
});

await check('tenant-scoped reservation rejects other hotel global identity', async () => {
  const supabase = createMockSupabase({
    reservations: [{
      id: 'reservation-other',
      hotel_id: otherHotelId,
      pms_provider: 'apaleo',
      pms_reservation_id: 'reservation-shared',
      status: 'confirmed'
    }]
  });

  await assert.rejects(
    () => createOrUpdateReservation({
      hotel_id: hotelId,
      pms_provider: 'apaleo',
      pms_reservation_id: 'reservation-shared',
      guest_name: 'Private Guest'
    }, {
      tenantScopedPmsIdentity: true,
      requireExplicitHotelId: true,
      supabase
    }),
    PmsReservationTenantCollisionError
  );
  assert.equal(supabase.db.counters.reservationInsertCalls, 0);
  assert.equal(supabase.db.counters.reservationUpsertCalls, 0);
});

await check('tenant-scoped reservation rejects null hotel legacy identity', async () => {
  const supabase = createMockSupabase({
    reservations: [{
      id: 'reservation-null-hotel',
      hotel_id: null,
      pms_provider: 'apaleo',
      pms_reservation_id: 'reservation-null-hotel',
      status: 'confirmed'
    }]
  });

  await assert.rejects(
    () => createOrUpdateReservation({
      hotel_id: hotelId,
      pms_provider: 'apaleo',
      pms_reservation_id: 'reservation-null-hotel',
      guest_name: 'Private Guest'
    }, {
      tenantScopedPmsIdentity: true,
      requireExplicitHotelId: true,
      supabase
    }),
    PmsReservationTenantCollisionError
  );
});

await check('tenant Apaleo sync rejects missing connection before global env credentials', async () => {
  const previousEnv = {
    APALEO_CLIENT_ID: process.env.APALEO_CLIENT_ID,
    APALEO_CLIENT_SECRET: process.env.APALEO_CLIENT_SECRET,
    APALEO_ACCOUNT_CODE: process.env.APALEO_ACCOUNT_CODE,
    APALEO_BASE_URL: process.env.APALEO_BASE_URL
  };
  const previousFetch = global.fetch;
  let fetchCalls = 0;

  process.env.APALEO_CLIENT_ID = 'global-client';
  process.env.APALEO_CLIENT_SECRET = 'global-secret';
  process.env.APALEO_ACCOUNT_CODE = 'GLOBAL';
  process.env.APALEO_BASE_URL = 'https://api.apaleo.global.example';
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('global env credentials should not be used');
  };

  try {
    await assert.rejects(
      () => syncReservationsFromApaleo({
        hotelId,
        from: '2026-09-01',
        to: '2026-09-02'
      }),
      {
        name: 'ApaleoTenantSyncConfigurationError',
        reasonCode: 'UNKNOWN_CONNECTION'
      }
    );
    assert.equal(fetchCalls, 0);
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    global.fetch = previousFetch;
  }
});

await check('tenant Apaleo sync rejects mismatched hotel connection', async () => {
  await assert.rejects(
    () => syncReservationsFromApaleo({
      hotelId,
      connection: apaleoConnection({ hotel_id: otherHotelId }),
      from: '2026-09-01',
      to: '2026-09-02'
    }),
    {
      name: 'ApaleoTenantSyncConfigurationError',
      reasonCode: 'TENANT_MISMATCH'
    }
  );
});

check('source removes hash event id fallback', () => {
  const webhookSource = source('src/integrations/apaleo/apaleo-webhooks.service.js');
  assert.doesNotMatch(webhookSource, /stableHash\s*\(/);
  assert.doesNotMatch(webhookSource, /externalEventId[\s\S]{0,250}\|\|\s*hash/i);
});

check('source removes nullable event tenant fallback', () => {
  const webhookSource = source('src/integrations/apaleo/apaleo-webhooks.service.js');
  assert.doesNotMatch(webhookSource, /hotel_id:\s*connection\?\.hotel_id\s*\|\|\s*null/);
  assert.doesNotMatch(webhookSource, /connection_id:\s*connection\?\.id\s*\|\|\s*null/);
});

check('source uses scoped webhook lookup and claim filters', () => {
  const webhookSource = source('src/integrations/apaleo/apaleo-webhooks.service.js');
  assert.match(webhookSource, /\.eq\('connection_id', connectionId\)/);
  assert.match(webhookSource, /\.eq\('connection_id', context\.connectionId\)/);
  assert.match(webhookSource, /\.eq\('hotel_id', context\.hotelId\)/);
});

check('source blocks latest enabled connection fallback', () => {
  const webhookSource = source('src/integrations/apaleo/apaleo-webhooks.service.js');
  assert.doesNotMatch(webhookSource, /else\s*\{\s*query\s*=\s*query\.eq\('enabled', true\)/);
  assert.match(webhookSource, /missing_connection_hint/);
});

check('source blocks webhook env credential fallback', () => {
  const webhookSource = source('src/integrations/apaleo/apaleo-webhooks.service.js');
  assert.match(webhookSource, /connectionToApaleoConfig\(context\.connection\)/);
  assert.doesNotMatch(webhookSource, /connection\s*\?\s*connectionToApaleoConfig\(connection\)\s*:\s*null/);
});

check('source declares validation not configured quarantine path', () => {
  const webhookSource = source('src/integrations/apaleo/apaleo-webhooks.service.js');
  assert.match(webhookSource, /VALIDATION_NOT_CONFIGURED/);
  assert.match(webhookSource, /validateWebhookRequest/);
});

check('quarantine writer has only safe storage fields', () => {
  const quarantineSource = source('src/services/pms-webhook-quarantine.service.js');
  assert.match(quarantineSource, /pms_webhook_quarantine/);
  assert.doesNotMatch(quarantineSource, /\b(request_body|raw_payload|payload|guest_name|guest_email|guest_phone|contact|credentials|token|secret|error_message)\b/);
});

check('pms reservation-created route propagates explicit hotel context', () => {
  const controllerSource = source('src/controllers/pms.controller.js');
  assert.match(controllerSource, /hotel_id:\s*req\.explicitHotelId/);
  assert.match(controllerSource, /tenantScopedPmsIdentity:\s*true/);
  assert.match(controllerSource, /requireExplicitHotelId:\s*true/);
});

check('apaleo sync uses tenant-scoped PMS reservation mutation', () => {
  const syncSource = source('src/integrations/apaleo/apaleo-sync.service.js');
  assert.match(syncSource, /tenantScopedPmsIdentity:\s*true/);
  assert.match(syncSource, /requireExplicitHotelId:\s*true/);
  assert.match(syncSource, /assertTenantConnectionForSync/);
  assert.doesNotMatch(syncSource, /const config = connectionToConfig\(connection\);/);
});

check('direct Apaleo sync route uses tenant connection service', () => {
  const routeSource = source('src/routes/integrations.routes.js');
  assert.match(routeSource, /syncHotelReservations\(\{/);
  assert.doesNotMatch(routeSource, /syncReservationsFromApaleo/);
});

check('PMS sync and reservation B2 paths sanitize raw errors', () => {
  const syncSource = source('src/integrations/apaleo/apaleo-sync.service.js');
  const reservationSource = source('src/services/reservation.service.js');
  const connectionSource = source('src/services/pms-connections.service.js');

  assert.match(syncSource, /sanitizeWebhookErrorCode/);
  assert.doesNotMatch(syncSource, /error:\s*error\.message/);
  assert.match(reservationSource, /sanitizeWebhookErrorCode/);
  assert.doesNotMatch(reservationSource, /error:\s*error\.message/);
  assert.match(connectionSource, /sanitizeWebhookErrorCode/);
  assert.doesNotMatch(connectionSource, /last_sync_error:\s*error\.message/);
});

check('product PMS callers use tenant-scoped reservation mutation', () => {
  const webhookSource = source('src/integrations/apaleo/apaleo-webhooks.service.js');
  const syncSource = source('src/integrations/apaleo/apaleo-sync.service.js');
  const controllerSource = source('src/controllers/pms.controller.js');

  [webhookSource, syncSource, controllerSource].forEach((productSource) => {
    assert.match(productSource, /tenantScopedPmsIdentity:\s*true/);
    assert.match(productSource, /requireExplicitHotelId:\s*true/);
  });
});

check('backend PMS connection delete is soft disable', () => {
  const serviceSource = source('src/services/pms-connections.service.js');
  const deleteFunction = serviceSource.match(/export const deleteHotelPmsConnection[\s\S]*?^};/m)?.[0] || '';
  assert.match(deleteFunction, /\.update\(\{/);
  assert.match(deleteFunction, /enabled:\s*false/);
  assert.match(deleteFunction, /webhook_enabled:\s*false/);
  assert.doesNotMatch(deleteFunction, /\.delete\(\)/);
});

check('dashboard PMS connection delete is soft disable', () => {
  const routeSource = source('dashboard/app/api/pms-connections/route.js');
  const deleteRoute = routeSource.match(/export async function DELETE[\s\S]*?^}/m)?.[0] || '';
  assert.match(deleteRoute, /\.update\(\{/);
  assert.match(deleteRoute, /enabled:\s*false/);
  assert.match(deleteRoute, /webhook_enabled:\s*false/);
  assert.doesNotMatch(deleteRoute, /\.delete\(\)/);
});

check('integrations route lets runtime quarantine validation failures', () => {
  const routeSource = source('src/routes/integrations.routes.js');
  assert.doesNotMatch(routeSource, /router\.post\('\/apaleo\/webhook', blockUnverifiedApaleoWebhookInProduction/);
  assert.match(routeSource, /processApaleoWebhookEvent\(req\.body \|\| \{\}, req\.headers \|\| \{\}\)/);
});

check('tenant-scoped reservation path does not use PostgREST upsert', () => {
  const reservationSource = source('src/services/reservation.service.js');
  const tenantBlock = reservationSource.match(/if \(tenantScopedPmsIdentity\)[\s\S]*?return \{\s*reservation,\s*guest\s*\};\s*}/)?.[0] || '';
  assert.match(tenantBlock, /writeTenantScopedReservation/);
  assert.doesNotMatch(tenantBlock, /\.upsert\(/);
});

check('B2 script is registered', () => {
  const packageSource = source('package.json');
  assert.match(packageSource, /"test:pms-webhook-tenant-runtime": "node scripts\/test-pms-webhook-tenant-runtime\.js"/);
});

assert.ok(checks >= 30);

console.log(JSON.stringify({
  ok: true,
  checks,
  runtime: 'pms_webhook_tenant_hardened'
}, null, 2));
