create table if not exists public.ai_upsells (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  reservation_id uuid null references public.reservations(id) on delete cascade,
  guest_id uuid null references public.guests(id) on delete set null,
  conversation_id uuid null references public.conversations(id) on delete set null,
  upsell_type text not null,
  title text not null,
  description text not null,
  suggested_message text not null,
  trigger_source text not null,
  confidence numeric default 0,
  status text not null default 'suggested',
  accepted boolean default false,
  rejected boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists ai_upsells_hotel_id_idx
on public.ai_upsells (hotel_id);

create index if not exists ai_upsells_reservation_id_idx
on public.ai_upsells (reservation_id);

create index if not exists ai_upsells_status_idx
on public.ai_upsells (status);

create index if not exists ai_upsells_conversation_status_idx
on public.ai_upsells (conversation_id, status);

alter table public.ai_logs
add column if not exists upsell_detected boolean default false;

alter table public.ai_logs
add column if not exists upsell_type text null;

alter table public.ai_logs
add column if not exists upsell_confidence numeric null;
