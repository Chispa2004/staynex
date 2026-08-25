alter table public.hotels
  add column if not exists country_code text null default null;

alter table public.hotels
  add column if not exists city text null default null;

alter table public.hotels
  add column if not exists timezone_integrity_status text not null default 'unverified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hotels_country_code_iso_alpha2_check'
      and conrelid = 'public.hotels'::regclass
  ) then
    alter table public.hotels
      add constraint hotels_country_code_iso_alpha2_check
      check (country_code is null or country_code ~ '^[A-Z]{2}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hotels_city_not_blank_check'
      and conrelid = 'public.hotels'::regclass
  ) then
    alter table public.hotels
      add constraint hotels_city_not_blank_check
      check (city is null or length(btrim(city)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hotels_timezone_integrity_status_check'
      and conrelid = 'public.hotels'::regclass
  ) then
    alter table public.hotels
      add constraint hotels_timezone_integrity_status_check
      check (timezone_integrity_status in ('unverified', 'verified', 'mismatch', 'manual_override'));
  end if;
end $$;
