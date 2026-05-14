create table if not exists public.guest_ai_profiles (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  guest_score numeric not null default 50,
  preferred_language text null,
  sentiment text null,
  revenue_generated numeric not null default 0,
  operational_risk_score numeric not null default 0,
  last_summary text null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists guest_ai_profiles_hotel_guest_uidx
  on public.guest_ai_profiles (hotel_id, guest_id);

create index if not exists guest_ai_profiles_hotel_score_idx
  on public.guest_ai_profiles (hotel_id, guest_score desc);

create table if not exists public.guest_ai_tags (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  tag text not null,
  source text not null default 'ai_memory',
  confidence numeric not null default 0.8,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists guest_ai_tags_hotel_guest_tag_uidx
  on public.guest_ai_tags (hotel_id, guest_id, tag);

create index if not exists guest_ai_tags_hotel_tag_idx
  on public.guest_ai_tags (hotel_id, tag);

create table if not exists public.guest_ai_insights (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  insight_type text not null,
  title text not null,
  description text not null,
  priority text not null default 'normal',
  is_active boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists guest_ai_insights_hotel_guest_idx
  on public.guest_ai_insights (hotel_id, guest_id);

create index if not exists guest_ai_insights_active_idx
  on public.guest_ai_insights (hotel_id, is_active, priority);

create table if not exists public.guest_ai_actions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  action_type text not null,
  title text not null,
  description text not null,
  department text not null default 'reception',
  priority text not null default 'normal',
  status text not null default 'suggested',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists guest_ai_actions_hotel_guest_idx
  on public.guest_ai_actions (hotel_id, guest_id);

create index if not exists guest_ai_actions_status_idx
  on public.guest_ai_actions (hotel_id, status, priority);

-- These tables persist the enterprise guest intelligence layer.
-- The dashboard can still compute a live profile from existing operational data if this migration has not run yet.
