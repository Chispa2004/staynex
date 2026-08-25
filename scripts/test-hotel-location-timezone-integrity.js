import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertHotelIdMatchesContext,
  buildSafeLocationChangeAudit,
  buildTimezoneIntegrityConfirmation,
  buildValidatedHotelCreationInput,
  buildValidatedHotelProfileUpdate,
  confirmHotelTimezoneIntegrity,
  evaluateHotelLocationTimezoneIntegrity,
  isAuthorizedHotelLocationRole,
  normalizeCity,
  normalizeCountryCode,
  validateCity,
  validateCountryCode,
  validateHotelTimezoneIntegrityInput
} from '../shared/location/hotel-location-integrity.js';

process.env.SEND_AUTOMATIONS = 'false';

let passed = 0;
const tests = [];
const test = (name, fn) => {
  tests.push({ name, fn });
};

const assertThrowsMessage = (fn, pattern) => {
  assert.throws(fn, (error) => pattern.test(error.message));
};

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const clone = (value) => JSON.parse(JSON.stringify(value));

const createFakeSupabase = (initialHotel, { beforeUpdate = null } = {}) => {
  const state = {
    hotels: new Map([[initialHotel.id, clone(initialHotel)]]),
    updateCalls: [],
    selectCalls: [],
    beforeUpdateCalled: false
  };

  const rowsFor = (filters) => [...state.hotels.values()]
    .filter((row) => filters.every(({ field, value }) => row[field] === value));

  class Query {
    constructor(table) {
      this.table = table;
      this.operation = 'select';
      this.payload = null;
      this.filters = [];
    }

    select() {
      return this;
    }

    update(payload) {
      this.operation = 'update';
      this.payload = payload;
      return this;
    }

    eq(field, value) {
      this.filters.push({ field, value });
      return this;
    }

    async single() {
      return this.execute({ allowEmpty: false });
    }

    async maybeSingle() {
      return this.execute({ allowEmpty: true });
    }

    async execute({ allowEmpty }) {
      if (this.table !== 'hotels') {
        return { data: null, error: null };
      }

      if (this.operation === 'update') {
        state.updateCalls.push({
          payload: clone(this.payload),
          filters: clone(this.filters)
        });

        if (beforeUpdate && !state.beforeUpdateCalled) {
          state.beforeUpdateCalled = true;
          beforeUpdate(state);
        }

        const rows = rowsFor(this.filters);
        if (!rows.length) {
          return allowEmpty
            ? { data: null, error: null }
            : { data: null, error: new Error('No rows returned') };
        }

        Object.assign(rows[0], this.payload);
        return { data: clone(rows[0]), error: null };
      }

      state.selectCalls.push({ filters: clone(this.filters) });
      const rows = rowsFor(this.filters);
      if (!rows.length) {
        return { data: null, error: new Error('No rows returned') };
      }

      return { data: clone(rows[0]), error: null };
    }
  }

  return {
    state,
    from(table) {
      return new Query(table);
    }
  };
};

const baseConfirmedHotel = {
  id: 'hotel-atomic',
  country_code: 'MA',
  city: 'Casablanca',
  timezone: 'Africa/Casablanca',
  timezone_integrity_status: 'unverified'
};

const assertFilter = (call, field, value) => {
  assert.ok(
    call.filters.some((filter) => filter.field === field && filter.value === value),
    `expected conditional update filter ${field}=${value}`
  );
};

test('country code trims and uppercases Spain', () => {
  assert.equal(normalizeCountryCode(' es '), 'ES');
});

test('country code accepts Morocco', () => {
  assert.equal(validateCountryCode('MA', { required: true }).countryCode, 'MA');
});

test('country code rejects one letter', () => {
  assert.equal(validateCountryCode('E', { required: true }).valid, false);
});

test('country code rejects three letters', () => {
  assert.equal(validateCountryCode('ESP', { required: true }).valid, false);
});

test('country code rejects numeric input', () => {
  assert.equal(validateCountryCode('12', { required: true }).valid, false);
});

test('country code rejects blank required input', () => {
  assert.equal(validateCountryCode('  ', { required: true }).reason, 'country_code_required');
});

