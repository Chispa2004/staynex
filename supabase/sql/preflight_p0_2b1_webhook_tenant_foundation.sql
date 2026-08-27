-- BADAR P0-2B1 PMS webhook tenant foundation preflight.
-- Read-only diagnostics. Run before the foundation migration.
-- Reports counts, metadata, grants, policies, indexes, constraints, ownership,
-- exact compatibility, and readiness without exposing guest/contact/request/
-- provider-error values.

do $$
declare
  missing_relations text[];
begin
  select array_agg(relation_name order by relation_name)
  from (
    values
      ('public.hotel_pms_connections'),
      ('public.pms_webhook_events'),
      ('public.reservations')
  ) as required_relations(relation_name)
  where to_regclass(relation_name) is null
  into missing_relations;

  if coalesce(array_length(missing_relations, 1), 0) > 0 then
    raise exception 'P0-2B1 preflight BLOCKED: missing critical relation(s): %', array_to_string(missing_relations, ', ');
  end if;
end $$;

with
ownership_marker as (
  select 'STAYNEX_P0_2B1_OWNED_V1'::text as marker
),
schema_flags as (
  select
    to_regclass('public.pms_webhook_events') is not null as events_table_exists,
    to_regclass('public.hotel_pms_connections') is not null as connections_table_exists,
    to_regclass('public.reservations') is not null as reservations_table_exists,
    to_regclass('public.pms_webhook_quarantine') is not null as quarantine_table_exists,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pms_webhook_events' and column_name = 'hotel_id'
    ) as events_hotel_id_column_exists,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pms_webhook_events' and column_name = 'connection_id'
    ) as events_connection_id_column_exists,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pms_webhook_events' and column_name = 'external_event_id'
    ) as events_external_event_id_column_exists,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hotel_pms_connections' and column_name = 'hotel_id'
    ) as connections_hotel_id_column_exists,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'reservations' and column_name = 'hotel_id'
    ) as reservations_hotel_id_column_exists,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'reservations' and column_name = 'pms_provider'
    ) as reservations_pms_provider_column_exists,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'reservations' and column_name = 'pms_reservation_id'
    ) as reservations_pms_reservation_id_column_exists
),
required_index_contracts as (
  select *
  from (
    values
      ('legacy_event_unique', 'pms_webhook_events_provider_external_event_unique_idx', 'public.pms_webhook_events', array['provider', 'external_event_id']::text[], true, 'external_event_idisnotnull', false),
      ('legacy_hotel_provider_unique', 'hotel_pms_connections_hotel_provider_idx', 'public.hotel_pms_connections', array['hotel_id', 'provider']::text[], true, '', false),
      ('quarantine_created_at_index', 'pms_webhook_quarantine_created_at_idx', 'public.pms_webhook_quarantine', array['created_at desc']::text[], false, '', true),
      ('quarantine_provider_created_at_index', 'pms_webhook_quarantine_provider_created_at_idx', 'public.pms_webhook_quarantine', array['provider', 'created_at']::text[], false, '', true),
      ('quarantine_reason_code_created_at_index', 'pms_webhook_quarantine_reason_code_created_at_idx', 'public.pms_webhook_quarantine', array['reason_code', 'created_at']::text[], false, '', true),
      ('quarantine_status_created_at_index', 'pms_webhook_quarantine_status_created_at_idx', 'public.pms_webhook_quarantine', array['status', 'created_at']::text[], false, '', true),
      ('quarantine_candidate_connection_index', 'pms_webhook_quarantine_candidate_connection_id_idx', 'public.pms_webhook_quarantine', array['candidate_connection_id']::text[], false, '', true),
      ('connection_composite_index', 'hotel_pms_connections_id_hotel_id_unique_idx', 'public.hotel_pms_connections', array['id', 'hotel_id']::text[], true, '', true),
      ('event_connection_index', 'pms_webhook_events_connection_id_idx', 'public.pms_webhook_events', array['connection_id']::text[], false, '', true),
      ('event_scoped_unique', 'pms_webhook_events_provider_connection_event_unique_idx', 'public.pms_webhook_events', array['provider', 'connection_id', 'external_event_id']::text[], true, 'connection_idisnotnullandexternal_event_idisnotnull', true),
      ('reservation_scoped_unique', 'reservations_hotel_pms_provider_reservation_id_unique_idx', 'public.reservations', array['hotel_id', 'pms_provider', 'pms_reservation_id']::text[], true, 'hotel_idisnotnullandpms_providerisnotnullandpms_reservation_idisnotnull', true)
  ) as contracts(
    contract_key,
    canonical_index_name,
    table_name,
    column_defs,
    must_be_unique,
    predicate_norm,
    is_b1_object
  )
),
index_catalog as (
  select
    c.oid as index_oid,
    n.nspname as schema_name,
    c.relname as index_name,
    i.indrelid as table_oid,
    i.indisunique as is_unique,
    regexp_replace(lower(coalesce(pg_get_expr(i.indpred, i.indrelid), '')), '[[:space:]()]', '', 'g') as predicate_norm,
    array(
      select trim(lower(regexp_replace(pg_get_indexdef(i.indexrelid, key_part.ordinality::int, true), '[[:space:]]+', ' ', 'g')))
      from unnest(i.indkey) with ordinality as key_part(attnum, ordinality)
      order by key_part.ordinality
    ) as column_defs,
    obj_description(c.oid, 'pg_class') as object_comment,
    pg_get_indexdef(c.oid) as indexdef
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index i on i.indexrelid = c.oid
  where n.nspname = 'public'
    and c.relkind in ('i', 'I')
),
canonical_objects as (
  select
    r.contract_key,
    r.canonical_index_name,
    c.oid as object_oid,
    c.relkind as object_relkind
  from required_index_contracts r
  left join pg_class c
    on c.relname = r.canonical_index_name
    and c.relnamespace = 'public'::regnamespace
),
index_compatibility as (
  select
    r.contract_key,
    r.canonical_index_name,
    r.table_name,
    r.column_defs,
    r.must_be_unique,
    r.predicate_norm,
    r.is_b1_object,
    co.object_oid is not null as canonical_object_exists,
    co.object_relkind,
    canonical.index_oid is not null as canonical_index_exists,
    (
      canonical.index_oid is not null
      and canonical.table_oid = to_regclass(r.table_name)
      and canonical.is_unique = r.must_be_unique
      and canonical.column_defs is not distinct from r.column_defs
      and coalesce(canonical.predicate_norm, '') = r.predicate_norm
    ) as canonical_index_compatible,
    exists (
      select 1
      from index_catalog equivalent
      where equivalent.index_name <> r.canonical_index_name
        and equivalent.table_oid = to_regclass(r.table_name)
        and equivalent.is_unique = r.must_be_unique
        and equivalent.column_defs is not distinct from r.column_defs
        and coalesce(equivalent.predicate_norm, '') = r.predicate_norm
    ) as equivalent_different_name_exists,
    (
      select equivalent.index_name
      from index_catalog equivalent
      where equivalent.index_name <> r.canonical_index_name
        and equivalent.table_oid = to_regclass(r.table_name)
        and equivalent.is_unique = r.must_be_unique
        and equivalent.column_defs is not distinct from r.column_defs
        and coalesce(equivalent.predicate_norm, '') = r.predicate_norm
      order by equivalent.index_name
      limit 1
    ) as equivalent_different_name,
    (
      co.object_oid is not null
      and not (
        canonical.index_oid is not null
        and canonical.table_oid = to_regclass(r.table_name)
        and canonical.is_unique = r.must_be_unique
        and canonical.column_defs is not distinct from r.column_defs
        and coalesce(canonical.predicate_norm, '') = r.predicate_norm
      )
    ) as same_name_incompatible,
    (
      co.object_oid is null
      or (
        canonical.index_oid is not null
        and canonical.table_oid = to_regclass(r.table_name)
        and canonical.is_unique = r.must_be_unique
        and canonical.column_defs is not distinct from r.column_defs
        and coalesce(canonical.predicate_norm, '') = r.predicate_norm
      )
    ) as canonical_name_safe_for_migration,
    (
      co.object_oid is null
      or (
        canonical.index_oid is not null
        and canonical.table_oid = to_regclass(r.table_name)
        and canonical.is_unique = r.must_be_unique
        and canonical.column_defs is not distinct from r.column_defs
        and coalesce(canonical.predicate_norm, '') = r.predicate_norm
      )
      or exists (
        select 1
        from index_catalog equivalent
        where equivalent.index_name <> r.canonical_index_name
          and equivalent.table_oid = to_regclass(r.table_name)
          and equivalent.is_unique = r.must_be_unique
          and equivalent.column_defs is not distinct from r.column_defs
          and coalesce(equivalent.predicate_norm, '') = r.predicate_norm
      )
    ) as object_compatible_or_absent,
    (
      canonical.index_oid is not null
      and canonical.object_comment like '%' || (select marker from ownership_marker) || '%'
    ) as object_owned_by_p0_2b1
  from required_index_contracts r
  join canonical_objects co on co.contract_key = r.contract_key
  left join index_catalog canonical
    on canonical.index_name = r.canonical_index_name
),
index_compatibility_summary as (
  select
    bool_and(not same_name_incompatible) filter (where is_b1_object) as b1_indexes_compatible_or_absent,
    bool_or(same_name_incompatible) filter (where is_b1_object) as b1_same_name_incompatible_exists,
    bool_or(equivalent_different_name_exists and not canonical_object_exists) filter (where is_b1_object) as b1_equivalent_different_name_exists,
    bool_or(object_owned_by_p0_2b1) filter (where is_b1_object) as b1_owned_index_exists,
    max(object_compatible_or_absent::int) filter (where contract_key = 'connection_composite_index')::boolean as connection_composite_index_compatible,
    max(object_owned_by_p0_2b1::int) filter (where contract_key = 'connection_composite_index')::boolean as connection_composite_index_owned_by_p0_2b1,
    max(object_compatible_or_absent::int) filter (where contract_key = 'event_connection_index')::boolean as event_connection_index_compatible,
    max(object_owned_by_p0_2b1::int) filter (where contract_key = 'event_connection_index')::boolean as event_connection_index_owned_by_p0_2b1,
    max(object_compatible_or_absent::int) filter (where contract_key = 'event_scoped_unique')::boolean as event_scoped_unique_compatible,
    max(object_owned_by_p0_2b1::int) filter (where contract_key = 'event_scoped_unique')::boolean as event_scoped_unique_owned_by_p0_2b1,
    max(object_compatible_or_absent::int) filter (where contract_key = 'reservation_scoped_unique')::boolean as reservation_scoped_unique_compatible,
    max(object_owned_by_p0_2b1::int) filter (where contract_key = 'reservation_scoped_unique')::boolean as reservation_scoped_unique_owned_by_p0_2b1,
    bool_and(object_compatible_or_absent) filter (where contract_key like 'quarantine_%') as quarantine_indexes_compatible,
    bool_or(object_owned_by_p0_2b1) filter (where contract_key like 'quarantine_%') as quarantine_index_owned_by_p0_2b1,
    max(canonical_index_compatible::int) filter (where contract_key = 'legacy_event_unique')::boolean as legacy_event_unique_compatible,
    max(canonical_index_compatible::int) filter (where contract_key = 'legacy_hotel_provider_unique')::boolean as hotel_provider_unique_compatible
  from index_compatibility
),
reservation_legacy_constraint as (
  select
    exists (
      select 1
      from pg_constraint con
      where con.conrelid = 'public.reservations'::regclass
        and con.conname = 'reservations_pms_unique'
        and con.contype = 'u'
        and array(
          select att.attname::text
          from unnest(con.conkey) with ordinality as key_part(attnum, ordinality)
          join pg_attribute att
            on att.attrelid = con.conrelid
            and att.attnum = key_part.attnum
          order by key_part.ordinality
        ) = array['pms_provider', 'pms_reservation_id']::text[]
    ) as legacy_reservation_unique_compatible
),
quarantine_required_columns as (
  select *
  from (
    values
      ('id', 'uuid', false, '%gen_random_uuid%'),
      ('provider', 'text', false, null),
      ('reason_code', 'text', false, null),
      ('status', 'text', false, '%''pending''%'),
      ('request_hash', 'text', true, null),
      ('event_hash', 'text', true, null),
      ('candidate_connection_id', 'uuid', true, null),
      ('safe_flags', 'jsonb', false, '%{}%jsonb%'),
      ('created_at', 'timestamptz', false, '%now()%'),
      ('reviewed_at', 'timestamptz', true, null),
      ('expires_at', 'timestamptz', true, null)
  ) as expected(column_name, udt_name, is_nullable, default_like)
),
quarantine_column_compatibility as (
  select
    count(*) filter (
      where c.column_name is null
        or c.udt_name <> e.udt_name
        or ((c.is_nullable = 'YES') <> e.is_nullable)
        or (e.default_like is null and c.column_default is not null)
        or (e.default_like is not null and lower(coalesce(c.column_default, '')) not like e.default_like)
    ) as incompatible_required_column_count
  from quarantine_required_columns e
  left join information_schema.columns c
    on c.table_schema = 'public'
    and c.table_name = 'pms_webhook_quarantine'
    and c.column_name = e.column_name
),
quarantine_unsafe_columns as (
  select count(*) as unsafe_column_count
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'pms_webhook_quarantine'
    and (
      lower(c.column_name) in ('raw_payload', 'payload', 'request_body', 'body', 'raw_error', 'guest_name', 'email', 'phone', 'credentials', 'token', 'secret')
      or lower(c.column_name) like '%payload%'
      or lower(c.column_name) like '%request_body%'
      or lower(c.column_name) like '%body%'
      or lower(c.column_name) like '%raw_error%'
      or lower(c.column_name) like '%guest_name%'
      or lower(c.column_name) like '%email%'
      or lower(c.column_name) like '%phone%'
      or lower(c.column_name) like '%credential%'
      or lower(c.column_name) like '%token%'
      or lower(c.column_name) like '%secret%'
      or lower(c.column_name) like '%error%'
    )
),
quarantine_reason_contract as (
  select
    (
      select array_agg(code order by code)
      from unnest(array[
        'INVALID_SIGNATURE',
        'MISSING_SIGNATURE',
        'UNKNOWN_CONNECTION',
        'AMBIGUOUS_CONNECTION',
        'CONNECTION_DISABLED',
        'TENANT_MISMATCH',
        'MISSING_EVENT_ID',
        'MALFORMED_EVENT',
        'UNSUPPORTED_PROVIDER',
        'VALIDATION_NOT_CONFIGURED',
        'LEGACY_GLOBAL_EVENT_COLLISION',
        'LEGACY_GLOBAL_RESERVATION_COLLISION'
      ]::text[]) as code
    ) as expected_reason_codes,
    (
      select array_agg(reason_code order by reason_code)
      from (
        select distinct reason_match[1] as reason_code
        from pg_constraint con
        cross join lateral regexp_matches(pg_get_constraintdef(con.oid), '''([^'']+)''', 'g') as reason_match
        where con.conrelid = to_regclass('public.pms_webhook_quarantine')
          and con.conname = 'pms_webhook_quarantine_reason_code_check'
          and con.contype = 'c'
      ) parsed_reason_codes
    ) as actual_reason_codes
),
quarantine_security as (
  select
    coalesce((
      select c.relkind = 'r'
      from pg_class c
      where c.oid = to_regclass('public.pms_webhook_quarantine')
    ), false) as quarantine_is_regular_table,
    coalesce((
      select c.relrowsecurity
      from pg_class c
      where c.oid = to_regclass('public.pms_webhook_quarantine')
    ), false) as quarantine_rls_enabled,
    (
      select count(*)
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'pms_webhook_quarantine'
        and grantee in ('PUBLIC', 'anon', 'authenticated')
    ) as quarantine_browser_grant_count,
    (
      select count(*)
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'pms_webhook_quarantine'
        and exists (
          select 1
          from unnest(p.roles) as policy_role(role_name)
          where policy_role.role_name::text in ('public', 'anon', 'authenticated')
        )
    ) as quarantine_dangerous_browser_policy_count,
    (
      select count(*)
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pms_webhook_quarantine'
    ) as quarantine_realtime_membership_count,
    (
      not exists (select 1 from pg_roles where rolname = 'service_role')
      or (
        select count(distinct privilege_type)
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = 'pms_webhook_quarantine'
          and grantee = 'service_role'
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      ) = 4
    ) as quarantine_service_role_grants_compatible
),
quarantine_pk as (
  select exists (
    select 1
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
      and att.attnum = any(con.conkey)
    where con.conrelid = to_regclass('public.pms_webhook_quarantine')
      and con.contype = 'p'
      and con.conkey = array[att.attnum]::smallint[]
      and att.attname = 'id'
  ) as quarantine_primary_key_compatible
),
quarantine_compatibility as (
  select
    (select quarantine_table_exists from schema_flags) as quarantine_object_exists,
    coalesce(obj_description(to_regclass('public.pms_webhook_quarantine'), 'pg_class'), '') like '%' || (select marker from ownership_marker) || '%' as quarantine_owned_by_p0_2b1,
    (
      not (select quarantine_table_exists from schema_flags)
      or (
        (select quarantine_is_regular_table from quarantine_security)
        and (select incompatible_required_column_count from quarantine_column_compatibility) = 0
        and (select unsafe_column_count from quarantine_unsafe_columns) = 0
        and (select quarantine_primary_key_compatible from quarantine_pk)
        and (select actual_reason_codes from quarantine_reason_contract) is not distinct from (select expected_reason_codes from quarantine_reason_contract)
        and (select quarantine_rls_enabled from quarantine_security)
        and (select quarantine_browser_grant_count from quarantine_security) = 0
        and (select quarantine_dangerous_browser_policy_count from quarantine_security) = 0
        and (select quarantine_realtime_membership_count from quarantine_security) = 0
        and (select quarantine_service_role_grants_compatible from quarantine_security)
      )
    ) as quarantine_schema_compatible
),
event_stats as (
  select
    count(*) as total_events,
    count(*) filter (where e.hotel_id is null) as null_hotel_id,
    count(*) filter (where e.connection_id is null) as null_connection_id,
    count(*) filter (where e.hotel_id is null and e.connection_id is null) as both_null,
    count(*) filter (where e.hotel_id is not null and e.connection_id is null) as hotel_present_connection_null,
    count(*) filter (where e.connection_id is not null and e.hotel_id is null) as connection_present_hotel_null,
    count(*) filter (
      where e.connection_id is not null
        and e.hotel_id is not null
        and c.id is not null
        and e.hotel_id <> c.hotel_id
    ) as connection_hotel_mismatch,
    count(*) filter (where e.connection_id is not null and c.id is null) as orphan_connection_id,
    count(*) filter (where e.connection_id is not null and c.id is not null) as resolvable_by_connection,
    count(*) filter (where e.connection_id is null or c.id is null) as unresolved_after_connection_mapping,
    count(*) filter (where e.external_event_id is null) as null_external_event_id,
    min(e.created_at) as oldest_created_at,
    max(e.created_at) as newest_created_at
  from public.pms_webhook_events e
  left join public.hotel_pms_connections c on c.id = e.connection_id
),
event_current_duplicates as (
  select count(*) as duplicate_current_event_identity
  from (
    select provider, external_event_id
    from public.pms_webhook_events
    where external_event_id is not null
    group by provider, external_event_id
    having count(*) > 1
  ) duplicate_groups
),
event_proposed_duplicates as (
  select count(*) as duplicate_proposed_event_identity
  from (
    select provider, connection_id, external_event_id
    from public.pms_webhook_events
    where connection_id is not null
      and external_event_id is not null
    group by provider, connection_id, external_event_id
    having count(*) > 1
  ) duplicate_groups
),
reservation_stats as (
  select
    count(*) filter (where pms_provider is not null or pms_reservation_id is not null) as total_pms_identified_reservations,
    count(*) filter (
      where (pms_provider is not null or pms_reservation_id is not null)
        and hotel_id is null
    ) as pms_rows_hotel_id_null,
    count(*) filter (where pms_provider is null) as pms_provider_null,
    count(*) filter (where pms_reservation_id is null) as pms_reservation_id_null
  from public.reservations
),
reservation_current_duplicates as (
  select count(*) as duplicate_current_reservation_identity
  from (
    select pms_provider, pms_reservation_id
    from public.reservations
    where pms_provider is not null
      and pms_reservation_id is not null
    group by pms_provider, pms_reservation_id
    having count(*) > 1
  ) duplicate_groups
),
reservation_proposed_duplicates as (
  select count(*) as duplicate_proposed_reservation_identity
  from (
    select hotel_id, pms_provider, pms_reservation_id
    from public.reservations
    where hotel_id is not null
      and pms_provider is not null
      and pms_reservation_id is not null
    group by hotel_id, pms_provider, pms_reservation_id
    having count(*) > 1
  ) duplicate_groups
),
reservation_cross_hotel_reuse as (
  select count(*) as cross_hotel_reservation_identity_reuse
  from (
    select pms_provider, pms_reservation_id
    from public.reservations
    where hotel_id is not null
      and pms_provider is not null
      and pms_reservation_id is not null
    group by pms_provider, pms_reservation_id
    having count(distinct hotel_id) > 1
  ) reuse_groups
),
connection_stats as (
  select
    count(*) as total_hotel_pms_connections,
    count(*) filter (where id is null) as id_null_impossible_sanity,
    count(*) filter (where hotel_id is null) as hotel_id_null,
    (
      select count(*)
      from (
        select id, hotel_id
        from public.hotel_pms_connections
        group by id, hotel_id
        having count(*) > 1
      ) duplicate_groups
    ) as duplicate_id_hotel_id
  from public.hotel_pms_connections
),
security_flags as (
  select
    coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'pms_webhook_events'
    ), false) as events_rls_enabled,
    coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'hotel_pms_connections'
    ), false) as connections_rls_enabled,
    (
      select count(*)
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'pms_webhook_events'
        and grantee in ('PUBLIC', 'anon', 'authenticated')
    ) as event_browser_grant_count,
    (
      select count(*)
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'hotel_pms_connections'
        and grantee in ('PUBLIC', 'anon', 'authenticated')
    ) as connection_browser_grant_count,
    (
      select count(*)
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'pms_webhook_events'
        and exists (
          select 1
          from unnest(p.roles) as policy_role(role_name)
          where policy_role.role_name::text in ('public', 'anon', 'authenticated')
        )
    ) as event_dangerous_browser_policy_count,
    (
      select count(*)
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'hotel_pms_connections'
        and exists (
          select 1
          from unnest(p.roles) as policy_role(role_name)
          where policy_role.role_name::text in ('public', 'anon', 'authenticated')
        )
    ) as connection_dangerous_browser_policy_count
),
readiness_flags as (
  select
    (
      schema_flags.events_table_exists
      and schema_flags.connections_table_exists
      and schema_flags.reservations_table_exists
      and schema_flags.events_hotel_id_column_exists
      and schema_flags.events_connection_id_column_exists
      and schema_flags.events_external_event_id_column_exists
      and schema_flags.connections_hotel_id_column_exists
      and schema_flags.reservations_hotel_id_column_exists
      and schema_flags.reservations_pms_provider_column_exists
      and schema_flags.reservations_pms_reservation_id_column_exists
      and index_compatibility_summary.legacy_event_unique_compatible
      and reservation_legacy_constraint.legacy_reservation_unique_compatible
      and index_compatibility_summary.hotel_provider_unique_compatible
      and quarantine_compatibility.quarantine_schema_compatible
      and index_compatibility_summary.b1_indexes_compatible_or_absent
    ) as critical_schema_compatible,
    (
      not security_flags.events_rls_enabled
      or security_flags.event_browser_grant_count > 0
      or security_flags.event_dangerous_browser_policy_count > 0
    ) as browser_event_access_regression,
    (
      event_stats.connection_hotel_mismatch > 0
      or event_stats.orphan_connection_id > 0
      or event_proposed_duplicates.duplicate_proposed_event_identity > 0
      or reservation_proposed_duplicates.duplicate_proposed_reservation_identity > 0
      or connection_stats.duplicate_id_hotel_id > 0
    ) as integrity_blocker,
    (
      event_stats.null_hotel_id > 0
      or event_stats.null_connection_id > 0
      or event_stats.both_null > 0
      or event_stats.hotel_present_connection_null > 0
      or event_stats.connection_present_hotel_null > 0
      or event_stats.null_external_event_id > 0
      or event_stats.unresolved_after_connection_mapping > 0
      or reservation_stats.pms_rows_hotel_id_null > 0
    ) as manual_review_needed
  from schema_flags, event_stats, event_proposed_duplicates,
    reservation_proposed_duplicates, connection_stats, reservation_stats,
    security_flags, index_compatibility_summary, reservation_legacy_constraint,
    quarantine_compatibility
)
select metric, value
from (
  values
    ('ready_for_p0_2b1_stage_a', (
      select (
        critical_schema_compatible
        and not browser_event_access_regression
        and not integrity_blocker
      )::text
      from readiness_flags
    )),
    ('readiness', (
      select case
        when not critical_schema_compatible
          or browser_event_access_regression
          or integrity_blocker
          then 'BLOCKED'
        when manual_review_needed then 'NEEDS_MANUAL_REVIEW'
        else 'READY_FOR_STAGE_A'
      end
      from readiness_flags
    )),
    ('critical_schema_compatible', (select critical_schema_compatible::text from readiness_flags)),
    ('browser_event_access_regression', (select browser_event_access_regression::text from readiness_flags)),
    ('integrity_blocker', (select integrity_blocker::text from readiness_flags)),
    ('manual_review_needed', (select manual_review_needed::text from readiness_flags)),
    ('events_table_exists', (select events_table_exists::text from schema_flags)),
    ('connections_table_exists', (select connections_table_exists::text from schema_flags)),
    ('reservations_table_exists', (select reservations_table_exists::text from schema_flags)),
    ('quarantine_table_exists', (select quarantine_table_exists::text from schema_flags)),
    ('quarantine_schema_compatible', (select quarantine_schema_compatible::text from quarantine_compatibility)),
    ('quarantine_object_owned_by_p0_2b1', (select quarantine_owned_by_p0_2b1::text from quarantine_compatibility)),
    ('quarantine_unsafe_column_count', (select unsafe_column_count::text from quarantine_unsafe_columns)),
    ('quarantine_indexes_compatible', (select quarantine_indexes_compatible::text from index_compatibility_summary)),
    ('connection_composite_index_compatible', (select connection_composite_index_compatible::text from index_compatibility_summary)),
    ('connection_composite_index_owned_by_p0_2b1', (select connection_composite_index_owned_by_p0_2b1::text from index_compatibility_summary)),
    ('event_connection_index_compatible', (select event_connection_index_compatible::text from index_compatibility_summary)),
    ('event_connection_index_owned_by_p0_2b1', (select event_connection_index_owned_by_p0_2b1::text from index_compatibility_summary)),
    ('event_scoped_unique_compatible', (select event_scoped_unique_compatible::text from index_compatibility_summary)),
    ('event_scoped_unique_owned_by_p0_2b1', (select event_scoped_unique_owned_by_p0_2b1::text from index_compatibility_summary)),
    ('reservation_scoped_unique_compatible', (select reservation_scoped_unique_compatible::text from index_compatibility_summary)),
    ('reservation_scoped_unique_owned_by_p0_2b1', (select reservation_scoped_unique_owned_by_p0_2b1::text from index_compatibility_summary)),
    ('b1_same_name_incompatible_exists', (select b1_same_name_incompatible_exists::text from index_compatibility_summary)),
    ('b1_equivalent_different_name_exists', (select b1_equivalent_different_name_exists::text from index_compatibility_summary)),
    ('legacy_event_unique_compatible', (select legacy_event_unique_compatible::text from index_compatibility_summary)),
    ('legacy_reservation_unique_compatible', (select legacy_reservation_unique_compatible::text from reservation_legacy_constraint)),
    ('hotel_provider_unique_compatible', (select hotel_provider_unique_compatible::text from index_compatibility_summary))
) as summary(metric, value)
order by metric;

