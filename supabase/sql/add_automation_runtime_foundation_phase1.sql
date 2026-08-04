-- Automation Runtime Foundation - Phase 1
-- Manual migration only. Do not run against production until the Phase 1 code has
-- been deployed and existing scheduled_messages rows have been reviewed.
-- Recommended order:
-- 1. Run preflight_automation_runtime_foundation_phase1.sql in the target database.
-- 2. Resolve any duplicate non-null idempotency keys reported by the preflight.
-- 3. Run this additive migration during a controlled maintenance window.
-- 4. Keep rollback_automation_runtime_foundation_phase1.sql available for manual rollback.

alter table public.scheduled_messages
add column if not exists execution_mode text null;

alter table public.scheduled_messages
add column if not exists idempotency_key text null;

alter table public.scheduled_messages
add column if not exists runtime_version text null;

alter table public.scheduled_messages
add column if not exists source text null;

alter table public.scheduled_messages
add column if not exists creation_reason text null;

create unique index if not exists scheduled_messages_hotel_idempotency_unique
on public.scheduled_messages (hotel_id, idempotency_key)
where idempotency_key is not null;

create index if not exists scheduled_messages_execution_mode_idx
on public.scheduled_messages (execution_mode);

alter table public.automation_runs
add column if not exists execution_mode text null;

alter table public.automation_runs
add column if not exists idempotency_key text null;

alter table public.automation_runs
add column if not exists runtime_version text null;

alter table public.automation_runs
add column if not exists source text null;

alter table public.automation_runs
add column if not exists skip_reason text null;

create index if not exists automation_runs_idempotency_idx
on public.automation_runs (hotel_id, idempotency_key);

create index if not exists automation_runs_execution_mode_idx
on public.automation_runs (execution_mode);

comment on table public.scheduled_messages is
  'Canonical operational queue for Staynex automation message previews and future approved/live sends.';

comment on table public.automation_runs is
  'Canonical audit log of automation evaluation decisions, modes, statuses and skip reasons.';

comment on table public.ai_logs is
  'AI trace log for message generation, provider/model attribution and AI-related automation traceability only.';

comment on table public.automation_events is
  'Legacy reservation event timeline. Not an operational automation send queue.';

comment on column public.scheduled_messages.idempotency_key is
  'Deterministic Phase 1 key built from hotel, reservation/stay, canonical automation type, trigger occurrence and rule version. Backfill before enforcing live paths.';

comment on column public.scheduled_messages.execution_mode is
  'Execution mode: disabled, preview, approval_required, live_limited or live. Phase 1 writes preview only.';

comment on column public.automation_runs.execution_mode is
  'Decision mode separated from operational status. Phase 1 caps existing hotels and uncertified automations at preview.';

comment on column public.automation_runs.skip_reason is
  'Explicit reason for skipped or blocked automation decisions.';
