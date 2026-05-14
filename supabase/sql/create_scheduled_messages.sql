create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  guest_id uuid null references public.guests(id) on delete set null,
  conversation_id uuid null references public.conversations(id) on delete set null,
  automation_rule_id uuid null references public.automation_rules(id) on delete set null,
  automation_type text not null,
  channel text not null default 'whatsapp',
  scheduled_for timestamptz not null,
  send_to text null,
  language text null,
  message_preview text not null,
  status text not null default 'scheduled',
  ai_provider text null,
  ai_model text null,
  automation_fallback boolean default false,
  sent_at timestamptz null,
  failed_at timestamptz null,
  error_message text null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists scheduled_messages_hotel_id_idx
on public.scheduled_messages (hotel_id);

create index if not exists scheduled_messages_reservation_id_idx
on public.scheduled_messages (reservation_id);

create index if not exists scheduled_messages_status_idx
on public.scheduled_messages (status);

create index if not exists scheduled_messages_scheduled_for_idx
on public.scheduled_messages (scheduled_for);

create unique index if not exists scheduled_messages_reservation_type_day_unique
on public.scheduled_messages (reservation_id, automation_type, ((scheduled_for at time zone 'UTC')::date));

alter table public.ai_logs
add column if not exists automation_triggered boolean default false;

alter table public.ai_logs
add column if not exists automation_type text null;

alter table public.ai_logs
add column if not exists automation_sent boolean default false;

alter table public.ai_logs
add column if not exists automation_fallback boolean default false;