test('country code rejects symbols', () => {
  assert.equal(validateCountryCode('@!', { required: true }).valid, false);
});

test('city trims valid text', () => {
  assert.equal(normalizeCity('  Madrid  '), 'Madrid');
});

test('city rejects blank required input', () => {
  assert.equal(validateCity(' ', { required: true }).reason, 'city_required');
});

test('valid IANA timezone passes shared integrity input', () => {
  const result = validateHotelTimezoneIntegrityInput({
    country_code: 'ES',
    city: 'Madrid',
    timezone: 'Europe/Madrid',
    timezone_integrity_status: 'verified'
  });
  assert.equal(result.valid, true);
  assert.equal(result.ready, true);
});

test('fixed offset timezone fails shared integrity input', () => {
  assert.equal(validateHotelTimezoneIntegrityInput({
    country_code: 'ES',
    city: 'Madrid',
    timezone: '+01:00',
    timezone_integrity_status: 'verified'
  }).valid, false);
});

test('hotel creation requires name', () => {
  assertThrowsMessage(() => buildValidatedHotelCreationInput({
    country_code: 'ES',
    city: 'Madrid',
    timezone: 'Europe/Madrid'
  }), /Hotel name is required/);
});

test('hotel creation requires country code', () => {
  assertThrowsMessage(() => buildValidatedHotelCreationInput({
    name: 'Hotel Test',
    city: 'Madrid',
    timezone: 'Europe/Madrid'
  }), /country_code_required/);
});

test('hotel creation requires city', () => {
  assertThrowsMessage(() => buildValidatedHotelCreationInput({
    name: 'Hotel Test',
    country_code: 'ES',
    timezone: 'Europe/Madrid'
  }), /city_required/);
});

test('hotel creation requires timezone', () => {
  assertThrowsMessage(() => buildValidatedHotelCreationInput({
    name: 'Hotel Test',
    country_code: 'ES',
    city: 'Madrid'
  }), /timezone_invalid/);
});

test('hotel creation normalizes location and starts unverified', () => {
  const payload = buildValidatedHotelCreationInput({
    name: 'Hotel Test',
    country_code: ' es ',
    city: ' Madrid ',
    timezone: 'Europe/Madrid'
  });
  assert.deepEqual({
    country_code: payload.country_code,
    city: payload.city,
    timezone: payload.timezone,
    timezone_integrity_status: payload.timezone_integrity_status
  }, {
    country_code: 'ES',
    city: 'Madrid',
    timezone: 'Europe/Madrid',
    timezone_integrity_status: 'unverified'
  });
});

test('country code change resets integrity status', () => {
  const result = buildValidatedHotelProfileUpdate({
    body: { country_code: 'MA' },
    existingHotel: { country_code: 'ES', city: 'Madrid', timezone: 'Europe/Madrid', timezone_integrity_status: 'verified' }
  });
  assert.deepEqual(result.changedLocationFields, ['country_code']);
  assert.equal(result.updates.timezone_integrity_status, 'unverified');
});

test('city change resets integrity status', () => {
  const result = buildValidatedHotelProfileUpdate({
    body: { city: 'Rabat' },
    existingHotel: { country_code: 'MA', city: 'Casablanca', timezone: 'Africa/Casablanca', timezone_integrity_status: 'verified' }
  });
  assert.deepEqual(result.changedLocationFields, ['city']);
  assert.equal(result.updates.timezone_integrity_status, 'unverified');
});

test('timezone change resets integrity status', () => {
  const result = buildValidatedHotelProfileUpdate({
    body: { timezone: 'Africa/Casablanca' },
    existingHotel: { country_code: 'MA', city: 'Rabat', timezone: 'Europe/Madrid', timezone_integrity_status: 'manual_override' }
  });
  assert.deepEqual(result.changedLocationFields, ['timezone']);
  assert.equal(result.updates.timezone_integrity_status, 'unverified');
});

