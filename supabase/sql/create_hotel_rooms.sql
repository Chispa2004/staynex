-- Staynex Hotel Rooms Management & QR Source System
-- Manual rollout: run in Supabase after review.
-- Purpose: make hotel_rooms the official tenant-safe source for QR Rooms.

create extension if not exists pgcrypto;

create table if not exists public.hotel_rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_number text not null,
  floor text null,
  room_type text null,
  active boolean not null default true,
  qr_enabled boolean not null default true,
  source text not null default 'manual',
  pms_provider text null,
  pms_room_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, room_number)
);

create index if not exists idx_hotel_rooms_hotel_id on public.hotel_rooms(hotel_id);
create index if not exists idx_hotel_rooms_room_number on public.hotel_rooms(hotel_id, room_number);
create index if not exists idx_hotel_rooms_active_qr on public.hotel_rooms(hotel_id, active, qr_enabled);
create index if not exists idx_hotel_rooms_source on public.hotel_rooms(source);

comment on table public.hotel_rooms is
  'Official tenant-safe room catalog for Staynex QR Rooms. QR codes should be generated from this table, not demo/global fallback data.';

comment on column public.hotel_rooms.source is
  'manual, pms_import, reservation_detected, csv_import, api_future';

-- Safe RLS alignment with existing Staynex helpers if RLS Phase 1/2 has been applied.
alter table public.hotel_rooms enable row level security;

do $$
begin
  if to_regprocedure('public.staynex_can_read_hotel(uuid)') is not null
    and to_regprocedure('public.staynex_can_write_hotel(uuid,text[])') is not null
    and to_regprocedure('public.staynex_can_manage_hotel(uuid)') is not null
  then
    execute 'drop policy if exists staynex_tenant_read_hotel_rooms on public.hotel_rooms';
    execute 'create policy staynex_tenant_read_hotel_rooms on public.hotel_rooms for select to authenticated using (public.staynex_can_read_hotel(hotel_id))';

    execute 'drop policy if exists staynex_tenant_insert_hotel_rooms on public.hotel_rooms';
    execute 'create policy staynex_tenant_insert_hotel_rooms on public.hotel_rooms for insert to authenticated with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'']::text[]))';

    execute 'drop policy if exists staynex_tenant_update_hotel_rooms on public.hotel_rooms';
    execute 'create policy staynex_tenant_update_hotel_rooms on public.hotel_rooms for update to authenticated using (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'']::text[])) with check (public.staynex_can_write_hotel(hotel_id, array[''owner'', ''admin'', ''manager'']::text[]))';

    execute 'drop policy if exists staynex_tenant_delete_hotel_rooms on public.hotel_rooms';
    execute 'create policy staynex_tenant_delete_hotel_rooms on public.hotel_rooms for delete to authenticated using (public.staynex_can_manage_hotel(hotel_id))';

    execute 'grant select, insert, update, delete on public.hotel_rooms to authenticated';
  else
    raise notice 'hotel_rooms RLS helper functions not found. Run RLS Phase 1/2 before exposing direct authenticated table access. Backend service_role APIs remain tenant-scoped.';
  end if;
end $$;
