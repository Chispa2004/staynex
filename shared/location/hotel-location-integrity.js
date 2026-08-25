import { validateIanaTimeZone } from '../time/delivery-policy.js';

export const HOTEL_LOCATION_TIMEZONE_CHECK_TYPE = 'hotel_location_timezone_integrity';

export const TIMEZONE_INTEGRITY_STATUSES = Object.freeze([
  'unverified',
  'verified',
  'mismatch',
  'manual_override'
]);

export const TIMEZONE_INTEGRITY_PASS_STATUSES = Object.freeze([
  'verified',
  'manual_override'
]);

export const TIMEZONE_INTEGRITY_CONFIRMATION_STATUSES = Object.freeze([
  'verified',
  'manual_override'
]);

export const DEFAULT_TIMEZONE_INTEGRITY_STATUS = 'unverified';

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const HOTEL_LOCATION_FIELDS = ['country_code', 'city', 'timezone'];
const HOTEL_LOCATION_AUDIT_FIELDS = [
  'country_code',
  'city',
  'timezone',
  'timezone_integrity_status'
];
const HOTEL_LOCATION_ROLES = ['owner', 'admin', 'manager'];
const PLATFORM_LOCATION_ROLES = ['platform_admin', 'super_admin', 'internal_only'];

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const fieldValue = (object, snakeKey, camelKey = null) => (
  hasOwn(object, snakeKey) ? object[snakeKey] : camelKey && hasOwn(object, camelKey) ? object[camelKey] : undefined
);

const fail = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const normalizeText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

export const normalizeCountryCode = (value) => {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : null;
};

export const validateCountryCode = (value, { required = false } = {}) => {
  const countryCode = normalizeCountryCode(value);

  if (!countryCode) {
    return {
      valid: !required,
      reason: required ? 'country_code_required' : null,
      countryCode: null,
      normalizedCountryCode: null
    };
  }

  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    return {
      valid: false,
      reason: 'country_code_invalid',
      countryCode: null,
      normalizedCountryCode: null
    };
  }

  return {
    valid: true,
    reason: null,
    countryCode,
    normalizedCountryCode: countryCode
  };
};

export const normalizeCity = (value) => normalizeText(value);

export const validateCity = (value, { required = false } = {}) => {
  const city = normalizeCity(value);

  if (!city) {
    return {
      valid: !required,
      reason: required ? 'city_required' : null,
      city: null,
      normalizedCity: null
    };
  }

  return {
    valid: true,
    reason: null,
    city,
    normalizedCity: city
  };
};

export const normalizeTimezoneIntegrityStatus = (value) => {
  const status = normalizeText(value);
  return TIMEZONE_INTEGRITY_STATUSES.includes(status) ? status : null;
};

export const validateTimezoneIntegrityStatus = (value, { required = true, passOnly = false } = {}) => {
  const status = normalizeTimezoneIntegrityStatus(value);

  if (!status) {
    return {
      valid: !required,
      reason: required ? 'timezone_integrity_status_invalid' : null,
      timezoneIntegrityStatus: null
    };
  }

  if (passOnly && !TIMEZONE_INTEGRITY_PASS_STATUSES.includes(status)) {
    return {
      valid: false,
      reason: 'timezone_integrity_status_not_ready',
      timezoneIntegrityStatus: status
    };
  }

  return {
    valid: true,
    reason: null,
    timezoneIntegrityStatus: status
  };
};

export const validateHotelTimezoneIntegrityInput = ({
  country_code: countryCodeValue,
  countryCode,
  city: cityValue,
  timezone,
  timezone_integrity_status: statusValue,
  timezoneIntegrityStatus,
  requireVerified = false
} = {}) => {
  const country = validateCountryCode(countryCodeValue ?? countryCode, { required: true });
  const city = validateCity(cityValue, { required: true });
  const timezoneResult = validateIanaTimeZone(timezone);
  const status = validateTimezoneIntegrityStatus(
    statusValue ?? timezoneIntegrityStatus ?? DEFAULT_TIMEZONE_INTEGRITY_STATUS,
    { required: true, passOnly: requireVerified }
  );
  const valid = country.valid && city.valid && timezoneResult.valid && status.valid;
  const ready = valid && TIMEZONE_INTEGRITY_PASS_STATUSES.includes(status.timezoneIntegrityStatus);

  return {
    valid,
    ready,
    reason: country.reason || city.reason || timezoneResult.reason || status.reason || null,
    countryCode: country.countryCode,
    city: city.city,
    timezone: timezoneResult.timezone,
    normalizedTimezone: timezoneResult.normalizedTimezone,
    timezoneIntegrityStatus: status.timezoneIntegrityStatus
  };
};

