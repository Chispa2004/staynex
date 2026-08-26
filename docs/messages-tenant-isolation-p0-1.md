# Badar P0-1 - Messages / Inbox Tenant Isolation

## Original Vulnerability

`messages` was tenant-derived only through `conversation_id`. The table did not store `hotel_id`, had no tenant-aware RLS, and the Inbox browser Realtime subscription listened to all `messages` inserts without a hotel filter. A dashboard session could therefore receive Realtime events for another hotel.

## Tenant Invariant

Every message belongs to exactly one hotel:

```text
messages.conversation_id -> conversations.id -> conversations.hotel_id
messages.hotel_id = conversations.hotel_id
```

Application code never accepts a freely chosen message tenant from the client. `createMessage` resolves the tenant from `conversations.hotel_id`; a caller-supplied hotel context is only a mismatch check.

## Phase A - Expand

Run `supabase/sql/preflight_messages_tenant_isolation_p0_1_stage_a.sql` first.

Then run `supabase/sql/add_messages_tenant_isolation_p0_1_stage_a_expand.sql`.

Stage A is backward-compatible with old application instances:

- Adds `messages.hotel_id uuid null`.
- Backfills from `conversations.hotel_id`.
- Aborts on existing orphan messages or conversations without hotel.
- Adds the tenant index and composite FK infrastructure.
- Keeps `hotel_id` nullable.
- Does not enable new restrictive `messages` RLS.

PostgreSQL composite FK semantics allow legacy rows with `messages.hotel_id = null` during this phase. Non-null values must match `conversations(id, hotel_id)`.

## Current Production Expanded State

Stage A has been applied and verified in production:

- `messages.hotel_id` exists and remains nullable by Stage A contract.
- 877/877 existing messages are backfilled.
- There are zero orphan messages, zero conversations with null hotel, and zero tenant mismatches.
- Stage A composite FK, tenant index and `conversations(id, hotel_id)` unique index exist.
- `public.messages` is present in the `supabase_realtime` publication.
- `messages` RLS is already enabled, forced RLS is false, and `messages` has zero policies.

This pre-Stage-B RLS baseline is fail-closed: anon/authenticated direct table access is deny-all, while backend service-role writes continue through the intended RLS bypass.

## Deploy

After Stage A verification, deploy the new application code:

- `createMessage` derives `hotel_id` from `conversations.hotel_id`.
- Manual send requires active hotel context.
- Demo/onboarding direct inserts include the validated hotel fixture id.
- Inbox and TicketDetail Realtime use `hotel_id=eq.<activeHotelId>`.
- Payload mismatches are ignored.

During this short controlled window, DB RLS is enabled but not final because the tenant-aware SELECT policy does not exist yet. Direct browser Realtime on `messages` may remain deny-all until Stage B creates the SELECT policy. This is an acceptable temporary live-refresh degradation, not an isolation risk. Do not disable RLS or create a broad temporary policy to recover Realtime.

## Phase B - Contract

Run `supabase/sql/preflight_messages_tenant_isolation_p0_1_stage_b.sql`.

Then run `supabase/sql/add_messages_tenant_isolation_p0_1_stage_b_contract.sql`.

Stage B preflight must report ready only when Stage A infrastructure exists, the new application code is deployed, unresolved message counts are zero, `staynex_can_read_hotel` is available, and `public.messages` is present in the `supabase_realtime` publication.

Stage B:

- Re-backfills `messages.hotel_id is null` from `conversations.hotel_id`.
- Aborts on orphan, missing conversation, null conversation hotel, null message hotel, or tenant mismatch.
- Sets `messages.hotel_id not null`.
- Enables `messages` RLS.
- Creates authenticated SELECT policy using `staynex_can_read_hotel(hotel_id)`.
- Does not create authenticated INSERT/UPDATE/DELETE policies.

Backend service-role writes remain functional through the intended RLS bypass.

## Verification

Run `supabase/sql/verify_messages_tenant_isolation_p0_1_stage_b.sql` after Stage B.

It checks:

- `hotel_id null = 0`.
- orphan count = 0.
- tenant mismatch count = 0.
- RLS enabled.
- expected SELECT policy exists.
- authenticated write policies are absent.
- tenant index/FK/publication remain present.

Real DB RLS behavior must be verified after Stage B in Supabase. Static SQL tests only validate repository contract and expected SQL text.

## Rollback

If Stage B fails after code deploy:

1. Run `supabase/sql/rollback_messages_tenant_isolation_p0_1_stage_b.sql`.
2. This returns to Stage A expanded state by dropping P0-1 policies, preserving `messages` RLS enabled, and dropping `NOT NULL`.
3. It keeps `messages.hotel_id`, tenant index and composite FK so new code can continue running.
4. With the Stage B SELECT policy removed, direct anon/authenticated access returns to the production Stage A deny-all baseline.

For full rollback:

1. Roll application code back so it no longer depends on `messages.hotel_id`.
2. Run Stage B rollback if Stage B was applied.
3. Run `supabase/sql/rollback_messages_tenant_isolation_p0_1_stage_a.sql` to remove Stage A infrastructure and `messages.hotel_id`.

## RLS Model

Authenticated browser clients receive SELECT-only access through:

```text
staynex_can_read_hotel(messages.hotel_id)
```

Authenticated browser writes are intentionally blocked by omission of INSERT/UPDATE/DELETE policies. Legitimate writes go through backend service-role flows.

Platform/support read behavior follows the existing `staynex_can_read_hotel` helper semantics. No additional global access is introduced.

## Tests

`npm run test:messages-tenant-isolation` verifies:

- Stage A/Stage B SQL contract.
- Backfill source and unresolved guards.
- SELECT-only RLS design.
- Functional `resolveConversationHotelId` and `createMessage` behavior with a fake Supabase client.
- Insert error propagation.
- Direct demo/onboarding insert hotel scoping.
- Realtime hotel filter, no global subscription and payload defense.
