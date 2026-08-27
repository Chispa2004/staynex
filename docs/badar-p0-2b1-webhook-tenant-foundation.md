# BADAR P0-2B1 - Webhook Tenant Integrity Foundation

## Scope

P0-2B1 prepares the database foundation for PMS webhook tenant integrity without
changing runtime behavior. It is migration-first only because every accepted
object in this stage is additive and compatible with current code.

This stage does not process live provider traffic differently. It does not
remove fallbacks, alter claim/retry semantics, change reservation upserts,
change connection deletion, run backfills, contact providers, or execute
migrations.

Overall P0-2B remains blocked for live webhook mutation until P0-2B2 runtime
hardening is implemented.

## Original tenant risk

`pms_webhook_events.hotel_id` and `pms_webhook_events.connection_id` are
nullable. Current webhook code can create canonical event rows without a
validated tenant connection, and later reservation mutation paths can fall back
to default/demo/first-hotel behavior. That means unresolved provider input can
reach tenant-owned reservation data.

## Event global identity risk

The legacy event identity is `(provider, external_event_id)`. Provider-global
event-id uniqueness is not verifiable, so the key is not sufficient for a
multi-tenant SaaS boundary. The target identity is scoped by connection:
`(provider, connection_id, external_event_id)`.

P0-2B1 adds only the supporting partial unique index for non-null proposed
keys. The legacy global unique index remains during transition so old runtime
instances continue to behave as before.

## Reservation global identity risk

The legacy reservation identity is `(pms_provider, pms_reservation_id)`, and the
current upsert conflict target uses that global identity. Provider-global
reservation-id uniqueness is also not verifiable. The target identity is
tenant-scoped: `(hotel_id, pms_provider, pms_reservation_id)`.

P0-2B1 adds only the supporting partial unique index for non-null proposed
keys. The legacy reservation unique constraint remains until runtime upserts are
changed in P0-2B2.

## Production drift fail-closed behavior

P0-1/P0-2A showed production drift is possible. P0-2B1 therefore does not trust
same-name objects by name alone.

The migration validates exact object compatibility through `pg_catalog` before
reuse:

- table kind, columns, types, nullability, relevant defaults, primary key and
  reason-code check contract for `public.pms_webhook_quarantine`
- RLS, browser grants, browser policies, service-role grants and Realtime
  membership for `public.pms_webhook_quarantine`
- index table, ordered indexed expressions, uniqueness and partial predicates
  for every B1 index

If a canonical B1 name exists with an incompatible definition, the migration
raises an exception and rolls back the transaction. It does not silently modify
preexisting objects to make them compatible.

## Exact object compatibility

B1 index compatibility is semantic, not name-only:

- `hotel_pms_connections(id, hotel_id)` must be unique and non-partial.
- `pms_webhook_events(connection_id)` must be a non-partial supporting index.
- `pms_webhook_events(provider, connection_id, external_event_id)` must be
  unique with the partial predicate `connection_id IS NOT NULL AND
  external_event_id IS NOT NULL`.
- `reservations(hotel_id, pms_provider, pms_reservation_id)` must be unique
  with all three fields non-null in the partial predicate.
- quarantine support indexes must match their expected tables and ordered
  indexed columns, including `created_at DESC`.

Different-name equivalent indexes may be reused only when the catalog proves
the same table, order, uniqueness and predicate. They are treated as preexisting
infrastructure and are not B1-owned.

## Ownership marker

Objects created by B1 receive the stable comment marker:

`STAYNEX_P0_2B1_OWNED_V1`

B1 applies this marker only to objects it actually creates:

- quarantine table
- quarantine indexes
- `hotel_pms_connections(id, hotel_id)` composite unique support
- `pms_webhook_events(connection_id)` supporting index
- scoped webhook-event unique index
- scoped reservation unique index

Preexisting compatible objects are reused but not claimed. Existing comments on
preexisting objects are preserved. A retry of an already-applied B1 migration
recognizes the marker and remains idempotent as long as the object definition is
still compatible.

## Quarantine foundation

`public.pms_webhook_quarantine` is a server-only table for unresolved or invalid
webhook routing metadata. It stores only non-sensitive triage fields:

- provider
- reason code
- status
- request/event hashes
- candidate connection id
- safe flags
- timestamps

It must never store raw request bodies, webhook payloads, guest data, contact
data, credentials, tokens, secrets, or raw provider errors. Same-name
preexisting quarantine tables with unsafe raw-data or secret-like columns block
the migration.

Finite reason codes are part of the contract:

- `INVALID_SIGNATURE`
- `MISSING_SIGNATURE`
- `UNKNOWN_CONNECTION`
- `AMBIGUOUS_CONNECTION`
- `CONNECTION_DISABLED`
- `TENANT_MISMATCH`
- `MISSING_EVENT_ID`
- `MALFORMED_EVENT`
- `UNSUPPORTED_PROVIDER`
- `VALIDATION_NOT_CONFIGURED`
- `LEGACY_GLOBAL_EVENT_COLLISION`
- `LEGACY_GLOBAL_RESERVATION_COLLISION`

## candidate_connection_id

`candidate_connection_id` deliberately has no FK. In short: deliberately no FK.

Reason: quarantine must be able to preserve a technical candidate identifier
even if the connection does not exist, was deleted, or was part of an invalid
mapping. It is evidence/reference only, not tenant authority. Runtime code must
not use `candidate_connection_id` to authorize reservation mutation.

## Security contract

The quarantine table is server-only:

- RLS enabled
- `PUBLIC`, `anon`, and `authenticated` privileges revoked
- no browser policies
- `service_role` receives required CRUD privileges when the role exists
- no Realtime publication membership

