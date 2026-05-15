create table if not exists hotel_pms_connections (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  provider text not null default 'apaleo',
  client_id text null,
  encrypted_client_secret text null,
  account_code text null,
  base_url text null,
  enabled boolean not null default true,
  sync_status text not null default 'not_configured',
  last_sync_at timestamptz null,
  last_sync_error text null,
  webhook_enabled boolean not null default false,
  webhook_status text not null default 'not_configured',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists hotel_pms_connections_hotel_provider_idx
  on hotel_pms_connections(hotel_id, provider);

create index if not exists hotel_pms_connections_hotel_id_idx
  on hotel_pms_connections(hotel_id);

create index if not exists hotel_pms_connections_provider_idx
  on hotel_pms_connections(provider);

create index if not exists hotel_pms_connections_enabled_idx
  on hotel_pms_connections(enabled);

create index if not exists hotel_pms_connections_sync_status_idx
  on hotel_pms_connections(sync_status);
