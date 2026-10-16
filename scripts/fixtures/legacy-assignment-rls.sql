-- Existing helper definitions, compared with remote READ ONLY on 2026-10-16. No data.
create or replace function public.staynex_rls_auth_email()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(
    coalesce(
      nullif(auth.jwt() ->> 'email', ''),
      nullif(current_setting('request.jwt.claim.email', true), '')
    )
  );
$$;

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
      and (
        hu.user_id = auth.uid()
        or (
          hu.email is not null
          and public.staynex_rls_auth_email() is not null
          and lower(hu.email) = public.staynex_rls_auth_email()
        )
      )
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
      and (
        hu.user_id = auth.uid()
        or (
          hu.email is not null
          and public.staynex_rls_auth_email() is not null
          and lower(hu.email) = public.staynex_rls_auth_email()
        )
      )
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
          and (
            hu.user_id = auth.uid()
            or (
              hu.email is not null
              and public.staynex_rls_auth_email() is not null
              and lower(hu.email) = public.staynex_rls_auth_email()
            )
          )
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
          and (
            hu.user_id = auth.uid()
            or (
              hu.email is not null
              and public.staynex_rls_auth_email() is not null
              and lower(hu.email) = public.staynex_rls_auth_email()
            )
          )
      )
    );
$$;
