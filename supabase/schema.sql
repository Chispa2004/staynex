create extension if not exists pgcrypto;

create table if not exists hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_number text not null unique,
  created_at timestamp with time zone not null default now()
);

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  phone_number text not null,
  current_room text,
  created_at timestamp with time zone not null default now(),
  unique (hotel_id, phone_number)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  status text not null default 'active',
  last_message_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint conversations_status_check check (status in ('active', 'closed'))
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null,
  content text not null,
  created_at timestamp with time zone not null default now(),
  constraint messages_sender_type_check check (sender_type in ('guest', 'ai', 'staff'))
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  room_number text,
  category text not null,
  title text not null,
  description text not null,
  priority text not null default 'normal',
  status text not null default 'open',
  created_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  constraint tickets_category_check check (
    category in (
      'housekeeping',
      'maintenance',
      'transport',
      'restaurant',
      'spa',
      'room_service',
      'reception',
      'complaint',
      'emergency'
    )
  ),
  constraint tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint tickets_status_check check (status in ('open', 'in_progress', 'completed', 'cancelled'))
);

create table if not exists hotel_knowledge (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  key text not null,
  value text not null
);

create index if not exists guests_hotel_phone_idx
  on guests (hotel_id, phone_number);

create index if not exists conversations_hotel_guest_status_idx
  on conversations (hotel_id, guest_id, status);

create index if not exists messages_conversation_created_at_idx
  on messages (conversation_id, created_at);

create index if not exists tickets_hotel_status_priority_idx
  on tickets (hotel_id, status, priority);

create index if not exists hotel_knowledge_hotel_key_idx
  on hotel_knowledge (hotel_id, key);

alter table public.tickets replica identity full;
alter table public.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.tickets;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

-- Example seed for local testing. Replace the number with TWILIO_WHATSAPP_FROM.
-- insert into hotels (name, whatsapp_number)
-- values ('Staynex Demo Hotel', '+14155238886')
-- on conflict (whatsapp_number) do nothing;