If a preexisting same-name quarantine table violates this contract, B1 blocks
instead of silently changing it.

## Migration-first rationale

P0-2B1 is safe as a migration-first stage because it only creates or reuses
compatible additive objects and supporting indexes. Old code can ignore them.
New code in P0-2B2 can then start using them for validated tenant resolution,
scoped idempotency and quarantine.

## Deferred composite FK

The final event tenant invariant will use a composite relationship from
`pms_webhook_events(connection_id, hotel_id)` to
`hotel_pms_connections(id, hotel_id)`.

That FK is deliberately deferred. Current runtime and dashboard code can still
physically delete PMS connections. Adding a restrictive composite FK before
hardening connection deletion could break production deletes. P0-2B2/P0-2B3
must change deletion semantics before the final FK is added.

## Coexisting identities

During transition, old and new event identities coexist:

- legacy: `(provider, external_event_id)`
- proposed: `(provider, connection_id, external_event_id)`

Therefore, two hotels using the same provider event id may still be blocked by
the legacy global unique index until final cutover. P0-2B2 runtime must detect
that collision, quarantine it with `LEGACY_GLOBAL_EVENT_COLLISION`, avoid
cross-tenant rereads and avoid reservation mutation.

Reservation identities have the same transition issue:

- legacy: `(pms_provider, pms_reservation_id)`
- proposed: `(hotel_id, pms_provider, pms_reservation_id)`

P0-2B2 must fail closed on old-global cross-tenant reservation conflicts and
must never reuse a row from one hotel for another hotel.

## Production preflight

`supabase/sql/preflight_p0_2b1_webhook_tenant_foundation.sql` is read-only. It
reports event, reservation, connection, quarantine, RLS, grant, policy, index,
FK, ownership marker and readiness diagnostics without selecting sensitive
values.

If a critical source relation is missing, preflight raises a controlled
fail-closed exception and that state is `BLOCKED`.

Preflight exposes explicit compatibility booleans, including:

- `quarantine_schema_compatible`
- `connection_composite_index_compatible`
- `event_connection_index_compatible`
- `event_scoped_unique_compatible`
- `reservation_scoped_unique_compatible`
- `critical_schema_compatible`

`critical_schema_compatible` is false for missing critical source schema,
incompatible same-name B1 objects, unsafe quarantine schema, wrong scoped unique
definitions, wrong reservation unique definitions or incompatible legacy
identity support.

`ready_for_p0_2b1_stage_a` means the additive foundation migration should not
be blocked by known schema, security, orphan, mismatch, proposed-key duplicate
or production-drift issues.

`readiness` is:

- `READY_FOR_STAGE_A` when no blockers or manual-review data states exist.
- `NEEDS_MANUAL_REVIEW` when nullable legacy rows exist but no foundation
  blocker exists.
- `BLOCKED` when browser access regressed on webhook events, connection/hotel
  mismatches exist, orphan connection ids exist, proposed-key duplicates exist,
  source schema is missing or incompatible, or existing B1 objects are
  incompatible.

## Rollback ownership

`supabase/sql/rollback_p0_2b1_webhook_tenant_foundation.sql` never drops by name
alone. For every object, rollback requires:

1. the object exists;
2. the object comment contains `STAYNEX_P0_2B1_OWNED_V1`;
3. the current catalog definition still matches the expected B1 definition.

Unowned preexisting compatible objects are skipped and preserved. Rollback does
not touch legacy unique identities, operational webhook events, reservations,
P0-2A secrets, or existing RLS/grants outside quarantine.

## Quarantine row guard

Before dropping a B1-owned quarantine table, rollback counts rows only.

If the table contains any rows, rollback raises an exception, does not drop the
table and does not delete rows. This protects operational evidence once B2 or
later runtime starts writing quarantine records.

## Pre-B2 rollback

Automatic B1 rollback is safe only while:

- B2 runtime has not started writing quarantine; or
- the B1-owned quarantine table is still empty.

In that state, rollback may remove empty B1-owned foundation objects after
ownership and exact-definition checks pass.

## Post-B2 rollback

Once quarantine contains operational rows, automatic table DROP is prohibited.
Operational rollback must preserve quarantine evidence and be manually planned.

If B2/new runtime depends on the B1 indexes, application rollback or traffic
stop must happen before foundation index rollback. The rollback script will not
silently destroy unowned infrastructure or reopen browser grants.

## Locking operational caution

B1 keeps the migration transactional and uses regular `CREATE INDEX` /
`CREATE UNIQUE INDEX`. Those statements can lock writes while indexes are
created, especially on `pms_webhook_events` and `reservations`.

Preflight preserves row-count reporting. Before real production execution, use
those counts to classify the operation:

- small tables: normal migration window is acceptable;
- large or active tables: needs operational caution and may require a planned
  maintenance window or a separately reviewed concurrent strategy.

Do not switch blindly to `CONCURRENTLY` because the current migration is
transactional.

## Pending P0-2B2/P0-2B3 work

P0-2B2 must harden runtime validation and mutation behavior:

- validate requests before tenant assignment
- require validated PMS connection before canonical event insert
- route unresolved/invalid input to quarantine
- use scoped event lookup/claim keys
- remove default/demo/first-hotel fallbacks from PMS mutation paths
- detect legacy global event/reservation collisions and fail closed
- change reservation upserts to tenant-scoped identity
- harden PMS connection deletion before final restrictive FK

P0-2B3 can then enforce final constraints:

- canonical event `hotel_id`, `connection_id`, and provider event id NOT NULL
- final composite tenant FK
- final scoped unique identities
- legacy global identity removal after cutover
