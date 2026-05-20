alter table hotel_pms_connections
  add column if not exists status text,
  add column if not exists connection_mode text,
  add column if not exists credentials_encrypted jsonb default '{}'::jsonb,
  add column if not exists property_id text,
  add column if not exists notes text,
  add column if not exists last_test_at timestamptz;

update hotel_pms_connections
set
  status = coalesce(status, sync_status, 'configured'),
  connection_mode = coalesce(connection_mode, metadata->>'connection_mode', case when provider = 'apaleo' then 'live_api' else 'manual_setup' end),
  property_id = coalesce(property_id, metadata->>'property_id', account_code),
  notes = coalesce(notes, metadata->>'notes')
where status is null
   or connection_mode is null
   or property_id is null
   or notes is null;

create index if not exists hotel_pms_connections_status_idx on hotel_pms_connections(status);
create index if not exists hotel_pms_connections_connection_mode_idx on hotel_pms_connections(connection_mode);
create index if not exists hotel_pms_connections_property_id_idx on hotel_pms_connections(property_id);
