# Hotel Location & Timezone Integrity Foundation

Status: Phase 2B1-L foundation only. It does not geocode hotels, infer coordinates, modify existing hotel data, connect automation runtime scheduling to hotel timezone, enable workers, register cron jobs, or contact providers.

## Schema Contract

The additive database contract for `public.hotels` is:

- `country_code text null default null`
- `city text null default null`
- `timezone_integrity_status text not null default 'unverified'`

`country_code` is optional for existing rows, but if present it must be ISO alpha-2 uppercase. `city` is optional for existing rows, but if present it must not be blank after trimming. `timezone_integrity_status` can be `unverified`, `verified`, `mismatch`, or `manual_override`.

Existing `hotels.timezone`, address, metadata and operational records are not changed by this phase.

## Application Contract

New hotel creation requires explicit `name`, `country_code`, `city` and IANA `timezone`. The app no longer creates new hotels with a hidden `Europe/Madrid` timezone fallback in Platform Admin or workspace creation.

Existing hotels remain compatible with missing `country_code` and `city`. They default to `unverified` until an authorized user verifies or manually overrides the integrity status.

Editing `country_code`, `city` or `timezone` resets `timezone_integrity_status` to `unverified`. An explicit confirmation operation can set the status to `verified` or `manual_override` only when the submitted current country, city and timezone still match the hotel.

`mismatch` is schema-ready for future/internal review. This phase does not set it automatically.

## Permission Contract

Hotel location and timezone edits require an authenticated hotel context and one of:

- Platform Admin or Super Admin
- hotel owner
- hotel admin
- hotel manager

Receptionist, support, housekeeping, maintenance and analyst roles cannot modify or confirm hotel location/timezone integrity.

## Readiness Gate

Go-live readiness includes `hotel_location_timezone_integrity`. It passes only when:

- `country_code` is valid ISO alpha-2 uppercase
- `city` is non-blank
- `timezone` is a valid IANA timezone
- `timezone_integrity_status` is `verified` or `manual_override`

It fails for missing fields, invalid values, `unverified` and `mismatch`.

This is readiness/reporting only. It does not enable live sending or change automation execution mode.

## Phase 2B1.2 Safety Contract

Phase 2B1.2 must not use canonical timezone scheduling for a hotel when `hotel_location_timezone_integrity` fails. Runtime scheduling, message queue send-time behavior, Automation Center, Test Center UI and live sending remain NOT YET INTEGRATED in this foundation.

Coordinates and geocoding are DEFERRED. Hotel Marruecos is NOT MODIFIED and is not hardcoded.
