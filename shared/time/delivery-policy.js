import { createHash } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';

export const DELIVERY_POLICY_VERSION = 'delivery-policy-v1';
export const TEMPORAL_DISAMBIGUATION = 'later';

export const DELIVERY_POLICY_REASONS = Object.freeze({
  QUIET_HOURS_ADJUSTMENT: 'hotel_quiet_hours_adjustment',
  UNVERIFIABLE: 'delivery_policy_unverifiable'
});

export const DEFAULT_QUIET_HOURS_POLICY = Object.freeze({
  enabled: true,
  start: '22:00',
  end: '08:00'
});

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const FIXED_OFFSET_TIME_ZONE_PATTERN = /^[+-](?:2[0-3]|[01]\d):?[0-5]\d$/;
const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const invalid = (reason, extra = {}) => ({
  valid: false,
  reason,
  ...extra
});

const pad2 = (value) => String(value).padStart(2, '0');
const pad3 = (value) => String(value).padStart(3, '0');

const formatPlainDate = (plainDate) => (
  `${String(plainDate.year).padStart(4, '0')}-${pad2(plainDate.month)}-${pad2(plainDate.day)}`
);

export const formatHotelLocalDateTime = (plainDateTime) => (
  `${formatPlainDate(plainDateTime)}T${pad2(plainDateTime.hour)}:${pad2(plainDateTime.minute)}:${pad2(plainDateTime.second)}.${pad3(plainDateTime.millisecond)}`
);

const instantToIsoMilliseconds = (instant) => instant.toString({ smallestUnit: 'millisecond' });

const parseStrictDate = (value) => {
  if (value instanceof Temporal.PlainDate) {
    return {
      valid: true,
      plainDate: value,
      date: formatPlainDate(value)
    };
  }

  if (typeof value !== 'string') {
    return invalid('date_invalid');
  }

  const text = value.trim();
  const match = text.match(DATE_PATTERN);

  if (!match) {
    return invalid('date_invalid');
  }

  try {
    const plainDate = Temporal.PlainDate.from({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3])
    }, { overflow: 'reject' });

    return {
      valid: true,
      plainDate,
      date: formatPlainDate(plainDate)
    };
  } catch (error) {
    return invalid('date_invalid', { error: error.message });
  }
};