with event_stats as (
  select
    count(*) as total_events,
    count(*) filter (where e.hotel_id is null) as null_hotel_id,
    count(*) filter (where e.connection_id is null) as null_connection_id,
    count(*) filter (where e.hotel_id is null and e.connection_id is null) as both_null,
    count(*) filter (where e.hotel_id is not null and e.connection_id is null) as hotel_present_connection_null,
    count(*) filter (where e.connection_id is not null and e.hotel_id is null) as connection_present_hotel_null,
    count(*) filter (
      where e.connection_id is not null
        and e.hotel_id is not null
        and c.id is not null
        and e.hotel_id <> c.hotel_id
    ) as connection_hotel_mismatch,
    count(*) filter (where e.connection_id is not null and c.id is null) as orphan_connection_id,
    count(*) filter (where e.connection_id is not null and c.id is not null) as resolvable_by_connection,
    count(*) filter (where e.connection_id is null or c.id is null) as unresolved_after_connection_mapping,
    count(*) filter (where e.external_event_id is null) as null_external_event_id,
    min(e.created_at) as oldest_created_at,
    max(e.created_at) as newest_created_at
  from public.pms_webhook_events e
  left join public.hotel_pms_connections c on c.id = e.connection_id
),
event_current_duplicates as (
  select count(*) as duplicate_current_event_identity
  from (
    select provider, external_event_id
    from public.pms_webhook_events
    where external_event_id is not null
    group by provider, external_event_id
    having count(*) > 1
  ) duplicate_groups
),
event_proposed_duplicates as (
  select count(*) as duplicate_proposed_event_identity
  from (
    select provider, connection_id, external_event_id
    from public.pms_webhook_events
    where connection_id is not null
      and external_event_id is not null
    group by provider, connection_id, external_event_id
    having count(*) > 1
  ) duplicate_groups
)
select 'pms_webhook_events' as scope, metric, value
from (
  values
    ('total_events', (select total_events::text from event_stats)),
    ('null_hotel_id', (select null_hotel_id::text from event_stats)),
    ('null_connection_id', (select null_connection_id::text from event_stats)),
    ('both_null', (select both_null::text from event_stats)),
    ('hotel_present_connection_null', (select hotel_present_connection_null::text from event_stats)),
    ('connection_present_hotel_null', (select connection_present_hotel_null::text from event_stats)),
    ('connection_hotel_mismatch', (select connection_hotel_mismatch::text from event_stats)),
    ('orphan_connection_id', (select orphan_connection_id::text from event_stats)),
    ('resolvable_by_connection', (select resolvable_by_connection::text from event_stats)),
    ('unresolved_after_connection_mapping', (select unresolved_after_connection_mapping::text from event_stats)),
    ('null_external_event_id', (select null_external_event_id::text from event_stats)),
    ('duplicate_current_event_identity', (select duplicate_current_event_identity::text from event_current_duplicates)),
    ('duplicate_proposed_event_identity', (select duplicate_proposed_event_identity::text from event_proposed_duplicates)),
    ('oldest_created_at', (select oldest_created_at::text from event_stats)),
    ('newest_created_at', (select newest_created_at::text from event_stats))
) as metrics(metric, value)
order by metric;

