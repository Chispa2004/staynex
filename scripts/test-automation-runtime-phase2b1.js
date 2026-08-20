import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Temporal } from '@js-temporal/polyfill';
import {
  DEFAULT_QUIET_HOURS_POLICY,
  DELIVERY_POLICY_REASONS,
  DELIVERY_POLICY_VERSION,
  TEMPORAL_DISAMBIGUATION,
  applyDeliveryWindow,
  createDeliveryPolicyFingerprint,
  createHotelLocalDateTime,
  hotelLocalDateTimeToUtc,
  isWithinQuietHours,
  nextAllowedLocalDateTime,
  normalizeLocalClock,
  utcInstantToHotelLocal,
  validateHotelLocalDateTime,
  validateIanaTimeZone,
  validateLocalClock,
  validateQuietHoursPolicy
} from '../shared/time/delivery-policy.js';
import {
  buildReservationScheduleFingerprint
} from '../shared/automations/reservation-lifecycle.js';
import {
  buildAutomationIdempotencyKey,
  scheduledForAutomation
} from '../shared/automations/runtime.js';

process.env.SEND_AUTOMATIONS = 'false';
process.env.USE_MOCK_AI = 'true';
delete process.env.TEST_WHATSAPP_NUMBER;
delete process.env.UBIKOS_ENABLED;

const canonical = (value) => validateHotelLocalDateTime(value).localDateTime;

const assertValidTimezone = (timezone) => {
  const result = validateIanaTimeZone(timezone);
  assert.equal(result.valid, true, `${timezone} should validate`);
  assert.equal(result.timezone, timezone);
  assert.equal(result.normalizedTimezone, timezone);
};

assertValidTimezone('Europe/Madrid');
assertValidTimezone('Africa/Casablanca');
assertValidTimezone('America/New_York');
assertValidTimezone('Asia/Dubai');
assert.equal(validateIanaTimeZone('Madrid/Europe').valid, false);
assert.equal(validateIanaTimeZone('').valid, false);
assert.equal(validateIanaTimeZone('   ').valid, false);
assert.equal(validateIanaTimeZone(null).valid, false);
assert.equal(validateIanaTimeZone(undefined).valid, false);
assert.equal(validateIanaTimeZone('+01:00').valid, false, 'fixed offsets are not IANA hotel timezones');
assert.equal(validateIanaTimeZone('UTC').valid, true);
assert.equal(validateIanaTimeZone('Etc/UTC').valid, true);

assert.equal(normalizeLocalClock('22:00'), '22:00');
assert.equal(normalizeLocalClock('22:00:00'), '22:00');
assert.equal(normalizeLocalClock('08:00'), '08:00');
assert.equal(normalizeLocalClock('08:00:00.000'), '08:00');
assert.equal(validateLocalClock('24:00').valid, false);
assert.equal(validateLocalClock('25:00').valid, false);
assert.equal(validateLocalClock('12:60').valid, false);
assert.equal(validateLocalClock('8pm').valid, false);
assert.equal(validateLocalClock('8:00').valid, false);
assert.equal(validateLocalClock('22:00:01').valid, false, 'quiet-hours config remains minute-level');
assert.equal(validateLocalClock('22:00:30').valid, false, 'DB/app contract rejects non-zero seconds');

const defaultPolicy = validateQuietHoursPolicy(DEFAULT_QUIET_HOURS_POLICY);
assert.equal(defaultPolicy.valid, true);
assert.deepEqual(defaultPolicy.quietHours, DEFAULT_QUIET_HOURS_POLICY);
assert.equal(defaultPolicy.crossMidnight, true);
assert.equal(defaultPolicy.intervalType, 'cross_midnight');

