import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTOMATION_RUNTIME_VERSION,
  CERTIFICATION_STATUSES,
  EXECUTION_MODES,
  OPERATIONAL_STATUSES,
  getAutomationDefinition,
  getReservationDateDependenciesForAutomation,
  normalizeAutomationType
} from '../shared/automations/catalog.js';
import {
  buildRuntimeAutomationPreview,
  evaluateAutomationDecision
} from '../shared/automations/runtime.js';
import { writeAutomationDecisionToQueue } from '../shared/automations/queue-writer.js';
import {
  buildReservationScheduleFingerprint,
  evaluateMessageScheduleStaleness,
  evaluateReservationLifecyclePolicy
} from '../shared/automations/reservation-lifecycle.js';
import {
  PILOT_JOURNEY_AUTOMATION_TYPES,
  PILOT_JOURNEY_CERTIFICATION,
  PILOT_JOURNEY_STATUSES,
  PILOT_LIVE_SEND_BLOCKERS
} from '../shared/automations/pilot-journeys.js';
import {
  PILOT_AI_GATE_REASONS,
  shouldAiAutoRespond
} from '../shared/pilot/ai-safety.js';
import { processScheduledMessage } from '../src/services/message-queue.service.js';

process.env.SEND_AUTOMATIONS = 'false';
process.env.GUEST_MEMORY_ENABLED = 'false';
process.env.AUTOMATION_TEST_CENTER_ENABLED = 'true';
process.env.AUTOMATION_TEST_SEND_ENABLED = 'false';
process.env.USE_MOCK_AI = 'true';
delete process.env.TEST_WHATSAPP_NUMBER;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.OPENAI_API_KEY;
delete process.env.UBIKOS_ENABLED;

const { runAutomationTestCenter } = await import(`../dashboard/lib/automation-test-center.js?pilotJourneys=${Date.now()}`);

const now = new Date('2026-09-01T12:00:00.000Z');
const hotel = {
  id: 'hotel-pilot-journeys',
  name: 'Hotel Piloto',
  default_language: 'es',
  timezone: 'Europe/Madrid',
  metadata: {
    ai_auto_reply_enabled: true,
    automation_live_enabled: true,
    automation_execution_mode: EXECUTION_MODES.LIVE,
    automation_live_approved_at: '2026-09-01T09:00:00.000Z',
    automation_live_approved_by: 'ops-user'
  }
};
const otherHotel = {
  ...hotel,
  id: 'hotel-other',
  name: 'Otro Hotel'
};
const guest = {
  id: 'guest-pilot',
  hotel_id: hotel.id,
  name: 'Laura Garcia',
  phone_number: '+34911111111',
  preferred_language: 'es',
  pms_data_complete: true,
  metadata: {}
};

