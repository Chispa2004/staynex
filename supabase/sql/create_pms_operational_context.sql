-- Staynex PMS Intelligence & Operational Context Layer
-- Manual rollout only. Do not run automatically from the app.
-- This migration creates hotel-scoped operational context derived from PMS data.
-- It does not replace the PMS; it stores snapshots/events that AI, Copilot,
-- Automations and dashboards can consume safely.

create table if not exists public.pms_operational_events (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  reservation_id uuid null references public.reservations(id) on delete set null,
  guest_id uuid null references public.guests(id) on delete set null,
  room_number text null,
  event_type text not null,
  event_source text not null default 'pms_intelligence',
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.room_status_snapshots (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_number text not null,
  room_type text null,
  housekeeping_status text not null default 'unknown'
    check (housekeeping_status in ('clean', 'dirty', 'inspected', 'unknown')),
  maintenance_status text not null default 'unknown'
    check (maintenance_status in ('ok', 'maintenance', 'out_of_order', 'unknown')),
  occupancy_status text not null default 'unknown'
    check (occupancy_status in ('occupied', 'vacant', 'arriving', 'departing', 'unknown')),
  current_guest_id uuid null references public.guests(id) on delete set null,
  current_reservation_id uuid null references public.reservations(id) on delete set null,
  next_arrival_at timestamptz null,
  last_cleaned_at timestamptz null,
  last_updated_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists room_status_snapshots_hotel_room_unique
on public.room_status_snapshots (hotel_id, room_number);

create table if not exists public.hotel_occupancy_snapshots (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  date date not null,
  occupancy_percent numeric null,
  occupied_rooms integer not null default 0,
  available_rooms integer not null default 0,
  arrivals_today integer not null default 0,
  departures_today integer not null default 0,
  stayovers_today integer not null default 0,
  adr numeric null,
  revpar numeric null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists hotel_occupancy_snapshots_hotel_date_unique
on public.hotel_occupancy_snapshots (hotel_id, date);

create table if not exists public.guest_stay_context (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid null references public.guests(id) on delete set null,
  reservation_id uuid null references public.reservations(id) on delete cascade,
  room_number text null,
  room_type text null,
  rate_plan text null,
  arrival_date date null,
  departure_date date null,
  checked_in_at timestamptz null,
  checked_out_at timestamptz null,
  nights integer null,
  adults integer null,
  children integer null,
  language text null,
  country text null,
  vip_score numeric not null default 0,
  stay_phase text not null default 'pre_arrival'
    check (stay_phase in ('pre_arrival', 'in_house', 'pre_checkout', 'checked_out')),
  revenue_potential numeric not null default 0,
  upgrade_eligible boolean not null default false,
  late_checkout_eligible boolean not null default false,
  transfer_likely boolean not null default false,
  experience_likely boolean not null default false,
  last_updated_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists guest_stay_context_reservation_unique
on public.guest_stay_context (reservation_id)
where reservation_id is not null;

create index if not exists guest_stay_context_hotel_guest_idx
on public.guest_stay_context (hotel_id, guest_id);

create table if not exists public.pms_intelligence_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid null references public.guests(id) on delete set null,
  reservation_id uuid null references public.reservations(id) on delete set null,
  log_type text not null,
  confidence numeric null,
  input_payload jsonb not null default '{}'::jsonb,
  output_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pms_operational_events_hotel_type_idx
on public.pms_operational_events (hotel_id, event_type, occurred_at desc);

create index if not exists pms_operational_events_guest_idx
on public.pms_operational_events (hotel_id, guest_id, occurred_at desc);

create index if not exists room_status_snapshots_hotel_status_idx
on public.room_status_snapshots (hotel_id, housekeeping_status, maintenance_status, occupancy_status);

create index if not exists hotel_occupancy_snapshots_hotel_created_idx
on public.hotel_occupancy_snapshots (hotel_id, created_at desc);

create index if not exists pms_intelligence_logs_hotel_type_idx
on public.pms_intelligence_logs (hotel_id, log_type, created_at desc);

alter table public.pms_operational_events enable row level security;
alter table public.room_status_snapshots enable row level security;
alter table public.hotel_occupancy_snapshots enable row level security;
alter table public.guest_stay_context enable row level security;
alter table public.pms_intelligence_logs enable row level security;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'staynex_can_read_hotel'
  ) then
    execute 'drop policy if exists staynex_tenant_read_pms_operational_events on public.pms_operational_events';
    execute 'create policy staynex_tenant_read_pms_operational_events on public.pms_operational_events for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';

    execute 'drop policy if exists staynex_tenant_read_room_status_snapshots on public.room_status_snapshots';
    execute 'create policy staynex_tenant_read_room_status_snapshots on public.room_status_snapshots for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';

    execute 'drop policy if exists staynex_tenant_read_hotel_occupancy_snapshots on public.hotel_occupancy_snapshots';
    execute 'create policy staynex_tenant_read_hotel_occupancy_snapshots on public.hotel_occupancy_snapshots for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';

    execute 'drop policy if exists staynex_tenant_read_guest_stay_context on public.guest_stay_context';
    execute 'create policy staynex_tenant_read_guest_stay_context on public.guest_stay_context for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';

    execute 'drop policy if exists staynex_tenant_read_pms_intelligence_logs on public.pms_intelligence_logs';
    execute 'create policy staynex_tenant_read_pms_intelligence_logs on public.pms_intelligence_logs for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';
  end if;
end $$;

grant select on public.pms_operational_events to authenticated;
grant select on public.room_status_snapshots to authenticated;
grant select on public.hotel_occupancy_snapshots to authenticated;
grant select on public.guest_stay_context to authenticated;
grant select on public.pms_intelligence_logs to authenticated;

comment on table public.pms_operational_events is
  'Hotel-scoped normalized PMS events such as check-in, checkout tomorrow, room status and upgrade opportunities.';
comment on table public.room_status_snapshots is
  'Latest operational room status snapshot per hotel room. PMS housekeeping integrations can update this later.';
comment on table public.hotel_occupancy_snapshots is
  'Daily hotel occupancy context derived from PMS reservations or native PMS occupancy APIs.';
comment on table public.guest_stay_context is
  'Current stay context for guests and reservations used by AI Concierge, Copilot, revenue and automations.';
comment on table public.pms_intelligence_logs is
  'Trace logs for PMS Intelligence decisions, fallbacks and derived operational context.';