const disabledPolicy = validateQuietHoursPolicy({ enabled: false, start: '22:00', end: '08:00' });
assert.equal(disabledPolicy.valid, true);
assert.deepEqual(disabledPolicy.quietHours, { enabled: false, start: '22:00', end: '08:00' });
assert.equal(validateQuietHoursPolicy({ enabled: true, start: '22:00', end: '22:00' }).valid, false);
assert.equal(validateQuietHoursPolicy({ enabled: 'true', start: '22:00', end: '08:00' }).valid, false);
assert.equal(validateQuietHoursPolicy({ enabled: true, start: '13:00', end: '15:00' }).intervalType, 'daytime');

assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-14T21:59:59.999',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
}).allowed, true);
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-14T22:00:00.000',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
}).quiet, true);
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-15T02:00:00.000',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
}).quiet, true);
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-15T07:59:59.999',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
}).quiet, true);
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-15T08:00:00.000',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
}).allowed, true);

const daytimeQuietHours = { enabled: true, start: '13:00', end: '15:00' };
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-14T12:59:59.999',
  quietHours: daytimeQuietHours
}).allowed, true);
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-14T13:00:00.000',
  quietHours: daytimeQuietHours
}).quiet, true);
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-14T14:59:59.999',
  quietHours: daytimeQuietHours
}).quiet, true);
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-14T15:00:00.000',
  quietHours: daytimeQuietHours
}).allowed, true);
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-14T13:30:00.000',
  quietHours: { enabled: false, start: '13:00', end: '15:00' }
}).allowed, true);
assert.equal(isWithinQuietHours({
  localDateTime: '2026-08-14T13:30:00.000',
  quietHours: { enabled: true, start: '13:00', end: '13:00' }
}).reason, DELIVERY_POLICY_REASONS.UNVERIFIABLE);

const assertRoundTrip = ({ timezone, localDateTime }) => {
  const utc = hotelLocalDateTimeToUtc({ localDateTime, timezone });
  assert.equal(utc.valid, true);
  const local = utcInstantToHotelLocal({
    utcInstant: utc.scheduledForUtc,
    timezone
  });
  assert.equal(local.valid, true);
  assert.equal(local.localDateTime, canonical(localDateTime));
};

assertRoundTrip({ timezone: 'Europe/Madrid', localDateTime: '2026-01-15T12:00' });
assertRoundTrip({ timezone: 'Africa/Casablanca', localDateTime: '2026-01-15T12:00' });
assertRoundTrip({ timezone: 'America/New_York', localDateTime: '2026-01-15T12:00' });
assertRoundTrip({ timezone: 'Asia/Dubai', localDateTime: '2026-01-15T12:00' });

const madridSpring = hotelLocalDateTimeToUtc({
  localDateTime: '2026-03-29T02:30',
  timezone: 'Europe/Madrid'
});
assert.equal(madridSpring.valid, true);
assert.equal(madridSpring.disambiguation, TEMPORAL_DISAMBIGUATION);
assert.equal(madridSpring.scheduledForUtc, '2026-03-29T01:30:00.000Z');
assert.equal(madridSpring.zonedDateTime, '2026-03-29T03:30:00+02:00[Europe/Madrid]');
assert.equal(utcInstantToHotelLocal({
  utcInstant: madridSpring.scheduledForUtc,
  timezone: 'Europe/Madrid'
}).localDateTime, '2026-03-29T03:30:00.000');

const madridFall = hotelLocalDateTimeToUtc({
  localDateTime: '2026-10-25T02:30',
  timezone: 'Europe/Madrid'
});
assert.equal(madridFall.scheduledForUtc, '2026-10-25T01:30:00.000Z');
assert.equal(madridFall.zonedDateTime, '2026-10-25T02:30:00+01:00[Europe/Madrid]');
assert.equal(utcInstantToHotelLocal({
  utcInstant: madridFall.scheduledForUtc,
  timezone: 'Europe/Madrid'
}).localDateTime, '2026-10-25T02:30:00.000');

const newYorkSpring = hotelLocalDateTimeToUtc({
  localDateTime: '2026-03-08T02:30',
  timezone: 'America/New_York'
});
assert.equal(newYorkSpring.scheduledForUtc, '2026-03-08T07:30:00.000Z');
assert.equal(newYorkSpring.zonedDateTime, '2026-03-08T03:30:00-04:00[America/New_York]');

