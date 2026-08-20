-- Automation Runtime Phase 2B1.1 quiet-hours preflight
-- Read-only diagnostics. Do not mutate data. Do not treat PostgreSQL timezone
-- recognition as a replacement for Temporal validation in application code.

select
  now() as checked_at,
  current_database() as database_name,
  current_schema() as schema_name;

select
  'public.hotels exists' as check_name,
  to_regclass('public.hotels') is not null as ok;

select
  expected.column_name,
  columns.column_name is not null as already_exists,
  columns.data_type,
  columns.is_nullable,
  columns.column_default
from (
  values
    ('automation_quiet_hours_enabled'),
    ('automation_quiet_hours_start'),
    ('automation_quiet_hours_end')
) as expected(column_name)
left join information_schema.columns columns
  on columns.table_schema = 'public'
  and columns.table_name = 'hotels'
  and columns.column_name = expected.column_name
order by expected.column_name;

do $$
declare
  row record;
  hotel_count bigint := 0;
  null_timezone_count bigint := 0;
  empty_timezone_count bigint := 0;
  whitespace_timezone_count bigint := 0;
begin
  if to_regclass('public.hotels') is null then
    raise notice 'public.hotels is missing; stop before running the migration.';
    return;
  end if;

  execute 'select count(*) from public.hotels'
  into hotel_count;

  execute 'select count(*) from public.hotels where timezone is null'
  into null_timezone_count;

  execute $query$
    select count(*)
    from public.hotels
    where timezone = ''
  $query$
  into empty_timezone_count;

  execute $query$
    select count(*)
    from public.hotels
    where timezone is not null
      and timezone <> ''
      and btrim(timezone) = ''
  $query$
  into whitespace_timezone_count;

  raise notice 'existing hotel rows: %', hotel_count;
  raise notice 'timezone null rows: %', null_timezone_count;
  raise notice 'timezone empty-string rows: %', empty_timezone_count;
  raise notice 'timezone whitespace-only rows: %', whitespace_timezone_count;
  raise notice 'hotels.timezone distribution follows:';

  for row in execute $query$
    select
      coalesce(nullif(btrim(timezone), ''), '<blank>') as timezone_value,
      count(*) as hotels
    from public.hotels
    group by 1
    order by hotels desc, timezone_value
  $query$ loop
    raise notice 'timezone=% hotels=%', row.timezone_value, row.hotels;
  end loop;

  raise notice 'PostgreSQL pg_timezone_names diagnostics follow; this is informational only:';

  for row in execute $query$
    select
      hotels.id,
      hotels.name as hotel_name,
      hotels.timezone
    from public.hotels hotels
    left join pg_timezone_names zones
      on zones.name = btrim(hotels.timezone)
    where hotels.timezone is not null
      and nullif(btrim(hotels.timezone), '') is not null
      and zones.name is null
    order by hotels.id
    limit 50
  $query$ loop
    raise notice 'timezone not recognized by pg_timezone_names: hotel_id=% hotel_name=% timezone=%',
      row.id,
      row.hotel_name,
      row.timezone;
  end loop;
end $$;

select
  'Preflight summary' as section,
  case
    when to_regclass('public.hotels') is null then
      'BLOCK: public.hotels is missing.'
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'hotels'
        and column_name in (
          'automation_quiet_hours_enabled',
          'automation_quiet_hours_start',
          'automation_quiet_hours_end'
        )
    ) then
      'CHECK: one or more quiet-hours columns already exist; inspect the column report before migration.'
    else
      'READY: public.hotels exists and quiet-hours columns are absent.'
  end as result,
  'Timezone diagnostics use pg_timezone_names only; application validation remains Temporal-based and fail-closed.' as note;
