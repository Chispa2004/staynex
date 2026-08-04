-- Automation Runtime Foundation - Phase 1 rollback
-- Manual use only. This removes additive Phase 1 columns and indexes.
-- Review downstream dashboards before running because execution/idempotency audit metadata
-- stored in dedicated columns will no longer be queryable after rollback.

begin;

drop index if exists public.scheduled_messages_hotel_idempotency_unique;
drop index if exists public.scheduled_messages_execution_mode_idx;
drop index if exists public.automation_runs_idempotency_idx;
drop index if exists public.automation_runs_execution_mode_idx;

alter table public.scheduled_messages
drop column if exists execution_mode,
drop column if exists idempotency_key,
drop column if exists runtime_version,
drop column if exists source,
drop column if exists creation_reason;

alter table public.automation_runs
drop column if exists execution_mode,
drop column if exists idempotency_key,
drop column if exists runtime_version,
drop column if exists source,
drop column if exists skip_reason;

commit;
