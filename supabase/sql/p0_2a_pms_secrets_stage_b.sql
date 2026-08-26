-- BADAR P0-2A Stage B secrets cutover.
-- Rollout order is CODE FIRST:
--   1. Deploy Stage B application code that no longer selects webhook_secret.
--   2. Run supabase/sql/preflight_p0_2a_pms_secrets_stage_b.sql.
--   3. Apply this migration only when ready_for_stage_b = true.
--
-- This migration drops only the legacy plaintext webhook_secret column.
-- It does not modify encrypted_client_secret, encrypted_webhook_secret, metadata,
-- PMS rows, grants, or policies.

begin;

do $$
declare
  connections_exists boolean;
  encrypted_column_exists boolean;
  encrypted_column_type text;
  legacy_column_exists boolean;
  legacy_non_null_count bigint := 0;
  rls_enabled boolean := false;
  dangerous_policy_count bigint := 0;
  browser_grant_count bigint := 0;
begin
  select to_regclass('public.hotel_pms_connections') is not null
    into connections_exists;

  if not connections_exists then
    raise exception 'Refusing Stage B cutover because public.hotel_pms_connections is missing.';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hotel_pms_connections'
      and column_name = 'encrypted_webhook_secret'
  ) into encrypted_column_exists;

  if not encrypted_column_exists then
    raise exception 'Refusing Stage B cutover because encrypted_webhook_secret is missing.';
  end if;

  select data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'hotel_pms_connections'
    and column_name = 'encrypted_webhook_secret'
  into encrypted_column_type;

  if encrypted_column_type is distinct from 'text' then
    raise exception 'Refusing Stage B cutover because encrypted_webhook_secret has unexpected type: %.', encrypted_column_type;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hotel_pms_connections'
      and column_name = 'webhook_secret'
  ) into legacy_column_exists;

  if legacy_column_exists then
    execute 'select count(*) from public.hotel_pms_connections where webhook_secret is not null'
      into legacy_non_null_count;

    if legacy_non_null_count > 0 then
      raise exception 'Refusing Stage B cutover because % legacy plaintext webhook_secret values remain.', legacy_non_null_count;
    end if;
  end if;

  select coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'hotel_pms_connections'
  ), false) into rls_enabled;

  if not rls_enabled then
    raise exception 'Refusing Stage B cutover because RLS is disabled on public.hotel_pms_connections.';
  end if;

  select count(*)
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'hotel_pms_connections'
    and exists (
      select 1
      from unnest(p.roles) as policy_role(role_name)
      where policy_role.role_name::text in ('public', 'anon', 'authenticated')
    )
  into dangerous_policy_count;

  if dangerous_policy_count > 0 then
    raise exception 'Refusing Stage B cutover because dangerous browser policies remain on public.hotel_pms_connections.';
  end if;

  select count(*)
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'hotel_pms_connections'
    and grantee in ('PUBLIC', 'anon', 'authenticated')
  into browser_grant_count;

  if browser_grant_count > 0 then
    raise exception 'Refusing Stage B cutover because browser grants remain on public.hotel_pms_connections.';
  end if;
end $$;

alter table public.hotel_pms_connections
  drop column if exists webhook_secret;

commit;
