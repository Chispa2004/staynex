-- BADAR P0-2A Stage A rollback.
-- Run order:
--   1. Roll back application code first.
--   2. Review the Stage A preflight output captured before migration.
--   3. In the same SQL session, confirm code rollback:
--        set badar.stage_a_code_rollback_confirmed = 'true';
--      If encrypted_webhook_secret contains values and you still accept dropping
--      the Stage A encrypted-copy column after code rollback:
--        set badar.allow_drop_encrypted_webhook_secret_with_values = 'true';
--
-- This rollback never disables RLS, never grants anon/authenticated, never touches
-- plaintext webhook_secret values, and never deletes PMS rows. Prior browser grants
-- or policies must only be restored manually from reviewed preflight evidence.
-- Do not run this DB rollback first while Stage A application code is deployed.

begin;

do $$
declare
  code_rollback_confirmed text;
  encrypted_column_exists boolean;
  encrypted_value_count bigint := 0;
begin
  code_rollback_confirmed := current_setting('badar.stage_a_code_rollback_confirmed', true);

  if code_rollback_confirmed is distinct from 'true' then
    raise exception 'Refusing Stage A DB rollback until application code rollback is confirmed. Set badar.stage_a_code_rollback_confirmed = true in this session after code rollback.';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hotel_pms_connections'
      and column_name = 'encrypted_webhook_secret'
  ) into encrypted_column_exists;

  if encrypted_column_exists then
    execute 'select count(*) from public.hotel_pms_connections where encrypted_webhook_secret is not null'
      into encrypted_value_count;

    if encrypted_value_count > 0
      and current_setting('badar.allow_drop_encrypted_webhook_secret_with_values', true) is distinct from 'true' then
      raise exception 'Refusing to drop encrypted_webhook_secret because % encrypted values exist. Confirm code rollback and set badar.allow_drop_encrypted_webhook_secret_with_values = true if dropping the Stage A encrypted-copy column is acceptable.', encrypted_value_count;
    end if;
  end if;
end $$;

alter table public.hotel_pms_connections
  drop column if exists encrypted_webhook_secret;

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
