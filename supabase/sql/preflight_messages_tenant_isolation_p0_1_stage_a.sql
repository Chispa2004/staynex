-- BADAR P0-1 - Stage A preflight
-- Read-only diagnostics before expanding public.messages with nullable hotel_id.

with column_state as (
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'hotel_id'
  ) as hotel_id_exists
),
message_counts as (
  select
    count(*) as total_messages,
    count(*) filter (where m.conversation_id is null) as null_conversation_id,
    count(*) filter (where c.id is null) as orphan_messages,
    count(*) filter (where c.id is not null and c.hotel_id is null) as conversation_hotel_null,
    count(*) filter (where c.id is not null and c.hotel_id is not null) as resolvable_from_conversation,
    count(*) filter (
      where m.conversation_id is null
         or c.id is null
         or c.hotel_id is null
    ) as unresolved_for_stage_a
  from public.messages m
  left join public.conversations c on c.id = m.conversation_id
)
select
  jsonb_build_object(
    'messages_exists', to_regclass('public.messages') is not null,
    'conversations_exists', to_regclass('public.conversations') is not null,
    'hotel_id_column_exists', column_state.hotel_id_exists,
    'total_messages', message_counts.total_messages,
    'messages_resolvable_from_conversation', message_counts.resolvable_from_conversation,
    'messages_with_null_conversation_id', message_counts.null_conversation_id,
    'orphan_messages', message_counts.orphan_messages,
    'conversation_hotel_null', message_counts.conversation_hotel_null,
    'unresolved_for_stage_a', message_counts.unresolved_for_stage_a,
    'staynex_can_read_hotel_exists', to_regprocedure('public.staynex_can_read_hotel(uuid)') is not null,
    'staynex_can_write_hotel_exists', to_regprocedure('public.staynex_can_write_hotel(uuid,text[])') is not null,
    'ready_for_stage_a', message_counts.unresolved_for_stage_a = 0
  ) as stage_a_summary
from column_state, message_counts;

select
  c.relrowsecurity as messages_rls_enabled,
  c.relforcerowsecurity as messages_rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'messages';

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
