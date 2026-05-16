-- Staynex RLS Phase 1 - Safe Tenant Read Protection
--
-- Rollout intent:
-- - Protect tenant reads for the first tenant-critical tables.
-- - Keep existing backend/service_role workflows working.
-- - Do not FORCE RLS yet. Supabase service_role still bypasses these policies.
-- - Do not protect PMS internals, webhooks, automations, ai_logs, Twilio or OpenAI logs in this phase.
--
-- Protected tables in this phase:
-- - reservations
-- - conversations
-- - tickets
-- - hotel_experiences
-- - local_knowledge_items
-- - experience_booking_requests
--
-- Strategy:
-- - Authenticated browser/client reads are limited to hotels assigned in hotel_users.
-- - platform_admin/support can read all protected tenants for internal operations.
-- - Existing dashboard/server APIs should continue using service_role plus application-level hotel scoping.
--
-- Safe manual rollout:
-- 1. Run this in staging first.
-- 2. Verify hotel admin, receptionist and platform_admin sessions.
-- 3. Verify Inbox, Reservations, Tickets, Experiences, Local Knowledge and Experience Bookings.
-- 4. Roll out to production only after application checks pass.

begin;

alter table if exists public.hotel_users
  add column if not exists platform_role text default 'none',
  add column if not exists multi_property_access boolean default false,
  add column if not exists status text default 'active';

create index if not exists hotel_users_user_id_rls_idx on public.hotel_users(user_id);
create index if not exists hotel_users_email_rls_idx on public.hotel_users(lower(email));
create index if not exists hotel_users_hotel_id_rls_idx on public.hotel_users(hotel_id);
create index if not exists hotel_users_platform_role_rls_idx on public.hotel_users(platform_role);

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

comment on function public.staynex_rls_auth_email() is
  'RLS Phase 1 helper. Returns the authenticated user email from JWT claims when available.';

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

comment on function public.staynex_is_platform_operator() is
  'RLS Phase 1 helper. Allows platform_admin/support read access across protected tenants.';

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

comment on function public.staynex_can_read_hotel(uuid) is
  'RLS Phase 1 tenant read guard. True only for assigned hotels or platform operators.';

do $$
declare
  protected_table text;
  policy_name text;
begin
  foreach protected_table in array array[
    'reservations',
    'conversations',
    'tickets',
    'hotel_experiences',
    'local_knowledge_items',
    'experience_booking_requests'
  ]
  loop
    if to_regclass(format('public.%I', protected_table)) is not null then
      policy_name := 'staynex_tenant_read_' || protected_table;

      execute format('create index if not exists %I on public.%I(hotel_id)', protected_table || '_hotel_id_rls_idx', protected_table);
      execute format('alter table public.%I enable row level security', protected_table);

      execute format('drop policy if exists %I on public.%I', policy_name, protected_table);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.staynex_can_read_hotel(hotel_id))',
        policy_name,
        protected_table
      );

      execute format('grant select on public.%I to authenticated', protected_table);

      execute format(
        'comment on policy %I on public.%I is %L',
        policy_name,
        protected_table,
        'RLS Phase 1: authenticated users can read only rows for their assigned hotel; platform_admin/support can read for support operations. service_role bypass remains enabled.'
      );
    else
      raise notice 'RLS Phase 1 skipped missing table public.%', protected_table;
    end if;
  end loop;
end $$;

commit;
