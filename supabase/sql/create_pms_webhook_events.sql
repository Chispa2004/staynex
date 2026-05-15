create table if not exists pms_webhook_events (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid null references hotels(id) on delete set null,
  provider text not null,
  connection_id uuid null references hotel_pms_connections(id) on delete set null,
  external_event_id text null,
  external_resource_id text null,
  event_type text not null,
  event_action text null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error text null,
  processed_at timestamptz null,
  created_at timestamptz default now()
);

create index if not exists pms_webhook_events_provider_idx
  on pms_webhook_events(provider);

create index if not exists pms_webhook_events_hotel_id_idx
  on pms_webhook_events(hotel_id);

create index if not exists pms_webhook_events_external_event_id_idx
  on pms_webhook_events(external_event_id);

create unique index if not exists pms_webhook_events_provider_external_event_unique_idx
  on pms_webhook_events(provider, external_event_id)
  where external_event_id is not null;

create index if not exists pms_webhook_events_external_resource_id_idx
  on pms_webhook_events(external_resource_id);

create index if not exists pms_webhook_events_created_at_idx
  on pms_webhook_events(created_at desc);

alter table hotel_pms_connections
  add column if not exists webhook_url text null,
  add column if not exists webhook_secret text null,
  add column if not exists webhook_enabled boolean not null default false,
  add column if not exists webhook_status text null,
  add column if not exists last_webhook_at timestamptz null,
  add column if not exists last_webhook_error text null;
