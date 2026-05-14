alter table public.reservations
  add column if not exists source text null,
  add column if not exists adults integer null,
  add column if not exists children integer null,
  add column if not exists notes text null;

create index if not exists reservations_source_idx
  on public.reservations (source);
