alter table public.hotels
  drop constraint if exists hotels_timezone_integrity_status_check;

alter table public.hotels
  drop constraint if exists hotels_city_not_blank_check;

alter table public.hotels
  drop constraint if exists hotels_country_code_iso_alpha2_check;

alter table public.hotels
  drop column if exists timezone_integrity_status;

alter table public.hotels
  drop column if exists city;

alter table public.hotels
  drop column if exists country_code;
