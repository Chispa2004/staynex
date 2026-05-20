alter table hotels
  add column if not exists deleted_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists archived_reason text,
  add column if not exists status text default 'active',
  add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists hotels_deleted_at_idx on hotels(deleted_at);
create index if not exists hotels_archived_at_idx on hotels(archived_at);
create index if not exists hotels_status_idx on hotels(status);
