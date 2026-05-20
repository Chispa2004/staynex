alter table hotels
  add column if not exists hotel_live_mode boolean not null default false,
  add column if not exists live_mode_enabled_at timestamptz,
  add column if not exists live_mode_enabled_by uuid;

create table if not exists hotel_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  check_type text not null,
  category text not null,
  status text not null check (status in ('healthy', 'warning', 'critical', 'missing', 'unknown')),
  score integer not null default 0,
  severity text not null default 'low',
  message text not null,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists hotel_readiness_snapshots (
  hotel_id uuid primary key references hotels(id) on delete cascade,
  readiness_score integer not null default 0,
  healthy_checks integer not null default 0,
  warning_checks integer not null default 0,
  critical_checks integer not null default 0,
  missing_checks integer not null default 0,
  ready_for_live boolean not null default false,
  last_updated_at timestamptz not null default now()
);

create table if not exists hotel_readiness_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid references hotels(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hotel_readiness_checks_hotel_type_idx
  on hotel_readiness_checks(hotel_id, check_type);

create index if not exists hotel_readiness_checks_status_idx
  on hotel_readiness_checks(hotel_id, status);

create index if not exists hotel_readiness_logs_hotel_created_idx
  on hotel_readiness_logs(hotel_id, created_at desc);