export const evaluateHotelLocationTimezoneIntegrity = (hotel = {}) => {
  const result = validateHotelTimezoneIntegrityInput({
    country_code: hotel.country_code,
    city: hotel.city,
    timezone: hotel.timezone,
    timezone_integrity_status: hotel.timezone_integrity_status,
    requireVerified: true
  });

  return {
    ...result,
    checkType: HOTEL_LOCATION_TIMEZONE_CHECK_TYPE,
    pass: result.ready
  };
};

export const buildValidatedHotelCreationInput = (body = {}) => {
  const name = normalizeText(body.name);

  if (!name) {
    fail('Hotel name is required');
  }

  const location = validateHotelTimezoneIntegrityInput({
    country_code: fieldValue(body, 'country_code', 'countryCode'),
    city: fieldValue(body, 'city'),
    timezone: fieldValue(body, 'timezone'),
    timezone_integrity_status: DEFAULT_TIMEZONE_INTEGRITY_STATUS
  });

  if (!location.valid) {
    fail(`Hotel location/timezone is invalid: ${location.reason}`);
  }

  return {
    name,
    country_code: location.countryCode,
    city: location.city,
    timezone: location.timezone,
    timezone_integrity_status: DEFAULT_TIMEZONE_INTEGRITY_STATUS
  };
};

export const buildValidatedHotelProfileUpdate = ({
  body = {},
  existingHotel = {}
} = {}) => {
  const updates = {};
  const changedLocationFields = [];
  const previousValues = {};
  const newValues = {};

  if (hasOwn(body, 'country_code') || hasOwn(body, 'countryCode')) {
    const country = validateCountryCode(fieldValue(body, 'country_code', 'countryCode'), { required: true });
    if (!country.valid) fail(`Country code is invalid: ${country.reason}`);
    updates.country_code = country.countryCode;
  }

  if (hasOwn(body, 'city')) {
    const city = validateCity(body.city, { required: true });
    if (!city.valid) fail(`City is invalid: ${city.reason}`);
    updates.city = city.city;
  }

  if (hasOwn(body, 'timezone')) {
    const timezone = validateIanaTimeZone(body.timezone);
    if (!timezone.valid) fail(`Timezone is invalid: ${timezone.reason}`);
    updates.timezone = timezone.timezone;
  }

  HOTEL_LOCATION_FIELDS.forEach((field) => {
    if (!hasOwn(updates, field)) return;

    const previous = field === 'country_code'
      ? normalizeCountryCode(existingHotel[field])
      : field === 'city'
        ? normalizeCity(existingHotel[field])
        : normalizeText(existingHotel[field]);
    const next = field === 'country_code'
      ? normalizeCountryCode(updates[field])
      : field === 'city'
        ? normalizeCity(updates[field])
        : normalizeText(updates[field]);

    if (previous !== next) {
      changedLocationFields.push(field);
      previousValues[field] = previous;
      newValues[field] = next;
    }
  });

  if (changedLocationFields.length) {
    updates.timezone_integrity_status = DEFAULT_TIMEZONE_INTEGRITY_STATUS;
    previousValues.timezone_integrity_status = existingHotel.timezone_integrity_status || DEFAULT_TIMEZONE_INTEGRITY_STATUS;
    newValues.timezone_integrity_status = DEFAULT_TIMEZONE_INTEGRITY_STATUS;
  }

  return {
    updates,
    changedLocationFields,
    previousValues,
    newValues
  };
};

