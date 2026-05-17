-- Experience Providers v1
-- Controlled rollout: run manually in Supabase after review.
-- This creates a platform-managed provider catalog and hotel-level activation layer.

create extension if not exists pgcrypto;

create table if not exists experience_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  provider_type text not null default 'tour_operator',
  destination_country text not null,
  destination_city text null,
  contact_email text null,
  website_url text null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotel_experience_providers (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  provider_id uuid not null references experience_providers(id) on delete cascade,
  priority integer not null default 0,
  active boolean not null default true,
  lead_email text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, provider_id)
);

create table if not exists provider_experiences (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references experience_providers(id) on delete cascade,
  title text not null,
  slug text not null,
  category text not null default 'tour',
  description text null,
  short_description text null,
  price numeric null,
  commission_percent numeric null,
  currency text not null default 'EUR',
  tags text[] not null default '{}',
  audience_tags text[] not null default '{}',
  destination_city text null,
  image_url text null,
  duration text null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, slug)
);

create index if not exists idx_experience_providers_slug on experience_providers(slug);
create index if not exists idx_experience_providers_destination on experience_providers(destination_country, destination_city);
create index if not exists idx_hotel_experience_providers_hotel on hotel_experience_providers(hotel_id);
create index if not exists idx_hotel_experience_providers_provider on hotel_experience_providers(provider_id);
create index if not exists idx_provider_experiences_provider on provider_experiences(provider_id);
create index if not exists idx_provider_experiences_active on provider_experiences(active);
create index if not exists idx_provider_experiences_category on provider_experiences(category);

alter table experience_booking_requests
  add column if not exists provider_id uuid null references experience_providers(id) on delete set null,
  add column if not exists provider_experience_id uuid null references provider_experiences(id) on delete set null,
  add column if not exists provider_source text null,
  add column if not exists provider_lead_email text null,
  add column if not exists lead_status text null default 'not_required',
  add column if not exists lead_email_payload jsonb null,
  add column if not exists lead_email_sent_at timestamptz null,
  add column if not exists lead_error text null;

create index if not exists idx_experience_booking_requests_provider on experience_booking_requests(provider_id);
create index if not exists idx_experience_booking_requests_provider_source on experience_booking_requests(provider_source);
create index if not exists idx_experience_booking_requests_lead_status on experience_booking_requests(lead_status);

insert into experience_providers (
  name,
  slug,
  provider_type,
  destination_country,
  destination_city,
  contact_email,
  website_url,
  active,
  metadata
) values (
  'Luxotour Morocco',
  'luxotour-morocco',
  'tour_operator',
  'Morocco',
  null,
  'reservas@luxotour.com',
  'https://www.luxotour.com',
  true,
  jsonb_build_object(
    'lead_mode', 'email',
    'managed_by', 'staynex_platform',
    'future_api_ready', true
  )
) on conflict (slug) do update set
  name = excluded.name,
  provider_type = excluded.provider_type,
  destination_country = excluded.destination_country,
  contact_email = excluded.contact_email,
  website_url = excluded.website_url,
  active = excluded.active,
  metadata = experience_providers.metadata || excluded.metadata,
  updated_at = now();

with provider as (
  select id from experience_providers where slug = 'luxotour-morocco'
)
insert into provider_experiences (
  provider_id,
  title,
  slug,
  category,
  short_description,
  description,
  price,
  commission_percent,
  currency,
  tags,
  audience_tags,
  destination_city,
  duration,
  active,
  metadata
)
select id, title, slug, category, short_description, description, price, commission_percent, currency, tags, audience_tags, destination_city, duration, true, metadata
from provider
cross join (values
  (
    'Agafay Desert Dinner',
    'agafay-desert-dinner',
    'culture',
    'Desert dinner experience near Marrakech.',
    'Evening experience in Agafay with desert atmosphere, dinner and optional sunset moments.',
    95::numeric,
    10::numeric,
    'EUR',
    array['agafay','desert','sunset','dinner'],
    array['couples','vip','culture'],
    'Marrakech',
    '4-5 hours',
    jsonb_build_object('provider_priority', 90)
  ),
  (
    'Atlas Mountains Day Trip',
    'atlas-mountains-day-trip',
    'adventure',
    'Day trip to the Atlas Mountains.',
    'Scenic excursion from Marrakech to the Atlas Mountains with local landscapes and cultural stops.',
    75::numeric,
    10::numeric,
    'EUR',
    array['atlas','mountains','day trip','culture'],
    array['family','couples','culture'],
    'Marrakech',
    'Full day',
    jsonb_build_object('provider_priority', 85)
  ),
  (
    'Essaouira Coastal Excursion',
    'essaouira-coastal-excursion',
    'culture',
    'Coastal day trip to Essaouira.',
    'Relaxed excursion to Essaouira with old town, ocean views and local gastronomy.',
    80::numeric,
    10::numeric,
    'EUR',
    array['essaouira','coast','old town','sea'],
    array['family','couples','culture'],
    'Essaouira',
    'Full day',
    jsonb_build_object('provider_priority', 80)
  ),
  (
    'Marrakech Hammam Experience',
    'marrakech-hammam-experience',
    'wellness',
    'Traditional hammam and wellness experience.',
    'Local hammam experience suitable for guests looking for a calm, premium wellness plan.',
    65::numeric,
    12::numeric,
    'EUR',
    array['hammam','spa','wellness','indoor'],
    array['couples','vip','wellness'],
    'Marrakech',
    '2 hours',
    jsonb_build_object('provider_priority', 75, 'indoor', true)
  ),
  (
    'Marrakech Quad Adventure',
    'marrakech-quad-adventure',
    'adventure',
    'Quad biking adventure near Marrakech.',
    'Outdoor quad experience for guests looking for a more active excursion.',
    70::numeric,
    10::numeric,
    'EUR',
    array['quad','adventure','outdoor','agafay'],
    array['family','adventure','vip'],
    'Marrakech',
    '2-3 hours',
    jsonb_build_object('provider_priority', 70)
  )
) as seed(title, slug, category, short_description, description, price, commission_percent, currency, tags, audience_tags, destination_city, duration, metadata)
on conflict (provider_id, slug) do update set
  title = excluded.title,
  category = excluded.category,
  short_description = excluded.short_description,
  description = excluded.description,
  price = excluded.price,
  commission_percent = excluded.commission_percent,
  currency = excluded.currency,
  tags = excluded.tags,
  audience_tags = excluded.audience_tags,
  destination_city = excluded.destination_city,
  duration = excluded.duration,
  active = excluded.active,
  metadata = provider_experiences.metadata || excluded.metadata,
  updated_at = now();
