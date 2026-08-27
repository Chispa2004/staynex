-- BADAR P0-2B1: PMS webhook tenant integrity foundation.
-- Migration-first, additive, and compatible with current runtime behavior.
--
-- This stage intentionally does not change runtime semantics, does not backfill
-- operational rows, does not enforce NOT NULL, does not drop legacy global
-- identities, and does not add the final composite webhook-event FK.
--
-- Production drift contract:
--   Canonical same-name B1 objects are never trusted by name alone. Existing
--   objects are validated against pg_catalog before reuse. Incompatible drift
--   aborts the transaction. Compatible preexisting objects are reused without
--   being claimed as B1-owned. Newly-created B1 objects are marked with:
--   STAYNEX_P0_2B1_OWNED_V1
--
-- Composite FK decision:
--   DEFERRED. Current runtime can still physically delete hotel_pms_connections.
--   Adding a restrictive (connection_id, hotel_id) FK in this migration-first
--   stage could break production deletes before P0-2B2/P0-2B3 runtime hardening.

begin;

do $$
declare
  duplicate_count bigint := 0;
  blocker_count bigint := 0;
  browser_grant_count bigint := 0;
  browser_policy_count bigint := 0;
  events_rls_enabled boolean := false;
  legacy_contract_compatible boolean := false;
  missing_source_columns text[];
