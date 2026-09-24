import { Temporal } from '@js-temporal/polyfill';
const FIXED_OFFSET_TIME_ZONE_PATTERN = /^[+-](?:2[0-3]|[01]\d):?[0-5]\d$/;
const invalid = (reason, extra = {}) => ({ valid:false,reason,...extra });

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
