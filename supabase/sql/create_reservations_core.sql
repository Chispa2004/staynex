create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid null references public.hotels(id) on delete set null,
  guest_id uuid null references public.guests(id) on delete set null,
  pms_provider text not null default 'mock',
  pms_reservation_id text not null,
  guest_name text null,
  guest_email text null,
  guest_phone text null,
  arrival_date date null,
  departure_date date null,
  room_type text null,
  rate_plan text null,
  board_basis text null,
  status text not null default 'confirmed',
  whatsapp_link text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint reservations_pms_unique unique (pms_provider, pms_reservation_id)
);

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete cascade,
  event_type text not null,
  scheduled_for timestamptz null,
  channel text not null default 'email',
  status text not null default 'scheduled',
  payload jsonb null,
  sent_at timestamptz null,
  created_at timestamptz default now()
);

create index if not exists reservations_guest_phone_idx
  on public.reservations (guest_phone);

create index if not exists reservations_guest_email_idx
  on public.reservations (guest_email);

create index if not exists reservations_pms_reservation_id_idx
  on public.reservations (pms_reservation_id);

create index if not exists reservations_pms_provider_reservation_id_idx
  on public.reservations (pms_provider, pms_reservation_id);

create index if not exists automation_events_reservation_id_idx
  on public.automation_events (reservation_id);

create index if not exists automation_events_scheduled_for_idx
  on public.automation_events (scheduled_for);

create index if not exists automation_events_status_idx
  on public.automation_events (status);