const newYorkFall = hotelLocalDateTimeToUtc({
  localDateTime: '2026-11-01T01:30',
  timezone: 'America/New_York'
});
assert.equal(newYorkFall.scheduledForUtc, '2026-11-01T06:30:00.000Z');
assert.equal(newYorkFall.zonedDateTime, '2026-11-01T01:30:00-05:00[America/New_York]');

const dubaiWinter = hotelLocalDateTimeToUtc({
  localDateTime: '2026-01-15T02:30',
  timezone: 'Asia/Dubai'
});
const dubaiSummer = hotelLocalDateTimeToUtc({
  localDateTime: '2026-07-15T02:30',
  timezone: 'Asia/Dubai'
});
assert.equal(dubaiWinter.offset, '+04:00');
assert.equal(dubaiSummer.offset, '+04:00');
assert.equal(dubaiSummer.scheduledForUtc, '2026-07-14T22:30:00.000Z');

assertRoundTrip({ timezone: 'Africa/Casablanca', localDateTime: '2026-06-15T12:00' });

const findCasablancaTransition = () => {
  const start = Temporal.Instant.from('2026-01-01T00:00:00.000Z');
  let previous = utcInstantToHotelLocal({
    utcInstant: start.toString({ smallestUnit: 'millisecond' }),
    timezone: 'Africa/Casablanca'
  });

  for (let hour = 1; hour <= 366 * 24; hour += 1) {
    const currentInstant = start.add({ hours: hour });
    const current = utcInstantToHotelLocal({
      utcInstant: currentInstant.toString({ smallestUnit: 'millisecond' }),
      timezone: 'Africa/Casablanca'
    });

    if (current.offset !== previous.offset) {
      return { before: previous, after: current };
    }

    previous = current;
  }

  return null;
};

const casablancaTransition = findCasablancaTransition();
if (casablancaTransition) {
  assert.notEqual(casablancaTransition.before.offset, casablancaTransition.after.offset);
  assert.equal(casablancaTransition.before.timezone, 'Africa/Casablanca');
  assert.equal(casablancaTransition.after.timezone, 'Africa/Casablanca');
  assert.equal(hotelLocalDateTimeToUtc({
    localDateTime: casablancaTransition.after.localDateTime,
    timezone: 'Africa/Casablanca'
  }).valid, true);
}

const outsideQuiet = applyDeliveryWindow({
  intendedLocalDateTime: '2026-08-14T10:00',
  timezone: 'Europe/Madrid',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
});
assert.equal(outsideQuiet.valid, true);
assert.equal(outsideQuiet.allowed, true);
assert.equal(outsideQuiet.adjusted, false);
assert.equal(outsideQuiet.reason, null);
assert.equal(outsideQuiet.scheduledLocalDateTime, '2026-08-14T10:00:00.000');

const insideCrossMidnight = applyDeliveryWindow({
  intendedLocalDateTime: '2026-08-14T23:00',
  timezone: 'Europe/Madrid',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
});
assert.equal(insideCrossMidnight.valid, true);
assert.equal(insideCrossMidnight.allowed, true);
assert.equal(insideCrossMidnight.adjusted, true);
assert.equal(insideCrossMidnight.reason, DELIVERY_POLICY_REASONS.QUIET_HOURS_ADJUSTMENT);
assert.equal(insideCrossMidnight.scheduledLocalDateTime, '2026-08-15T08:00:00.000');
assert.equal(insideCrossMidnight.scheduledForUtc, '2026-08-15T06:00:00.000Z');
assert.equal(insideCrossMidnight.requestedScheduledLocalDateTime, '2026-08-15T08:00:00.000');

const insideEarlyMorning = nextAllowedLocalDateTime({
  localDateTime: '2026-08-15T02:00',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
});
assert.equal(insideEarlyMorning.scheduledLocalDateTime, '2026-08-15T08:00:00.000');

