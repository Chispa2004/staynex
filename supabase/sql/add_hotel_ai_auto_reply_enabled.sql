-- Canonical hotel AI auto-reply kill switch.
-- Manual production rollout only.
--
-- Rationale:
-- - explicit durable column on public.hotels
-- - tenant-scoped by hotel row
-- - fail closed by default
-- - does not depend on nonexistent hotels.metadata
-- - does not overload hotel_live_mode

alter table public.hotels
  add column if not exists ai_auto_reply_enabled boolean not null default false;

comment on column public.hotels.ai_auto_reply_enabled is
  'Canonical tenant-scoped hotel AI auto-reply kill switch. Defaults false to fail closed; independent from hotel_live_mode.';
