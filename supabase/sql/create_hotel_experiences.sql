create table if not exists public.hotel_experiences (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  title text not null,
  slug text not null,
  description text not null,
  category text not null,
  tags text[] not null default '{}',
  target_guest_types text[] not null default '{}',
  price numeric null,
  commission_percentage numeric null,
  partner_name text null,
  partner_contact text null,
  booking_url text null,
  image_url text null,
  priority integer not null default 0,
  active boolean not null default true,
  vip_only boolean not null default false,
  indoor boolean not null default false,
  weather_dependent boolean not null default false,
  language text not null default 'en',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_experiences_category_check check (
    category in (
      'boat_tour',
      'beach_club',
      'restaurant',
      'nightlife',
      'romantic',
      'family',
      'kids',
      'culture',
      'golf',
      'wellness',
      'spa',
      'transfer',
      'adventure',
      'luxury',
      'indoor',
      'rainy_day'
    )
  )
);

create unique index if not exists hotel_experiences_hotel_slug_idx
on public.hotel_experiences (hotel_id, slug);

create index if not exists hotel_experiences_hotel_id_idx
on public.hotel_experiences (hotel_id);

create index if not exists hotel_experiences_hotel_active_idx
on public.hotel_experiences (hotel_id, active);

create index if not exists hotel_experiences_category_idx
on public.hotel_experiences (category);

create index if not exists hotel_experiences_priority_idx
on public.hotel_experiences (hotel_id, priority desc);

create index if not exists hotel_experiences_tags_idx
on public.hotel_experiences using gin (tags);

create index if not exists hotel_experiences_target_guest_types_idx
on public.hotel_experiences using gin (target_guest_types);

insert into public.hotel_experiences (
  hotel_id,
  title,
  slug,
  description,
  category,
  tags,
  target_guest_types,
  price,
  commission_percentage,
  partner_name,
  priority,
  active,
  vip_only,
  indoor,
  weather_dependent,
  language,
  metadata
)
select
  hotels.id,
  demo.title,
  demo.slug,
  demo.description,
  demo.category,
  demo.tags,
  demo.target_guest_types,
  demo.price,
  demo.commission_percentage,
  demo.partner_name,
  demo.priority,
  true,
  demo.vip_only,
  demo.indoor,
  demo.weather_dependent,
  'en',
  jsonb_build_object('demo_seed', true, 'future_integrations', array['google_places', 'tripadvisor', 'viator', 'weather_api', 'events_api'])
from public.hotels
cross join (
  values
    ('staynex-demo', 'Catamaran Sunset', 'catamaran-sunset', 'Premium sunset catamaran experience with coastline views and relaxed concierge handling.', 'boat_tour', array['sea', 'sunset', 'catamaran'], array['couples', 'family', 'vip'], 120::numeric, 12::numeric, 'Mallorca Experiences', 90, false, false, true),
    ('staynex-demo', 'Cala Deia Tour', 'cala-deia-tour', 'Half-day local beach and village tour designed for guests asking for authentic Mallorca plans.', 'culture', array['cala', 'old_town', 'local'], array['couples', 'family'], 75::numeric, 10::numeric, 'Local Concierge Partner', 70, false, false, true),
    ('staynex-demo', 'Palma Rooftop Dinner', 'palma-rooftop-dinner', 'Elegant rooftop dinner option in Palma for romantic stays and premium dining requests.', 'restaurant', array['dinner', 'rooftop', 'palma', 'romantic'], array['couples', 'vip'], 110::numeric, 8::numeric, 'Palma Rooftop', 80, false, false, false),
    ('staynex-demo', 'VIP Beach Club', 'vip-beach-club', 'Premium beach club recommendation for guests asking for a polished sea-side day.', 'beach_club', array['vip', 'beach', 'daybed'], array['vip', 'couples'], 150::numeric, 12::numeric, 'Beach Club Partner', 60, true, false, true),
    ('staynex-demo', 'Old Town Gastronomy Tour', 'old-town-gastronomy-tour', 'Local gastronomy walk for guests interested in culture, markets and authentic food.', 'culture', array['gastronomy', 'market', 'old_town'], array['couples', 'family'], 80::numeric, 10::numeric, 'Palma Food Walks', 50, false, false, false)
) as demo(hotel_slug, title, slug, description, category, tags, target_guest_types, price, commission_percentage, partner_name, priority, vip_only, indoor, weather_dependent)
where hotels.slug = demo.hotel_slug
  and not exists (
    select 1
    from public.hotel_experiences existing
    where existing.hotel_id = hotels.id
      and existing.slug = demo.slug
  );

