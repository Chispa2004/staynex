# BADAR P0-2A Stage B Secrets Cutover

Stage B removes application support for the legacy plaintext PMS webhook secret
column after Stage A has already isolated PMS tables and introduced
`encrypted_webhook_secret`.

## Production Basis

Production Stage A status before this cutover:

- `encrypted_webhook_secret` exists and is nullable.
- `hotel_pms_connections` and `pms_webhook_events` have RLS enabled.
- Browser grants are zero.
- Dangerous browser policies are zero.
- Service-role access is preserved.
- Stage A code and hotfix `11c7eb8` are deployed and smoke-tested.
- Backfill dry-run inspected 4 rows.
- Backfill dry-run found plaintext-only candidates = 0.
- Backfill dry-run found plaintext + encrypted = 0.
- Backfill dry-run found empty/no secret = 4.
- Backfill dry-run found failures = 0.
- Backfill dry-run reported mutations = 0.

No mutating backfill is needed for Stage B based on that dry-run. The Stage A
backfill utility is RETIRED AFTER CLEAN PRODUCTION DRY-RUN and was deleted before
Stage B code deployment. No secret values are documented.

## Code Contract

Stage B application code must not select `webhook_secret` from
`hotel_pms_connections`.

Runtime webhook secret resolution is encrypted-only:

1. If `encrypted_webhook_secret` exists, decrypt it with the PMS encryption
   primitive.
2. Otherwise, resolve no webhook secret.

There is no plaintext fallback in Stage B application code.

API input can continue accepting a request field named `webhook_secret` for
backward-compatible clients, but persistence must write only
`encrypted_webhook_secret`.

The PMS serializer continues to strip `webhook_secret`, `encrypted_webhook_secret`,
`encrypted_client_secret`, credential containers, and nested secret-shaped keys
defensively.

## Rollout

Stage B is CODE FIRST.

Required production order:

1. Deploy Stage B application code.
2. Smoke-test PMS Settings, Platform, Health/Readiness, and webhook/provider paths.
3. Run `supabase/sql/preflight_p0_2a_pms_secrets_stage_b.sql`.
4. Proceed only if `ready_for_stage_b = true`.
5. Run `supabase/sql/p0_2a_pms_secrets_stage_b.sql`.
6. Verify the legacy `webhook_secret` column is gone and app surfaces remain healthy.

Do not use a migration-first rollout for Stage B. Stage A application code can still
select `webhook_secret`, so dropping the column before deploying Stage B code can
break production.

## Stage B SQL

`supabase/sql/preflight_p0_2a_pms_secrets_stage_b.sql` is read-only and reports
only metadata and counts. It does not select or print secret values.

`supabase/sql/p0_2a_pms_secrets_stage_b.sql` drops only
`public.hotel_pms_connections.webhook_secret` after guard checks pass.

It does not modify:

- `encrypted_client_secret`
- `encrypted_webhook_secret`
- `metadata`
- PMS rows
- event `hotel_id`
- `pms_webhook_events`

## Rollback

If the DB drop has been applied and code rollback is required:

1. Run `supabase/sql/rollback_p0_2a_pms_secrets_stage_b.sql` with
   `badar.stage_b_db_rollback_confirmed = true`.
2. Roll back application code only after the nullable legacy column exists again.

Rollback re-adds `webhook_secret text null` only. It cannot reconstruct historical
plaintext values, and the production dry-run basis showed there were none.

## Out Of Scope

PMS webhook event tenant hardening is not part of Stage B. Do not backfill event
`hotel_id`, quarantine events, or make event `hotel_id` not null here.
