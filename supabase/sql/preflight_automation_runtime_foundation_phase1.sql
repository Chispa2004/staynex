-- Automation Runtime Foundation - Phase 1 preflight
-- Read-only checks. Run before add_automation_runtime_foundation_phase1.sql.

select
  now() as checked_at,
  current_database() as database_name,
  current_schema() as schema_name;

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('scheduled_messages', 'automation_runs', 'automation_events', 'ai_logs')
order by table_name, ordinal_position;

select
  count(*) as scheduled_messages_rows
from public.scheduled_messages;

select
  status,
  count(*) as rows_count
from public.scheduled_messages
group by status
order by rows_count desc, status;

select
  automation_type,
  status,
  count(*) as rows_count
from public.scheduled_messages
group by automation_type, status
order by rows_count desc, automation_type, status;

select
  hotel_id,
  metadata::jsonb ->> 'idempotency_key' as metadata_idempotency_key,
  count(*) as duplicate_rows
from public.scheduled_messages
where nullif(metadata::jsonb ->> 'idempotency_key', '') is not null
group by hotel_id, metadata::jsonb ->> 'idempotency_key'
having count(*) > 1
order by duplicate_rows desc, hotel_id;

do $$
declare
  duplicate_groups integer := 0;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scheduled_messages'
      and column_name = 'idempotency_key'
  ) then
    execute $query$
      select count(*)
      from (
        select hotel_id, idempotency_key
        from public.scheduled_messages
        where idempotency_key is not null
        group by hotel_id, idempotency_key
        having count(*) > 1
      ) duplicate_keys
    $query$
    into duplicate_groups;

    raise notice 'scheduled_messages.idempotency_key duplicate groups: %', duplicate_groups;
  else
    raise notice 'scheduled_messages.idempotency_key column is not present yet';
  end if;
end $$;

select
  automation_type,
  count(*) as runs_count
from public.automation_runs
group by automation_type
order by runs_count desc, automation_type;
