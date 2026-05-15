-- Tenant isolation controls.
-- Hotel roles remain scoped to one hotel. Platform permissions are explicit.

alter table hotel_users
  add column if not exists platform_role text not null default 'none',
  add column if not exists multi_property_access boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hotel_users_platform_role_check'
  ) then
    alter table hotel_users
      add constraint hotel_users_platform_role_check
      check (platform_role in ('platform_admin', 'support', 'none'));
  end if;
end $$;

create index if not exists hotel_users_platform_role_idx
  on hotel_users (platform_role);

create index if not exists hotel_users_multi_property_access_idx
  on hotel_users (multi_property_access)
  where multi_property_access = true;

-- To make a Staynex internal user a platform admin, run this manually:
-- update hotel_users
-- set platform_role = 'platform_admin', multi_property_access = true
-- where email = 'founder@staynex.com';

update hotel_users
set platform_role = 'platform_admin',
    multi_property_access = true
where email = 'chema@hoyos.com';