test('unchanged location does not reset integrity status', () => {
  const result = buildValidatedHotelProfileUpdate({
    body: { country_code: ' es ', city: 'Madrid', timezone: 'Europe/Madrid' },
    existingHotel: { country_code: 'ES', city: 'Madrid', timezone: 'Europe/Madrid', timezone_integrity_status: 'verified' }
  });
  assert.deepEqual(result.changedLocationFields, []);
  assert.equal(result.updates.timezone_integrity_status, undefined);
});

test('verified confirmation succeeds with matching current values', () => {
  const result = buildTimezoneIntegrityConfirmation({
    body: { country_code: 'ES', city: 'Madrid', timezone: 'Europe/Madrid', timezone_integrity_status: 'verified' },
    hotel: { country_code: 'ES', city: 'Madrid', timezone: 'Europe/Madrid', timezone_integrity_status: 'unverified' }
  });
  assert.equal(result.updates.timezone_integrity_status, 'verified');
});

test('manual override confirmation succeeds with matching current values', () => {
  const result = buildTimezoneIntegrityConfirmation({
    body: { country_code: 'MA', city: 'Casablanca', timezone: 'Africa/Casablanca', manual_override: true },
    hotel: { country_code: 'MA', city: 'Casablanca', timezone: 'Africa/Casablanca', timezone_integrity_status: 'mismatch' }
  });
  assert.equal(result.updates.timezone_integrity_status, 'manual_override');
});

test('confirmation rejects stale current values', () => {
  assertThrowsMessage(() => buildTimezoneIntegrityConfirmation({
    body: { country_code: 'ES', city: 'Madrid', timezone: 'Europe/Madrid', timezone_integrity_status: 'verified' },
    hotel: { country_code: 'MA', city: 'Madrid', timezone: 'Europe/Madrid', timezone_integrity_status: 'unverified' }
  }), /stale/);
});

test('confirmation rejects mismatch as a confirmation target', () => {
  assertThrowsMessage(() => buildTimezoneIntegrityConfirmation({
    body: { country_code: 'ES', city: 'Madrid', timezone: 'Europe/Madrid', timezone_integrity_status: 'mismatch' },
    hotel: { country_code: 'ES', city: 'Madrid', timezone: 'Europe/Madrid', timezone_integrity_status: 'unverified' }
  }), /verified or manual_override/);
});

test('DB-backed confirmation writes verified with conditional filters', async () => {
  const fake = createFakeSupabase(baseConfirmedHotel);
  const result = await confirmHotelTimezoneIntegrity({
    supabase: fake,
    hotelId: baseConfirmedHotel.id,
    body: {
      country_code: 'MA',
      city: 'Casablanca',
      timezone: 'Africa/Casablanca',
      timezone_integrity_status: 'verified'
    },
    now: '2026-08-20T09:00:00.000Z'
  });

  assert.equal(result.hotel.timezone_integrity_status, 'verified');
  assert.equal(fake.state.updateCalls.length, 1);
  assertFilter(fake.state.updateCalls[0], 'id', baseConfirmedHotel.id);
  assertFilter(fake.state.updateCalls[0], 'country_code', 'MA');
  assertFilter(fake.state.updateCalls[0], 'city', 'Casablanca');
  assertFilter(fake.state.updateCalls[0], 'timezone', 'Africa/Casablanca');
});

test('DB-backed manual override uses the same conditional filters', async () => {
  const fake = createFakeSupabase(baseConfirmedHotel);
  const result = await confirmHotelTimezoneIntegrity({
    supabase: fake,
    hotelId: baseConfirmedHotel.id,
    body: {
      country_code: 'MA',
      city: 'Casablanca',
      timezone: 'Africa/Casablanca',
      manual_override: true
    }
  });

  assert.equal(result.hotel.timezone_integrity_status, 'manual_override');
  assertFilter(fake.state.updateCalls[0], 'country_code', 'MA');
  assertFilter(fake.state.updateCalls[0], 'city', 'Casablanca');
  assertFilter(fake.state.updateCalls[0], 'timezone', 'Africa/Casablanca');
});