const insideDaytime = applyDeliveryWindow({
  intendedLocalDateTime: '2026-08-14T14:00',
  timezone: 'Europe/Madrid',
  quietHours: daytimeQuietHours
});
assert.equal(insideDaytime.adjusted, true);
assert.equal(insideDaytime.scheduledLocalDateTime, '2026-08-14T15:00:00.000');
assert.equal(insideDaytime.scheduledForUtc, '2026-08-14T13:00:00.000Z');

const madridSpringQuietEndGap = applyDeliveryWindow({
  intendedLocalDateTime: '2026-03-28T23:00',
  timezone: 'Europe/Madrid',
  quietHours: { enabled: true, start: '22:00', end: '02:30' }
});
assert.equal(isWithinQuietHours({
  localDateTime: '2026-03-28T23:00',
  quietHours: { enabled: true, start: '22:00', end: '02:30' }
}).quiet, true);
assert.equal(madridSpringQuietEndGap.valid, true);
assert.equal(madridSpringQuietEndGap.adjusted, true);
assert.equal(
  madridSpringQuietEndGap.requestedScheduledLocalDateTime,
  '2026-03-29T02:30:00.000',
  'policy should target the nominal quiet-hours end before Temporal resolves the DST gap'
);
assert.equal(
  madridSpringQuietEndGap.scheduledForUtc,
  '2026-03-29T01:30:00.000Z',
  'Temporal later should resolve Madrid spring gap to the standard polyfill instant'
);
assert.equal(madridSpringQuietEndGap.scheduledZonedDateTime, '2026-03-29T03:30:00+02:00[Europe/Madrid]');
assert.equal(madridSpringQuietEndGap.scheduledTimeZoneOffset, '+02:00');
assert.equal(
  madridSpringQuietEndGap.scheduledLocalDateTime,
  '2026-03-29T03:30:00.000',
  'scheduledLocalDateTime must be the effective local time, not an impossible wall clock'
);
assert.equal(utcInstantToHotelLocal({
  utcInstant: madridSpringQuietEndGap.scheduledForUtc,
  timezone: 'Europe/Madrid'
}).localDateTime, madridSpringQuietEndGap.scheduledLocalDateTime);

const madridFallQuietEndOverlap = applyDeliveryWindow({
  intendedLocalDateTime: '2026-10-25T01:00',
  timezone: 'Europe/Madrid',
  quietHours: { enabled: true, start: '00:00', end: '02:30' }
});
assert.equal(isWithinQuietHours({
  localDateTime: '2026-10-25T01:00',
  quietHours: { enabled: true, start: '00:00', end: '02:30' }
}).quiet, true);
assert.equal(madridFallQuietEndOverlap.valid, true);
assert.equal(madridFallQuietEndOverlap.adjusted, true);
assert.equal(madridFallQuietEndOverlap.requestedScheduledLocalDateTime, '2026-10-25T02:30:00.000');
assert.equal(madridFallQuietEndOverlap.scheduledLocalDateTime, '2026-10-25T02:30:00.000');
assert.equal(
  madridFallQuietEndOverlap.scheduledForUtc,
  '2026-10-25T01:30:00.000Z',
  'Temporal later should choose the second Madrid 02:30 occurrence'
);
assert.equal(madridFallQuietEndOverlap.scheduledZonedDateTime, '2026-10-25T02:30:00+01:00[Europe/Madrid]');
assert.equal(madridFallQuietEndOverlap.scheduledTimeZoneOffset, '+01:00');

const yearBoundaryQuietEnd = applyDeliveryWindow({
  intendedLocalDateTime: '2026-12-31T23:00',
  timezone: 'Europe/Madrid',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
});
assert.equal(yearBoundaryQuietEnd.valid, true);
assert.equal(yearBoundaryQuietEnd.adjusted, true);
assert.equal(yearBoundaryQuietEnd.requestedScheduledLocalDateTime, '2027-01-01T08:00:00.000');
assert.equal(yearBoundaryQuietEnd.scheduledLocalDateTime, '2027-01-01T08:00:00.000');
assert.equal(yearBoundaryQuietEnd.scheduledForUtc, '2027-01-01T07:00:00.000Z');

