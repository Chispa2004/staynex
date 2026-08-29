import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTOMATION_RUNTIME_VERSION,
  CERTIFICATION_STATUSES,
  EXECUTION_MODES,
  OPERATIONAL_STATUSES
} from '../shared/automations/catalog.js';
import {
  buildReservationScheduleFingerprint,
  evaluateReservationLifecyclePolicy,
  isCanonicalAutomationScheduledMessage,
  isReservationTerminalForAutomations,
  normalizeReservationLifecycleStatus
} from '../shared/automations/reservation-lifecycle.js';
import { evaluateAutomationDecision } from '../shared/automations/runtime.js';
import { reconcileReservationAutomationLifecycle } from '../src/services/automation-reconciliation.service.js';
import {
  getDueScheduledMessages,
  getReservationSendTimeGate,
  processScheduledMessage
} from '../src/services/message-queue.service.js';
import { normalizeApaleoReservation } from '../src/integrations/apaleo/apaleo-normalizer.service.js';
import { normalizeUbikosReservation } from '../src/services/pms/normalizers/ubikos.normalizer.js';

process.env.SEND_AUTOMATIONS = 'false';
process.env.USE_MOCK_AI = 'true';
delete process.env.TEST_WHATSAPP_NUMBER;

const now = new Date('2026-08-10T10:00:00.000Z');
const hotel = {
  id: 'hotel-phase2a1',
  name: 'Staynex Test Hotel',
  timezone: 'Europe/Madrid',
  metadata: {
    automation_live_enabled: true,
    automation_execution_mode: EXECUTION_MODES.LIVE,
    automation_live_approved_at: '2026-08-10T08:00:00.000Z',
    automation_live_approved_by: 'ops-user',
    ai_auto_reply_enabled: true
  }
};
const previousReservation = {
  id: 'reservation-phase2a1',
  hotel_id: hotel.id,
  guest_id: 'guest-phase2a1',
  guest_name: 'Private Guest',
  guest_email: 'private@example.test',
  guest_phone: '+34911111111',
  arrival_date: '2026-08-11',
  departure_date: '2026-08-13',
  status: 'confirmed'
};
const cancelledReservation = {
  ...previousReservation,
  status: 'cancelled',
  updated_at: '2026-08-10T09:00:00.000Z'
};