select
  provider,
  count(*) as event_count
from public.pms_webhook_events
group by provider
order by event_count desc, provider;

select
  status,
  count(*) as event_count
from public.pms_webhook_events
group by status
order by event_count desc, status;

select
  provider,
  md5(provider || ':' || external_event_id) as event_identity_hash,
  count(*) as duplicate_rows,
  count(distinct hotel_id) as distinct_hotels,
  count(distinct connection_id) as distinct_connections
from public.pms_webhook_events
where external_event_id is not null
group by provider, external_event_id
having count(*) > 1
order by duplicate_rows desc, provider, event_identity_hash;

select
  provider,
  connection_id,
  md5(provider || ':' || connection_id::text || ':' || external_event_id) as proposed_event_identity_hash,
  count(*) as duplicate_rows,
  count(distinct hotel_id) as distinct_hotels
from public.pms_webhook_events
where connection_id is not null
  and external_event_id is not null
group by provider, connection_id, external_event_id
having count(*) > 1
order by duplicate_rows desc, provider, connection_id, proposed_event_identity_hash;

with reservation_stats as (
  select
    count(*) filter (where pms_provider is not null or pms_reservation_id is not null) as total_pms_identified_reservations,
    count(*) filter (
      where (pms_provider is not null or pms_reservation_id is not null)
        and hotel_id is null
    ) as hotel_id_null_among_pms_rows,
    count(*) filter (where pms_provider is null) as pms_provider_null,
    count(*) filter (where pms_reservation_id is null) as pms_reservation_id_null
  from public.reservations
),
reservation_current_duplicates as (
  select count(*) as duplicate_current_reservation_identity
  from (
    select pms_provider, pms_reservation_id
    from public.reservations
    where pms_provider is not null
      and pms_reservation_id is not null
    group by pms_provider, pms_reservation_id
    having count(*) > 1
  ) duplicate_groups
),
reservation_proposed_duplicates as (
  select count(*) as duplicate_proposed_reservation_identity
  from (
    select hotel_id, pms_provider, pms_reservation_id
    from public.reservations
    where hotel_id is not null
      and pms_provider is not null
      and pms_reservation_id is not null
    group by hotel_id, pms_provider, pms_reservation_id
    having count(*) > 1
  ) duplicate_groups
),
reservation_cross_hotel_reuse as (
  select count(*) as cross_hotel_reuse_groups
  from (
    select pms_provider, pms_reservation_id
    from public.reservations
    where hotel_id is not null
      and pms_provider is not null
      and pms_reservation_id is not null
    group by pms_provider, pms_reservation_id
    having count(distinct hotel_id) > 1
  ) reuse_groups
)
select 'reservations' as scope, metric, value
from (
  values
    ('total_pms_identified_reservations', (select total_pms_identified_reservations::text from reservation_stats)),
    ('hotel_id_null_among_pms_rows', (select hotel_id_null_among_pms_rows::text from reservation_stats)),
    ('pms_provider_null', (select pms_provider_null::text from reservation_stats)),
    ('pms_reservation_id_null', (select pms_reservation_id_null::text from reservation_stats)),
    ('duplicate_current_reservation_identity', (select duplicate_current_reservation_identity::text from reservation_current_duplicates)),
    ('duplicate_proposed_reservation_identity', (select duplicate_proposed_reservation_identity::text from reservation_proposed_duplicates)),
    ('cross_hotel_reservation_identity_reuse', (select cross_hotel_reuse_groups::text from reservation_cross_hotel_reuse))
) as metrics(metric, value)
order by metric;

