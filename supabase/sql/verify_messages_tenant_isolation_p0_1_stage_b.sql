-- BADAR P0-1 - Stage B post-migration verification
-- Read-only verification. Expected result: ready = true.

with message_counts as (
  select
    count(*) as total_messages,
    count(*) filter (where m.hotel_id is null) as hotel_id_null_count,
    count(*) filter (where c.id is null) as orphan_messages,
    count(*) filter (where c.id is not null and c.hotel_id is null) as conversation_hotel_null,
    count(*) filter (
      where m.hotel_id is not null
        and c.id is not null
        and m.hotel_id <> c.hotel_id
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
),
policy_state as (
  select
    exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'messages'
        and policyname = 'staynex_tenant_read_messages'
        and cmd = 'SELECT'
        and qual like '%staynex_can_read_hotel(hotel_id)%'
    ) as select_policy_exists,
    exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'messages'
        and policyname = 'staynex_tenant_read_messages'
        and cmd = 'SELECT'
        and roles && array['authenticated']::name[]
        and qual like '%staynex_can_read_hotel(hotel_id)%'
    ) as select_policy_authenticated_exists,
    exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'messages'
        and cmd in ('INSERT', 'UPDATE', 'DELETE')
        and roles && array['authenticated', 'public']::name[]
    ) as authenticated_write_policy_exists
),
infra_state as (
  select
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
    ) as realtime_publication_exists
)
select
  jsonb_build_object(
    'total_messages', message_counts.total_messages,
    'hotel_id_null_count', message_counts.hotel_id_null_count,
    'orphan_messages', message_counts.orphan_messages,
    'conversation_hotel_null', message_counts.conversation_hotel_null,
    'tenant_mismatch_count', message_counts.tenant_mismatch_count,
    'rls_enabled', coalesce(rls_state.rls_enabled, false),
    'select_policy_exists', policy_state.select_policy_exists,
    'select_policy_authenticated_exists', policy_state.select_policy_authenticated_exists,
    'authenticated_write_policy_absent', not policy_state.authenticated_write_policy_exists,
    'tenant_index_exists', infra_state.tenant_index_exists,
    'conversation_unique_exists', infra_state.conversation_unique_exists,
    'composite_fk_exists', infra_state.composite_fk_exists,
    'realtime_publication_exists', infra_state.realtime_publication_exists,
    'ready',
      message_counts.hotel_id_null_count = 0
      and message_counts.orphan_messages = 0
      and message_counts.conversation_hotel_null = 0
      and message_counts.tenant_mismatch_count = 0
      and coalesce(rls_state.rls_enabled, false)
      and policy_state.select_policy_exists
      and policy_state.select_policy_authenticated_exists
      and not policy_state.authenticated_write_policy_exists
      and infra_state.tenant_index_exists
      and infra_state.conversation_unique_exists
      and infra_state.composite_fk_exists
      and infra_state.realtime_publication_exists
  ) as stage_b_verification
from message_counts, policy_state, infra_state
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
