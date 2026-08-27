# Badar P0-2B2 - PMS Webhook Runtime Tenant Hardening

P0-2B2 hardens the runtime path that receives PMS webhooks after the P0-2B1
database foundation has been applied.

## Runtime contract

The Apaleo webhook processor now follows a fail-closed sequence:

1. Parse only safe request metadata.
2. Require configured webhook validation.
3. Resolve exactly one validated PMS connection.
4. Take `hotel_id` only from the validated connection.
5. Require an authoritative provider event id.
6. Check tenant-scoped reservation identity collisions before creating a
   canonical event when a reservation id is present.
7. Create or reuse the canonical event by
   `(provider, connection_id, external_event_id)`.
8. Claim processing with `id`, `provider`, `connection_id`, `hotel_id`, and a
   claimable status.
9. Fetch the reservation with the validated connection credentials.
10. Mutate reservations by `(hotel_id, pms_provider, pms_reservation_id)`.
11. Reconcile automation lifecycle using the scoped reservation.

If validation, connection resolution, event identity, or reservation identity
cannot be established safely, runtime writes a minimal quarantine row and does
not create a canonical event or mutate reservations.

## Quarantine

Runtime writes only the P0-2B1 allowlisted quarantine metadata:

- provider
- reason code
- status
- request hash
- event hash
- candidate connection id
- safe flags

It never writes raw request bodies, webhook payloads, guest data, contact data,
credentials, tokens, secrets, or provider error values. Hashes are one-way
SHA-256 over safe metadata only.

If quarantine writing itself fails, runtime still fails closed and performs no
event creation or reservation mutation.

## Live provider gate

No Apaleo signature scheme has been implemented in P0-2B2. Without an injected
official validation function or explicit test validation result, the runtime
quarantines the webhook with `VALIDATION_NOT_CONFIGURED`.

This intentionally keeps live webhook mutation blocked until the provider
validation contract is implemented and reviewed.

## Deferred

- No migration is included in P0-2B2.
- No backfill is included in P0-2B2.
- No B3 composite FK or NOT NULL enforcement is included in P0-2B2.
- No Supabase production access is required for this runtime change.