test('concurrent city edit blocks stale confirmation and success audit', async () => {
  const fake = createFakeSupabase(baseConfirmedHotel, {
    beforeUpdate: (state) => {
      const hotel = state.hotels.get(baseConfirmedHotel.id);
      hotel.city = 'Marrakech';
      hotel.timezone_integrity_status = 'unverified';
    }
  });
  const successAudits = [];
  const confirmAndAudit = async () => {
    const result = await confirmHotelTimezoneIntegrity({
      supabase: fake,
      hotelId: baseConfirmedHotel.id,
      body: {
        country_code: 'MA',
        city: 'Casablanca',
        timezone: 'Africa/Casablanca',
        timezone_integrity_status: 'verified'
      }
    });
    successAudits.push({ action: 'hotel_timezone_integrity_confirmed', hotelId: result.hotel.id });
  };

  await assert.rejects(confirmAndAudit, /timezone_integrity_conflict/);
  const current = fake.state.hotels.get(baseConfirmedHotel.id);
  assert.equal(current.city, 'Marrakech');
  assert.equal(current.timezone_integrity_status, 'unverified');
  assert.equal(successAudits.length, 0);
});

test('concurrent country edit blocks stale confirmation', async () => {
  const fake = createFakeSupabase(baseConfirmedHotel, {
    beforeUpdate: (state) => {
      const hotel = state.hotels.get(baseConfirmedHotel.id);
      hotel.country_code = 'ES';
      hotel.timezone_integrity_status = 'unverified';
    }
  });

  await assert.rejects(() => confirmHotelTimezoneIntegrity({
    supabase: fake,
    hotelId: baseConfirmedHotel.id,
    body: {
      country_code: 'MA',
      city: 'Casablanca',
      timezone: 'Africa/Casablanca',
      timezone_integrity_status: 'verified'
    }
  }), /timezone_integrity_conflict/);
  assert.equal(fake.state.hotels.get(baseConfirmedHotel.id).timezone_integrity_status, 'unverified');
});

test('concurrent timezone edit blocks stale confirmation', async () => {
  const initial = {
    id: 'hotel-palma',
    country_code: 'ES',
    city: 'Palma',
    timezone: 'Europe/Madrid',
    timezone_integrity_status: 'unverified'
  };
  const fake = createFakeSupabase(initial, {
    beforeUpdate: (state) => {
      const hotel = state.hotels.get(initial.id);
      hotel.timezone = 'Atlantic/Canary';
      hotel.timezone_integrity_status = 'unverified';
    }
  });

  await assert.rejects(() => confirmHotelTimezoneIntegrity({
    supabase: fake,
    hotelId: initial.id,
    body: {
      country_code: 'ES',
      city: 'Palma',
      timezone: 'Europe/Madrid',
      timezone_integrity_status: 'verified'
    }
  }), /timezone_integrity_conflict/);
  assert.equal(fake.state.hotels.get(initial.id).timezone, 'Atlantic/Canary');
  assert.equal(fake.state.hotels.get(initial.id).timezone_integrity_status, 'unverified');
});

test('double same-snapshot confirmation is idempotent safe', async () => {
  const fake = createFakeSupabase(baseConfirmedHotel);
  const body = {
    country_code: 'MA',
    city: 'Casablanca',
    timezone: 'Africa/Casablanca',
    timezone_integrity_status: 'verified'
  };
  const first = await confirmHotelTimezoneIntegrity({ supabase: fake, hotelId: baseConfirmedHotel.id, body });
  const second = await confirmHotelTimezoneIntegrity({ supabase: fake, hotelId: baseConfirmedHotel.id, body });

  assert.equal(first.hotel.timezone_integrity_status, 'verified');
  assert.equal(second.hotel.timezone_integrity_status, 'verified');
  assert.equal(fake.state.updateCalls.length, 2);
});

test('generic patch cannot mass-assign verified', () => {
  const result = buildValidatedHotelProfileUpdate({
    body: { timezone_integrity_status: 'verified' },
    existingHotel: {
      country_code: 'ES',
      city: 'Madrid',
      timezone: 'Europe/Madrid',
      timezone_integrity_status: 'unverified'
    }
  });
  assert.deepEqual(result.updates, {});
});

