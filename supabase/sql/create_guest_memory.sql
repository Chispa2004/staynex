create table if not exists public.guest_memory (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  memory_type text not null,
  memory_key text not null,
  memory_value text not null,
  confidence numeric default 0.8,
  source text not null default 'conversation',
  source_message_id uuid null,
  reservation_id uuid null references public.reservations(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists guest_memory_hotel_guest_key_unique
on public.guest_memory (hotel_id, guest_id, memory_key);

create index if not exists guest_memory_hotel_id_idx
on public.guest_memory (hotel_id);

create index if not exists guest_memory_guest_id_idx
on public.guest_memory (guest_id);

create index if not exists guest_memory_key_idx
on public.guest_memory (memory_key);

create index if not exists guest_memory_active_idx
on public.guest_memory (is_active);

alter table public.ai_logs
add column if not exists memory_used boolean default false;

alter table public.ai_logs
add column if not exists memory_keys_used text[] default '{}'::text[];
