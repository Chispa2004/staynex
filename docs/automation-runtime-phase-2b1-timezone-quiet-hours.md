# Automation Runtime Phase 2B1.1 - Timezone and Quiet Hours Foundation

Phase 2B1.1 adds the schema and shared time-policy foundation for hotel timezone and quiet-hours safety. It does not yet change runtime scheduling, send-time queue behavior, Automation Center, Test Center, settings UI, or audit flows.

## Schema

Manual SQL files:

- `supabase/sql/add_automation_runtime_phase2b1_quiet_hours.sql`
- `supabase/sql/preflight_automation_runtime_phase2b1_quiet_hours.sql`
- `supabase/sql/rollback_automation_runtime_phase2b1_quiet_hours.sql`

The additive migration prepares `public.hotels` with typed columns:

- `automation_quiet_hours_enabled boolean not null default true`
- `automation_quiet_hours_start time without time zone not null default time '22:00'`
- `automation_quiet_hours_end time without time zone not null default time '08:00'`

It also adds `hotels_automation_quiet_hours_start_end_check`, enforcing `automation_quiet_hours_start <> automation_quiet_hours_end`. No RLS, grants, indexes, reservations, messages, automation rows, or provider tables are changed.

The DB and application contract is minute precision for quiet-hours config. The migration also adds:

- `hotels_automation_quiet_hours_start_minute_precision_check`
- `hotels_automation_quiet_hours_end_minute_precision_check`

Both enforce `extract(second from ...) = 0`, so seconds and fractional seconds such as `22:00:30` are not valid quiet-hours configuration.

Existing hotels receive the SQL defaults above. The old code remains backward-compatible because it ignores these new columns.

## Preflight And Rollback

The preflight is read-only. It checks whether `public.hotels` exists, reports whether the new columns already exist, counts existing hotels, shows the `hotels.timezone` distribution, reports null/empty/whitespace timezone values, and uses `pg_timezone_names` only as a database-side diagnostic.

PostgreSQL timezone recognition is not the application contract. Runtime validation uses Temporal and remains fail-closed.

The rollback drops only the quiet-hours constraint and the three quiet-hours columns. No other hotel fields are touched.

## Shared Time Foundation

The shared module lives at `shared/time/delivery-policy.js` and is intended for later reuse by:

- automation runtime
- queue worker
- dashboard server paths
- Automation Center
- Automation Test Center

This phase keeps the module disconnected from those production paths.

## Temporal Polyfill

Phase 2B1.1 adds one time dependency: `@js-temporal/polyfill`.

The foundation uses Temporal for:

- IANA timezone validation
- local hotel wall time to UTC instant conversion
- UTC instant to hotel local conversion
- deterministic DST behavior

No Luxon, Moment, or date-fns-tz dependency is added.

## Timezone Validation

`validateIanaTimeZone(timezone)` requires an explicit timezone. It accepts valid Temporal-supported IANA zones such as:

- `Europe/Madrid`
- `Africa/Casablanca`
- `America/New_York`
- `Asia/Dubai`

It rejects null, undefined, empty strings, whitespace, arbitrary strings, invalid zones such as `Madrid/Europe`, and fixed offsets such as `+01:00`.

There is no `timezone || 'Europe/Madrid'` fallback in the new foundation.

## Local Wall Time Model

The model is:

```text
stay date + local wall clock + IANA timezone -> Temporal ZonedDateTime -> UTC Instant
```

Stay dates remain calendar dates. The foundation does not construct midnight UTC first, does not parse local strings with `new Date(localString)`, does not calculate offsets by hand, and does not guess DST offsets in loops.

Quiet-hour clock values are normalized strictly to `HH:mm`. PostgreSQL-style values such as `22:00`, `22:00:00`, `08:00`, and `08:00:00` are accepted when seconds are zero. Malformed values, `24:00`, invalid minutes, prose times, non-zero seconds, and fractional seconds are rejected.

## DST Semantics

Local wall time to timezone conversion uses Temporal with:

```text
disambiguation: 'later'
```

Staynex's Phase 2B1.1 contract is the Temporal `later` behavior:

- overlap/fall-back chooses the later occurrence
- gap/spring-forward uses Temporal's standard `later` resolution

The tests document concrete behavior for Madrid and New York in 2026. For example, Madrid `2026-03-29T02:30` resolves to `2026-03-29T03:30:00+02:00[Europe/Madrid]` and UTC `2026-03-29T01:30:00.000Z`.

Quiet-hours end uses the same Temporal `later` disambiguation. Tests explicitly cover:

- Madrid spring-forward gap where a nominal quiet-hours end at `2026-03-29T02:30` resolves to the effective local time `2026-03-29T03:30:00.000`.
- Madrid fall-back overlap where a nominal quiet-hours end at `2026-10-25T02:30` chooses the later `+01:00` occurrence.

`applyDeliveryWindow` returns `requestedScheduledLocalDateTime` for the nominal wall-clock target and `scheduledLocalDateTime` for the effective local time represented by `scheduledForUtc`.

## Quiet-Hours Semantics

Default policy:

```text
enabled=true
start=22:00
end=08:00
```

Boundary contract:

- start is inclusive
- end is exclusive
- `22:00 -> 08:00` is cross-midnight
- `13:00 -> 15:00` is daytime
- `start == end` is invalid, not disabled and not 24-hour quiet time

Examples:

- `21:59` allowed, `22:00` quiet, `07:59` quiet, `08:00` allowed
- `12:59` allowed, `13:00` quiet, `14:59` quiet, `15:00` allowed

Invalid config is explicit and fail-closed as `delivery_policy_unverifiable`.

## Delivery Window Policy

`applyDeliveryWindow({ intendedLocalDateTime, timezone, quietHours })` is a pure schedule-time foundation:

- outside quiet hours: allowed, unchanged
- inside quiet hours: allowed, adjusted to the next quiet-hours end
- invalid timezone/config/date: not allowed, `delivery_policy_unverifiable`

This is not yet connected to the runtime scheduler.

## Delivery Policy Fingerprint

`createDeliveryPolicyFingerprint(...)` hashes only:

- `DELIVERY_POLICY_VERSION`
- validated timezone
- quiet-hours enabled flag
- normalized start
- normalized end

It does not include hotel ID, reservation ID, guest name, phone, email, message content, provider payloads, tokens, or credentials.

The initial version constant is:

```text
delivery-policy-v1
```

## Separation From Reservation Fingerprint

The delivery policy fingerprint is separate from Phase 2A2 `reservation_schedule_fingerprint`.

Reservation schedule fingerprints continue to depend on reservation dates and automation rule dependencies only. Changing quiet-hours config changes the delivery fingerprint, but not the reservation schedule fingerprint.

## Idempotency

Phase 2B1.1 does not add `delivery_policy_fingerprint` to Phase 1 idempotency keys. Logical automation occurrences remain unchanged by quiet-hours shifting.

## Not Yet Implemented

Runtime integration is **NOT YET INTEGRATED**.

This phase does not yet:

- schedule automations in hotel timezone
- apply quiet hours in `scheduledForAutomation`
- write delivery policy metadata to queued messages
- enforce quiet hours at send-time
- change `message-queue.service.js`
- change Automation Center display
- change Automation Test Center display
- add settings API/UI
- add settings audit
- execute migrations

Those items belong to later phases 2B1.2, 2B1.3, and 2B1.4.
