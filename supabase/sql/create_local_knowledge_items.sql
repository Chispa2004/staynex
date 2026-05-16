create table if not exists local_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  title text not null,
  slug text not null,
  category text not null,
  description text not null,
  short_description text null,
  tags text[] default array[]::text[],
  audience_tags text[] default array[]::text[],
  recommendation_contexts text[] default array[]::text[],
  address text null,
  website_url text null,
  phone text null,
  image_url text null,
  opening_hours text null,
  price_range text null,
  priority integer default 0,
  active boolean default true,
  featured boolean default false,
  indoor boolean default false,
  weather_tags text[] default array[]::text[],
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (hotel_id, slug)
);

create index if not exists local_knowledge_items_hotel_id_idx
  on local_knowledge_items(hotel_id);

create index if not exists local_knowledge_items_category_idx
  on local_knowledge_items(category);

create index if not exists local_knowledge_items_active_idx
  on local_knowledge_items(active);

create index if not exists local_knowledge_items_featured_idx
  on local_knowledge_items(featured);

create index if not exists local_knowledge_items_priority_idx
  on local_knowledge_items(priority desc);

comment on table local_knowledge_items is
  'Per-hotel lightweight local concierge intelligence cards used by Staynex AI. This is intentionally simpler than a CMS.';
