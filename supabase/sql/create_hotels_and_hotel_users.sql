-- Hotel identity + user access foundation for Staynex.
-- Safe to run on top of the MVP schema: it extends the existing hotels table
-- if it already exists and creates hotel_users for Supabase Auth mapping.

create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_name text null,
  slug text unique,
  address text null,
  phone text null,
  whatsapp_number text,
  timezone text not null default 'Europe/Madrid',
  default_language text not null default 'es',
  check_in_time text null,
  check_out_time text null,
  description text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.hotels add column if not exists brand_name text null;
alter table public.hotels add column if not exists slug text null;
alter table public.hotels add column if not exists address text null;
alter table public.hotels add column if not exists phone text null;
alter table public.hotels add column if not exists timezone text not null default 'Europe/Madrid';
alter table public.hotels add column if not exists default_language text not null default 'es';
alter table public.hotels add column if not exists check_in_time text null;
alter table public.hotels add column if not exists check_out_time text null;
alter table public.hotels add column if not exists description text null;
alter table public.hotels add column if not exists updated_at timestamptz default now();

update public.hotels
set slug = 'staynex-demo'
where slug is null
  and lower(name) = 'staynex demo hotel';

update public.hotels
set slug = 'hotel-' || substring(id::text from 1 for 8)
where slug is null;

create unique index if not exists hotels_slug_unique_idx on public.hotels (slug);

alter table public.hotels alter column slug set not null;
alter table public.hotels alter column timezone set default 'Europe/Madrid';
alter table public.hotels alter column default_language set default 'es';

insert into public.hotels (
  name,
  brand_name,
  slug,
  whatsapp_number,
  timezone,
  default_language,
  check_in_time,
  check_out_time,
  description
)
select
  'Staynex Demo Hotel',
  'Staynex',
  'staynex-demo',
  'local-test',
  'Europe/Madrid',
  'es',
  '15:00',
  '11:00',
  'Hotel demo de Staynex para pruebas operativas.'
where not exists (
  select 1
  from public.hotels
  where slug = 'staynex-demo'
);

update public.hotels
set
  brand_name = coalesce(brand_name, 'Staynex'),
  timezone = coalesce(timezone, 'Europe/Madrid'),
  default_language = coalesce(default_language, 'es'),
  check_in_time = coalesce(check_in_time, '15:00'),
  check_out_time = coalesce(check_out_time, '11:00'),
  description = coalesce(description, 'Hotel demo de Staynex para pruebas operativas.'),
  updated_at = now()
where slug = 'staynex-demo';

create table if not exists public.hotel_users (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'admin',
  created_at timestamptz default now()
);

create unique index if not exists hotel_users_user_id_hotel_id
on public.hotel_users (user_id, hotel_id);

create index if not exists hotel_users_user_id_idx
on public.hotel_users (user_id);

-- After creating a Supabase Auth user, link it manually:
--
-- insert into public.hotel_users (hotel_id, user_id, role)
-- values ('HOTEL_ID', 'AUTH_USER_ID', 'admin');