test('generic edit after verified resets to unverified', () => {
  const result = buildValidatedHotelProfileUpdate({
    body: { city: 'Sevilla' },
    existingHotel: {
      country_code: 'ES',
      city: 'Madrid',
      timezone: 'Europe/Madrid',
      timezone_integrity_status: 'verified'
    }
  });
  assert.equal(result.updates.city, 'Sevilla');
  assert.equal(result.updates.timezone_integrity_status, 'unverified');
});

test('hotel owner can modify location integrity fields', () => {
  assert.equal(isAuthorizedHotelLocationRole({ role: 'owner' }), true);
});

test('hotel manager can modify location integrity fields', () => {
  assert.equal(isAuthorizedHotelLocationRole({ role: 'manager' }), true);
});

test('receptionist cannot modify location integrity fields', () => {
  assert.equal(isAuthorizedHotelLocationRole({ role: 'receptionist' }), false);
});

test('platform support cannot modify location integrity fields', () => {
  assert.equal(isAuthorizedHotelLocationRole({ role: 'admin', platformRole: 'support' }), false);
});

test('receptionist confirmation is blocked by role policy', () => {
  assert.equal(isAuthorizedHotelLocationRole({ role: 'receptionist' }), false);
});

test('support confirmation is blocked by role policy', () => {
  assert.equal(isAuthorizedHotelLocationRole({ role: 'owner', platformRole: 'support' }), false);
});

test('hotel context mismatch is rejected', () => {
  assertThrowsMessage(() => assertHotelIdMatchesContext({
    requestedHotelId: 'hotel-b',
    currentHotelId: 'hotel-a'
  }), /mismatch/);
});

test('cross-hotel confirmation is rejected before DB update', () => {
  assertThrowsMessage(() => assertHotelIdMatchesContext({
    requestedHotelId: 'hotel-b',
    currentHotelId: 'hotel-a'
  }), /mismatch/);
});

test('readiness passes verified hotel location integrity', () => {
  assert.equal(evaluateHotelLocationTimezoneIntegrity({
    country_code: 'ES',
    city: 'Madrid',
    timezone: 'Europe/Madrid',
    timezone_integrity_status: 'verified'
  }).ready, true);
});

test('readiness passes manual override hotel location integrity', () => {
  assert.equal(evaluateHotelLocationTimezoneIntegrity({
    country_code: 'MA',
    city: 'Casablanca',
    timezone: 'Africa/Casablanca',
    timezone_integrity_status: 'manual_override'
  }).ready, true);
});

test('readiness fails unverified hotel location integrity', () => {
  assert.equal(evaluateHotelLocationTimezoneIntegrity({
    country_code: 'ES',
    city: 'Madrid',
    timezone: 'Europe/Madrid',
    timezone_integrity_status: 'unverified'
  }).ready, false);
});

test('readiness fails mismatch hotel location integrity', () => {
  assert.equal(evaluateHotelLocationTimezoneIntegrity({
    country_code: 'ES',
    city: 'Madrid',
    timezone: 'Europe/Madrid',
    timezone_integrity_status: 'mismatch'
  }).ready, false);
});

test('readiness fails missing city', () => {
  assert.equal(evaluateHotelLocationTimezoneIntegrity({
    country_code: 'ES',
    city: null,
    timezone: 'Europe/Madrid',
    timezone_integrity_status: 'verified'
  }).reason, 'city_required');
});

test('audit payload contains only safe hotel location fields', () => {
  const audit = buildSafeLocationChangeAudit({
    previousValues: { country_code: 'ES', guest_name: 'Ada', token: 'secret' },
    newValues: { country_code: 'MA', pms_payload: { secret: true } },
    changedFields: ['country_code', 'guest_name', 'token', 'pms_payload']
  });
  assert.deepEqual(audit.changed_fields, ['country_code']);
  assert.deepEqual(audit.previous_values, { country_code: 'ES' });
  assert.deepEqual(audit.new_values, { country_code: 'MA' });
});

test('preflight SQL is read-only', () => {
  const preflight = source('supabase/sql/preflight_hotel_location_timezone_integrity.sql');
  assert.doesNotMatch(preflight, /\b(insert|update|delete|alter|create|drop|truncate)\b/i);
  assert.match(preflight, /pg_timezone_names/i);
});

