-- Requires existing tenant policy helpers. Preserves their ACL, role sets,
-- policies and status semantics; removes email fallback only. No row updates.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.staynex_is_platform_admin()') IS NULL
 OR to_regprocedure('public.staynex_is_platform_operator()') IS NULL
 OR to_regprocedure('public.staynex_can_read_hotel(uuid)') IS NULL
 OR to_regprocedure('public.staynex_can_write_hotel(uuid,text[])') IS NULL THEN
  RAISE EXCEPTION 'Existing tenant authorization helpers required';
 END IF;
END $$;
create or replace function public.staynex_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.hotel_users hu
    where coalesce(hu.status, 'active') = 'active'
      and coalesce(hu.platform_role, 'none') = 'platform_admin'
      and hu.user_id = auth.uid()
  );
$$;

create or replace function public.staynex_is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.hotel_users hu
    where coalesce(hu.status, 'active') = 'active'
      and coalesce(hu.platform_role, 'none') in ('platform_admin', 'support')
      and hu.user_id = auth.uid()
  );
$$;

create or replace function public.staynex_can_read_hotel(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_hotel_id is not null
    and (
      public.staynex_is_platform_operator()
      or exists (
        select 1
        from public.hotel_users hu
        where hu.hotel_id = target_hotel_id
          and coalesce(hu.status, 'active') = 'active'
          and hu.user_id = auth.uid()
      )
    );
$$;

create or replace function public.staynex_can_write_hotel(
  target_hotel_id uuid,
  allowed_roles text[] default array['owner', 'admin', 'manager']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_hotel_id is not null
    and (
      public.staynex_is_platform_admin()
      or exists (
        select 1
        from public.hotel_users hu
        where hu.hotel_id = target_hotel_id
          and coalesce(hu.status, 'active') = 'active'
          and coalesce(hu.role, 'receptionist') = any(allowed_roles)
          and hu.user_id = auth.uid()
      )
    );
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