begin
  if to_regclass('public.hotel_pms_connections') is null then
    raise exception 'P0-2B1 aborted: missing public.hotel_pms_connections';
  end if;

  if to_regclass('public.pms_webhook_events') is null then
    raise exception 'P0-2B1 aborted: missing public.pms_webhook_events';
  end if;

  if to_regclass('public.reservations') is null then
    raise exception 'P0-2B1 aborted: missing public.reservations';
  end if;

  select array_agg(required_column order by required_column)
  from (
    values
      ('public.pms_webhook_events.provider', 'public', 'pms_webhook_events', 'provider'),
      ('public.pms_webhook_events.connection_id', 'public', 'pms_webhook_events', 'connection_id'),
      ('public.pms_webhook_events.hotel_id', 'public', 'pms_webhook_events', 'hotel_id'),
      ('public.pms_webhook_events.external_event_id', 'public', 'pms_webhook_events', 'external_event_id'),
      ('public.hotel_pms_connections.id', 'public', 'hotel_pms_connections', 'id'),
      ('public.hotel_pms_connections.hotel_id', 'public', 'hotel_pms_connections', 'hotel_id'),
      ('public.hotel_pms_connections.provider', 'public', 'hotel_pms_connections', 'provider'),
      ('public.reservations.hotel_id', 'public', 'reservations', 'hotel_id'),
      ('public.reservations.pms_provider', 'public', 'reservations', 'pms_provider'),
      ('public.reservations.pms_reservation_id', 'public', 'reservations', 'pms_reservation_id')
  ) as required_columns(required_column, table_schema, table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = required_columns.table_schema
      and c.table_name = required_columns.table_name
      and c.column_name = required_columns.column_name
  )
  into missing_source_columns;

  if coalesce(array_length(missing_source_columns, 1), 0) > 0 then
    raise exception 'P0-2B1 aborted: missing critical source column(s): %', array_to_string(missing_source_columns, ', ');
  end if;

  select exists (
    select 1
    from pg_class idx
    join pg_namespace ns on ns.oid = idx.relnamespace
    join pg_index i on i.indexrelid = idx.oid
    where ns.nspname = 'public'
      and idx.relname = 'pms_webhook_events_provider_external_event_unique_idx'
      and idx.relkind in ('i', 'I')
      and i.indrelid = 'public.pms_webhook_events'::regclass
      and i.indisunique
      and array(
        select trim(lower(regexp_replace(pg_get_indexdef(i.indexrelid, key_part.ordinality::int, true), '[[:space:]]+', ' ', 'g')))
        from unnest(i.indkey) with ordinality as key_part(attnum, ordinality)
        order by key_part.ordinality
      ) = array['provider', 'external_event_id']::text[]
      and regexp_replace(lower(coalesce(pg_get_expr(i.indpred, i.indrelid), '')), '[[:space:]()]', '', 'g') = 'external_event_idisnotnull'
  )
  into legacy_contract_compatible;

  if not legacy_contract_compatible then
    raise exception 'P0-2B1 aborted: legacy event unique index pms_webhook_events_provider_external_event_unique_idx is missing or incompatible';
  end if;

  select exists (
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
  )
  into legacy_contract_compatible;

  if not legacy_contract_compatible then
    raise exception 'P0-2B1 aborted: legacy reservation unique constraint reservations_pms_unique is missing or incompatible';
  end if;

  select exists (
    select 1
    from pg_class idx
    join pg_namespace ns on ns.oid = idx.relnamespace
    join pg_index i on i.indexrelid = idx.oid
    where ns.nspname = 'public'
      and idx.relname = 'hotel_pms_connections_hotel_provider_idx'
      and idx.relkind in ('i', 'I')
      and i.indrelid = 'public.hotel_pms_connections'::regclass
      and i.indisunique
      and array(
        select trim(lower(regexp_replace(pg_get_indexdef(i.indexrelid, key_part.ordinality::int, true), '[[:space:]]+', ' ', 'g')))
        from unnest(i.indkey) with ordinality as key_part(attnum, ordinality)
        order by key_part.ordinality
      ) = array['hotel_id', 'provider']::text[]
      and coalesce(regexp_replace(lower(coalesce(pg_get_expr(i.indpred, i.indrelid), '')), '[[:space:]()]', '', 'g'), '') = ''
  )
  into legacy_contract_compatible;

  if not legacy_contract_compatible then
    raise exception 'P0-2B1 aborted: legacy hotel/provider unique index hotel_pms_connections_hotel_provider_idx is missing or incompatible';
  end if;

  select c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'pms_webhook_events'
  into events_rls_enabled;

  if not coalesce(events_rls_enabled, false) then
    raise exception 'P0-2B1 aborted: public.pms_webhook_events RLS is not enabled';
  end if;

  select count(*)
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'pms_webhook_events'
    and grantee in ('PUBLIC', 'anon', 'authenticated')
  into browser_grant_count;

  if browser_grant_count > 0 then
    raise exception 'P0-2B1 aborted: browser grants exist on public.pms_webhook_events: %', browser_grant_count;
  end if;

  select count(*)
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'pms_webhook_events'
    and exists (
      select 1
      from unnest(p.roles) as policy_role(role_name)
      where policy_role.role_name::text in ('public', 'anon', 'authenticated')
    )
  into browser_policy_count;

  if browser_policy_count > 0 then
    raise exception 'P0-2B1 aborted: browser policies exist on public.pms_webhook_events: %', browser_policy_count;
  end if;

  select count(*)
  from public.pms_webhook_events e
  join public.hotel_pms_connections c on c.id = e.connection_id
  where e.connection_id is not null
    and e.hotel_id is not null
    and e.hotel_id <> c.hotel_id
  into blocker_count;

  if blocker_count > 0 then
    raise exception 'P0-2B1 aborted: event connection/hotel mismatch rows detected: %', blocker_count;
  end if;

  select count(*)
  from public.pms_webhook_events e
  left join public.hotel_pms_connections c on c.id = e.connection_id
  where e.connection_id is not null
    and c.id is null
  into blocker_count;

  if blocker_count > 0 then
    raise exception 'P0-2B1 aborted: orphan event connection_id rows detected: %', blocker_count;
  end if;

  select count(*)
  from (
    select id, hotel_id
    from public.hotel_pms_connections
    group by id, hotel_id
    having count(*) > 1
  ) duplicate_connection_keys
  into duplicate_count;

  if duplicate_count > 0 then
    raise exception 'P0-2B1 aborted: duplicate hotel_pms_connections(id, hotel_id) groups detected: %', duplicate_count;
  end if;

  select count(*)
  from (
    select provider, connection_id, external_event_id
    from public.pms_webhook_events
    where connection_id is not null
      and external_event_id is not null
    group by provider, connection_id, external_event_id
    having count(*) > 1
  ) duplicate_event_keys
  into duplicate_count;

  if duplicate_count > 0 then
    raise exception 'P0-2B1 aborted: duplicate proposed PMS webhook event identity groups detected: %', duplicate_count;
  end if;

  select count(*)
  from (
    select hotel_id, pms_provider, pms_reservation_id
    from public.reservations
    where hotel_id is not null
      and pms_provider is not null
      and pms_reservation_id is not null
    group by hotel_id, pms_provider, pms_reservation_id
    having count(*) > 1
  ) duplicate_reservation_keys
  into duplicate_count;

  if duplicate_count > 0 then
    raise exception 'P0-2B1 aborted: duplicate proposed PMS reservation identity groups detected: %', duplicate_count;
  end if;
