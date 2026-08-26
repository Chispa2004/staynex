# Badar P0-2A PMS Secrets Isolation Stage A

## Original Vulnerability

`hotel_pms_connections` stored PMS client credentials plus legacy `webhook_secret` material on rows that had no RLS/grant hardening. Platform helpers also had paths that selected and returned raw PMS connection rows. A browser or over-broad API response could therefore expose plaintext secrets, ciphertext, or encrypted credential containers.

`pms_webhook_events` also had no server-only RLS/grant posture and stores raw PMS webhook payloads. Stage A does not change payload shape, but it makes the table server-only.

## Server-Only Target

Stage A treats both PMS tables as server-only:

- `public.hotel_pms_connections`
- `public.pms_webhook_events`

Dashboard and platform UI must continue through server APIs. No authenticated browser role should be granted direct table access.

## Secret Inventory

The PMS serializer always removes these top-level fields before crossing an API, platform, health, audit, or backend response boundary:

- `encrypted_client_secret`
- `webhook_secret`
- `encrypted_webhook_secret`
- `credentials_encrypted`
- `client_secret`
- `api_key`
- `access_token`
- `refresh_token`
- `authorization`
- `password`
- secret-like fields

Nested metadata is recursively sanitized, including `metadata.credentials_encrypted`, `metadata.api_key`, `metadata.secret`, `metadata.token`, and `metadata.password`.

## encrypted_webhook_secret

Stage A adds `hotel_pms_connections.encrypted_webhook_secret text null`.

It is additive, nullable, has no default, and is compatible with old code. Stage A does not remove or backfill `webhook_secret` in SQL.

## Migration-First Compatibility

Stage A must be rolled out migration-first. The new application code selects `encrypted_webhook_secret`, so deploying code before the migration can fail while the column is still absent.

Migration-first is compatible with the existing production code because:

- the new `encrypted_webhook_secret` column is nullable and has no default;
- old code ignores `encrypted_webhook_secret`;
- old code can continue using legacy `webhook_secret` during the short migration-to-code window;
- RLS/grant hardening does not break legitimate production paths because PMS access is service-role/server-side;
- browser clients do not require direct table access.

Keep the window between the Stage A migration and application deployment short.

## Dual-Read Temporary Contract

Internal server-only reads use this order:

1. If `encrypted_webhook_secret` exists, decrypt it with the existing PMS AES-256-GCM primitive.
2. Else, if legacy `webhook_secret` exists, use it internally as a temporary fallback.
3. Else, no webhook secret is configured.

The plaintext fallback is marked legacy in code and must be removed in Stage B.

## Serializer

`shared/pms/safe-connection.js` is the canonical PMS serializer. It supports limited surfaces:

- `tenant_settings`
- `platform_summary`
- `health`
- `audit`

Unknown surfaces fall back to the strict audit surface. Safe configured flags may be returned, but ciphertext is never returned as proof:

- `credential_configured`
- `webhook_secret_configured`
- `has_client_secret`
- `api_key_configured`

## Platform Redaction

`dashboard/lib/platform.js` no longer returns `raw.pmsConnections`. Overview returns `raw.pmsConnectionSummaries`, and detail responses use safe PMS DTOs. System health, executive dashboard, Go-Live readiness, PMS health checks, and platform Sheets sync use explicit PMS selects plus the canonical serializer before output.

## Audit Rules

PMS audit `oldValues` and `newValues` must use safe DTOs. Audit summaries may include provider, status, enabled state, and configured booleans. They must not include plaintext, ciphertext, or raw credential metadata.

## RLS And Grants

Stage A migration:

- enables RLS on `hotel_pms_connections`;
- enables RLS on `pms_webhook_events`;
- revokes table privileges from `public`, `anon`, and `authenticated`;
- grants service-role table privileges;
- creates no browser policies.

Service-role paths continue to work through Supabase service credentials and RLS bypass.

## Preflight

Run `supabase/sql/preflight_p0_2a_pms_secrets_isolation_stage_a.sql` before migration in production review. It reports table existence, counts, provider/status distributions, RLS state, policies, grants, and an explicit `ready_for_stage_a` summary. It never selects `webhook_secret` values or webhook payload values.

## Stage A Rollout

Recommended rollout:

1. Run the production preflight.
2. Review the result and confirm `ready_for_stage_a`.
3. Apply `supabase/sql/p0_2a_pms_secrets_isolation_stage_a.sql`.
4. Verify schema, RLS, and grants.
5. Deploy application code.
6. Smoke test PMS API, dashboard, platform, health, audit, and Sheets surfaces.
7. Production dry-run inspected 4 rows.
8. Production dry-run found candidates = 0, plaintext + encrypted = 0,
   empty/no secret = 4, failures = 0, and mutations = 0.
9. Mutating backfill was not required and was not executed.
10. The Stage A backfill utility was retired before Stage B cutover work.

Do not use a code-first rollout for P0-2A. If preflight shows dangerous browser policies, pause for manual review before production migration. Direct browser grants are visible in preflight and are revoked by the migration, but unexpected grant drift should still be reviewed before proceeding.

## Backfill

RETIRED AFTER CLEAN PRODUCTION DRY-RUN.

The Stage A backfill tool existed only as a one-off transition utility. The
production dry-run inspected 4 rows, found candidates = 0, plaintext + encrypted
= 0, empty/no secret = 4, failures = 0, and mutations = 0.

Mutating backfill was never executed. No secret values were documented. The
utility was deleted before Stage B cutover so no executable reader remains for
the legacy plaintext `webhook_secret` column.

## Rollback

Rollback order:

1. Roll back application code first if Stage A code has already been deployed.
2. Review captured preflight output.
3. Run `supabase/sql/rollback_p0_2a_pms_secrets_isolation_stage_a.sql` only with the explicit session confirmation documented in that file.

Do not run the DB rollback first while new code is deployed: removing `encrypted_webhook_secret` before the code rollback can break selectors that already depend on that column.

The rollback is conservative: it never disables RLS and never restores browser grants automatically because production drift must be reviewed before reopening direct access.

## Stage B Handoff

Stage B takes over the remaining secrets cutover:

- remove plaintext `webhook_secret` after code-first deployment and DB guards;
- remove the legacy plaintext fallback;
- keep `pms_webhook_events.hotel_id` hardening for P0-2B;
- skip mutating backfill because production dry-run found no candidates;
- complete secret rotation only if exposure is confirmed or required by policy.

Stage A alone does not claim plaintext has been removed.
