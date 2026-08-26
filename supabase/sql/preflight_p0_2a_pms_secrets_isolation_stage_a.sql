-- BADAR P0-2A Stage A preflight.
-- Read-only. Do not select secret or payload values; this only reports counts,
-- distributions, RLS state, policies, grants, and Stage A readiness.

create temporary table if not exists badar_p0_2a_preflight_results (
  scope text not null,
  metric text not null,
  value text null
) on commit drop;

create temporary table if not exists badar_p0_2a_preflight_distributions (
  scope text not null,
  dimension text not null,
  label text null,
  total_rows bigint not null
) on commit drop;

create temporary table if not exists badar_p0_2a_preflight_summary (
  metric text not null,
  value text null
) on commit drop;

truncate table badar_p0_2a_preflight_results;
truncate table badar_p0_2a_preflight_distributions;
truncate table badar_p0_2a_preflight_summary;

insert into badar_p0_2a_preflight_results(scope, metric, value)
values
  ('hotel_pms_connections', 'table_exists', (to_regclass('public.hotel_pms_connections') is not null)::text),
  ('pms_webhook_events', 'table_exists', (to_regclass('public.pms_webhook_events') is not null)::text);

do $$
declare
  hotel_pms_connections_exists boolean;
  pms_webhook_events_exists boolean;
  encrypted_webhook_secret_exists boolean := false;
  encrypted_webhook_secret_type text := null;
  credentials_encrypted_exists boolean := false;
  metric_value bigint;
  connections_rls_enabled boolean := false;
  events_rls_enabled boolean := false;
  connection_dangerous_policy_count bigint := 0;
  event_dangerous_policy_count bigint := 0;
  connection_dangerous_grant_count bigint := 0;
  event_dangerous_grant_count bigint := 0;
  blockers text[] := '{}';