const parseClockParts = (value, { minuteOnly = false } = {}) => {
  if (typeof value !== 'string') {
    return invalid('clock_invalid');
  }

  const text = value.trim();
  const match = text.match(CLOCK_PATTERN);

  if (!match) {
    return invalid('clock_invalid');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const millisecond = match[4] === undefined ? 0 : Number(match[4].padEnd(3, '0'));

  if (
    hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
    || second < 0
    || second > 59
  ) {
    return invalid('clock_invalid');
  }

  if (minuteOnly && (second !== 0 || millisecond !== 0)) {
    return invalid('clock_precision_invalid');
  }

  return {
    valid: true,
    clock: `${pad2(hour)}:${pad2(minute)}`,
    hour,
    minute,
    second,
    millisecond,
    minuteOfDay: hour * 60 + minute,
    millisecondOfDay: hour * 60 * MINUTE_MS
      + minute * MINUTE_MS
      + second * SECOND_MS
      + millisecond
  };
};

export const validateIanaTimeZone = (timeZone) => {
  if (typeof timeZone !== 'string') {
    return invalid('timezone_invalid', { timezone: null, normalizedTimezone: null });
  }

  const input = timeZone.trim();

  if (!input || FIXED_OFFSET_TIME_ZONE_PATTERN.test(input)) {
    return invalid('timezone_invalid', { timezone: null, normalizedTimezone: null });
  }

  try {
    const zonedDateTime = Temporal.ZonedDateTime.from({
      year: 2026,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      timeZone: input
    });
    const normalizedTimezone = zonedDateTime.timeZoneId;

    return {
      valid: true,
      input,
      timezone: normalizedTimezone,
      normalizedTimezone
    };
  } catch (error) {
    return invalid('timezone_invalid', {
      timezone: null,
      normalizedTimezone: null,
      error: error.message
    });
  }
};

export const normalizeLocalClock = (value) => {
  const result = parseClockParts(value, { minuteOnly: true });
  return result.valid ? result.clock : null;
};

export const validateLocalClock = (value) => {
  const result = parseClockParts(value, { minuteOnly: true });

  if (!result.valid) {
    return result;
  }

  return {
    valid: true,
    clock: result.clock,
    hour: result.hour,
    minute: result.minute,
    minuteOfDay: result.minuteOfDay
  };
};

export const validateQuietHoursPolicy = ({
  enabled,
  start,
  end
} = {}) => {
  if (typeof enabled !== 'boolean') {
    return invalid('quiet_hours_enabled_invalid');
  }

  const startClock = validateLocalClock(start);
  if (!startClock.valid) {
    return invalid('quiet_hours_start_invalid');
  }

  const endClock = validateLocalClock(end);
  if (!endClock.valid) {
    return invalid('quiet_hours_end_invalid');
  }

  if (startClock.clock === endClock.clock) {
    return invalid('quiet_hours_start_end_equal');
  }

  const crossMidnight = startClock.minuteOfDay > endClock.minuteOfDay;

  return {
    valid: true,
    quietHours: {
      enabled,
      start: startClock.clock,
      end: endClock.clock
    },
    enabled,
    start: startClock.clock,
    end: endClock.clock,
    startMinuteOfDay: startClock.minuteOfDay,
    endMinuteOfDay: endClock.minuteOfDay,
    startMillisecondOfDay: startClock.minuteOfDay * MINUTE_MS,
    endMillisecondOfDay: endClock.minuteOfDay * MINUTE_MS,
    crossMidnight,
    intervalType: crossMidnight ? 'cross_midnight' : 'daytime'
  };
};

export const createHotelLocalDateTime = ({
  stayDate,
  localWallClock
} = {}) => {
  const date = parseStrictDate(stayDate);
  if (!date.valid) {
    return date;
  }

  const clock = parseClockParts(localWallClock);
  if (!clock.valid) {
    return clock;
  }

  const plainDateTime = Temporal.PlainDateTime.from({
    year: date.plainDate.year,
    month: date.plainDate.month,
    day: date.plainDate.day,
    hour: clock.hour,
    minute: clock.minute,
    second: clock.second,
    millisecond: clock.millisecond
  }, { overflow: 'reject' });

  return {
    valid: true,
    plainDateTime,
    localDateTime: formatHotelLocalDateTime(plainDateTime),
    date: formatPlainDate(plainDateTime),
    clock: `${pad2(plainDateTime.hour)}:${pad2(plainDateTime.minute)}`,
    millisecondOfDay: clock.millisecondOfDay
  };
};

export const validateHotelLocalDateTime = (value) => {
  if (value instanceof Temporal.PlainDateTime) {
    return {
      valid: true,
      plainDateTime: value,
      localDateTime: formatHotelLocalDateTime(value),
      date: formatPlainDate(value),
      clock: `${pad2(value.hour)}:${pad2(value.minute)}`,
      millisecondOfDay: value.hour * 60 * MINUTE_MS
        + value.minute * MINUTE_MS
        + value.second * SECOND_MS
        + value.millisecond
    };
  }

  if (typeof value === 'object' && value !== null) {
    if (value.plainDateTime instanceof Temporal.PlainDateTime) {
      return validateHotelLocalDateTime(value.plainDateTime);
    }

    const stayDate = value.stayDate || value.date;
    const localWallClock = value.localWallClock || value.clock || value.time;

    if (stayDate && localWallClock) {
      return createHotelLocalDateTime({ stayDate, localWallClock });
    }
  }

  if (typeof value !== 'string') {
    return invalid('local_datetime_invalid');
  }

  const text = value.trim().replace(' ', 'T');
  const [dateText, clockText, extra] = text.split('T');

  if (extra !== undefined || !dateText || !clockText) {
    return invalid('local_datetime_invalid');
  }

  return createHotelLocalDateTime({
    stayDate: dateText,
    localWallClock: clockText
  });
};

export const hotelLocalDateTimeToUtc = ({
  stayDate,
  localWallClock,
  localDateTime,
  timezone
} = {}) => {
  const timezoneResult = validateIanaTimeZone(timezone);
  if (!timezoneResult.valid) {
    return {
      ...timezoneResult,
      scheduledForUtc: null,
      utcInstant: null
    };
  }

  const localResult = localDateTime !== undefined
    ? validateHotelLocalDateTime(localDateTime)
    : createHotelLocalDateTime({ stayDate, localWallClock });

  if (!localResult.valid) {
    return {
      ...localResult,
      timezone: timezoneResult.timezone,
      scheduledForUtc: null,
      utcInstant: null
    };
  }

  try {
    const plain = localResult.plainDateTime;
    const zonedDateTime = Temporal.ZonedDateTime.from({
      year: plain.year,
      month: plain.month,
      day: plain.day,
      hour: plain.hour,
      minute: plain.minute,
      second: plain.second,
      millisecond: plain.millisecond,
      timeZone: timezoneResult.timezone
    }, { disambiguation: TEMPORAL_DISAMBIGUATION });
    const instant = zonedDateTime.toInstant();
    const effectiveLocalDateTime = formatHotelLocalDateTime(zonedDateTime.toPlainDateTime());

    return {
      valid: true,
      timezone: timezoneResult.timezone,
      intendedLocalDateTime: localResult.localDateTime,
      localDateTime: localResult.localDateTime,
      effectiveLocalDateTime,
      zonedDateTime: zonedDateTime.toString(),
      offset: zonedDateTime.offset,
      utcInstant: instantToIsoMilliseconds(instant),
      scheduledForUtc: instantToIsoMilliseconds(instant),
      disambiguation: TEMPORAL_DISAMBIGUATION
    };
  } catch (error) {
    return invalid('local_datetime_invalid', {
      timezone: timezoneResult.timezone,
      scheduledForUtc: null,
      utcInstant: null,
      error: error.message
    });
  }
};

const parseUtcInstant = (value) => {
  if (value instanceof Temporal.Instant) {
    return {
      valid: true,
      instant: value,
      utcInstant: instantToIsoMilliseconds(value)
    };
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return invalid('utc_instant_invalid');
    }

    const instant = Temporal.Instant.from(value.toISOString());
    return {
      valid: true,
      instant,
      utcInstant: instantToIsoMilliseconds(instant)
    };
  }

  if (typeof value !== 'string') {
    return invalid('utc_instant_invalid');
  }

  try {
    const instant = Temporal.Instant.from(value);
    return {
      valid: true,
      instant,
      utcInstant: instantToIsoMilliseconds(instant)
    };
  } catch (error) {
    return invalid('utc_instant_invalid', { error: error.message });
  }
};