export const buildTimezoneIntegrityConfirmation = ({
  body = {},
  hotel = {}
} = {}) => {
  const requestedStatus = body.manual_override === true
    ? 'manual_override'
    : normalizeText(body.timezone_integrity_status || body.timezoneIntegrityStatus || body.status);

  if (!TIMEZONE_INTEGRITY_CONFIRMATION_STATUSES.includes(requestedStatus)) {
    fail('Timezone integrity confirmation status must be verified or manual_override');
  }

  const requestedCountry = validateCountryCode(fieldValue(body, 'country_code', 'countryCode'), { required: true });
  const requestedCity = validateCity(fieldValue(body, 'city'), { required: true });
  const requestedTimezone = validateIanaTimeZone(fieldValue(body, 'timezone'));
  const current = validateHotelTimezoneIntegrityInput({
    country_code: hotel.country_code,
    city: hotel.city,
    timezone: hotel.timezone,
    timezone_integrity_status: requestedStatus
  });

  if (!requestedCountry.valid || !requestedCity.valid || !requestedTimezone.valid || !current.valid) {
    fail('Timezone integrity confirmation requires current valid country, city and timezone');
  }

  if (
    requestedCountry.countryCode !== current.countryCode
    || requestedCity.city !== current.city
    || requestedTimezone.timezone !== current.timezone
  ) {
    fail('Timezone integrity confirmation values are stale');
  }

  return {
    updates: {
      timezone_integrity_status: requestedStatus
    },
    compare: {
      country_code: current.countryCode,
      city: current.city,
      timezone: current.timezone
    },
    changedFields: ['timezone_integrity_status'],
    previousValues: {
      timezone_integrity_status: hotel.timezone_integrity_status || DEFAULT_TIMEZONE_INTEGRITY_STATUS
    },
    newValues: {
      timezone_integrity_status: requestedStatus
    }
  };
};

export const confirmHotelTimezoneIntegrity = async ({
  supabase,
  hotelId,
  body = {},
  now = new Date().toISOString()
} = {}) => {
  if (!supabase) {
    fail('Supabase client is required', 500);
  }

  if (!hotelId) {
    fail('Hotel id is required');
  }

  const { data: hotel, error: lookupError } = await supabase
    .from('hotels')
    .select('*')
    .eq('id', hotelId)
    .single();

  if (lookupError) {
    throw lookupError;
  }

  const confirmation = buildTimezoneIntegrityConfirmation({ body, hotel });
  const { country_code: countryCode, city, timezone } = confirmation.compare;
  const updateQuery = supabase
    .from('hotels')
    .update({
      ...confirmation.updates,
      updated_at: now
    })
    .eq('id', hotelId)
    .eq('country_code', countryCode)
    .eq('city', city)
    .eq('timezone', timezone)
    .select('*');
  const { data: confirmedHotel, error: updateError } = typeof updateQuery.maybeSingle === 'function'
    ? await updateQuery.maybeSingle()
    : await updateQuery.single();

  if (updateError) {
    throw updateError;
  }

  if (!confirmedHotel) {
    fail('timezone_integrity_conflict', 409);
  }

  return {
    hotel: confirmedHotel,
    confirmation
  };
};

export const isAuthorizedHotelLocationRole = ({ role = null, platformRole = null } = {}) => (
  platformRole === 'support'
    ? false
    : PLATFORM_LOCATION_ROLES.includes(platformRole) || HOTEL_LOCATION_ROLES.includes(role)
);

export const assertHotelIdMatchesContext = ({ requestedHotelId = null, currentHotelId = null } = {}) => {
  if (!currentHotelId) {
    fail('Hotel context is required', 403);
  }

  if (requestedHotelId && String(requestedHotelId) !== String(currentHotelId)) {
    fail('Hotel context mismatch', 403);
  }

  return true;
};

export const buildSafeLocationChangeAudit = ({
  previousValues = {},
  newValues = {},
  changedFields = []
} = {}) => {
  const fields = changedFields.filter((field) => HOTEL_LOCATION_AUDIT_FIELDS.includes(field));
  const previous = {};
  const next = {};

  fields.forEach((field) => {
    previous[field] = previousValues[field] ?? null;
    next[field] = newValues[field] ?? null;
  });

  return {
    changed_fields: fields,
    previous_values: previous,
    new_values: next
  };
};