const reservation = (overrides = {}) => ({
  id: overrides.id || 'reservation-pilot',
  hotel_id: overrides.hotel_id || hotel.id,
  guest_id: overrides.guest_id || guest.id,
  guest_name: overrides.guest_name || guest.name,
  guest_phone: overrides.guest_phone ?? guest.phone_number,
  arrival_date: Object.prototype.hasOwnProperty.call(overrides, 'arrival_date') ? overrides.arrival_date : '2026-09-01',
  departure_date: Object.prototype.hasOwnProperty.call(overrides, 'departure_date') ? overrides.departure_date : '2026-09-03',
  status: overrides.status || 'confirmed',
  room_type: 'Deluxe',
  rate_plan: 'Breakfast',
  metadata: {
    ...(overrides.metadata || {})
  }
});

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.insertRows = null;
    this.updateValues = null;
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

  contains(column, value = {}) {
    this.filters.push((row) => Object.entries(value).every(([key, expected]) => row[column]?.[key] === expected));
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

    let rows = this.db[this.table].filter((row) => this.filters.every((filter) => filter(row)));

    if (this.operation === 'update') {
      rows = rows.map((row) => {
        Object.assign(row, this.updateValues);
        return row;
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

const evaluate = ({
  automationType,
  legacyType = null,
  reservation: reservationInput,
  guest: guestInput = guest,
  metadata = {},
  recentRuns = [],
  recentScheduledMessages = [],
  conversationState = null,
  at = now,
  hotel: hotelInput = hotel
}) => evaluateAutomationDecision({
  hotel: hotelInput,
  reservation: reservationInput,
  guest: guestInput,
  conversationState,
  automation: {
    type: legacyType || automationType,
    active: true
  },
  automationType,
  legacyType,
  executionMode: EXECUTION_MODES.PREVIEW,
  now: at,
  recentRuns,
  recentScheduledMessages,
  metadata: {
    source: 'pilot_journey_certification',
    test_mode: true,
    ...metadata
  },
  source: 'pilot_journey_certification'
});

const preview = (decision, reservationInput) => buildRuntimeAutomationPreview({
  decision,
  hotel,
  reservation: reservationInput,
  guest
});

const assertSpanishGuestCopy = (message, label) => {
  assert.ok(message && message.length <= 240, `${label} content should be short`);
  assert.match(
    message,
    /bienvenido|manana|estancia|recepcion|opinion|valorar|ayuda|interesado|podemos|experiencias|planes/i,
    `${label} should be natural Spanish guest copy`
  );
  assert.doesNotMatch(message, /\bHi\b|\bwelcome\b|\bfeedback\b|AI|runtime|idempotency|Supabase|Twilio/i, `${label} should not expose internals or English fallback`);
  assert.doesNotMatch(message, /gratis|confirmado|precio|40 EUR|garantizada/i, `${label} should not invent price, freebies or availability`);
};

const scheduledMessageFromDecision = (decision, overrides = {}) => ({
  id: overrides.id || `message-${decision.automationType}`,
  hotel_id: decision.hotelId,
  reservation_id: decision.reservationId,
  guest_id: decision.guestId,
  automation_type: decision.automationType,
  status: OPERATIONAL_STATUSES.PREVIEW,
  execution_mode: decision.executionMode,
  idempotency_key: decision.idempotencyKey,
  runtime_version: decision.runtimeVersion,
  certification_status: decision.certificationStatus,
  metadata: {
    ...decision.metadata
  },
  ...overrides
});

const assertQueueDedupe = async ({ decision, messagePreview, label }) => {
  const supabase = createMockSupabase();
  const first = await writeAutomationDecisionToQueue({
    supabase,
    decision,
    messagePreview,
    language: 'es',
    source: 'pilot_journey_certification',
    creationReason: decision.triggerReason
  });
  const second = await writeAutomationDecisionToQueue({
    supabase,
    decision,
    messagePreview,
    language: 'es',
    source: 'pilot_journey_certification',
    creationReason: decision.triggerReason
  });

  assert.equal(first.status, OPERATIONAL_STATUSES.PREVIEW, `${label} first evaluation should write preview`);
  assert.equal(first.scheduledMessage.send_to, null, `${label} preview should not persist guest send target`);
  assert.equal(second.duplicate, true, `${label} duplicate evaluation should be detected`);
  assert.equal(supabase.db.scheduled_messages.length, 1, `${label} duplicate should not duplicate queue`);
  assert.equal(supabase.db.automation_runs.length, 1, `${label} duplicate should not duplicate run audit`);
};

const assertStaleness = ({ decision, baseReservation, changedReservation, stale, label }) => {
  assert.equal(
    evaluateMessageScheduleStaleness({
      message: scheduledMessageFromDecision(decision),
      reservation: changedReservation
    }).stale,
    stale,
    label
  );
  assert.ok(
    buildReservationScheduleFingerprint({
      reservation: baseReservation,
      automationType: decision.automationType,
      dependencies: decision.reservationDateDependencies
    }),
    `${label} should have a schedule fingerprint`
  );
};

const pilotTypeSet = new Set(PILOT_JOURNEY_AUTOMATION_TYPES);
assert.deepEqual(
  [...pilotTypeSet].sort(),
  ['checkout', 'during_stay', 'pre_checkin', 'review_request', 'upselling', 'welcome'].sort(),
  'pilot certification should cover only the four journey families'
);
assert.equal(pilotTypeSet.has('transfer'), false, 'pilot certification must not certify transfer');
assert.equal(pilotTypeSet.has('spa'), false, 'pilot certification must not certify standalone spa');
assert.ok(PILOT_LIVE_SEND_BLOCKERS.includes('SEND_AUTOMATIONS=true controlled rollout'), 'live send blockers should remain explicit');

for (const row of PILOT_JOURNEY_CERTIFICATION) {
  assert.ok(Object.values(PILOT_JOURNEY_STATUSES).includes(row.status), `${row.journey} should use an allowed status`);
  for (const type of row.automationTypes) {
    assert.equal(getAutomationDefinition(type)?.type, type, `${type} should be an existing canonical type`);
    assert.equal(getAutomationDefinition(type)?.certificationStatus, CERTIFICATION_STATUSES.UNCERTIFIED, `${type} catalog live certification should remain closed`);
  }
}

assert.equal(normalizeAutomationType('welcome_message').canonicalType, 'welcome');
assert.equal(normalizeAutomationType('pre_arrival_1d').canonicalType, 'pre_checkin');
assert.equal(normalizeAutomationType('weather_trigger').canonicalType, 'during_stay');
assert.equal(normalizeAutomationType('abandoned_interest_followup').canonicalType, 'upselling');
assert.equal(normalizeAutomationType('checkout').canonicalType, 'checkout');
assert.equal(normalizeAutomationType('post_stay_review_intelligence').canonicalType, 'review_request');

const welcomeReservation = reservation({
  id: 'reservation-welcome',
  arrival_date: '2026-09-01',
  departure_date: '2026-09-03',
  status: 'confirmed'
});
const welcome = evaluate({
  automationType: 'welcome',
  legacyType: 'welcome_message',
  reservation: welcomeReservation
});
assert.equal(welcome.eligible, true, 'Welcome should be eligible on arrival day');
assert.equal(welcome.scheduledFor, '2026-09-01T12:00:00.000Z', 'Welcome anchor should be arrival');
assertSpanishGuestCopy(preview(welcome, welcomeReservation), 'Welcome');
const welcomeDuplicate = evaluate({
  automationType: 'welcome',
  legacyType: 'welcome_message',
  reservation: welcomeReservation,
  recentScheduledMessages: [{
    reservation_id: welcomeReservation.id,
    automation_type: 'welcome',
    status: OPERATIONAL_STATUSES.PREVIEW
  }]
});
assert.equal(welcomeDuplicate.eligible, false, 'Welcome should be one occurrence per stay');
assert.equal(welcomeDuplicate.skipReason, 'welcome_already_delivered');
assert.equal(welcomeDuplicate.duplicateBlocked, true);

const preCheckinReservation = reservation({
  id: 'reservation-pre-checkin',
  arrival_date: '2026-09-02',
  departure_date: '2026-09-05',
  status: 'confirmed'
});
const preCheckin = evaluate({
  automationType: 'pre_checkin',
  legacyType: 'pre_arrival_1d',
  reservation: preCheckinReservation
});
assert.equal(preCheckin.eligible, true, 'Pre Check-in should be eligible one day before arrival');
assert.equal(preCheckin.scheduledFor, '2026-09-01T12:00:00.000Z', 'Pre Check-in pilot trigger should anchor at arrival minus 24h');
assert.deepEqual(getReservationDateDependenciesForAutomation('pre_checkin'), ['arrival_date']);
assertSpanishGuestCopy(preview(preCheckin, preCheckinReservation), 'Pre Check-in');
const preCheckinMissingArrival = evaluate({
  automationType: 'pre_checkin',
  legacyType: 'pre_arrival_1d',
  reservation: reservation({ id: 'reservation-pre-missing-arrival', arrival_date: null })
});
assert.equal(preCheckinMissingArrival.eligible, false, 'Pre Check-in should fail closed without arrival date');

const duringStayReservation = reservation({
  id: 'reservation-during-stay',
  arrival_date: '2026-08-31',
  departure_date: '2026-09-03',
  status: 'checked_in',
  metadata: {
    last_intent: 'spa interest',
    available_offers: ['spa']
  }
});
const duringStay = evaluate({
  automationType: 'during_stay',
  reservation: duringStayReservation
});
assert.equal(duringStay.eligible, true, 'During stay should be eligible for in-house guest inside stay window');
assertSpanishGuestCopy(preview(duringStay, duringStayReservation), 'During Stay');
const duringBeforeArrival = evaluate({
  automationType: 'during_stay',
  reservation: reservation({
    id: 'reservation-during-before',
    arrival_date: '2026-09-02',
    departure_date: '2026-09-04',
    status: 'checked_in'
  })
});
assert.equal(duringBeforeArrival.skipReason, 'outside_stay_window', 'During stay must not run before arrival date');
const duringAfterDeparture = evaluate({
  automationType: 'during_stay',
  reservation: reservation({
    id: 'reservation-during-after',
    arrival_date: '2026-08-29',
    departure_date: '2026-09-01',
    status: 'checked_in'
  })
});
assert.equal(duringAfterDeparture.skipReason, 'outside_stay_window', 'During stay must not run after departure date');

const upsell = evaluate({
  automationType: 'upselling',
  legacyType: 'abandoned_interest_followup',
  reservation: duringStayReservation,
  metadata: {
    available_offers: ['spa'],
    guestSignals: 'spa interest'
  }
});
assert.equal(upsell.eligible, true, 'Upsell should require in-house guest with configured offer and interest');
assert.equal(upsell.triggerReason, 'configured_upsell_interest');
assertSpanishGuestCopy(preview(upsell, duringStayReservation), 'Upsell');
const upsellNoOffer = evaluate({
  automationType: 'upselling',
  legacyType: 'abandoned_interest_followup',
  reservation: reservation({
    id: 'reservation-upsell-no-offer',
    arrival_date: '2026-08-31',
    departure_date: '2026-09-03',
    status: 'checked_in',
    metadata: {
      last_intent: 'spa interest'
    }
  }),
  metadata: {
    guestSignals: 'spa interest'
  }
});
assert.equal(upsellNoOffer.skipReason, 'upsell_offer_not_configured', 'Upsell should skip when configured offer data is missing');

const checkoutNow = new Date('2026-09-01T10:00:00.000Z');
const checkoutReservation = reservation({
  id: 'reservation-checkout',
  arrival_date: '2026-08-29',
  departure_date: '2026-09-01',
  status: 'checked_in'
});
const checkout = evaluate({
  automationType: 'checkout',
  reservation: checkoutReservation,
  at: checkoutNow
});
assert.equal(checkout.eligible, true, 'Checkout should be eligible on departure day');
assert.equal(checkout.scheduledFor, '2026-09-01T12:00:00.000Z', 'Checkout anchor should be departure');
assert.deepEqual(getReservationDateDependenciesForAutomation('checkout'), ['departure_date']);
assertSpanishGuestCopy(preview(checkout, checkoutReservation), 'Checkout');

const reviewReservation = reservation({
  id: 'reservation-review',
  arrival_date: '2026-08-28',
  departure_date: '2026-08-31',
  status: 'checked_out'
});
const review = evaluate({
  automationType: 'review_request',
  legacyType: 'post_stay_review_intelligence',
  reservation: reviewReservation,
  guest: { ...guest, sentiment: 'positive' },
  at: now
});
assert.equal(review.eligible, true, 'Review should be eligible only after a checked-out valid stay');
assert.equal(review.scheduledFor, '2026-09-01T12:00:00.000Z', 'Review anchor should be departure plus 24h');
assertSpanishGuestCopy(preview(review, reviewReservation), 'Review');
const reviewNotCheckedOut = evaluate({
  automationType: 'review_request',
  legacyType: 'post_stay_review_intelligence',
  reservation: { ...reviewReservation, id: 'reservation-review-not-checked-out', status: 'confirmed' },
  at: now
});
assert.equal(reviewNotCheckedOut.skipReason, 'not_checked_out_24h_ago', 'Review should not run for non-checked-out stays');

for (const status of ['cancelled', 'no_show', 'deleted']) {
  for (const [type, baseReservation, legacyType] of [
    ['welcome', welcomeReservation, 'welcome_message'],
    ['pre_checkin', preCheckinReservation, 'pre_arrival_1d'],
    ['during_stay', duringStayReservation, null],
    ['upselling', duringStayReservation, 'abandoned_interest_followup'],
    ['checkout', checkoutReservation, null],
    ['review_request', reviewReservation, 'post_stay_review_intelligence']
  ]) {
    const cancelled = evaluate({
      automationType: type,
      legacyType,
      reservation: { ...baseReservation, id: `${baseReservation.id}-${status}-${type}`, status },
      metadata: type === 'upselling'
        ? { available_offers: ['spa'], guestSignals: 'spa interest' }
        : {}
    });
    assert.equal(cancelled.eligible, false, `${type} should skip terminal reservation status ${status}`);
    assert.match(cancelled.skipReason, /reservation_cancelled|reservation_no_show|reservation_deleted/);
  }
}

assertStaleness({
  decision: welcome,
  baseReservation: welcomeReservation,
  changedReservation: { ...welcomeReservation, arrival_date: '2026-09-02' },
  stale: true,
  label: 'Welcome should stale on arrival date change'
});
assertStaleness({
  decision: welcome,
  baseReservation: welcomeReservation,
  changedReservation: { ...welcomeReservation, departure_date: '2026-09-04' },
  stale: false,
  label: 'Welcome should not stale on departure-only change'
});
assertStaleness({
  decision: preCheckin,
  baseReservation: preCheckinReservation,
  changedReservation: { ...preCheckinReservation, arrival_date: '2026-09-03' },
  stale: true,
  label: 'Pre Check-in should stale on arrival date change'
});
assertStaleness({
  decision: duringStay,
  baseReservation: duringStayReservation,
  changedReservation: { ...duringStayReservation, departure_date: '2026-09-04' },
  stale: true,
  label: 'During stay should stale on departure date change'
});
assertStaleness({
  decision: upsell,
  baseReservation: duringStayReservation,
  changedReservation: { ...duringStayReservation, arrival_date: '2026-08-30' },
  stale: true,
  label: 'Upsell should stale on arrival date change'
});
assertStaleness({
  decision: checkout,
  baseReservation: checkoutReservation,
  changedReservation: { ...checkoutReservation, arrival_date: '2026-08-28' },
  stale: false,
  label: 'Checkout should not stale on arrival-only change'
});
assertStaleness({
  decision: checkout,
  baseReservation: checkoutReservation,
  changedReservation: { ...checkoutReservation, departure_date: '2026-09-02' },
  stale: true,
  label: 'Checkout should stale on departure date change'
});
assertStaleness({
  decision: review,
  baseReservation: reviewReservation,
  changedReservation: { ...reviewReservation, departure_date: '2026-09-01' },
  stale: true,
  label: 'Review should stale on departure date change'
});

for (const decision of [welcome, preCheckin, duringStay, upsell, checkout, review]) {
  assert.equal(decision.executionMode, EXECUTION_MODES.PREVIEW, `${decision.automationType} should remain preview mode`);
  assert.equal(decision.sendable, false, `${decision.automationType} should not be sendable in preview`);
  assert.equal(decision.metadata.live_sending_disabled, true, `${decision.automationType} metadata should keep live sending disabled`);
  assert.equal(decision.runtimeVersion, AUTOMATION_RUNTIME_VERSION, `${decision.automationType} should use the canonical runtime`);
}

await assertQueueDedupe({ decision: welcome, messagePreview: preview(welcome, welcomeReservation), label: 'Welcome' });
await assertQueueDedupe({ decision: preCheckin, messagePreview: preview(preCheckin, preCheckinReservation), label: 'Pre Check-in' });
await assertQueueDedupe({ decision: duringStay, messagePreview: preview(duringStay, duringStayReservation), label: 'During Stay' });
await assertQueueDedupe({ decision: upsell, messagePreview: preview(upsell, duringStayReservation), label: 'Upsell' });
await assertQueueDedupe({ decision: checkout, messagePreview: preview(checkout, checkoutReservation), label: 'Checkout' });
await assertQueueDedupe({ decision: review, messagePreview: preview(review, reviewReservation), label: 'Review' });

assert.throws(
  () => evaluate({
    automationType: 'welcome',
    legacyType: 'welcome_message',
    hotel: otherHotel,
    reservation: welcomeReservation
  }),
  /reservation hotel tenant mismatch/,
  'Reservation cross-tenant evaluation should fail closed'
);
assert.throws(
  () => evaluate({
    automationType: 'welcome',
    legacyType: 'welcome_message',
    reservation: welcomeReservation,
    guest: { ...guest, hotel_id: otherHotel.id }
  }),
  /guest hotel tenant mismatch/,
  'Guest cross-tenant evaluation should fail closed'
);
assert.throws(
  () => evaluateAutomationDecision({
    reservation: { ...welcomeReservation, hotel_id: null },
    automationType: 'welcome',
    legacyType: 'welcome_message'
  }),
  /hotelId is required/,
  'Missing hotel should not fall back to a default hotel'
);

const missingPhone = evaluate({
  automationType: 'welcome',
  legacyType: 'welcome_message',
  reservation: reservation({ id: 'reservation-missing-phone', guest_phone: '' }),
  guest: { ...guest, phone_number: '', phone: '' }
});
assert.equal(missingPhone.skipReason, 'skipped_missing_phone', 'Missing recipient should fail closed');
const takeoverBlocked = evaluate({
  automationType: 'during_stay',
  reservation: duringStayReservation,
  conversationState: { conversation_ai_mode: 'human_takeover' }
});
assert.equal(takeoverBlocked.skipReason, 'skipped_human_takeover', 'Human takeover should block guest-facing automation decisions');
const hotelKill = shouldAiAutoRespond({
  hotel: { ...hotel, metadata: { ...hotel.metadata, ai_auto_reply_enabled: false } },
  conversationState: null,
  env: { SEND_AUTOMATIONS: 'false' }
});
assert.equal(hotelKill.allowed, false, 'Hotel kill switch should block AI-driven guest-facing execution');
assert.equal(hotelKill.reason, PILOT_AI_GATE_REASONS.HOTEL_AI_AUTO_REPLY_OFF);
const globalKill = shouldAiAutoRespond({
  hotel,
  conversationState: null,
  env: { STAYNEX_GLOBAL_AI_AUTO_REPLY: 'off', SEND_AUTOMATIONS: 'false' }
});
assert.equal(globalKill.reason, PILOT_AI_GATE_REASONS.GLOBAL_KILL_SWITCH_OFF, 'Global kill should take precedence');

const sendBlocked = await processScheduledMessage({
  ...scheduledMessageFromDecision(welcome, {
    id: 'send-blocked-welcome',
    status: OPERATIONAL_STATUSES.SCHEDULED,
    execution_mode: EXECUTION_MODES.LIVE,
    certification_status: CERTIFICATION_STATUSES.CERTIFIED,
    send_to: '+34911111111',
    message_preview: preview(welcome, welcomeReservation)
  }),
  metadata: {
    ...welcome.metadata,
    execution_mode: EXECUTION_MODES.LIVE,
    certification_status: CERTIFICATION_STATUSES.CERTIFIED
  }
});
assert.equal(sendBlocked.skipped, true, 'SEND_AUTOMATIONS=false should block real sends before providers');
assert.equal(process.env.SEND_AUTOMATIONS, 'false', 'SEND_AUTOMATIONS must remain false');
assert.equal(process.env.GUEST_MEMORY_ENABLED, 'false', 'Guest Memory must remain off');

const cancellationPolicy = evaluateReservationLifecyclePolicy({
  previousReservation: preCheckinReservation,
  currentReservation: { ...preCheckinReservation, status: 'cancelled' },
  sourceEventId: 'pilot-cancel'
});
assert.equal(cancellationPolicy.action, 'cancel_pending', 'Cancellation should cancel pending journey previews');
const dateChangePolicy = evaluateReservationLifecyclePolicy({
  previousReservation: preCheckinReservation,
  currentReservation: { ...preCheckinReservation, arrival_date: '2026-09-03' },
  sourceEventId: 'pilot-date-change'
});
assert.equal(dateChangePolicy.action, 'future_reschedule', 'Date changes should be reschedule-safe');

const pilotTestAutomations = [
  { id: 'pilot-welcome', type: 'welcome_message', name: 'Welcome', active: true },
  { id: 'pilot-pre-checkin', type: 'pre_arrival_1d', name: 'Pre Check-in', active: true },
  { id: 'pilot-during-stay', type: 'weather_trigger', name: 'During Stay', active: true },
  { id: 'pilot-upsell', type: 'abandoned_interest_followup', name: 'Upsell', active: true },
  { id: 'pilot-checkout', type: 'checkout', name: 'Checkout', active: true },
  { id: 'pilot-review', type: 'post_stay_review_intelligence', name: 'Review', active: true }
];
const testCenterPreCheckin = runAutomationTestCenter({
  hotel,
  scenarioId: 'arriving_tomorrow',
  customNow: '2026-09-01T12:00:00.000Z',
  automations: pilotTestAutomations,
  dryRun: true,
  sendTest: false
});
assert.ok(
  testCenterPreCheckin.previews.some((item) => item.automation_type === 'pre_arrival_1d'),
  'Automation Test Center should demonstrate Pre Check-in with synthetic fixtures'
);
const testCenterStay = runAutomationTestCenter({
  hotel,
  scenarioId: 'guest_interested_spa',
  customNow: '2026-09-01T12:00:00.000Z',
  automations: pilotTestAutomations,
  dryRun: true,
  sendTest: false
});
assert.ok(
  testCenterStay.previews.some((item) => item.automation_type === 'abandoned_interest_followup'),
  'Automation Test Center should demonstrate configured upsell with synthetic fixtures'
);
const testCenterReview = runAutomationTestCenter({
  hotel,
  scenarioId: 'checked_out_24h_positive',
  customNow: '2026-09-01T12:00:00.000Z',
  automations: pilotTestAutomations,
  dryRun: true,
  sendTest: false
});
assert.ok(
  testCenterReview.previews.some((item) => item.automation_type === 'post_stay_review_intelligence'),
  'Automation Test Center should demonstrate Review with synthetic fixtures'
);
for (const result of [testCenterPreCheckin, testCenterStay, testCenterReview]) {
  assert.equal(result.safety.noGuestMessages, true, 'Test Center must not send guest messages');
  assert.equal(result.safety.liveSendingBlocked, true, 'Test Center must block live sending');
  assert.equal(result.safety.pmsTouched, false, 'Test Center must not touch PMS');
  assert.equal(result.safety.ubikosTouched, false, 'Test Center must not touch Ubikos');
  assert.equal(result.safety.sendAutomationsEnabled, false, 'Test Center must keep SEND_AUTOMATIONS false');
}

const docs = readFileSync(new URL('../docs/pilot-journey-certification.md', import.meta.url), 'utf8');
for (const label of ['WELCOME', 'PRE CHECK-IN', 'DURING STAY + UPSELL', 'CHECK-OUT + REVIEW']) {
  assert.ok(docs.includes(label), `${label} should be present in the certification matrix`);
}
assert.equal((docs.match(/CERTIFIED FOR PREVIEW/g) || []).length >= 4, true, 'Certification matrix should mark pilot journeys certified for preview');
assert.ok(docs.includes('REQUIRED BEFORE SEND_AUTOMATIONS=true'), 'Certification matrix should separate live-send blockers');

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['test:pilot-journeys'], 'node scripts/test-pilot-journeys.js', 'package script should be registered');

console.log('Pilot journey certification tests passed');
