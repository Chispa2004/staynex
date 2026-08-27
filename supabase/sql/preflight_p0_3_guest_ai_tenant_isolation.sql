-- BADAR P0-3: Guest/AI tenant isolation preflight.
-- Read-only diagnostic. It reports counts, RLS/grants, policies and tenant
-- consistency without returning guest contact data or AI text content.

with scoped_tables(table_name, target_access) as (
  values
    ('guests'::text, 'SERVER ONLY'::text),
    ('guest_ai_profiles'::text, 'SERVER ONLY'::text),
    ('guest_ai_tags'::text, 'SERVER ONLY'::text),
    ('guest_ai_insights'::text, 'SERVER ONLY'::text),
    ('guest_ai_actions'::text, 'SERVER ONLY'::text),
    ('ai_logs'::text, 'SERVER ONLY'::text),
    ('conversation_ai_state'::text, 'SERVER ONLY'::text),
    ('scheduled_messages'::text, 'SERVER ONLY'::text)
),
schema_state as (
  select
    st.table_name,
    st.target_access,
    to_regclass(format('%I.%I', 'public', st.table_name)) as table_regclass,
    to_regclass(format('%I.%I', 'public', st.table_name)) is not null as table_exists,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = st.table_name
        and c.column_name = 'hotel_id'
    ) as hotel_id_exists,
    coalesce((
      select cls.relrowsecurity
      from pg_class cls
      where cls.oid = to_regclass(format('%I.%I', 'public', st.table_name))
    ), false) as rls_enabled
  from scoped_tables st
),
row_counts as (
  select
    ss.table_name,
    case
      when ss.table_exists then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as total_rows,
    case
      when ss.table_exists and ss.hotel_id_exists then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I where hotel_id is null',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as hotel_id_null_count
  from schema_state ss
),
relationship_columns as (
  select
    ss.table_name,
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = ss.table_name
        and c.column_name = 'guest_id'
    ) as has_guest_id,
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = ss.table_name
        and c.column_name = 'conversation_id'
    ) as has_conversation_id,
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = ss.table_name
        and c.column_name = 'reservation_id'
    ) as has_reservation_id,
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = ss.table_name
        and c.column_name = 'message_id'
    ) as has_message_id,
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = ss.table_name
        and c.column_name = 'ticket_id'
    ) as has_ticket_id
  from schema_state ss
),
guest_relationship_stats as (
  select
    ss.table_name,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_guest_id
        and to_regclass('public.guests') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t left join public.guests g on g.id = t.guest_id where t.guest_id is not null and g.id is null',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as guest_orphan_count,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_guest_id
        and to_regclass('public.guests') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t join public.guests g on g.id = t.guest_id where t.guest_id is not null and t.hotel_id is not null and g.hotel_id is distinct from t.hotel_id',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as guest_hotel_mismatch_count
  from schema_state ss
  join relationship_columns rc using (table_name)
),
conversation_relationship_stats as (
  select
    ss.table_name,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_conversation_id
        and to_regclass('public.conversations') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t left join public.conversations c on c.id = t.conversation_id where t.conversation_id is not null and c.id is null',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as conversation_orphan_count,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_conversation_id
        and to_regclass('public.conversations') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t join public.conversations c on c.id = t.conversation_id where t.conversation_id is not null and t.hotel_id is not null and c.hotel_id is distinct from t.hotel_id',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as conversation_hotel_mismatch_count
  from schema_state ss
  join relationship_columns rc using (table_name)
),
reservation_relationship_stats as (
  select
    ss.table_name,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_reservation_id
        and to_regclass('public.reservations') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t left join public.reservations r on r.id = t.reservation_id where t.reservation_id is not null and r.id is null',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as reservation_orphan_count,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_reservation_id
        and to_regclass('public.reservations') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t join public.reservations r on r.id = t.reservation_id where t.reservation_id is not null and t.hotel_id is not null and r.hotel_id is distinct from t.hotel_id',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as reservation_hotel_mismatch_count
  from schema_state ss
  join relationship_columns rc using (table_name)
),
message_relationship_stats as (
  select
    ss.table_name,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_message_id
        and to_regclass('public.messages') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t left join public.messages m on m.id = t.message_id where t.message_id is not null and m.id is null',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as message_orphan_count,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_message_id
        and to_regclass('public.messages') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t join public.messages m on m.id = t.message_id where t.message_id is not null and t.hotel_id is not null and m.hotel_id is distinct from t.hotel_id',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as message_hotel_mismatch_count
  from schema_state ss
  join relationship_columns rc using (table_name)
),
ticket_relationship_stats as (
  select
    ss.table_name,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_ticket_id
        and to_regclass('public.tickets') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t left join public.tickets k on k.id = t.ticket_id where t.ticket_id is not null and k.id is null',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as ticket_orphan_count,
    case
      when ss.table_exists
        and ss.hotel_id_exists
        and rc.has_ticket_id
        and to_regclass('public.tickets') is not null
      then
        ((xpath('/row/c/text()', query_to_xml(format(
          'select count(*) as c from public.%I t join public.tickets k on k.id = t.ticket_id where t.ticket_id is not null and t.hotel_id is not null and k.hotel_id is distinct from t.hotel_id',
          ss.table_name
        ), false, true, '')))[1]::text)::bigint
      else null::bigint
    end as ticket_hotel_mismatch_count
  from schema_state ss
  join relationship_columns rc using (table_name)
),
grant_catalog as (
  select
    st.table_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'grantee', g.grantee,
      'privilege', g.privilege_type
    ) order by g.grantee, g.privilege_type) filter (where g.grantee is not null), '[]'::jsonb) as grants,
    count(*) filter (where lower(g.grantee) in ('public', 'anon', 'authenticated')) as browser_grants
  from scoped_tables st
  left join information_schema.role_table_grants g
    on g.table_schema = 'public'
   and g.table_name = st.table_name
   and lower(g.grantee) in ('public', 'anon', 'authenticated', 'service_role')
  group by st.table_name
),
policy_catalog as (
  select
    st.table_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'policy_name', p.policyname,
      'command', p.cmd,
      'roles', p.roles,
      'using', p.qual,
      'with_check', p.with_check
    ) order by p.policyname) filter (where p.policyname is not null), '[]'::jsonb) as policies,
    count(*) filter (where p.roles && array['public', 'anon', 'authenticated']::name[]) as dangerous_browser_policies
  from scoped_tables st
  left join pg_policies p
    on p.schemaname = 'public'
   and p.tablename = st.table_name
  group by st.table_name
),
fk_catalog as (
  select
    st.table_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'constraint_name', con.conname,
      'definition', pg_get_constraintdef(con.oid)
    ) order by con.conname) filter (where con.conname is not null), '[]'::jsonb) as foreign_keys
  from scoped_tables st
  left join pg_constraint con
    on con.conrelid = to_regclass(format('%I.%I', 'public', st.table_name))
   and con.contype = 'f'
  group by st.table_name
),
index_catalog as (
  select
    st.table_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'index_name', i.indexname,
      'is_unique', ix.indisunique,
      'definition_hash', md5(i.indexdef),
      'covers_hotel_id', i.indexdef ilike '%hotel_id%',
      'covers_guest_id', i.indexdef ilike '%guest_id%',
      'covers_conversation_id', i.indexdef ilike '%conversation_id%',
      'covers_reservation_id', i.indexdef ilike '%reservation_id%',
      'covers_message_id', i.indexdef ilike '%message_id%',
      'covers_ticket_id', i.indexdef ilike '%ticket_id%'
    ) order by i.indexname) filter (where i.indexname is not null), '[]'::jsonb) as relevant_indexes
  from scoped_tables st
  left join pg_indexes i
    on i.schemaname = 'public'
   and i.tablename = st.table_name
   and (
     i.indexdef ilike '%hotel_id%'
     or i.indexdef ilike '%guest_id%'
     or i.indexdef ilike '%conversation_id%'
     or i.indexdef ilike '%reservation_id%'
     or i.indexdef ilike '%message_id%'
     or i.indexdef ilike '%ticket_id%'
   )
  left join pg_namespace ns
    on ns.nspname = 'public'
  left join pg_class idx
    on idx.relname = i.indexname
   and idx.relnamespace = ns.oid
   and idx.relkind = 'i'
  left join pg_index ix
    on ix.indexrelid = idx.oid
  group by st.table_name
),
needed_indexes(index_name, table_name, expected_pattern) as (
  values
    ('guests_id_hotel_id_unique_idx'::text, 'guests'::text, 'CREATE UNIQUE INDEX .* ON public\.guests .* \(id, hotel_id\)'::text),
    ('conversations_id_hotel_id_unique_idx'::text, 'conversations'::text, 'CREATE UNIQUE INDEX .* ON public\.conversations .* \(id, hotel_id\)'::text),
    ('reservations_id_hotel_id_unique_idx'::text, 'reservations'::text, 'CREATE UNIQUE INDEX .* ON public\.reservations .* \(id, hotel_id\)'::text)
),
index_conflicts as (
  select
    count(*) filter (
      where idx.oid is not null
        and (
          rel.relname is distinct from ni.table_name
          or ix.indisunique is distinct from true
          or pg_get_indexdef(idx.oid) !~ ni.expected_pattern
        )
    ) as conflict_count,
    coalesce(jsonb_agg(jsonb_build_object(
      'index_name', ni.index_name,
      'expected_table', ni.table_name,
      'actual_table', rel.relname,
      'actual_definition_hash', case when idx.oid is null then null else md5(pg_get_indexdef(idx.oid)) end
    ) order by ni.index_name) filter (
      where idx.oid is not null
        and (
          rel.relname is distinct from ni.table_name
          or ix.indisunique is distinct from true
          or pg_get_indexdef(idx.oid) !~ ni.expected_pattern
        )
    ), '[]'::jsonb) as conflicts
  from needed_indexes ni
  left join pg_namespace ns
    on ns.nspname = 'public'
  left join pg_class idx
    on idx.relname = ni.index_name
   and idx.relnamespace = ns.oid
   and idx.relkind = 'i'
  left join pg_index ix
    on ix.indexrelid = idx.oid
  left join pg_class rel
    on rel.oid = ix.indrelid
),
needed_constraints(constraint_name, table_name, expected_pattern) as (
  values
    ('guest_ai_profiles_guest_hotel_match_fk'::text, 'guest_ai_profiles'::text, 'FOREIGN KEY \(guest_id, hotel_id\) REFERENCES guests\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
    ('guest_ai_tags_guest_hotel_match_fk'::text, 'guest_ai_tags'::text, 'FOREIGN KEY \(guest_id, hotel_id\) REFERENCES guests\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
    ('guest_ai_insights_guest_hotel_match_fk'::text, 'guest_ai_insights'::text, 'FOREIGN KEY \(guest_id, hotel_id\) REFERENCES guests\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
    ('guest_ai_actions_guest_hotel_match_fk'::text, 'guest_ai_actions'::text, 'FOREIGN KEY \(guest_id, hotel_id\) REFERENCES guests\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
    ('conversation_ai_state_conversation_hotel_match_fk'::text, 'conversation_ai_state'::text, 'FOREIGN KEY \(conversation_id, hotel_id\) REFERENCES conversations\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
    ('scheduled_messages_reservation_hotel_match_fk'::text, 'scheduled_messages'::text, 'FOREIGN KEY \(reservation_id, hotel_id\) REFERENCES reservations\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text)
),
constraint_conflicts as (
  select
    count(*) filter (
      where con.oid is not null
        and (
          con.contype <> 'f'
          or pg_get_constraintdef(con.oid) !~ nc.expected_pattern
        )
    ) as conflict_count,
    coalesce(jsonb_agg(jsonb_build_object(
      'constraint_name', nc.constraint_name,
      'table_name', nc.table_name,
      'actual_definition', pg_get_constraintdef(con.oid)
    ) order by nc.constraint_name) filter (
      where con.oid is not null
        and (
          con.contype <> 'f'
          or pg_get_constraintdef(con.oid) !~ nc.expected_pattern
        )
    ), '[]'::jsonb) as conflicts
  from needed_constraints nc
  left join pg_constraint con
    on con.conname = nc.constraint_name
   and con.conrelid = to_regclass(format('%I.%I', 'public', nc.table_name))
),
table_report as (
  select
    ss.table_name,
    ss.target_access,
    ss.table_exists,
    ss.hotel_id_exists,
    ss.rls_enabled,
    rc.total_rows,
    rc.hotel_id_null_count,
    gr.guest_orphan_count,
    gr.guest_hotel_mismatch_count,
    cr.conversation_orphan_count,
    cr.conversation_hotel_mismatch_count,
    rr.reservation_orphan_count,
    rr.reservation_hotel_mismatch_count,
    mr.message_orphan_count,
    mr.message_hotel_mismatch_count,
    tr.ticket_orphan_count,
    tr.ticket_hotel_mismatch_count,
    gc.browser_grants,
    gc.grants,
    pc.dangerous_browser_policies,
    pc.policies,
    fk.foreign_keys,
    ix.relevant_indexes
  from schema_state ss
  join row_counts rc using (table_name)
  join guest_relationship_stats gr using (table_name)
  join conversation_relationship_stats cr using (table_name)
  join reservation_relationship_stats rr using (table_name)
  join message_relationship_stats mr using (table_name)
  join ticket_relationship_stats tr using (table_name)
  join grant_catalog gc using (table_name)
  join policy_catalog pc using (table_name)
  join fk_catalog fk using (table_name)
  join index_catalog ix using (table_name)
),
metrics as (
  select
    count(*) filter (where not table_exists) as missing_table_count,
    count(*) filter (where table_exists and not hotel_id_exists) as missing_hotel_id_count,
    coalesce(sum(coalesce(hotel_id_null_count, 0)), 0) as hotel_id_null_count,
    coalesce(sum(coalesce(guest_orphan_count, 0)), 0)
      + coalesce(sum(coalesce(conversation_orphan_count, 0)), 0)
      + coalesce(sum(coalesce(reservation_orphan_count, 0)), 0)
      + coalesce(sum(coalesce(message_orphan_count, 0)), 0)
      + coalesce(sum(coalesce(ticket_orphan_count, 0)), 0) as orphan_relationship_count,
    coalesce(sum(coalesce(guest_hotel_mismatch_count, 0)), 0)
      + coalesce(sum(coalesce(conversation_hotel_mismatch_count, 0)), 0)
      + coalesce(sum(coalesce(reservation_hotel_mismatch_count, 0)), 0)
      + coalesce(sum(coalesce(message_hotel_mismatch_count, 0)), 0)
      + coalesce(sum(coalesce(ticket_hotel_mismatch_count, 0)), 0) as tenant_mismatch_count,
    coalesce(sum(browser_grants), 0) as browser_grant_count,
    coalesce(sum(dangerous_browser_policies), 0) as dangerous_browser_policy_count,
    (select conflict_count from index_conflicts) as index_conflict_count,
    (select conflict_count from constraint_conflicts) as constraint_conflict_count
  from table_report
),
readiness as (
  select
    case
      when missing_table_count > 0
        or missing_hotel_id_count > 0
        or orphan_relationship_count > 0
        or tenant_mismatch_count > 0
        or dangerous_browser_policy_count > 0
        or index_conflict_count > 0
        or constraint_conflict_count > 0
      then 'BLOCKED'
      when hotel_id_null_count > 0 then 'NEEDS_MANUAL_REVIEW'
      else 'READY'
    end as readiness,
    metrics.*
  from metrics
)
select
  readiness as ready_for_p0_3,
  readiness,
  jsonb_build_object(
    'missing_table_count', missing_table_count,
    'missing_hotel_id_count', missing_hotel_id_count,
    'hotel_id_null_count', hotel_id_null_count,
    'orphan_relationship_count', orphan_relationship_count,
    'tenant_mismatch_count', tenant_mismatch_count,
    'browser_grant_count', browser_grant_count,
    'dangerous_browser_policy_count', dangerous_browser_policy_count,
    'index_conflict_count', index_conflict_count,
    'constraint_conflict_count', constraint_conflict_count,
    'index_conflicts', (select conflicts from index_conflicts),
    'constraint_conflicts', (select conflicts from constraint_conflicts)
  ) as summary,
  (
    select jsonb_agg(to_jsonb(table_report) order by table_name)
    from table_report
  ) as table_matrix
from readiness;
