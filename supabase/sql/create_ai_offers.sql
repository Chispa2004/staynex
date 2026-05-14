create table if not exists public.ai_offers (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid null references public.guests(id) on delete set null,
  reservation_id uuid null references public.reservations(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete set null,
  offer_type text not null,
  suggested_price numeric not null default 0,
  currency text not null default 'EUR',
  status text not null default 'suggested'
    check (status in ('suggested', 'sent', 'accepted', 'rejected', 'expired')),
  confidence numeric default 0.75,
  ai_reason text null,
  accepted_at timestamptz null,
  rejected_at timestamptz null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists ai_offers_hotel_id_idx
  on public.ai_offers (hotel_id);

create index if not exists ai_offers_guest_id_idx
  on public.ai_offers (guest_id);

create index if not exists ai_offers_conversation_id_idx
  on public.ai_offers (conversation_id);

create index if not exists ai_offers_status_idx
  on public.ai_offers (hotel_id, status, created_at);

create unique index if not exists ai_offers_active_conversation_type_uidx
  on public.ai_offers (conversation_id, offer_type)
  where status in ('suggested', 'sent');

alter table public.ai_logs
  add column if not exists concierge_intent text null,
  add column if not exists offer_created boolean default false,
  add column if not exists offer_type text null,
  add column if not exists offer_status text null;

-- v1 uses AI-estimated offer values. Future PMS integrations can confirm real charges
-- and update ai_offers plus upsell_conversions from the PMS folio automatically.
