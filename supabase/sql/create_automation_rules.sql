create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  automation_type text not null,
  name text not null,
  description text null,
  channel text not null default 'whatsapp',
  is_active boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists automation_rules_hotel_type_unique
on public.automation_rules (hotel_id, automation_type);

create index if not exists automation_rules_hotel_id_idx
on public.automation_rules (hotel_id);

create index if not exists automation_rules_type_idx
on public.automation_rules (automation_type);

create index if not exists automation_rules_active_idx
on public.automation_rules (is_active);