const withFixedSystemTime = async (isoTimestamp, callback) => {
  const RealDate = Date;
  const fixedTime = new RealDate(isoTimestamp).getTime();

  globalThis.Date = class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedTime);
        return;
      }

      super(...args);
    }

    static now() {
      return fixedTime;
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  };

  try {
    return await callback();
  } finally {
    globalThis.Date = RealDate;
  }
};

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
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
    const configuredError = this.db.maybeSingleErrors?.[this.table] || null;

    if (configuredError) {
      return Promise.resolve({
        data: null,
        error: configuredError
      });
    }

    if (this.db.throwMaybeSingleTables?.includes(this.table)) {
      throw new Error(`${this.table} maybeSingle failed`);
    }

    if (this.db.ambiguousMaybeSingleTables?.includes(this.table) && result.data?.length > 1) {
      return Promise.resolve({
        data: null,
        error: {
          message: 'JSON object requested, multiple rows returned'
        }
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

    if (this.operation === 'insert') {
      const inserted = this.insertRows.map((row) => ({
        id: row.id || `${this.table}-${this.db.nextId++}`,
        created_at: row.created_at || now.toISOString(),
        ...row
      }));
      this.db[this.table].push(...inserted);
      return { data: inserted, error: null };
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
    hotels: [],
    reservations: [],
    scheduled_messages: [],
    automation_runs: [],
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

const canonicalMessage = (overrides = {}) => ({
  id: overrides.id || 'message-canonical',
  hotel_id: hotel.id,
  reservation_id: previousReservation.id,
  guest_id: previousReservation.guest_id,
  conversation_id: null,
  automation_type: 'transfer',
  channel: 'whatsapp',
  scheduled_for: overrides.scheduled_for || '2026-08-10T09:30:00.000Z',
  send_to: overrides.send_to ?? '+34911111111',
  language: 'es',
  message_preview: 'Transfer preview',
  status: overrides.status || OPERATIONAL_STATUSES.SCHEDULED,
  execution_mode: overrides.execution_mode || EXECUTION_MODES.LIVE,
  idempotency_key: overrides.idempotency_key || `automation:phase1:${overrides.id || 'message-canonical'}`,
  runtime_version: overrides.runtime_version || AUTOMATION_RUNTIME_VERSION,
  certification_status: overrides.certification_status || CERTIFICATION_STATUSES.CERTIFIED,
  metadata: {
    runtime_version: overrides.runtime_version || AUTOMATION_RUNTIME_VERSION,
    execution_mode: overrides.execution_mode || EXECUTION_MODES.LIVE,
    certification_status: overrides.certification_status || CERTIFICATION_STATUSES.CERTIFIED,
    trigger: 'transfer_need',
    ...(overrides.metadata || {})
  },
  ...overrides
});

const captureConsoleLogs = async (callback) => {
  const logs = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args) => {
    logs.push(args.join(' '));
  };
  console.warn = (...args) => {
    logs.push(args.join(' '));
  };

  try {
    const result = await callback();
    return { result, logs };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
};

const parseStructuredLogContexts = (logs, message) => logs
  .filter((line) => line.includes(message))
  .map((line) => {
    const jsonStart = line.indexOf('{');
    assert.notEqual(jsonStart, -1, `Structured log should include JSON context for ${message}`);
    return JSON.parse(line.slice(jsonStart));
  });

assert.equal(normalizeReservationLifecycleStatus('canceled'), 'cancelled');
assert.equal(normalizeReservationLifecycleStatus('no-show'), 'no_show');
assert.equal(normalizeReservationLifecycleStatus('NO SHOW'), 'no_show');
assert.equal(isReservationTerminalForAutomations('deleted'), true);

const terminalDecision = evaluateAutomationDecision({
  hotel,
  reservation: cancelledReservation,
  automationType: 'transfer_offer',
  legacyType: 'transfer_offer',
  executionMode: EXECUTION_MODES.PREVIEW,
  now,
  metadata: { source: 'phase2a1_test' }
});
assert.equal(terminalDecision.eligible, false, 'Terminal reservations must not generate new automation decisions');
assert.equal(terminalDecision.skipReason, 'reservation_cancelled');

const cancellationPolicy = evaluateReservationLifecyclePolicy({
  previousReservation,
  currentReservation: cancelledReservation,
  sourceEventId: 'apaleo-event-cancel-1'
});
assert.equal(cancellationPolicy.action, 'cancel_pending');
assert.equal(cancellationPolicy.reason, 'reservation_cancelled');

const reconciliationSupabase = createMockSupabase({
  scheduled_messages: [
    canonicalMessage({ id: 'preview-canonical', status: OPERATIONAL_STATUSES.PREVIEW }),
    canonicalMessage({ id: 'approval-canonical', status: OPERATIONAL_STATUSES.AWAITING_APPROVAL }),
    canonicalMessage({ id: 'scheduled-canonical', status: OPERATIONAL_STATUSES.SCHEDULED }),
    canonicalMessage({ id: 'processing-canonical', status: OPERATIONAL_STATUSES.PROCESSING }),
    canonicalMessage({ id: 'sent-canonical', status: OPERATIONAL_STATUSES.SENT }),
    canonicalMessage({ id: 'failed-canonical', status: OPERATIONAL_STATUSES.FAILED }),
    canonicalMessage({ id: 'cancelled-canonical', status: OPERATIONAL_STATUSES.CANCELLED }),
    {
      id: 'legacy-manual',
      hotel_id: hotel.id,
      reservation_id: previousReservation.id,
      automation_type: 'manual_followup',
      status: OPERATIONAL_STATUSES.SCHEDULED,
      scheduled_for: '2026-08-10T09:30:00.000Z',
      send_to: '+34922222222',
      message_preview: 'Legacy manual message',
      metadata: { manually_created: true }
    },
    canonicalMessage({
      id: 'other-hotel-scheduled',
      hotel_id: 'hotel-phase2a1-b',
      status: OPERATIONAL_STATUSES.SCHEDULED
    }),
    canonicalMessage({
      id: 'other-reservation-scheduled',
      reservation_id: 'reservation-phase2a1-b',
      status: OPERATIONAL_STATUSES.SCHEDULED
    })
  ]
});

const firstReconciliation = await reconcileReservationAutomationLifecycle({
  previousReservation,
  currentReservation: cancelledReservation,
  source: 'apaleo_webhook',
  sourceEventId: 'apaleo-event-cancel-1',
  supabase: reconciliationSupabase
});
assert.equal(firstReconciliation.rowsCancelled, 3, 'Preview, approval and scheduled canonical messages are cancellable');
assert.equal(firstReconciliation.rowsLegacyIgnored, 1, 'Legacy/manual messages must be quarantined, not mutated');
assert.equal(firstReconciliation.rowsAlreadyTerminal, 3, 'Sent, failed and already-cancelled messages stay terminal');
assert.equal(firstReconciliation.processingRowsRequiringSendTimeGuard, 1, 'Processing rows are left for send-time guard');
assert.equal(firstReconciliation.processingRowsRequireSendTimeGuard, 1, 'Result should expose send-time guard processing count');
assert.equal(firstReconciliation.canonicalStatus, 'cancelled');
assert.equal(firstReconciliation.statusChanged, true);
assert.equal(firstReconciliation.becameTerminal, true);
assert.equal(firstReconciliation.sourceEventId, 'apaleo-event-cancel-1');
assert.ok(firstReconciliation.eventKey.includes('apaleo-event-cancel-1'));
assert.equal(firstReconciliation.runtimeVersion, AUTOMATION_RUNTIME_VERSION);
assert.equal(reconciliationSupabase.db.scheduled_messages.find((row) => row.id === 'preview-canonical').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(reconciliationSupabase.db.scheduled_messages.find((row) => row.id === 'approval-canonical').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(reconciliationSupabase.db.scheduled_messages.find((row) => row.id === 'scheduled-canonical').status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(reconciliationSupabase.db.scheduled_messages.find((row) => row.id === 'processing-canonical').status, OPERATIONAL_STATUSES.PROCESSING);
assert.equal(reconciliationSupabase.db.scheduled_messages.find((row) => row.id === 'sent-canonical').status, OPERATIONAL_STATUSES.SENT);
assert.equal(reconciliationSupabase.db.scheduled_messages.find((row) => row.id === 'legacy-manual').status, OPERATIONAL_STATUSES.SCHEDULED);
assert.equal(reconciliationSupabase.db.scheduled_messages.find((row) => row.id === 'other-hotel-scheduled').status, OPERATIONAL_STATUSES.SCHEDULED);
assert.equal(reconciliationSupabase.db.scheduled_messages.find((row) => row.id === 'other-reservation-scheduled').status, OPERATIONAL_STATUSES.SCHEDULED);
assert.equal(reconciliationSupabase.db.automation_runs.length, 3, 'Each newly-cancelled canonical row gets an audit run');
assert.ok(reconciliationSupabase.db.automation_runs.every((run) => run.status === OPERATIONAL_STATUSES.CANCELLED));
assert.ok(
  reconciliationSupabase.db.automation_runs.every((run) => run.metadata?.reconciliation?.source_event_id === 'apaleo-event-cancel-1'),
  'sourceEventId should be preserved in safe audit metadata'
);
assert.ok(
  reconciliationSupabase.db.automation_runs.every((run) => run.metadata?.reconciliation?.event_key === firstReconciliation.eventKey),
  'eventKey should be preserved in safe audit metadata'
);
assert.doesNotMatch(
  JSON.stringify(reconciliationSupabase.db.automation_runs),
  /Private Guest|private@example\.test|\+34911111111/,
  'Reconciliation audit metadata must not include guest PII'
);

const duplicateApaleoReconciliation = await reconcileReservationAutomationLifecycle({
  previousReservation,
  currentReservation: cancelledReservation,
  source: 'apaleo_webhook',
  sourceEventId: 'apaleo-event-cancel-1',
  supabase: reconciliationSupabase
});
assert.equal(duplicateApaleoReconciliation.rowsCancelled, 0, 'Duplicate Apaleo cancellation reconciliation is idempotent');
assert.equal(reconciliationSupabase.db.automation_runs.length, 3, 'Duplicate cancellation must not create new audit rows');

const traceSupabase = createMockSupabase({
  scheduled_messages: [
    canonicalMessage({
      id: 'trace-canonical',
      metadata: {
        runtime_version: AUTOMATION_RUNTIME_VERSION,
        execution_mode: EXECUTION_MODES.LIVE,
        certification_status: CERTIFICATION_STATUSES.CERTIFIED,
        trigger: 'transfer_need',
        private_probe_token: 'STX-PRIVATE-TRACE-TOKEN',
        pms_payload_probe: 'raw-pms-payload-should-not-log'
      }
    })
  ]
});
const firstTraceCapture = await captureConsoleLogs(() => reconcileReservationAutomationLifecycle({
  previousReservation,
  currentReservation: cancelledReservation,
  source: 'apaleo_webhook',
  sourceEventId: 'apaleo-event-trace-1',
  supabase: traceSupabase
}));
const [firstTraceLog] = parseStructuredLogContexts(
  firstTraceCapture.logs,
  'automation_reconciliation_completed'
);
assert.equal(firstTraceCapture.result.rowsCancelled, 1, 'Trace reconciliation should keep cancellation semantics');
assert.match(
  firstTraceLog.reconciliationEventId,
  /^[0-9a-f]{24}$/,
  'Reconciliation log should include a compact stable reconciliationEventId'
);
assert.notEqual(firstTraceLog.reconciliationEventId, 'redacted', 'reconciliationEventId must not be redacted');
assert.equal(firstTraceLog.eventKey, 'redacted', 'Global logger should keep redacting eventKey fields');
assert.equal(firstTraceLog.sourceEventId, 'apaleo-event-trace-1', 'sourceEventId should remain visible for provider traceability');
assert.doesNotMatch(
  firstTraceCapture.logs.join('\n'),
  /Private Guest|private@example\.test|\+34911111111|STX-PRIVATE-TRACE-TOKEN|raw-pms-payload-should-not-log/,
  'Reconciliation logs must not include guest PII, tokens or PMS payloads'
);

const repeatTraceCapture = await captureConsoleLogs(() => reconcileReservationAutomationLifecycle({
  previousReservation,
  currentReservation: cancelledReservation,
  source: 'apaleo_webhook',
  sourceEventId: 'apaleo-event-trace-1',
  supabase: traceSupabase
}));
const [repeatTraceLog] = parseStructuredLogContexts(
  repeatTraceCapture.logs,
  'automation_reconciliation_completed'
);
assert.equal(repeatTraceCapture.result.rowsCancelled, 0, 'Repeated trace reconciliation should remain idempotent');
assert.equal(
  repeatTraceLog.reconciliationEventId,
  firstTraceLog.reconciliationEventId,
  'Same reconciliation event should produce the same reconciliationEventId'
);

const differentTraceSupabase = createMockSupabase({
  scheduled_messages: [canonicalMessage({ id: 'trace-canonical-different' })]
});
const differentTraceCapture = await captureConsoleLogs(() => reconcileReservationAutomationLifecycle({
  previousReservation,
  currentReservation: cancelledReservation,
  source: 'apaleo_webhook',
  sourceEventId: 'apaleo-event-trace-2',
  supabase: differentTraceSupabase
}));
const [differentTraceLog] = parseStructuredLogContexts(
  differentTraceCapture.logs,
  'automation_reconciliation_completed'
);
assert.notEqual(
  differentTraceLog.reconciliationEventId,
  firstTraceLog.reconciliationEventId,
  'Different reconciliation events should produce different reconciliationEventIds'
);

const noSourceTraceSupabase = createMockSupabase({
  scheduled_messages: [canonicalMessage({ id: 'trace-canonical-no-source' })]
});
const noSourceTraceCapture = await captureConsoleLogs(() => reconcileReservationAutomationLifecycle({
  previousReservation,
  currentReservation: {
    ...previousReservation,
    status: 'deleted'
  },
  source: 'pms_terminal_test',
  sourceEventId: null,
  supabase: noSourceTraceSupabase
}));
const [noSourceTraceLog] = parseStructuredLogContexts(
  noSourceTraceCapture.logs,
  'automation_reconciliation_completed'
);
const repeatNoSourceTraceCapture = await captureConsoleLogs(() => reconcileReservationAutomationLifecycle({
  previousReservation,
  currentReservation: {
    ...previousReservation,
    status: 'deleted'
  },
  source: 'pms_terminal_test',
  sourceEventId: null,
  supabase: noSourceTraceSupabase
}));
const [repeatNoSourceTraceLog] = parseStructuredLogContexts(
  repeatNoSourceTraceCapture.logs,
  'automation_reconciliation_completed'
);
assert.equal(noSourceTraceLog.sourceEventId, null, 'Missing sourceEventId should remain explicit in reconciliation logs');
assert.match(noSourceTraceLog.reconciliationEventId, /^[0-9a-f]{24}$/);
assert.equal(
  repeatNoSourceTraceLog.reconciliationEventId,
  noSourceTraceLog.reconciliationEventId,
  'Missing sourceEventId should still produce a stable reconciliationEventId from the no-source fallback'
);

for (const scenario of [
  {
    status: 'no_show',
    reason: 'reservation_no_show',
    sourceEventId: 'apaleo-event-noshow-1'
  },
  {
    status: 'deleted',
    reason: 'reservation_deleted',
    sourceEventId: null
  }
]) {
  const scenarioSupabase = createMockSupabase({
    scheduled_messages: [
      canonicalMessage({ id: `${scenario.status}-pending`, status: OPERATIONAL_STATUSES.SCHEDULED }),
      canonicalMessage({ id: `${scenario.status}-sent`, status: OPERATIONAL_STATUSES.SENT })
    ]
  });
  const scenarioResult = await reconcileReservationAutomationLifecycle({
    previousReservation,
    currentReservation: {
      ...previousReservation,
      status: scenario.status
    },
    source: 'pms_terminal_test',
    sourceEventId: scenario.sourceEventId,
    supabase: scenarioSupabase
  });

  assert.equal(scenarioResult.action, 'cancel_pending', `${scenario.status} should reconcile pending messages`);
  assert.equal(scenarioResult.reason, scenario.reason);
  assert.equal(scenarioResult.canonicalStatus, scenario.status);
  assert.equal(scenarioResult.statusChanged, true);
  assert.equal(scenarioResult.becameTerminal, true);
  assert.equal(scenarioResult.sourceEventId, scenario.sourceEventId);
  assert.ok(scenarioResult.eventKey.includes(scenario.sourceEventId || 'no-source-event'));
  assert.equal(scenarioResult.rowsCancelled, 1);
  assert.equal(scenarioSupabase.db.scheduled_messages.find((row) => row.id === `${scenario.status}-pending`).status, OPERATIONAL_STATUSES.CANCELLED);
  assert.equal(scenarioSupabase.db.scheduled_messages.find((row) => row.id === `${scenario.status}-sent`).status, OPERATIONAL_STATUSES.SENT);
  assert.equal(scenarioSupabase.db.automation_runs.length, 1);
  assert.equal(
    scenarioSupabase.db.automation_runs[0].metadata.reconciliation.source_event_id,
    scenario.sourceEventId,
    'sourceEventId should be preserved as provided, including explicit null'
  );
}

const retrySupabase = createMockSupabase({
  scheduled_messages: [canonicalMessage({ id: 'retry-pending-after-reconciliation-failure' })]
});
const retryAfterFailureResult = await reconcileReservationAutomationLifecycle({
  previousReservation: cancelledReservation,
  currentReservation: cancelledReservation,
  source: 'apaleo_webhook_retry',
  sourceEventId: 'apaleo-event-cancel-retry',
  supabase: retrySupabase
});
assert.equal(retryAfterFailureResult.action, 'cancel_pending', 'Already-terminal reservation should still ensure pending cancellation');
assert.equal(retryAfterFailureResult.statusChanged, false);
assert.equal(retryAfterFailureResult.becameTerminal, false);
assert.equal(retryAfterFailureResult.rowsCancelled, 1, 'Retry after failed reconciliation should repair pending canonical messages');
assert.equal(retrySupabase.db.scheduled_messages[0].status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(retrySupabase.db.automation_runs.length, 1);

const thirdTerminalRun = await reconcileReservationAutomationLifecycle({
  previousReservation: cancelledReservation,
  currentReservation: cancelledReservation,
  source: 'apaleo_webhook_retry',
  sourceEventId: 'apaleo-event-cancel-retry',
  supabase: retrySupabase
});
assert.equal(thirdTerminalRun.action, 'cancel_pending');
assert.equal(thirdTerminalRun.rowsCancelled, 0, 'Third terminal reconciliation should be a no-op');
assert.equal(retrySupabase.db.automation_runs.length, 1, 'No duplicate audit run should be created when nothing changed');

const runDateChangeReplacementScenario = () => {
  const rescheduleSupabase = createMockSupabase({
    scheduled_messages: [canonicalMessage({ id: 'date-change-scheduled' })]
  });

  return reconcileReservationAutomationLifecycle({
    previousReservation,
    currentReservation: {
      ...previousReservation,
      arrival_date: '2026-08-12'
    },
    source: 'reservation_mutation',
    supabase: rescheduleSupabase
  }).then((dateChangeResult) => ({
    dateChangeResult,
    rescheduleSupabase
  }));
};

const { dateChangeResult, rescheduleSupabase } = await withFixedSystemTime(
  '2026-08-11T10:00:00.000Z',
  runDateChangeReplacementScenario
);
assert.equal(dateChangeResult.action, 'future_reschedule');
assert.equal(dateChangeResult.staleRows, 1, 'Date changes supersede stale canonical messages in Phase 2A2');
assert.equal(dateChangeResult.replacementsCreated, 1, 'A replacement is created before stale cancellation');
assert.equal(dateChangeResult.rowsCancelled, 1, 'Stale date-dependent messages are cancelled after replacement');
assert.equal(rescheduleSupabase.db.scheduled_messages[0].status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(rescheduleSupabase.db.scheduled_messages.length, 2);
assert.equal(rescheduleSupabase.db.scheduled_messages[1].status, OPERATIONAL_STATUSES.PREVIEW);
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
await assert.rejects(
  () => reconcileReservationAutomationLifecycle({
    previousReservation,
    currentReservation: {
      ...previousReservation,
      departure_date: '2026-08-14'
    }
  }),
  { message: 'Supabase environment variables are not configured' },
  'No-terminal date change without a DB client must fail explicitly instead of succeeding as a no-op'
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

const dueSupabase = createMockSupabase({
  scheduled_messages: [
    canonicalMessage({ id: 'due-canonical', scheduled_for: '2026-08-10T09:00:00.000Z' }),
    canonicalMessage({ id: 'future-canonical', scheduled_for: '2026-08-10T12:00:00.000Z' }),
    canonicalMessage({
      id: 'wrong-runtime',
      scheduled_for: '2026-08-10T09:00:00.000Z',
      runtime_version: 'legacy-runtime'
    }),
    {
      id: 'legacy-due',
      hotel_id: hotel.id,
      reservation_id: previousReservation.id,
      automation_type: 'manual_followup',
      status: OPERATIONAL_STATUSES.SCHEDULED,
      scheduled_for: '2026-08-10T09:00:00.000Z',
      message_preview: 'Legacy due'
    }
  ]
});
const dueMessages = await getDueScheduledMessages({
  now,
  supabase: dueSupabase
});
assert.deepEqual(dueMessages.map((message) => message.id), ['due-canonical']);
assert.equal(dueMessages.every(isCanonicalAutomationScheduledMessage), true);

const legacyProcessSupabase = createMockSupabase({
  scheduled_messages: [{
    id: 'manual-legacy-process',
    hotel_id: hotel.id,
    reservation_id: previousReservation.id,
    automation_type: 'manual_followup',
    status: OPERATIONAL_STATUSES.SCHEDULED,
    scheduled_for: '2026-08-10T09:00:00.000Z',
    send_to: '+34933333333',
    message_preview: 'Manual legacy'
  }]
});
process.env.SEND_AUTOMATIONS = 'true';
const legacyProcessResult = await processScheduledMessage(
  legacyProcessSupabase.db.scheduled_messages[0],
  { supabase: legacyProcessSupabase }
);
assert.equal(legacyProcessResult.blocked, true);
assert.equal(legacyProcessResult.reason, 'legacy_automation_message_quarantined');
assert.equal(legacyProcessSupabase.db.scheduled_messages[0].status, OPERATIONAL_STATUSES.SCHEDULED);

const terminalProcessSupabase = createMockSupabase({
  hotels: [hotel],
  reservations: [cancelledReservation],
  scheduled_messages: [canonicalMessage({ id: 'terminal-send-time-block' })]
});
const terminalProcessResult = await processScheduledMessage(
  terminalProcessSupabase.db.scheduled_messages[0],
  { supabase: terminalProcessSupabase }
);
assert.equal(terminalProcessResult.status, OPERATIONAL_STATUSES.CANCELLED);
assert.equal(terminalProcessResult.error_message, 'reservation_cancelled');
assert.equal(
  terminalProcessSupabase.db.scheduled_messages[0].metadata.send_time_guard.reason,
  'reservation_cancelled',
  'Send-time guard must record the lifecycle block reason without sending'
);

const assertLookupFailureFailsClosed = async ({ label, supabase }) => {
  const result = await processScheduledMessage(
    supabase.db.scheduled_messages[0],
    { supabase }
  );

  assert.equal(result.status, OPERATIONAL_STATUSES.FAILED, `${label} should fail closed`);
  assert.equal(result.error_message, 'reservation_lookup_failed', `${label} should keep an explicit lookup failure reason`);
  assert.equal(result.sent_at || null, null, `${label} must not be marked sent`);
  assert.equal(
    supabase.db.scheduled_messages[0].status,
    OPERATIONAL_STATUSES.FAILED,
    `${label} should persist failed status before any provider send`
  );
};

await assertLookupFailureFailsClosed({
  label: 'Supabase reservation read error',
  supabase: createMockSupabase({
    hotels: [hotel],
    reservations: [previousReservation],
    scheduled_messages: [canonicalMessage({ id: 'reservation-read-error' })],
    maybeSingleErrors: {
      reservations: { message: 'Supabase reservation read failed' }
    }
  })
});
await assertLookupFailureFailsClosed({
  label: 'Reservation lookup exception',
  supabase: createMockSupabase({
    hotels: [hotel],
    reservations: [previousReservation],
    scheduled_messages: [canonicalMessage({ id: 'reservation-read-exception' })],
    throwMaybeSingleTables: ['reservations']
  })
});
await assertLookupFailureFailsClosed({
  label: 'Ambiguous reservation lookup',
  supabase: createMockSupabase({
    hotels: [hotel],
    reservations: [
      previousReservation,
      { ...previousReservation, updated_at: '2026-08-10T09:59:00.000Z' }
    ],
    scheduled_messages: [canonicalMessage({ id: 'reservation-read-ambiguous' })],
    ambiguousMaybeSingleTables: ['reservations']
  })
});

const activeProcessSupabase = createMockSupabase({
  hotels: [hotel],
  reservations: [previousReservation],
  scheduled_messages: [canonicalMessage({
    id: 'active-next-gate',
    send_to: null,
    metadata: {
      reservation_schedule_fingerprint: buildReservationScheduleFingerprint({
        reservation: previousReservation,
        automationType: 'transfer'
      }),
      schedule_fingerprint_version: 'reservation-schedule-fingerprint-v1'
    }
  })]
});
const activeGate = await getReservationSendTimeGate({
  scheduledMessage: activeProcessSupabase.db.scheduled_messages[0],
  supabase: activeProcessSupabase
});
assert.equal(activeGate.allowed, true, 'Active reservation passes lifecycle send-time guard');
const activeProcessResult = await processScheduledMessage(
  activeProcessSupabase.db.scheduled_messages[0],
  { supabase: activeProcessSupabase }
);
assert.equal(activeProcessResult.status, OPERATIONAL_STATUSES.FAILED);
assert.equal(activeProcessResult.error_message, 'Missing send_to', 'Active reservation continues to the next send gate');

assert.equal(normalizeApaleoReservation({
  id: 'APALEO-NOSHOW',
  status: 'no-show',
  arrival: '2026-08-11',
  departure: '2026-08-13'
}).status, 'no_show');
assert.equal(normalizeUbikosReservation({
  id: 'UBIKOS-NOSHOW',
  estado: 'NO_SHOW',
  entrada: '11/08/2026',
  salida: '13/08/2026',
  titular: 'Test Guest'
}).status, 'no_show');

const serverSource = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
assert.doesNotMatch(serverSource, /scheduler\.service|processDueScheduledMessages|runAutomationScheduler/, 'No worker or cron should be registered by the server');
const queueSource = readFileSync(new URL('../src/services/message-queue.service.js', import.meta.url), 'utf8');
assert.match(queueSource, /\.not\('idempotency_key', 'is', null\)/, 'Due-message query must exclude rows without canonical idempotency');
assert.match(queueSource, /legacy_automation_message_quarantined/, 'Processor must quarantine legacy/manual rows');

process.env.SEND_AUTOMATIONS = 'false';
assert.equal(process.env.SEND_AUTOMATIONS, 'false');

console.log(JSON.stringify({
  ok: true,
  rowsCancelled: firstReconciliation.rowsCancelled,
  duplicateRowsCancelled: duplicateApaleoReconciliation.rowsCancelled,
  legacyQuarantined: firstReconciliation.rowsLegacyIgnored,
  dueMessages: dueMessages.map((message) => message.id),
  sendAutomations: process.env.SEND_AUTOMATIONS
}, null, 2));