assert.equal(applyDeliveryWindow({
  intendedLocalDateTime: '2026-08-14T10:00',
  timezone: 'Madrid/Europe',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
}).reason, DELIVERY_POLICY_REASONS.UNVERIFIABLE);
assert.equal(applyDeliveryWindow({
  intendedLocalDateTime: '2026-08-14T10:00',
  timezone: 'Europe/Madrid',
  quietHours: { enabled: true, start: '22:00', end: '22:00' }
}).reason, DELIVERY_POLICY_REASONS.UNVERIFIABLE);
assert.equal(createHotelLocalDateTime({
  stayDate: '2026-02-29',
  localWallClock: '10:00'
}).valid, false);

const fingerprintA = createDeliveryPolicyFingerprint({
  timezone: 'Europe/Madrid',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
});
const fingerprintB = createDeliveryPolicyFingerprint({
  timezone: 'Europe/Madrid',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
});
assert.match(fingerprintA, /^[0-9a-f]{32}$/);
assert.equal(fingerprintA, fingerprintB);
assert.notEqual(fingerprintA, createDeliveryPolicyFingerprint({
  timezone: 'Africa/Casablanca',
  quietHours: DEFAULT_QUIET_HOURS_POLICY
}));
assert.notEqual(fingerprintA, createDeliveryPolicyFingerprint({
  timezone: 'Europe/Madrid',
  quietHours: { enabled: true, start: '23:00', end: '08:00' }
}));
assert.notEqual(fingerprintA, createDeliveryPolicyFingerprint({
  timezone: 'Europe/Madrid',
  quietHours: { enabled: true, start: '22:00', end: '09:00' }
}));
assert.notEqual(fingerprintA, createDeliveryPolicyFingerprint({
  timezone: 'Europe/Madrid',
  quietHours: { enabled: false, start: '22:00', end: '08:00' }
}));
assert.equal(createDeliveryPolicyFingerprint({
  timezone: 'Europe/Madrid',
  quietHours: {
    ...DEFAULT_QUIET_HOURS_POLICY,
    guestName: 'Private Guest',
    guestEmail: 'private@example.test',
    token: 'secret-token'
  }
}), fingerprintA, 'fingerprint must ignore unknown PII/provider fields');
assert.doesNotMatch(fingerprintA, /Private|private@example|secret-token|\+34911111111/);

const reservation = {
  id: 'reservation-phase2b1',
  hotel_id: 'hotel-phase2b1',
  arrival_date: '2026-08-14',
  departure_date: '2026-08-16'
};
const reservationFingerprintA = buildReservationScheduleFingerprint({
  reservation,
  automationType: 'transfer'
});
const reservationFingerprintB = buildReservationScheduleFingerprint({
  reservation,
  automationType: 'transfer'
});
const differentQuietDeliveryFingerprint = createDeliveryPolicyFingerprint({
  timezone: 'Europe/Madrid',
  quietHours: { enabled: true, start: '23:00', end: '08:00' }
});
assert.equal(reservationFingerprintA, reservationFingerprintB);
assert.notEqual(fingerprintA, differentQuietDeliveryFingerprint);

const idempotencyInput = {
  hotelId: 'hotel-phase2b1',
  reservationId: 'reservation-phase2b1',
  automationType: 'transfer',
  trigger: 'transfer_need',
  triggerOccurrence: '2026-08-13T12:00:00.000Z',
  ruleVersion: 'catalog-v1:transfer'
};
const idempotencyKeyA = buildAutomationIdempotencyKey(idempotencyInput);
const idempotencyKeyB = buildAutomationIdempotencyKey({
  ...idempotencyInput,
  deliveryPolicyFingerprint: fingerprintA
});
assert.equal(idempotencyKeyA, idempotencyKeyB);

assert.equal(DELIVERY_POLICY_VERSION, 'delivery-policy-v1');
assert.equal(process.env.SEND_AUTOMATIONS, 'false');

