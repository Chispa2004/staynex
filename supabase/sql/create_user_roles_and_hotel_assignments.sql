-- User hotel assignment + role based access control for Staynex.
-- Safe to run on projects where hotel_users already exists.

create table if not exists hotel_users (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  user_id uuid null,
  email text null,
  role text not null default 'admin',
  status text not null default 'active',
  is_default boolean not null default false,
  invited_at timestamptz null,
  accepted_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hotel_users
  add column if not exists user_id uuid null,
  add column if not exists email text null,
  add column if not exists role text not null default 'admin',
  add column if not exists status text not null default 'active',
  add column if not exists is_default boolean not null default false,
  add column if not exists invited_at timestamptz null,
  add column if not exists accepted_at timestamptz null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update hotel_users
set
  role = coalesce(nullif(role, ''), 'admin'),
  status = coalesce(nullif(status, ''), 'active'),
  updated_at = now()
where role is null or role = '' or status is null or status = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hotel_users_role_check'
  ) then
    alter table hotel_users
      add constraint hotel_users_role_check
      check (role in (
        'owner',
        'admin',
        'manager',
        'receptionist',
        'housekeeping',
        'maintenance',
        'analyst'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hotel_users_status_check'
  ) then
    alter table hotel_users
      add constraint hotel_users_status_check
      check (status in ('active', 'invited', 'disabled'));
  end if;
end $$;

create unique index if not exists hotel_users_hotel_id_email_unique
  on hotel_users (hotel_id, lower(email))
  where email is not null;

create unique index if not exists hotel_users_user_id_hotel_id_unique
  on hotel_users (user_id, hotel_id)
  where user_id is not null;

create index if not exists hotel_users_user_id_idx on hotel_users (user_id);
create index if not exists hotel_users_email_idx on hotel_users (lower(email));
create index if not exists hotel_users_hotel_id_idx on hotel_users (hotel_id);
create index if not exists hotel_users_status_idx on hotel_users (status);

-- Optional development helper:
-- 1. Create a Supabase Auth user.
-- 2. Copy its user id from Authentication -> Users.
-- 3. Assign it to a hotel:
--
-- insert into hotel_users (hotel_id, user_id, email, role, status, is_default, accepted_at)
-- values ('HOTEL_ID', 'AUTH_USER_ID', 'admin@example.com', 'owner', 'active', true, now())
-- on conflict do nothing;
