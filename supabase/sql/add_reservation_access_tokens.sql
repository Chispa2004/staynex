alter table public.reservations
  add column if not exists reservation_access_token text unique;

create unique index if not exists reservations_access_token_idx
  on public.reservations (reservation_access_token)
  where reservation_access_token is not null;

update public.reservations
set reservation_access_token = 'STX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where reservation_access_token is null;
