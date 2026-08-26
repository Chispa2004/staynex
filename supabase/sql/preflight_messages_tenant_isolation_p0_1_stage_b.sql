-- BADAR P0-1 - Stage B preflight
-- Read-only diagnostics before enforcing NOT NULL + RLS contract.

with checks as (
  select
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'messages'
        and column_name = 'hotel_id'
    ) as hotel_id_exists,
    exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'messages'
        and indexname = 'messages_hotel_conversation_created_idx'
    ) as tenant_index_exists,
    exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'conversations'
        and indexname = 'conversations_id_hotel_id_unique_idx'
    ) as conversation_unique_exists,
    exists (
      select 1
      from pg_constraint
      where conname = 'messages_conversation_hotel_match_fk'
        and conrelid = 'public.messages'::regclass
    ) as composite_fk_exists,
    exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) as realtime_publication_exists,
    to_regprocedure('public.staynex_can_read_hotel(uuid)') is not null as read_helper_exists,
    to_regprocedure('public.staynex_can_write_hotel(uuid,text[])') is not null as write_helper_exists
),
message_counts as (
  select
    count(*) as total_messages,
    count(*) filter (where (to_jsonb(m)->>'hotel_id') is null) as hotel_id_null_count,
    count(*) filter (where c.id is null) as orphan_messages,
    count(*) filter (where c.id is not null and c.hotel_id is null) as conversation_hotel_null,
    count(*) filter (
      where (to_jsonb(m)->>'hotel_id') is null
        and c.id is not null
        and c.hotel_id is not null
    ) as rows_backfillable,
    count(*) filter (
      where (to_jsonb(m)->>'hotel_id') is not null
        and c.id is not null
        and (to_jsonb(m)->>'hotel_id')::uuid <> c.hotel_id
    ) as tenant_mismatch_count
  from public.messages m
  left join public.conversations c on c.id = m.conversation_id
),
rls_state as (
  select
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'messages'
)
select
  jsonb_build_object(
    'hotel_id_exists', checks.hotel_id_exists,
    'stage_a_index_exists', checks.tenant_index_exists,
    'conversation_unique_exists', checks.conversation_unique_exists,
    'composite_fk_exists', checks.composite_fk_exists,
    'realtime_publication_exists', checks.realtime_publication_exists,
    'total_messages', message_counts.total_messages,
    'hotel_id_null_count', message_counts.hotel_id_null_count,
    'orphan_messages', message_counts.orphan_messages,
    'conversation_hotel_null', message_counts.conversation_hotel_null,
    'tenant_mismatch_count', message_counts.tenant_mismatch_count,
    'rows_backfillable', message_counts.rows_backfillable,
    'rls_enabled', coalesce(rls_state.rls_enabled, false),
    'messages_rls_enabled_before_stage_b', coalesce(rls_state.rls_enabled, false),
    'staynex_can_read_hotel_exists', checks.read_helper_exists,
    'staynex_can_write_hotel_exists', checks.write_helper_exists,
    'ready_for_stage_b',
      checks.hotel_id_exists
      and checks.tenant_index_exists
      and checks.conversation_unique_exists
      and checks.composite_fk_exists
      and checks.realtime_publication_exists
      and checks.read_helper_exists
      and message_counts.orphan_messages = 0
      and message_counts.conversation_hotel_null = 0
      and message_counts.tenant_mismatch_count = 0
  ) as stage_b_summary
from checks, message_counts
left join rls_state on true;

select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'messages'
order by policyname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('messages', 'conversations')
  and (
    tablename = 'messages'
    or indexname = 'conversations_id_hotel_id_unique_idx'
  )
order by tablename, indexname;

select
  conname,
  pg_get_constraintdef(oid) as constraint_def
from pg_constraint
where conrelid = 'public.messages'::regclass
order by conname;

select
  pubname,
  schemaname,
  tablename
from pg_publication_tables
where schemaname = 'public'
  and tablename = 'messages'
order by pubname;