const runtimeSource = readFileSync(new URL('../shared/automations/runtime.js', import.meta.url), 'utf8');
const queueSource = readFileSync(new URL('../src/services/message-queue.service.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const timeFoundationSource = readFileSync(new URL('../shared/time/delivery-policy.js', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../supabase/sql/add_automation_runtime_phase2b1_quiet_hours.sql', import.meta.url), 'utf8');
const rollbackSource = readFileSync(new URL('../supabase/sql/rollback_automation_runtime_phase2b1_quiet_hours.sql', import.meta.url), 'utf8');
const preflightSource = readFileSync(new URL('../supabase/sql/preflight_automation_runtime_phase2b1_quiet_hours.sql', import.meta.url), 'utf8');

assert.equal(
  scheduledForAutomation({
    automationType: 'transfer',
    reservation: { arrival_date: '2026-08-14' }
  }),
  '2026-08-13T12:00:00.000Z',
  'Phase 2B1.1 must not change runtime scheduledFor semantics yet'
);
assert.doesNotMatch(runtimeSource, /@js-temporal\/polyfill|shared\/time|delivery-policy|applyDeliveryWindow/);
assert.doesNotMatch(queueSource, /applyDeliveryWindow|hotel_quiet_hours_adjustment|delivery_policy_fingerprint|automation_quiet_hours/);
assert.doesNotMatch(serverSource, /scheduler\.service|processDueScheduledMessages|runAutomationScheduler/);
assert.doesNotMatch(timeFoundationSource, /Twilio|OpenAI|Apaleo|Ubikos|from\('/);
assert.match(migrationSource, /hotels_automation_quiet_hours_start_end_check[\s\S]+check\s*\(\s*automation_quiet_hours_start\s*<>\s*automation_quiet_hours_end\s*\)/);
assert.match(migrationSource, /hotels_automation_quiet_hours_start_minute_precision_check[\s\S]+check\s*\(\s*extract\(second from automation_quiet_hours_start\)\s*=\s*0\s*\)/);
assert.match(migrationSource, /hotels_automation_quiet_hours_end_minute_precision_check[\s\S]+check\s*\(\s*extract\(second from automation_quiet_hours_end\)\s*=\s*0\s*\)/);
assert.doesNotMatch(migrationSource, /\b(create\s+index|grant|revoke|alter\s+policy|create\s+policy|drop\s+table|delete\s+from|truncate)\b/i);
assert.doesNotMatch(migrationSource, /public\.(reservations|scheduled_messages|automation_runs|automation_events)\b/i);
assert.match(rollbackSource, /drop constraint if exists hotels_automation_quiet_hours_start_end_check/);
assert.match(rollbackSource, /drop constraint if exists hotels_automation_quiet_hours_start_minute_precision_check/);
assert.match(rollbackSource, /drop constraint if exists hotels_automation_quiet_hours_end_minute_precision_check/);
assert.doesNotMatch(rollbackSource, /timezone|metadata|public\.(reservations|scheduled_messages|automation_runs|automation_events)\b/i);
assert.doesNotMatch(preflightSource, /\b(insert|update|delete|alter|create|drop|truncate)\b/i, 'preflight must remain read-only');

console.log(JSON.stringify({
  ok: true,
  deliveryPolicyVersion: DELIVERY_POLICY_VERSION,
  defaultQuietHours: DEFAULT_QUIET_HOURS_POLICY,
  madridSpringUtc: madridSpring.scheduledForUtc,
  madridFallUtc: madridFall.scheduledForUtc,
  newYorkSpringUtc: newYorkSpring.scheduledForUtc,
  newYorkFallUtc: newYorkFall.scheduledForUtc,
  casablancaTransitionCovered: Boolean(casablancaTransition),
  deliveryFingerprint: fingerprintA,
  reservationFingerprint: reservationFingerprintA,
  sendAutomations: process.env.SEND_AUTOMATIONS
}, null, 2));
