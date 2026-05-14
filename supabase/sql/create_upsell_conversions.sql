create table if not exists public.upsell_conversions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  guest_id uuid null references public.guests(id) on delete set null,
  reservation_id uuid null references public.reservations(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete set null,
  upsell_id uuid null references public.ai_upsells(id) on delete set null,
  upsell_type text not null,
  source text not null default 'ai_upsell',
  offer_sent_at timestamptz null,
  accepted_at timestamptz null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'accepted', 'rejected')),
  estimated_amount numeric not null default 0,
  currency text not null default 'EUR',
  notes text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists upsell_conversions_hotel_id_idx
  on public.upsell_conversions (hotel_id);

create index if not exists upsell_conversions_reservation_id_idx
  on public.upsell_conversions (reservation_id);

create index if not exists upsell_conversions_guest_id_idx
  on public.upsell_conversions (guest_id);

create index if not exists upsell_conversions_upsell_id_idx
  on public.upsell_conversions (upsell_id);

create unique index if not exists upsell_conversions_unique_upsell_idx
  on public.upsell_conversions (upsell_id)
  where upsell_id is not null;

create index if not exists upsell_conversions_status_idx
  on public.upsell_conversions (status);

create index if not exists upsell_conversions_hotel_status_created_idx
  on public.upsell_conversions (hotel_id, status, created_at);

alter table public.ai_logs
  add column if not exists revenue_generated numeric null,
  add column if not exists conversion_status text null;

-- Future PMS integrations will update these conversion records from real folio/charge data.
-- For v1, Staynex stores estimated revenue so hotels can see attribution before PMS revenue sync exists.
