select
  'hotels_table' as check_name,
  to_regclass('public.hotels') is not null as present;

select
  columns.column_name,
  columns.data_type,
  columns.is_nullable,
  columns.column_default
from information_schema.columns columns
where columns.table_schema = 'public'
  and columns.table_name = 'hotels'
  and columns.column_name in ('country_code', 'city', 'timezone', 'timezone_integrity_status', 'address', 'metadata')
order by columns.column_name;

select
  count(*) as total_hotels,
  count(*) filter (where nullif(btrim(coalesce(hotels.timezone, '')), '') is null) as hotels_missing_timezone,
  count(*) filter (where nullif(btrim(coalesce(to_jsonb(hotels)->>'country_code', '')), '') is not null) as hotels_with_country_code,
  count(*) filter (where nullif(btrim(coalesce(to_jsonb(hotels)->>'city', '')), '') is not null) as hotels_with_city,
  count(*) filter (where coalesce(to_jsonb(hotels)->>'timezone_integrity_status', '') = 'verified') as timezone_integrity_verified,
  count(*) filter (where coalesce(to_jsonb(hotels)->>'timezone_integrity_status', '') = 'manual_override') as timezone_integrity_manual_override,
  count(*) filter (where coalesce(to_jsonb(hotels)->>'timezone_integrity_status', 'unverified') = 'unverified') as timezone_integrity_unverified,
  count(*) filter (where coalesce(to_jsonb(hotels)->>'timezone_integrity_status', '') = 'mismatch') as timezone_integrity_mismatch
from public.hotels hotels;

select
  coalesce(nullif(btrim(hotels.timezone), ''), '(empty)') as timezone,
  count(*) as hotel_count
from public.hotels hotels
group by coalesce(nullif(btrim(hotels.timezone), ''), '(empty)')
order by hotel_count desc, timezone;

select
  count(*) filter (
    where lower(coalesce(to_jsonb(hotels)->>'status', '')) in ('active', 'enabled')
      or (
        coalesce(to_jsonb(hotels)->>'archived_at', '') = ''
        and coalesce(to_jsonb(hotels)->>'deleted_at', '') = ''
      )
  ) as possible_active_hotels,
  count(*) filter (
    where lower(coalesce(to_jsonb(hotels)->>'status', '')) in ('demo', 'enterprise_demo', 'pro_demo')
      or lower(coalesce(to_jsonb(hotels)->>'subscription_plan', '')) like '%demo%'
  ) as possible_demo_hotels,
  count(*) filter (
    where lower(coalesce(to_jsonb(hotels)->>'status', '')) in ('archived', 'deleted')
      or coalesce(to_jsonb(hotels)->>'archived_at', '') <> ''
      or coalesce(to_jsonb(hotels)->>'deleted_at', '') <> ''
  ) as possible_archived_hotels,
  count(*) filter (
    where nullif(btrim(coalesce(to_jsonb(hotels)->>'address', '')), '') is not null
  ) as hotels_with_address,
  count(*) filter (
    where nullif(btrim(coalesce(to_jsonb(hotels)->>'address', '')), '') is not null
      or (
        jsonb_typeof(to_jsonb(hotels)->'metadata') = 'object'
        and (to_jsonb(hotels)->'metadata') ?| array[
          'country_code',
          'country',
          'city',
          'location',
          'timezone_location',
          'coordinates',
          'lat',
          'lng',
          'latitude',
          'longitude'
        ]
      )
  ) as hotels_with_possible_location_signals
from public.hotels hotels;

select
  pg_timezone_names.name as postgres_timezone_name,
  count(hotels.id) as matching_hotels
from pg_timezone_names
left join public.hotels hotels
  on hotels.timezone = pg_timezone_names.name
group by pg_timezone_names.name
having count(hotels.id) > 0
order by matching_hotels desc, pg_timezone_names.name;
