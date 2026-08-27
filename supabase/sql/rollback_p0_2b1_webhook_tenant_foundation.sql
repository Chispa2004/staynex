-- BADAR P0-2B1 rollback.
-- Removes only empty B1-owned foundation objects introduced by P0-2B1.
--
-- Ownership contract:
--   Objects are rollback-owned only when their pg_description comment contains
--   STAYNEX_P0_2B1_OWNED_V1 and their current catalog definition still matches
--   the B1 contract. Preexisting compatible objects are preserved.
--
-- Pre-B2 automatic rollback:
--   Safe when the B1-owned quarantine table is empty.
--
-- Post-B2 operational rollback:
--   If quarantine contains rows, it may contain operational evidence. This
--   script aborts and preserves the table. Plan a manual rollback that keeps
--   evidence and rolls back application traffic before removing foundation
--   indexes that new runtime code may depend on.

begin;

do $$
declare
  ownership_marker constant text := 'STAYNEX_P0_2B1_OWNED_V1';
  quarantine_oid oid := to_regclass('public.pms_webhook_quarantine');
  quarantine_comment text;
  quarantine_row_count bigint := 0;
begin
  if quarantine_oid is not null then
    quarantine_comment := coalesce(obj_description(quarantine_oid, 'pg_class'), '');

    if quarantine_comment like '%' || ownership_marker || '%' then
      execute 'select count(*) from public.pms_webhook_quarantine'
      into quarantine_row_count;

      if quarantine_row_count > 0 then
        raise exception 'P0-2B1 rollback aborted: B1-owned public.pms_webhook_quarantine contains % row(s); preserve evidence and use a manual post-B2 rollback plan', quarantine_row_count;
      end if;
    end if;
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
  expected_table_oid oid;
begin
  for required_index in
    select *
    from (
      values
        ('pms_webhook_quarantine_created_at_idx', 'public.pms_webhook_quarantine', array['created_at desc']::text[], false, ''),
        ('pms_webhook_quarantine_provider_created_at_idx', 'public.pms_webhook_quarantine', array['provider', 'created_at']::text[], false, ''),
        ('pms_webhook_quarantine_reason_code_created_at_idx', 'public.pms_webhook_quarantine', array['reason_code', 'created_at']::text[], false, ''),
        ('pms_webhook_quarantine_status_created_at_idx', 'public.pms_webhook_quarantine', array['status', 'created_at']::text[], false, ''),
        ('pms_webhook_quarantine_candidate_connection_id_idx', 'public.pms_webhook_quarantine', array['candidate_connection_id']::text[], false, ''),
        ('hotel_pms_connections_id_hotel_id_unique_idx', 'public.hotel_pms_connections', array['id', 'hotel_id']::text[], true, ''),
        ('pms_webhook_events_connection_id_idx', 'public.pms_webhook_events', array['connection_id']::text[], false, ''),
        ('pms_webhook_events_provider_connection_event_unique_idx', 'public.pms_webhook_events', array['provider', 'connection_id', 'external_event_id']::text[], true, 'connection_idisnotnullandexternal_event_idisnotnull'),
        ('reservations_hotel_pms_provider_reservation_id_unique_idx', 'public.reservations', array['hotel_id', 'pms_provider', 'pms_reservation_id']::text[], true, 'hotel_idisnotnullandpms_providerisnotnullandpms_reservation_idisnotnull')
    ) as required_indexes(index_name, table_name, column_defs, must_be_unique, predicate_norm)
  loop
    canonical_oid := null;
    canonical_relkind := null;
    canonical_table_oid := null;
    canonical_unique := null;
    canonical_predicate_norm := null;
    canonical_column_defs := null;
    canonical_comment := null;
    expected_table_oid := to_regclass(required_index.table_name);

    select c.oid, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = required_index.index_name
    into canonical_oid, canonical_relkind;

    if canonical_oid is null then
      raise notice 'P0-2B1 rollback: index public.% is absent; skipping', required_index.index_name;
      continue;
    end if;

    canonical_comment := coalesce(obj_description(canonical_oid, 'pg_class'), '');

    if canonical_comment not like '%' || ownership_marker || '%' then
      raise notice 'P0-2B1 rollback: preserving unowned preexisting index public.%', required_index.index_name;
      continue;
    end if;

    if canonical_relkind not in ('i', 'I') then
      raise exception 'P0-2B1 rollback aborted: B1-owned object public.% is no longer an index', required_index.index_name;
    end if;

    if expected_table_oid is null then
      raise exception 'P0-2B1 rollback aborted: expected table % is missing while B1-owned index public.% exists', required_index.table_name, required_index.index_name;
    end if;

    select
      i.indrelid,
      i.indisunique,
      regexp_replace(lower(coalesce(pg_get_expr(i.indpred, i.indrelid), '')), '[[:space:]()]', '', 'g'),
      array(
        select trim(lower(regexp_replace(pg_get_indexdef(i.indexrelid, key_part.ordinality::int, true), '[[:space:]]+', ' ', 'g')))
        from unnest(i.indkey) with ordinality as key_part(attnum, ordinality)
        order by key_part.ordinality
      )
    from pg_index i
    where i.indexrelid = canonical_oid
    into canonical_table_oid, canonical_unique, canonical_predicate_norm, canonical_column_defs;

    if canonical_table_oid <> expected_table_oid
      or canonical_unique <> required_index.must_be_unique
      or canonical_column_defs is distinct from required_index.column_defs
      or coalesce(canonical_predicate_norm, '') <> required_index.predicate_norm
    then
      raise exception 'P0-2B1 rollback aborted: B1-owned index public.% has drifted from the expected B1 definition', required_index.index_name;
    end if;

    execute format('drop index public.%I', required_index.index_name);
    raise notice 'P0-2B1 rollback: dropped B1-owned index public.%', required_index.index_name;
  end loop;
