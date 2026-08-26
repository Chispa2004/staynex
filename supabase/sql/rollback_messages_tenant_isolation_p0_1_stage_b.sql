-- BADAR P0-1 - Stage B rollback
--
-- Returns the database from final contract state to Stage A expanded state.
-- This keeps messages.hotel_id, Stage A indexes and the composite FK so the
-- new application code can continue to run while Stage B is investigated.
-- Production Stage A baseline has messages RLS enabled with zero policies, so
-- this rollback intentionally preserves RLS enabled and fail-closed.
--
-- Full rollback order when needed:
--   1. Roll application code back if removing messages.hotel_id.
--   2. Run this Stage B rollback.
--   3. Run Stage A rollback only after code no longer depends on hotel_id.

drop policy if exists staynex_tenant_read_messages on public.messages;
drop policy if exists staynex_tenant_insert_messages on public.messages;
drop policy if exists staynex_tenant_update_messages on public.messages;
drop policy if exists staynex_tenant_delete_messages on public.messages;

alter table public.messages enable row level security;

alter table public.messages
  alter column hotel_id drop not null;

comment on column public.messages.hotel_id is
  'BADAR P0-1 Stage B rollback: nullable tenant owner retained from Stage A expand state.';