select
  pms_provider,
  md5(pms_provider || ':' || pms_reservation_id) as reservation_identity_hash,
  count(*) as duplicate_rows,
  count(distinct hotel_id) as distinct_hotels
from public.reservations
where pms_provider is not null
  and pms_reservation_id is not null
group by pms_provider, pms_reservation_id
having count(*) > 1
order by duplicate_rows desc, pms_provider, reservation_identity_hash;

select
  hotel_id,
  pms_provider,
  md5(hotel_id::text || ':' || pms_provider || ':' || pms_reservation_id) as proposed_reservation_identity_hash,
  count(*) as duplicate_rows
from public.reservations
where hotel_id is not null
  and pms_provider is not null
  and pms_reservation_id is not null
group by hotel_id, pms_provider, pms_reservation_id
having count(*) > 1
order by duplicate_rows desc, hotel_id, pms_provider, proposed_reservation_identity_hash;

select
  pms_provider,
  md5(pms_provider || ':' || pms_reservation_id) as reservation_identity_hash,
  count(*) as rows_sharing_identity,
  count(distinct hotel_id) as distinct_hotels
from public.reservations
where hotel_id is not null
  and pms_provider is not null
  and pms_reservation_id is not null
group by pms_provider, pms_reservation_id
having count(distinct hotel_id) > 1
order by rows_sharing_identity desc, pms_provider, reservation_identity_hash;