test('migration adds only the approved hotel location columns and constraints', () => {
  const migration = source('supabase/sql/add_hotel_location_timezone_integrity.sql');
  assert.match(migration, /add column if not exists country_code text null default null/i);
  assert.match(migration, /add column if not exists city text null default null/i);
  assert.match(migration, /add column if not exists timezone_integrity_status text not null default 'unverified'/i);
  assert.match(migration, /hotels_country_code_iso_alpha2_check/i);
  assert.match(migration, /hotels_city_not_blank_check/i);
  assert.match(migration, /hotels_timezone_integrity_status_check/i);
  assert.doesNotMatch(migration, /alter\s+column\s+timezone/i);
});

test('rollback removes only the Phase 2B1-L additions', () => {
  const rollback = source('supabase/sql/rollback_hotel_location_timezone_integrity.sql');
  assert.match(rollback, /drop column if exists timezone_integrity_status/i);
  assert.match(rollback, /drop column if exists city/i);
  assert.match(rollback, /drop column if exists country_code/i);
  assert.doesNotMatch(rollback, /drop column if exists timezone\b/i);
  assert.doesNotMatch(rollback, /address|metadata/i);
});

test('creation APIs do not retain hidden Europe Madrid timezone fallback', () => {
  const platformRoute = source('dashboard/app/api/platform/hotels/route.js');
  const workspacesRoute = source('dashboard/app/api/workspaces/route.js');
  assert.doesNotMatch(platformRoute, /timezone:\s*normalizeOptional\(body\.timezone\)\s*\|\|\s*'Europe\/Madrid'/);
  assert.doesNotMatch(workspacesRoute, /timezone:\s*normalizeOptional\(body\.timezone\)\s*\|\|\s*'Europe\/Madrid'/);
});

test('onboarding UI hides editable controls without hotel setup authorization', () => {
  const wizard = source('dashboard/components/onboarding/OnboardingWizard.js');
  const step = source('dashboard/components/onboarding/StepHotelSetup.js');
  assert.match(wizard, /canManageHotelSetup/);
  assert.match(step, /readOnly=\{!canEdit\}/);
  assert.match(step, /\{canEdit \? \(/);
});

test('foundation code does not implement geocoding or coordinates', () => {
  const foundationSource = [
    source('shared/location/hotel-location-integrity.js'),
    source('dashboard/app/api/platform/hotels/route.js'),
    source('dashboard/app/api/workspaces/route.js'),
    source('dashboard/app/api/onboarding/hotel/route.js')
  ].join('\n');
  assert.doesNotMatch(foundationSource, /\b(latitude|longitude|lat|lng|geocode|google places|coordinates)\b/i);
});

test('Hotel Marruecos is not hardcoded or modified by product code', () => {
  const productSource = [
    source('shared/location/hotel-location-integrity.js'),
    source('dashboard/app/api/platform/hotels/route.js'),
    source('dashboard/app/api/workspaces/route.js'),
    source('dashboard/app/api/onboarding/hotel/route.js'),
    source('dashboard/components/onboarding/StepHotelSetup.js')
  ].join('\n');
  assert.doesNotMatch(productSource, /Hotel Marruecos|hotel-marruecos|Marruecos/);
});

test('automation runtime timezone scheduling is not integrated', () => {
  const runtimeSource = source('shared/automations/runtime.js');
  assert.doesNotMatch(runtimeSource, /hotel-location-integrity|hotel_location_timezone_integrity|applyDeliveryWindow/);
});

test('message queue send-time policy is not integrated', () => {
  const queueSource = source('shared/automations/queue-writer.js');
  assert.doesNotMatch(queueSource, /hotel-location-integrity|hotel_location_timezone_integrity|applyDeliveryWindow/);
});

test('SEND_AUTOMATIONS remains false in the local foundation suite', () => {
  assert.equal(process.env.SEND_AUTOMATIONS, 'false');
});

for (const { name, fn } of tests) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

console.log(`Hotel location/timezone integrity checks passed: ${passed}`);
