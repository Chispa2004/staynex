-- Staynex Guest Intelligence & Revenue AI Engine
-- Manual rollout. Safe to run after core guests/reservations/tickets/experience bookings tables.

create table if not exists public.guest_intelligence_profiles (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  reservation_id uuid null references public.reservations(id) on delete set null,
  profile_type text not null default 'low_engagement',
  vip_score numeric not null default 0,
  sentiment_score numeric not null default 50,
  review_risk_score numeric not null default 0,
  revenue_potential_score numeric not null default 0,
  engagement_score numeric not null default 0,
  automation_affinity_score numeric not null default 0,
  language text null,
  country text null,
  travel_type text null,
  stay_type text null,
  profile_summary text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guest_intelligence_profiles_guest_unique
on public.guest_intelligence_profiles (hotel_id, guest_id);

create index if not exists guest_intelligence_profiles_hotel_idx
on public.guest_intelligence_profiles (hotel_id);

create index if not exists guest_intelligence_profiles_type_idx
on public.guest_intelligence_profiles (profile_type);

create table if not exists public.guest_behavior_signals (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  reservation_id uuid null references public.reservations(id) on delete set null,
  signal_type text not null,
  confidence numeric not null default 0.5,
  source text not null default 'conversation',
  detected_from text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guest_behavior_signals_hotel_guest_idx
on public.guest_behavior_signals (hotel_id, guest_id, created_at desc);

create index if not exists guest_behavior_signals_type_idx
on public.guest_behavior_signals (signal_type);

create table if not exists public.guest_revenue_predictions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  reservation_id uuid null references public.reservations(id) on delete set null,
  likely_to_buy_spa numeric not null default 0,
  likely_to_buy_transfer numeric not null default 0,
  likely_to_buy_experience numeric not null default 0,
  likely_to_buy_upgrade numeric not null default 0,
  likely_to_buy_late_checkout numeric not null default 0,
  estimated_revenue numeric not null default 0,
  conversion_probability numeric not null default 0,
  prediction_confidence numeric not null default 0.5,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create index if not exists guest_revenue_predictions_hotel_guest_idx
on public.guest_revenue_predictions (hotel_id, guest_id, generated_at desc);

create table if not exists public.guest_sentiment_history (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete set null,
  sentiment text not null default 'neutral',
  sentiment_score numeric not null default 50,
  confidence numeric not null default 0.5,
  source text not null default 'ai_concierge',
  detected_from text null,
  created_at timestamptz not null default now()
);

create index if not exists guest_sentiment_history_hotel_guest_idx
on public.guest_sentiment_history (hotel_id, guest_id, created_at desc);

create table if not exists public.guest_interest_affinities (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  reservation_id uuid null references public.reservations(id) on delete set null,
  spa_affinity numeric not null default 0,
  wellness_affinity numeric not null default 0,
  adventure_affinity numeric not null default 0,
  restaurant_affinity numeric not null default 0,
  luxury_affinity numeric not null default 0,
  transfer_affinity numeric not null default 0,
  family_affinity numeric not null default 0,
  nightlife_affinity numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists guest_interest_affinities_guest_unique
on public.guest_interest_affinities (hotel_id, guest_id);

create table if not exists public.revenue_ai_events (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid null references public.guests(id) on delete set null,
  reservation_id uuid null references public.reservations(id) on delete set null,
  conversation_id uuid null references public.conversations(id) on delete set null,
  event_type text not null,
  revenue_type text null,
  estimated_revenue numeric not null default 0,
  conversion_probability numeric null,
  source text not null default 'revenue_ai',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists revenue_ai_events_hotel_idx
on public.revenue_ai_events (hotel_id, created_at desc);

create index if not exists revenue_ai_events_type_idx
on public.revenue_ai_events (event_type);

comment on table public.guest_intelligence_profiles is
  'Hotel-scoped guest intelligence profile for personalization, Copilot and revenue AI.';

comment on table public.guest_behavior_signals is
  'Detected behavioral signals such as spa interest, complaint risk, transfer need or premium intent.';

comment on table public.guest_revenue_predictions is
  'Point-in-time Revenue AI predictions for likely conversion categories.';

comment on table public.guest_sentiment_history is
  'Sentiment timeline for guest conversations, used by Copilot and review-risk detection.';

comment on table public.guest_interest_affinities is
  'Affinity scores from 0-100 for revenue and hospitality categories.';

comment on table public.revenue_ai_events is
  'Revenue AI event stream for suggestions, upsells, automations and conversion tracking.';

alter table public.guest_intelligence_profiles enable row level security;
alter table public.guest_behavior_signals enable row level security;
alter table public.guest_revenue_predictions enable row level security;
alter table public.guest_sentiment_history enable row level security;
alter table public.guest_interest_affinities enable row level security;
alter table public.revenue_ai_events enable row level security;

do $$
begin
  if to_regprocedure('public.staynex_can_read_hotel(uuid)') is not null
    and to_regprocedure('public.staynex_can_write_hotel(uuid,text[])') is not null
  then
    execute 'drop policy if exists staynex_read_guest_intelligence_profiles on public.guest_intelligence_profiles';
    execute 'create policy staynex_read_guest_intelligence_profiles on public.guest_intelligence_profiles for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';
    execute 'drop policy if exists staynex_write_guest_intelligence_profiles on public.guest_intelligence_profiles';
    execute 'create policy staynex_write_guest_intelligence_profiles on public.guest_intelligence_profiles for all to authenticated using (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[])) with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[]))';

    execute 'drop policy if exists staynex_read_guest_behavior_signals on public.guest_behavior_signals';
    execute 'create policy staynex_read_guest_behavior_signals on public.guest_behavior_signals for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';
    execute 'drop policy if exists staynex_write_guest_behavior_signals on public.guest_behavior_signals';
    execute 'create policy staynex_write_guest_behavior_signals on public.guest_behavior_signals for all to authenticated using (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[])) with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[]))';

    execute 'drop policy if exists staynex_read_guest_revenue_predictions on public.guest_revenue_predictions';
    execute 'create policy staynex_read_guest_revenue_predictions on public.guest_revenue_predictions for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';
    execute 'drop policy if exists staynex_write_guest_revenue_predictions on public.guest_revenue_predictions';
    execute 'create policy staynex_write_guest_revenue_predictions on public.guest_revenue_predictions for all to authenticated using (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[])) with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[]))';

    execute 'drop policy if exists staynex_read_guest_sentiment_history on public.guest_sentiment_history';
    execute 'create policy staynex_read_guest_sentiment_history on public.guest_sentiment_history for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';
    execute 'drop policy if exists staynex_write_guest_sentiment_history on public.guest_sentiment_history';
    execute 'create policy staynex_write_guest_sentiment_history on public.guest_sentiment_history for all to authenticated using (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[])) with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[]))';

    execute 'drop policy if exists staynex_read_guest_interest_affinities on public.guest_interest_affinities';
    execute 'create policy staynex_read_guest_interest_affinities on public.guest_interest_affinities for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';
    execute 'drop policy if exists staynex_write_guest_interest_affinities on public.guest_interest_affinities';
    execute 'create policy staynex_write_guest_interest_affinities on public.guest_interest_affinities for all to authenticated using (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[])) with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[]))';

    execute 'drop policy if exists staynex_read_revenue_ai_events on public.revenue_ai_events';
    execute 'create policy staynex_read_revenue_ai_events on public.revenue_ai_events for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';
    execute 'drop policy if exists staynex_write_revenue_ai_events on public.revenue_ai_events';
    execute 'create policy staynex_write_revenue_ai_events on public.revenue_ai_events for all to authenticated using (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[])) with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'', ''receptionist'']::text[]))';
  else
    raise notice 'Guest Intelligence RLS helper functions not found. Backend service_role APIs remain tenant-scoped.';
  end if;
end $$;