with connection_stats as (
  select
    count(*) as total_hotel_pms_connections,
    count(*) filter (where id is null) as id_null_impossible_sanity,
    count(*) filter (where hotel_id is null) as hotel_id_null,
    (
      select count(*)
      from (
        select id, hotel_id
        from public.hotel_pms_connections
        group by id, hotel_id
        having count(*) > 1
      ) duplicate_groups
    ) as duplicate_id_hotel_id
  from public.hotel_pms_connections
)
select 'hotel_pms_connections' as scope, metric, value
from (
  values
    ('total_hotel_pms_connections', (select total_hotel_pms_connections::text from connection_stats)),
    ('id_null_impossible_sanity', (select id_null_impossible_sanity::text from connection_stats)),
    ('hotel_id_null', (select hotel_id_null::text from connection_stats)),
    ('duplicate_id_hotel_id', (select duplicate_id_hotel_id::text from connection_stats))
) as metrics(metric, value)
order by metric;

with
ownership_marker as (
  select 'STAYNEX_P0_2B1_OWNED_V1'::text as marker
),
required_index_contracts as (
  select *
  from (
    values
      ('quarantine_created_at_index', 'pms_webhook_quarantine_created_at_idx', 'public.pms_webhook_quarantine', array['created_at desc']::text[], false, ''),
      ('quarantine_provider_created_at_index', 'pms_webhook_quarantine_provider_created_at_idx', 'public.pms_webhook_quarantine', array['provider', 'created_at']::text[], false, ''),
      ('quarantine_reason_code_created_at_index', 'pms_webhook_quarantine_reason_code_created_at_idx', 'public.pms_webhook_quarantine', array['reason_code', 'created_at']::text[], false, ''),
      ('quarantine_status_created_at_index', 'pms_webhook_quarantine_status_created_at_idx', 'public.pms_webhook_quarantine', array['status', 'created_at']::text[], false, ''),
      ('quarantine_candidate_connection_index', 'pms_webhook_quarantine_candidate_connection_id_idx', 'public.pms_webhook_quarantine', array['candidate_connection_id']::text[], false, ''),
      ('connection_composite_index', 'hotel_pms_connections_id_hotel_id_unique_idx', 'public.hotel_pms_connections', array['id', 'hotel_id']::text[], true, ''),
      ('event_connection_index', 'pms_webhook_events_connection_id_idx', 'public.pms_webhook_events', array['connection_id']::text[], false, ''),
      ('event_scoped_unique', 'pms_webhook_events_provider_connection_event_unique_idx', 'public.pms_webhook_events', array['provider', 'connection_id', 'external_event_id']::text[], true, 'connection_idisnotnullandexternal_event_idisnotnull'),
      ('reservation_scoped_unique', 'reservations_hotel_pms_provider_reservation_id_unique_idx', 'public.reservations', array['hotel_id', 'pms_provider', 'pms_reservation_id']::text[], true, 'hotel_idisnotnullandpms_providerisnotnullandpms_reservation_idisnotnull')
  ) as contracts(contract_key, canonical_index_name, table_name, column_defs, must_be_unique, predicate_norm)
),
index_catalog as (
  select
    c.oid as index_oid,
    c.relname as index_name,
    i.indrelid as table_oid,
    i.indisunique as is_unique,
    regexp_replace(lower(coalesce(pg_get_expr(i.indpred, i.indrelid), '')), '[[:space:]()]', '', 'g') as predicate_norm,
    array(
      select trim(lower(regexp_replace(pg_get_indexdef(i.indexrelid, key_part.ordinality::int, true), '[[:space:]]+', ' ', 'g')))
      from unnest(i.indkey) with ordinality as key_part(attnum, ordinality)
      order by key_part.ordinality
    ) as column_defs,
    obj_description(c.oid, 'pg_class') as object_comment
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index i on i.indexrelid = c.oid
  where n.nspname = 'public'
    and c.relkind in ('i', 'I')
),
compatibility as (
  select
    r.contract_key,
    r.canonical_index_name,
    to_regclass(r.table_name) is not null as source_table_exists,
    coalesce(canonical.index_oid is not null, false) as canonical_index_exists,
    exists (
      select 1
      from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relname = r.canonical_index_name
    ) as canonical_object_exists,
    (
      canonical.index_oid is not null
      and canonical.table_oid = to_regclass(r.table_name)
      and canonical.is_unique = r.must_be_unique
      and canonical.column_defs is not distinct from r.column_defs
      and coalesce(canonical.predicate_norm, '') = r.predicate_norm
    ) as canonical_index_compatible,
    exists (
      select 1
      from index_catalog equivalent
      where equivalent.index_name <> r.canonical_index_name
        and equivalent.table_oid = to_regclass(r.table_name)
        and equivalent.is_unique = r.must_be_unique
        and equivalent.column_defs is not distinct from r.column_defs
        and coalesce(equivalent.predicate_norm, '') = r.predicate_norm
    ) as equivalent_different_name_exists,
    (
      select equivalent.index_name
      from index_catalog equivalent
      where equivalent.index_name <> r.canonical_index_name
        and equivalent.table_oid = to_regclass(r.table_name)
        and equivalent.is_unique = r.must_be_unique
        and equivalent.column_defs is not distinct from r.column_defs
        and coalesce(equivalent.predicate_norm, '') = r.predicate_norm
      order by equivalent.index_name
      limit 1
    ) as equivalent_different_name,
    (
      exists (
        select 1
        from pg_class c
        where c.relnamespace = 'public'::regnamespace
          and c.relname = r.canonical_index_name
      )
      and not (
        canonical.index_oid is not null
        and canonical.table_oid = to_regclass(r.table_name)
        and canonical.is_unique = r.must_be_unique
        and canonical.column_defs is not distinct from r.column_defs
        and coalesce(canonical.predicate_norm, '') = r.predicate_norm
      )
    ) as same_name_incompatible,
    (
      canonical.index_oid is not null
      and canonical.object_comment like '%' || (select marker from ownership_marker) || '%'
    ) as object_owned_by_p0_2b1
  from required_index_contracts r
  left join index_catalog canonical on canonical.index_name = r.canonical_index_name
)
select *
from compatibility
order by contract_key;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls_enabled,
  obj_description(c.oid, 'pg_class') as object_comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('pms_webhook_events', 'hotel_pms_connections', 'pms_webhook_quarantine')