begin
  select to_regclass('public.hotel_pms_connections') is not null
    into hotel_pms_connections_exists;
  select to_regclass('public.pms_webhook_events') is not null
    into pms_webhook_events_exists;

  if not hotel_pms_connections_exists then
    blockers := array_append(blockers, 'missing public.hotel_pms_connections');
  end if;

  if not pms_webhook_events_exists then
    blockers := array_append(blockers, 'missing public.pms_webhook_events');
  end if;

  if hotel_pms_connections_exists then
    execute 'select count(*) from public.hotel_pms_connections'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'total_rows', metric_value::text);
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'total_connections', metric_value::text);

    execute 'select count(*) from public.hotel_pms_connections where hotel_id is null'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'hotel_id_null_count', metric_value::text);
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'null_hotel_id', metric_value::text);

    execute 'select count(*) from public.hotel_pms_connections where encrypted_client_secret is not null'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'encrypted_client_secret_non_null_count', metric_value::text);
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'encrypted_client_secret_count', metric_value::text);

    execute 'select count(*) from public.hotel_pms_connections where webhook_secret is null'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'webhook_secret_null_count', metric_value::text);

    execute 'select count(*) from public.hotel_pms_connections where webhook_secret is not null'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'webhook_secret_non_null_count', metric_value::text);
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'plaintext_webhook_secret_count', metric_value::text);

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'hotel_pms_connections'
        and column_name = 'encrypted_webhook_secret'
    ) into encrypted_webhook_secret_exists;
    insert into badar_p0_2a_preflight_results values (
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

      insert into badar_p0_2a_preflight_results values (
        'hotel_pms_connections',
        'encrypted_webhook_secret_column_type',
        encrypted_webhook_secret_type
      );

      if encrypted_webhook_secret_type is distinct from 'text' then
        blockers := array_append(blockers, 'encrypted_webhook_secret exists with non-text type');
      end if;

      execute 'select count(*) from public.hotel_pms_connections where encrypted_webhook_secret is not null'
        into metric_value;
      insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'encrypted_webhook_secret_non_null_count', metric_value::text);
    end if;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'hotel_pms_connections'
        and column_name = 'credentials_encrypted'
    ) into credentials_encrypted_exists;
    insert into badar_p0_2a_preflight_results values (
      'hotel_pms_connections',
      'credentials_encrypted_column_exists',
      credentials_encrypted_exists::text
    );

    if credentials_encrypted_exists then
      execute 'select count(*) from public.hotel_pms_connections where credentials_encrypted is not null and credentials_encrypted <> ''{}''::jsonb'
        into metric_value;
      insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'credentials_encrypted_non_empty_count', metric_value::text);
    end if;

    execute 'select count(*) from public.hotel_pms_connections where metadata ? ''credentials_encrypted'''
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'metadata_credentials_encrypted_count', metric_value::text);

    execute 'insert into badar_p0_2a_preflight_distributions(scope, dimension, label, total_rows)
      select ''hotel_pms_connections'', ''provider'', coalesce(provider::text, ''null''), count(*)
      from public.hotel_pms_connections
      group by provider';
  end if;

  if pms_webhook_events_exists then
    execute 'select count(*) from public.pms_webhook_events'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'total_rows', metric_value::text);
    insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'total_events', metric_value::text);

    execute 'select count(*) from public.pms_webhook_events where hotel_id is null'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'hotel_id_null_count', metric_value::text);
    insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'null_hotel_id', metric_value::text);

    execute 'select count(*) from public.pms_webhook_events where connection_id is null'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'connection_id_null_count', metric_value::text);
    insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'null_connection_id', metric_value::text);

    execute 'select count(*) from public.pms_webhook_events where payload is not null and payload <> ''{}''::jsonb'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'payload_presence_count', metric_value::text);

    execute 'select count(*) from public.pms_webhook_events where external_event_id is null'
      into metric_value;
    insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'external_event_id_null_count', metric_value::text);

    execute 'insert into badar_p0_2a_preflight_distributions(scope, dimension, label, total_rows)
      select ''pms_webhook_events'', ''provider'', coalesce(provider::text, ''null''), count(*)
      from public.pms_webhook_events
      group by provider';

    execute 'insert into badar_p0_2a_preflight_distributions(scope, dimension, label, total_rows)
      select ''pms_webhook_events'', ''status'', coalesce(status::text, ''null''), count(*)
      from public.pms_webhook_events
      group by status';
  end if;

  select coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'hotel_pms_connections'
  ), false) into connections_rls_enabled;

  select coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'pms_webhook_events'
  ), false) into events_rls_enabled;

  insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'rls_enabled', connections_rls_enabled::text);
  insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'rls_enabled', events_rls_enabled::text);

  select count(*)
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'hotel_pms_connections'
    and exists (
      select 1
      from unnest(p.roles) as policy_role(role_name)
      where policy_role.role_name::text in ('public', 'anon', 'authenticated')
    )
  into connection_dangerous_policy_count;

  select count(*)
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'pms_webhook_events'
    and exists (
      select 1
      from unnest(p.roles) as policy_role(role_name)
      where policy_role.role_name::text in ('public', 'anon', 'authenticated')
    )
  into event_dangerous_policy_count;

  insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'dangerous_browser_policy_count', connection_dangerous_policy_count::text);
  insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'dangerous_browser_policy_count', event_dangerous_policy_count::text);

  if connection_dangerous_policy_count > 0 then
    blockers := array_append(blockers, 'dangerous browser policies on public.hotel_pms_connections require manual review');
  end if;

  if event_dangerous_policy_count > 0 then
    blockers := array_append(blockers, 'dangerous browser policies on public.pms_webhook_events require manual review');
  end if;

  select count(*)
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'hotel_pms_connections'
    and grantee in ('PUBLIC', 'anon', 'authenticated')
  into connection_dangerous_grant_count;

  select count(*)
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'pms_webhook_events'
    and grantee in ('PUBLIC', 'anon', 'authenticated')
  into event_dangerous_grant_count;

  insert into badar_p0_2a_preflight_results values ('hotel_pms_connections', 'dangerous_browser_grant_count', connection_dangerous_grant_count::text);
  insert into badar_p0_2a_preflight_results values ('pms_webhook_events', 'dangerous_browser_grant_count', event_dangerous_grant_count::text);

  insert into badar_p0_2a_preflight_summary values (
    'ready_for_stage_a',
    (coalesce(array_length(blockers, 1), 0) = 0)::text
  );
  insert into badar_p0_2a_preflight_summary values (
    'readiness',
    case when coalesce(array_length(blockers, 1), 0) = 0 then 'READY' else 'NOT READY' end
  );
  insert into badar_p0_2a_preflight_summary values (
    'blockers',
    case when coalesce(array_length(blockers, 1), 0) = 0 then 'none' else array_to_string(blockers, '; ') end
  );
  insert into badar_p0_2a_preflight_summary values (
    'plaintext_webhook_secret_blocks_stage_a',
    'false'
  );
  insert into badar_p0_2a_preflight_summary values (
    'dangerous_browser_grants_are_remediated_by_stage_a_migration',
    'true'
  );
end $$;

insert into badar_p0_2a_preflight_results(scope, metric, value)
select
  expected_grants.table_name,
  expected_grants.metric_name,
  count(grants.privilege_type)::text
from (
  values
    ('hotel_pms_connections', 'PUBLIC', 'grant_count_public'),
    ('hotel_pms_connections', 'anon', 'grant_count_anon'),
    ('hotel_pms_connections', 'authenticated', 'grant_count_authenticated'),
    ('hotel_pms_connections', 'service_role', 'grant_count_service_role'),
    ('pms_webhook_events', 'PUBLIC', 'grant_count_public'),
    ('pms_webhook_events', 'anon', 'grant_count_anon'),
    ('pms_webhook_events', 'authenticated', 'grant_count_authenticated'),
    ('pms_webhook_events', 'service_role', 'grant_count_service_role')
) as expected_grants(table_name, role_name, metric_name)
left join information_schema.role_table_grants grants
  on grants.table_schema = 'public'
  and grants.table_name = expected_grants.table_name
  and grants.grantee = expected_grants.role_name
group by expected_grants.table_name, expected_grants.metric_name;

select metric, value
from badar_p0_2a_preflight_summary
order by metric;

select scope, metric, value
from badar_p0_2a_preflight_results
order by scope, metric;

select scope, dimension, label, total_rows
from badar_p0_2a_preflight_distributions
order by scope, dimension, label;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('hotel_pms_connections', 'pms_webhook_events')
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
  and tablename in ('hotel_pms_connections', 'pms_webhook_events')
order by tablename, policyname;

select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('hotel_pms_connections', 'pms_webhook_events')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;
