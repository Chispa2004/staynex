create table if not exists experience_booking_requests (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  reservation_id uuid null references reservations(id) on delete set null,
  guest_id uuid null references guests(id) on delete set null,
  conversation_id uuid null references conversations(id) on delete set null,
  hotel_experience_id uuid null references hotel_experiences(id) on delete set null,
  experience_title text not null,
  partner_name text null,
  guest_name text null,
  room_number text null,
  requested_date date null,
  requested_time text null,
  guests_count integer null,
  notes text null,
  status text not null default 'pending',
  estimated_revenue numeric default 0,
  commission_estimate numeric default 0,
  assigned_to_user uuid null,
  source text not null default 'ai_concierge',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint experience_booking_requests_status_check
    check (status in ('pending', 'reviewing', 'confirmed', 'rejected', 'completed', 'cancelled'))
);

create index if not exists experience_booking_requests_hotel_id_idx
  on experience_booking_requests(hotel_id);

create index if not exists experience_booking_requests_conversation_id_idx
  on experience_booking_requests(conversation_id);

create index if not exists experience_booking_requests_guest_id_idx
  on experience_booking_requests(guest_id);

create index if not exists experience_booking_requests_status_idx
  on experience_booking_requests(status);

create index if not exists experience_booking_requests_experience_idx
  on experience_booking_requests(hotel_experience_id);

create index if not exists experience_booking_requests_created_at_idx
  on experience_booking_requests(created_at desc);

comment on table experience_booking_requests is
  'Operational workflow for AI-detected experience booking requests. Reception confirms availability before any booking is considered confirmed.';