export const utcInstantToHotelLocal = ({
  utcInstant,
  timezone
} = {}) => {
  const timezoneResult = validateIanaTimeZone(timezone);
  if (!timezoneResult.valid) {
    return timezoneResult;
  }

  const instantResult = parseUtcInstant(utcInstant);
  if (!instantResult.valid) {
    return {
      ...instantResult,
      timezone: timezoneResult.timezone
    };
  }

  const zonedDateTime = instantResult.instant.toZonedDateTimeISO(timezoneResult.timezone);
  const plainDateTime = zonedDateTime.toPlainDateTime();

  return {
    valid: true,
    timezone: timezoneResult.timezone,
    utcInstant: instantResult.utcInstant,
    localDateTime: formatHotelLocalDateTime(plainDateTime),
    date: formatPlainDate(plainDateTime),
    clock: `${pad2(plainDateTime.hour)}:${pad2(plainDateTime.minute)}`,
    offset: zonedDateTime.offset,
    zonedDateTime: zonedDateTime.toString()
  };
};

export const isWithinQuietHours = ({
  localDateTime,
  quietHours
} = {}) => {
  const policy = validateQuietHoursPolicy(quietHours);
  if (!policy.valid) {
    return {
      valid: false,
      allowed: false,
      withinQuietHours: null,
      quiet: null,
      reason: DELIVERY_POLICY_REASONS.UNVERIFIABLE,
      detail: policy.reason
    };
  }

  const local = validateHotelLocalDateTime(localDateTime);
  if (!local.valid) {
    return {
      valid: false,
      allowed: false,
      withinQuietHours: null,
      quiet: null,
      reason: DELIVERY_POLICY_REASONS.UNVERIFIABLE,
      detail: local.reason
    };
  }

  if (!policy.enabled) {
    return {
      valid: true,
      allowed: true,
      withinQuietHours: false,
      quiet: false,
      reason: null,
      localDateTime: local.localDateTime,
      intervalType: policy.intervalType
    };
  }

  const value = local.millisecondOfDay;
  const quiet = policy.crossMidnight
    ? value >= policy.startMillisecondOfDay || value < policy.endMillisecondOfDay
    : value >= policy.startMillisecondOfDay && value < policy.endMillisecondOfDay;

  return {
    valid: true,
    allowed: !quiet,
    withinQuietHours: quiet,
    quiet,
    reason: quiet ? 'hotel_quiet_hours' : null,
    localDateTime: local.localDateTime,
    intervalType: policy.intervalType
  };
};

export const nextAllowedLocalDateTime = ({
  localDateTime,
  quietHours
} = {}) => {
  const policy = validateQuietHoursPolicy(quietHours);
  if (!policy.valid) {
    return {
      valid: false,
      adjusted: false,
      reason: DELIVERY_POLICY_REASONS.UNVERIFIABLE,
      detail: policy.reason
    };
  }

  const local = validateHotelLocalDateTime(localDateTime);
  if (!local.valid) {
    return {
      valid: false,
      adjusted: false,
      reason: DELIVERY_POLICY_REASONS.UNVERIFIABLE,
      detail: local.reason
    };
  }

  const quietResult = isWithinQuietHours({
    localDateTime: local.localDateTime,
    quietHours: policy.quietHours
  });

  if (!quietResult.valid) {
    return quietResult;
  }

  if (!quietResult.quiet) {
    return {
      valid: true,
      adjusted: false,
      reason: null,
      localDateTime: local.localDateTime,
      scheduledLocalDateTime: local.localDateTime
    };
  }

  const endClock = validateLocalClock(policy.end);
  const shouldMoveToNextDay = policy.crossMidnight
    && local.millisecondOfDay >= policy.startMillisecondOfDay;
  const targetDate = shouldMoveToNextDay
    ? local.plainDateTime.toPlainDate().add({ days: 1 })
    : local.plainDateTime.toPlainDate();
  const nextPlainDateTime = Temporal.PlainDateTime.from({
    year: targetDate.year,
    month: targetDate.month,
    day: targetDate.day,
    hour: endClock.hour,
    minute: endClock.minute,
    second: 0,
    millisecond: 0
  }, { overflow: 'reject' });

  return {
    valid: true,
    adjusted: true,
    reason: DELIVERY_POLICY_REASONS.QUIET_HOURS_ADJUSTMENT,
    localDateTime: local.localDateTime,
    scheduledLocalDateTime: formatHotelLocalDateTime(nextPlainDateTime)
  };
};