end $$;

do $$
declare
  ownership_marker constant text := 'STAYNEX_P0_2B1_OWNED_V1';
  quarantine_oid oid := to_regclass('public.pms_webhook_quarantine');
  quarantine_created boolean := false;
  quarantine_relkind "char";
  missing_or_wrong_columns bigint := 0;
  unsafe_column_count bigint := 0;
  browser_grant_count bigint := 0;
  browser_policy_count bigint := 0;
  realtime_membership_count bigint := 0;
  service_role_grant_count bigint := 0;
  quarantine_rls_enabled boolean := false;
  pk_compatible boolean := false;
  expected_reason_codes text[] := array[
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
  ]::text[];
  expected_reason_codes_sorted text[];
  actual_reason_codes_sorted text[];
begin
  if quarantine_oid is null then
    create table public.pms_webhook_quarantine (
      id uuid primary key default gen_random_uuid(),
      provider text not null,
      reason_code text not null,
      status text not null default 'pending',
      request_hash text null,
      event_hash text null,
      candidate_connection_id uuid null,
      safe_flags jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      reviewed_at timestamptz null,
      expires_at timestamptz null,
      constraint pms_webhook_quarantine_reason_code_check check (
        reason_code in (
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
        )
      )
    );

    quarantine_created := true;
    quarantine_oid := 'public.pms_webhook_quarantine'::regclass;

    comment on table public.pms_webhook_quarantine is
      'STAYNEX_P0_2B1_OWNED_V1: server-only PMS webhook quarantine metadata. No raw bodies, guest data, secrets, tokens, or provider error values.';

    comment on column public.pms_webhook_quarantine.safe_flags is
      'Small non-sensitive booleans/counters for triage only. Do not store request bodies, guest data, credentials, tokens, or raw provider errors.';

    comment on column public.pms_webhook_quarantine.candidate_connection_id is
      'Evidence/reference only. Deliberately no FK: the candidate may be missing, deleted, or invalid and must never authorize tenant mutation.';

    alter table public.pms_webhook_quarantine enable row level security;

    revoke all privileges on table public.pms_webhook_quarantine from public;
    revoke all privileges on table public.pms_webhook_quarantine from anon;
    revoke all privileges on table public.pms_webhook_quarantine from authenticated;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      grant select, insert, update, delete on table public.pms_webhook_quarantine to service_role;
    end if;
  end if;

  select c.relkind
  from pg_class c
  where c.oid = quarantine_oid
  into quarantine_relkind;

  if quarantine_relkind <> 'r' then
    raise exception 'P0-2B1 aborted: public.pms_webhook_quarantine exists but is not a regular table';
  end if;

  with expected_columns(column_name, udt_name, is_nullable, default_like) as (
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
  )
  select count(*)
  from expected_columns e
  left join information_schema.columns c
    on c.table_schema = 'public'
    and c.table_name = 'pms_webhook_quarantine'
    and c.column_name = e.column_name
  where c.column_name is null
    or c.udt_name <> e.udt_name
    or ((c.is_nullable = 'YES') <> e.is_nullable)
    or (e.default_like is null and c.column_default is not null)
    or (e.default_like is not null and lower(coalesce(c.column_default, '')) not like e.default_like)
  into missing_or_wrong_columns;

  if missing_or_wrong_columns > 0 then
    raise exception 'P0-2B1 aborted: public.pms_webhook_quarantine has incompatible columns, types, nullability, or defaults';
  end if;

  select count(*)
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'pms_webhook_quarantine'
    and (
      lower(c.column_name) in (
        'raw_payload',
        'payload',
        'request_body',
        'body',
        'raw_error',
        'guest_name',
        'email',
        'phone',
        'credentials',
        'token',
        'secret'
      )
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
  into unsafe_column_count;

  if unsafe_column_count > 0 then
    raise exception 'P0-2B1 aborted: public.pms_webhook_quarantine has unsafe raw-data or secret-like columns';
  end if;

  select exists (
    select 1
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
      and att.attnum = any(con.conkey)
    where con.conrelid = quarantine_oid
      and con.contype = 'p'
      and con.conkey = array[att.attnum]::smallint[]
      and att.attname = 'id'
  )
  into pk_compatible;

  if not pk_compatible then
    raise exception 'P0-2B1 aborted: public.pms_webhook_quarantine primary key is incompatible';
  end if;

  select array_agg(code order by code)
  from unnest(expected_reason_codes) as code
  into expected_reason_codes_sorted;

  select array_agg(reason_code order by reason_code)
  from (
    select distinct reason_match[1] as reason_code
    from pg_constraint con
    cross join lateral regexp_matches(pg_get_constraintdef(con.oid), '''([^'']+)''', 'g') as reason_match
    where con.conrelid = quarantine_oid
      and con.conname = 'pms_webhook_quarantine_reason_code_check'
      and con.contype = 'c'
  ) parsed_reason_codes
  into actual_reason_codes_sorted;

  if actual_reason_codes_sorted is distinct from expected_reason_codes_sorted then
    raise exception 'P0-2B1 aborted: public.pms_webhook_quarantine reason_code CHECK contract is incompatible';
  end if;

  select c.relrowsecurity
  from pg_class c
  where c.oid = quarantine_oid
  into quarantine_rls_enabled;

  if not quarantine_rls_enabled then
    raise exception 'P0-2B1 aborted: public.pms_webhook_quarantine RLS is not enabled';
  end if;

  select count(*)
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'pms_webhook_quarantine'
    and grantee in ('PUBLIC', 'anon', 'authenticated')
  into browser_grant_count;

  if browser_grant_count > 0 then
    raise exception 'P0-2B1 aborted: browser grants exist on public.pms_webhook_quarantine';
  end if;

  select count(*)
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'pms_webhook_quarantine'
    and exists (
      select 1
      from unnest(p.roles) as policy_role(role_name)
      where policy_role.role_name::text in ('public', 'anon', 'authenticated')
    )
  into browser_policy_count;

  if browser_policy_count > 0 then
    raise exception 'P0-2B1 aborted: browser policies exist on public.pms_webhook_quarantine';
  end if;

  select count(*)
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'pms_webhook_quarantine'
  into realtime_membership_count;

  if realtime_membership_count > 0 then
    if quarantine_created then
      alter publication supabase_realtime drop table public.pms_webhook_quarantine;
    else
      raise exception 'P0-2B1 aborted: preexisting public.pms_webhook_quarantine is in supabase_realtime';
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    select count(distinct privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'pms_webhook_quarantine'
      and grantee = 'service_role'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    into service_role_grant_count;

    if service_role_grant_count <> 4 then
      raise exception 'P0-2B1 aborted: public.pms_webhook_quarantine service_role grants are incomplete';
    end if;
  end if;

  if quarantine_created then
    raise notice 'P0-2B1 created and marked public.pms_webhook_quarantine as B1-owned';
  elsif coalesce(obj_description(quarantine_oid, 'pg_class'), '') like '%' || ownership_marker || '%' then
    raise notice 'P0-2B1 reusing B1-owned public.pms_webhook_quarantine after exact compatibility validation';
  else
    raise notice 'P0-2B1 reusing compatible preexisting public.pms_webhook_quarantine; not B1-owned';
  end if;
end $$;

do $$
declare
  ownership_marker constant text := 'STAYNEX_P0_2B1_OWNED_V1';
  required_index record;
  canonical_oid oid;
  canonical_relkind "char";
  canonical_table_oid oid;
  canonical_unique boolean;
  canonical_predicate_norm text;
  canonical_column_defs text[];
  canonical_comment text;
  equivalent_oid oid;
  equivalent_name text;
  expected_table_oid oid;
begin
  for required_index in
    select *
    from (
      values
        (
          'pms_webhook_quarantine_created_at_idx',
          'public.pms_webhook_quarantine',
          array['created_at desc']::text[],
          false,
          '',
          'create index pms_webhook_quarantine_created_at_idx on public.pms_webhook_quarantine(created_at desc)',
          'quarantine created_at index'
        ),
        (
          'pms_webhook_quarantine_provider_created_at_idx',
          'public.pms_webhook_quarantine',
          array['provider', 'created_at']::text[],
          false,
          '',
          'create index pms_webhook_quarantine_provider_created_at_idx on public.pms_webhook_quarantine(provider, created_at)',
          'quarantine provider/created_at index'
        ),
        (
          'pms_webhook_quarantine_reason_code_created_at_idx',
          'public.pms_webhook_quarantine',
          array['reason_code', 'created_at']::text[],
          false,
          '',
          'create index pms_webhook_quarantine_reason_code_created_at_idx on public.pms_webhook_quarantine(reason_code, created_at)',
          'quarantine reason_code/created_at index'
        ),
        (
          'pms_webhook_quarantine_status_created_at_idx',
          'public.pms_webhook_quarantine',
          array['status', 'created_at']::text[],
          false,
          '',
          'create index pms_webhook_quarantine_status_created_at_idx on public.pms_webhook_quarantine(status, created_at)',
          'quarantine status/created_at index'
        ),
        (
          'pms_webhook_quarantine_candidate_connection_id_idx',
          'public.pms_webhook_quarantine',
          array['candidate_connection_id']::text[],
          false,
          '',
          'create index pms_webhook_quarantine_candidate_connection_id_idx on public.pms_webhook_quarantine(candidate_connection_id)',
          'quarantine candidate_connection_id index'
        ),
        (
          'hotel_pms_connections_id_hotel_id_unique_idx',
          'public.hotel_pms_connections',
          array['id', 'hotel_id']::text[],
          true,
          '',
          'create unique index hotel_pms_connections_id_hotel_id_unique_idx on public.hotel_pms_connections(id, hotel_id)',
          'connection composite unique support'
        ),
        (
          'pms_webhook_events_connection_id_idx',
          'public.pms_webhook_events',
          array['connection_id']::text[],
          false,
          '',
          'create index pms_webhook_events_connection_id_idx on public.pms_webhook_events(connection_id)',
          'webhook event connection_id support'
        ),
        (
          'pms_webhook_events_provider_connection_event_unique_idx',
          'public.pms_webhook_events',
          array['provider', 'connection_id', 'external_event_id']::text[],
          true,
          'connection_idisnotnullandexternal_event_idisnotnull',
          'create unique index pms_webhook_events_provider_connection_event_unique_idx on public.pms_webhook_events(provider, connection_id, external_event_id) where connection_id is not null and external_event_id is not null',
          'scoped webhook-event unique support'
        ),
        (
          'reservations_hotel_pms_provider_reservation_id_unique_idx',
          'public.reservations',
          array['hotel_id', 'pms_provider', 'pms_reservation_id']::text[],
          true,
          'hotel_idisnotnullandpms_providerisnotnullandpms_reservation_idisnotnull',
          'create unique index reservations_hotel_pms_provider_reservation_id_unique_idx on public.reservations(hotel_id, pms_provider, pms_reservation_id) where hotel_id is not null and pms_provider is not null and pms_reservation_id is not null',
          'scoped reservation unique support'
        )
    ) as required_indexes(
      index_name,
      table_name,
      column_defs,
      must_be_unique,
      predicate_norm,
      create_sql,
      marker_label
    )
  loop
    expected_table_oid := to_regclass(required_index.table_name);
    if expected_table_oid is null then
      raise exception 'P0-2B1 aborted: expected index table is missing: %', required_index.table_name;
    end if;

    canonical_oid := null;
    canonical_relkind := null;
    canonical_table_oid := null;
    canonical_unique := null;
    canonical_predicate_norm := null;
    canonical_column_defs := null;
    canonical_comment := null;

    select c.oid, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = required_index.index_name
    into canonical_oid, canonical_relkind;

    if canonical_oid is not null then
      if canonical_relkind not in ('i', 'I') then
        raise exception 'P0-2B1 aborted: %.% exists but is not an index', 'public', required_index.index_name;
      end if;

      select
        i.indrelid,
        i.indisunique,
        regexp_replace(lower(coalesce(pg_get_expr(i.indpred, i.indrelid), '')), '[[:space:]()]', '', 'g'),
        array(
          select trim(lower(regexp_replace(pg_get_indexdef(i.indexrelid, key_part.ordinality::int, true), '[[:space:]]+', ' ', 'g')))
          from unnest(i.indkey) with ordinality as key_part(attnum, ordinality)
          order by key_part.ordinality
        ),
        obj_description(canonical_oid, 'pg_class')
      from pg_index i
      where i.indexrelid = canonical_oid
      into canonical_table_oid, canonical_unique, canonical_predicate_norm, canonical_column_defs, canonical_comment;

      if canonical_table_oid <> expected_table_oid
        or canonical_unique <> required_index.must_be_unique
        or canonical_column_defs is distinct from required_index.column_defs
        or coalesce(canonical_predicate_norm, '') <> required_index.predicate_norm
      then
        raise exception 'P0-2B1 aborted: same-name index public.% has incompatible table, uniqueness, columns, order, or predicate', required_index.index_name;
      end if;

      if coalesce(canonical_comment, '') like '%' || ownership_marker || '%' then
        raise notice 'P0-2B1 reusing B1-owned compatible index public.%', required_index.index_name;
      else
        raise notice 'P0-2B1 reusing compatible preexisting index public.% without claiming ownership', required_index.index_name;
      end if;
    else
      equivalent_oid := null;
      equivalent_name := null;

      select candidate.index_oid, candidate.index_name
      from (
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
          ) as column_defs
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_index i on i.indexrelid = c.oid
        where n.nspname = 'public'
          and c.relkind in ('i', 'I')
          and c.relname <> required_index.index_name
      ) candidate
      where candidate.table_oid = expected_table_oid
        and candidate.is_unique = required_index.must_be_unique
        and candidate.column_defs is not distinct from required_index.column_defs
        and coalesce(candidate.predicate_norm, '') = required_index.predicate_norm
      order by candidate.index_name
      limit 1
      into equivalent_oid, equivalent_name;

      if equivalent_oid is not null then
        raise notice 'P0-2B1 reusing equivalent compatible preexisting index public.% for %. It is not B1-owned.', equivalent_name, required_index.index_name;
      else
        execute required_index.create_sql;
        execute format(
          'comment on index public.%I is %L',
          required_index.index_name,
          ownership_marker || ': ' || required_index.marker_label
        );
        raise notice 'P0-2B1 created and marked index public.% as B1-owned', required_index.index_name;
      end if;
    end if;
  end loop;
end $$;

commit;
