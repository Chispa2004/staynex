create table if not exists hotel_onboarding_state (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  current_step text not null default 'hotel_setup',
  completed_steps jsonb not null default '[]'::jsonb,
  onboarding_completed boolean not null default false,
  onboarding_completed_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists hotel_onboarding_state_hotel_id_unique_idx
  on hotel_onboarding_state(hotel_id);

create index if not exists hotel_onboarding_state_completed_idx
  on hotel_onboarding_state(onboarding_completed);

create index if not exists hotel_onboarding_state_updated_at_idx
  on hotel_onboarding_state(updated_at desc);
