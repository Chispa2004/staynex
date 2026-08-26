-- BADAR P0-2A Stage A: PMS secrets and webhook events are server-only.
-- Safe with old code that already uses server-side Supabase clients for PMS paths.
-- This migration is intentionally additive for secrets: it does not remove or backfill
-- public.hotel_pms_connections.webhook_secret.
-- It does not drop unknown pre-existing policies. Run preflight first and pause for
-- manual review if dangerous browser policies are reported.

begin;

alter table public.hotel_pms_connections
  add column if not exists encrypted_webhook_secret text null;

alter table public.hotel_pms_connections enable row level security;
alter table public.pms_webhook_events enable row level security;

revoke all privileges on table public.hotel_pms_connections from public;
revoke all privileges on table public.hotel_pms_connections from anon;
revoke all privileges on table public.hotel_pms_connections from authenticated;

revoke all privileges on table public.pms_webhook_events from public;
revoke all privileges on table public.pms_webhook_events from anon;
revoke all privileges on table public.pms_webhook_events from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.hotel_pms_connections to service_role;
    grant select, insert, update, delete on table public.pms_webhook_events to service_role;
  end if;
end $$;

commit;