export const applyDeliveryWindow = ({
  intendedLocalDateTime,
  timezone,
  quietHours
} = {}) => {
  const timezoneResult = validateIanaTimeZone(timezone);
  const policy = validateQuietHoursPolicy(quietHours);
  const intended = validateHotelLocalDateTime(intendedLocalDateTime);

  if (!timezoneResult.valid || !policy.valid || !intended.valid) {
    return {
      valid: false,
      allowed: false,
      adjusted: false,
      reason: DELIVERY_POLICY_REASONS.UNVERIFIABLE,
      detail: timezoneResult.reason || policy.reason || intended.reason,
      intendedLocalDateTime: intended.valid ? intended.localDateTime : null,
      scheduledLocalDateTime: null,
      scheduledForUtc: null,
      timezone: timezoneResult.valid ? timezoneResult.timezone : null,
      deliveryPolicyVersion: DELIVERY_POLICY_VERSION
    };
  }

  const nextAllowed = nextAllowedLocalDateTime({
    localDateTime: intended.localDateTime,
    quietHours: policy.quietHours
  });

  if (!nextAllowed.valid) {
    return {
      valid: false,
      allowed: false,
      adjusted: false,
      reason: DELIVERY_POLICY_REASONS.UNVERIFIABLE,
      detail: nextAllowed.detail,
      intendedLocalDateTime: intended.localDateTime,
      scheduledLocalDateTime: null,
      scheduledForUtc: null,
      timezone: timezoneResult.timezone,
      deliveryPolicyVersion: DELIVERY_POLICY_VERSION
    };
  }

  const scheduledUtc = hotelLocalDateTimeToUtc({
    localDateTime: nextAllowed.scheduledLocalDateTime,
    timezone: timezoneResult.timezone
  });

  if (!scheduledUtc.valid) {
    return {
      valid: false,
      allowed: false,
      adjusted: false,
      reason: DELIVERY_POLICY_REASONS.UNVERIFIABLE,
      detail: scheduledUtc.reason,
      intendedLocalDateTime: intended.localDateTime,
      scheduledLocalDateTime: nextAllowed.scheduledLocalDateTime,
      scheduledForUtc: null,
      timezone: timezoneResult.timezone,
      deliveryPolicyVersion: DELIVERY_POLICY_VERSION
    };
  }

  return {
    valid: true,
    allowed: true,
    adjusted: nextAllowed.adjusted,
    reason: nextAllowed.adjusted ? DELIVERY_POLICY_REASONS.QUIET_HOURS_ADJUSTMENT : null,
    intendedLocalDateTime: intended.localDateTime,
    requestedScheduledLocalDateTime: nextAllowed.scheduledLocalDateTime,
    scheduledLocalDateTime: scheduledUtc.effectiveLocalDateTime || nextAllowed.scheduledLocalDateTime,
    scheduledForUtc: scheduledUtc.scheduledForUtc,
    scheduledZonedDateTime: scheduledUtc.zonedDateTime,
    scheduledTimeZoneOffset: scheduledUtc.offset,
    timezone: timezoneResult.timezone,
    quietHours: policy.quietHours,
    deliveryPolicyVersion: DELIVERY_POLICY_VERSION
  };
};

export const createDeliveryPolicyFingerprint = ({
  timezone,
  quietHours = DEFAULT_QUIET_HOURS_POLICY
} = {}) => {
  const timezoneResult = validateIanaTimeZone(timezone);
  const policy = validateQuietHoursPolicy(quietHours);

  if (!timezoneResult.valid || !policy.valid) {
    return null;
  }

  return createHash('sha256')
    .update(JSON.stringify({
      version: DELIVERY_POLICY_VERSION,
      timezone: timezoneResult.timezone,
      quietHours: policy.quietHours
    }))
    .digest('hex')
    .slice(0, 32);
};