insert into public.hotel_experiences (
  hotel_id,
  title,
  slug,
  description,
  category,
  tags,
  target_guest_types,
  price,
  commission_percentage,
  partner_name,
  priority,
  active,
  vip_only,
  indoor,
  weather_dependent,
  language,
  metadata
)
select
  hotels.id,
  demo.title,
  demo.slug,
  demo.description,
  demo.category,
  demo.tags,
  demo.target_guest_types,
  demo.price,
  demo.commission_percentage,
  demo.partner_name,
  demo.priority,
  true,
  demo.vip_only,
  demo.indoor,
  demo.weather_dependent,
  'en',
  jsonb_build_object('demo_seed', true, 'tenant_demo', demo.tenant_demo)
from public.hotels
join (
  values
    ('%riu mallorca%', 'Catamaran Sunset', 'riu-mallorca-catamaran-sunset', 'Sunset catamaran experience for guests asking for sea, calas or romantic plans.', 'boat_tour', array['mallorca', 'catamaran', 'sunset'], array['couples', 'family', 'vip'], 120::numeric, 12::numeric, 'Mallorca Sea Concierge', 95, false, false, true, 'Riu Mallorca'),
    ('%riu mallorca%', 'Cala Deia Tour', 'riu-mallorca-cala-deia-tour', 'Local cala and village tour for guests looking for authentic Mallorca recommendations.', 'culture', array['cala', 'local', 'old_town'], array['couples', 'family'], 75::numeric, 10::numeric, 'Local Mallorca Tours', 70, false, false, true, 'Riu Mallorca'),
    ('%riu mallorca%', 'Palma Rooftop Dinner', 'riu-mallorca-palma-rooftop-dinner', 'Elegant Palma rooftop dinner for honeymoon, anniversary and premium dining moments.', 'restaurant', array['palma', 'rooftop', 'romantic'], array['couples', 'vip'], 110::numeric, 8::numeric, 'Palma Rooftop', 80, false, false, false, 'Riu Mallorca'),
    ('%melia ibiza%', 'VIP Beach Club', 'melia-ibiza-vip-beach-club', 'Premium beach club access for Ibiza guests asking for beach, sunset or nightlife plans.', 'beach_club', array['ibiza', 'beach_club', 'vip'], array['couples', 'vip'], 160::numeric, 12::numeric, 'Ibiza Beach Club Partner', 90, true, false, true, 'Melia Ibiza'),
    ('%melia ibiza%', 'Yacht Sunset', 'melia-ibiza-yacht-sunset', 'Private-style sunset yacht experience for VIP and luxury Ibiza stays.', 'luxury', array['ibiza', 'yacht', 'sunset'], array['vip', 'couples'], 350::numeric, 10::numeric, 'Ibiza Yacht Concierge', 95, true, false, true, 'Melia Ibiza'),
    ('%boutique palma%', 'Wine Tasting', 'boutique-palma-wine-tasting', 'Indoor-friendly wine tasting for guests interested in local gastronomy and culture.', 'indoor', array['wine', 'gastronomy', 'rainy_day'], array['couples', 'vip'], 75::numeric, 10::numeric, 'Palma Wine Partner', 80, false, true, false, 'Boutique Palma'),
    ('%boutique palma%', 'Old Town Gastronomy Tour', 'boutique-palma-old-town-gastronomy-tour', 'Curated old town gastronomy walk for guests asking for authentic Palma recommendations.', 'culture', array['old_town', 'gastronomy', 'local'], array['couples', 'family'], 85::numeric, 10::numeric, 'Palma Food Walks', 85, false, false, false, 'Boutique Palma')
) as demo(hotel_name_match, title, slug, description, category, tags, target_guest_types, price, commission_percentage, partner_name, priority, vip_only, indoor, weather_dependent, tenant_demo)
on lower(hotels.name) like demo.hotel_name_match
where not exists (
  select 1
  from public.hotel_experiences existing
  where existing.hotel_id = hotels.id
    and existing.slug = demo.slug
);

comment on table public.hotel_experiences is 'Per-hotel concierge experience catalog used by Staynex AI. Future integrations can enrich this table from Google Places, TripAdvisor, Viator, weather and events APIs.';