order by c.relname;

select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('pms_webhook_events', 'hotel_pms_connections', 'pms_webhook_quarantine')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

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
  and tablename in ('pms_webhook_events', 'hotel_pms_connections', 'pms_webhook_quarantine')
  and exists (
    select 1
    from unnest(roles) as policy_role(role_name)
    where policy_role.role_name::text in ('public', 'anon', 'authenticated')
  )
order by tablename, policyname;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and (
    (tablename = 'pms_webhook_events' and indexname in (
      'pms_webhook_events_provider_external_event_unique_idx',
      'pms_webhook_events_provider_connection_event_unique_idx',
      'pms_webhook_events_connection_id_idx',
      'pms_webhook_events_hotel_id_idx',
      'pms_webhook_events_created_at_idx'
    ))
    or (tablename = 'hotel_pms_connections' and indexname in (
      'hotel_pms_connections_hotel_provider_idx',
      'hotel_pms_connections_id_hotel_id_unique_idx',
      'hotel_pms_connections_hotel_id_idx',
      'hotel_pms_connections_provider_idx'
    ))
    or (tablename = 'reservations' and indexname in (
      'reservations_pms_unique',
      'reservations_pms_provider_reservation_id_idx',
      'reservations_hotel_pms_provider_reservation_id_unique_idx'
    ))
    or tablename = 'pms_webhook_quarantine'
  )
order by tablename, indexname;

select
  conrelid::regclass::text as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as constraint_def
from pg_constraint
where conrelid in (
  'public.pms_webhook_events'::regclass,
  'public.hotel_pms_connections'::regclass,
  'public.reservations'::regclass
)
  and (
    conrelid = 'public.pms_webhook_events'::regclass
    or conrelid = 'public.hotel_pms_connections'::regclass
    or (conrelid = 'public.reservations'::regclass and contype in ('u', 'f', 'p'))
  )
order by table_name, conname;

select
  pubname,
  schemaname,
  tablename
from pg_publication_tables
where schemaname = 'public'
  and tablename in ('pms_webhook_events', 'hotel_pms_connections', 'pms_webhook_quarantine')
order by pubname, tablename;