end $$;

do $$
declare
  ownership_marker constant text := 'STAYNEX_P0_2B1_OWNED_V1';
  quarantine_oid oid := to_regclass('public.pms_webhook_quarantine');
  quarantine_comment text;
  missing_or_wrong_columns bigint := 0;
  unsafe_column_count bigint := 0;
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
    raise notice 'P0-2B1 rollback: public.pms_webhook_quarantine is absent; skipping';
    return;
  end if;

  quarantine_comment := coalesce(obj_description(quarantine_oid, 'pg_class'), '');

  if quarantine_comment not like '%' || ownership_marker || '%' then
    raise notice 'P0-2B1 rollback: preserving unowned preexisting public.pms_webhook_quarantine';
    return;
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
    raise exception 'P0-2B1 rollback aborted: B1-owned quarantine table has drifted from the expected B1 schema';
  end if;

  select count(*)
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'pms_webhook_quarantine'
    and (
      lower(c.column_name) in ('raw_payload', 'payload', 'request_body', 'body', 'raw_error', 'guest_name', 'email', 'phone', 'credentials', 'token', 'secret')
      or lower(c.column_name) like '%payload%'
      or lower(c.column_name) like '%body%'
      or lower(c.column_name) like '%email%'
      or lower(c.column_name) like '%phone%'
      or lower(c.column_name) like '%credential%'
      or lower(c.column_name) like '%token%'
      or lower(c.column_name) like '%secret%'
      or lower(c.column_name) like '%error%'
    )
  into unsafe_column_count;

  if unsafe_column_count > 0 then
    raise exception 'P0-2B1 rollback aborted: B1-owned quarantine table has unsafe raw-data or secret-like columns';
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
    raise exception 'P0-2B1 rollback aborted: B1-owned quarantine primary key has drifted';
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
    raise exception 'P0-2B1 rollback aborted: B1-owned quarantine reason_code CHECK has drifted';
  end if;

  drop table public.pms_webhook_quarantine;
  raise notice 'P0-2B1 rollback: dropped empty B1-owned public.pms_webhook_quarantine';
end $$;

commit;
