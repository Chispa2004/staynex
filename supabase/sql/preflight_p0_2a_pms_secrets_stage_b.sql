-- BADAR P0-2A Stage B secrets preflight.
-- Read-only. Do not select secret values; this only reports schema metadata,
-- counts, RLS state, policies, grants, and Stage B readiness.

create temporary table if not exists badar_p0_2a_stage_b_preflight_results (
  scope text not null,
  metric text not null,
  value text null
) on commit drop;

create temporary table if not exists badar_p0_2a_stage_b_preflight_summary (
  metric text not null,
  value text null
) on commit drop;

truncate table badar_p0_2a_stage_b_preflight_results;
truncate table badar_p0_2a_stage_b_preflight_summary;

do $$
declare
  connections_exists boolean;
  encrypted_webhook_secret_exists boolean := false;
  encrypted_webhook_secret_type text := null;
  webhook_secret_exists boolean := false;
  metric_value bigint;
  connections_rls_enabled boolean := false;
  dangerous_policy_count bigint := 0;
  browser_grant_count bigint := 0;
  service_role_expected_privilege_count bigint := 0;
  blockers text[] := '{}';
begin
  select to_regclass('public.hotel_pms_connections') is not null
    into connections_exists;

  insert into badar_p0_2a_stage_b_preflight_results(scope, metric, value)
  values ('hotel_pms_connections', 'table_exists', connections_exists::text);

  if not connections_exists then
    blockers := array_append(blockers, 'missing public.hotel_pms_connections');
  else
    execute 'select count(*) from public.hotel_pms_connections'
      into metric_value;
    insert into badar_p0_2a_stage_b_preflight_results values ('hotel_pms_connections', 'total_connections', metric_value::text);

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'hotel_pms_connections'
        and column_name = 'encrypted_webhook_secret'
    ) into encrypted_webhook_secret_exists;
    insert into badar_p0_2a_stage_b_preflight_results values (
      'hotel_pms_connections',
      'encrypted_webhook_secret_column_exists',
      encrypted_webhook_secret_exists::text
    );

    if encrypted_webhook_secret_exists then
      select data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'hotel_pms_connections'
        and column_name = 'encrypted_webhook_secret'
      into encrypted_webhook_secret_type;

      insert into badar_p0_2a_stage_b_preflight_results values (
        'hotel_pms_connections',
        'encrypted_webhook_secret_column_type',
        encrypted_webhook_secret_type
      );

      if encrypted_webhook_secret_type is distinct from 'text' then
        blockers := array_append(blockers, 'encrypted_webhook_secret exists with non-text type');
      end if;

      execute 'select count(*) from public.hotel_pms_connections where encrypted_webhook_secret is not null'
        into metric_value;
      insert into badar_p0_2a_stage_b_preflight_results values ('hotel_pms_connections', 'encrypted_webhook_secret_non_null_count', metric_value::text);
    else
      blockers := array_append(blockers, 'missing encrypted_webhook_secret');
    end if;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'hotel_pms_connections'
        and column_name = 'webhook_secret'
    ) into webhook_secret_exists;
    insert into badar_p0_2a_stage_b_preflight_results values (
      'hotel_pms_connections',
      'webhook_secret_column_exists',
      webhook_secret_exists::text
    );

    if webhook_secret_exists then
      execute 'select count(*) from public.hotel_pms_connections where webhook_secret is not null'
        into metric_value;
      insert into badar_p0_2a_stage_b_preflight_results values ('hotel_pms_connections', 'webhook_secret_non_null_count', metric_value::text);
      insert into badar_p0_2a_stage_b_preflight_results values ('hotel_pms_connections', 'plaintext_webhook_secret_count', metric_value::text);

      if metric_value > 0 then
        blockers := array_append(blockers, 'legacy plaintext webhook_secret values remain');
      end if;
    else
      blockers := array_append(blockers, 'webhook_secret already missing before Stage B drop');
    end if;
  end if;

  select coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'hotel_pms_connections'
  ), false) into connections_rls_enabled;
  insert into badar_p0_2a_stage_b_preflight_results values ('hotel_pms_connections', 'rls_enabled', connections_rls_enabled::text);

  if not connections_rls_enabled then
    blockers := array_append(blockers, 'RLS disabled on public.hotel_pms_connections');
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
  insert into badar_p0_2a_stage_b_preflight_results values ('hotel_pms_connections', 'dangerous_browser_policy_count', dangerous_policy_count::text);

  if dangerous_policy_count > 0 then
    blockers := array_append(blockers, 'dangerous browser policies on public.hotel_pms_connections require manual review');
  end if;

  select count(*)
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'hotel_pms_connections'
    and grantee in ('PUBLIC', 'anon', 'authenticated')
  into browser_grant_count;
  insert into badar_p0_2a_stage_b_preflight_results values ('hotel_pms_connections', 'browser_grant_count', browser_grant_count::text);

  if browser_grant_count > 0 then
    blockers := array_append(blockers, 'browser grants on public.hotel_pms_connections remain');
  end if;

  select count(distinct privilege_type)
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'hotel_pms_connections'
    and grantee = 'service_role'
    and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  into service_role_expected_privilege_count;
  insert into badar_p0_2a_stage_b_preflight_results values (
    'hotel_pms_connections',
    'service_role_expected_privilege_count',
    service_role_expected_privilege_count::text
  );

  if service_role_expected_privilege_count < 4 then
    blockers := array_append(blockers, 'service_role missing expected PMS connection privileges');
  end if;

  insert into badar_p0_2a_stage_b_preflight_summary values (
    'schema_compatible',
    (connections_exists and encrypted_webhook_secret_exists and encrypted_webhook_secret_type = 'text' and webhook_secret_exists)::text
  );
  insert into badar_p0_2a_stage_b_preflight_summary values (
    'ready_for_stage_b',
    (coalesce(array_length(blockers, 1), 0) = 0)::text
  );
  insert into badar_p0_2a_stage_b_preflight_summary values (
    'readiness',
    case when coalesce(array_length(blockers, 1), 0) = 0 then 'READY' else 'NOT READY' end
  );
  insert into badar_p0_2a_stage_b_preflight_summary values (
    'blockers',
    case when coalesce(array_length(blockers, 1), 0) = 0 then 'none' else array_to_string(blockers, '; ') end
  );
end $$;

insert into badar_p0_2a_stage_b_preflight_results(scope, metric, value)
select
  expected_grants.table_name,
  expected_grants.metric_name,
  count(grants.privilege_type)::text
from (
  values
    ('hotel_pms_connections', 'PUBLIC', 'grant_count_public'),
    ('hotel_pms_connections', 'anon', 'grant_count_anon'),
    ('hotel_pms_connections', 'authenticated', 'grant_count_authenticated'),
    ('hotel_pms_connections', 'service_role', 'grant_count_service_role')
) as expected_grants(table_name, role_name, metric_name)
left join information_schema.role_table_grants grants
  on grants.table_schema = 'public'
  and grants.table_name = expected_grants.table_name
  and grants.grantee = expected_grants.role_name
group by expected_grants.table_name, expected_grants.metric_name;

select metric, value
from badar_p0_2a_stage_b_preflight_summary
order by metric;

select scope, metric, value
from badar_p0_2a_stage_b_preflight_results
order by scope, metric;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'hotel_pms_connections'
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'hotel_pms_connections'
order by tablename, policyname;

select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'hotel_pms_connections'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;
