-- Staynex RLS Phase 2 - Secure Write Protection & Enterprise Hardening
--
-- Rollout intent:
-- - Add tenant-safe INSERT/UPDATE/DELETE policies.
-- - Extend initial protection to guest_memory, upsell_conversions and ai_offers.
-- - Keep existing backend/service_role workflows working.
-- - Keep support mode read-only by default at the database-policy layer.
-- - Do not FORCE RLS yet. Supabase service_role still bypasses these policies.
--
-- Tables covered by write protection:
-- - reservations
-- - conversations
-- - tickets
-- - hotel_experiences
-- - local_knowledge_items
-- - experience_booking_requests
-- - guest_memory
-- - upsell_conversions
-- - ai_offers
--
-- Role model:
-- - platform_admin: read/write across protected tenant tables for internal operations.
-- - support: read across protected tenant tables, read-only by default.
-- - owner/admin/manager: broad hotel management writes.
-- - receptionist: operational writes for Inbox, Tickets, Guest Memory, AI Offers, Local Knowledge and Experience Bookings.
-- - housekeeping/maintenance: ticket writes inside their assigned hotel only.
--
-- Safe manual rollout:
-- 1. Run create_enterprise_audit_logs.sql first.
-- 2. Run rls_phase_1_safe_tenant_protection.sql first if it has not been applied.
-- 3. Run this migration in staging.
-- 4. Verify hotel admin, receptionist, housekeeping/maintenance and platform_admin sessions.
-- 5. Verify PMS/webhooks/Twilio/automations continue working through service_role.
-- 6. Roll out to production after checks pass.

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

comment on function public.staynex_is_platform_admin() is
  'RLS Phase 2 helper. True only for platform_admin; support is intentionally excluded from write bypass.';

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
  'RLS Phase 2 helper. Allows platform_admin/support read access across protected tenants.';

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

comment on function public.staynex_can_write_hotel(uuid, text[]) is
  'RLS Phase 2 tenant write guard. True for allowed hotel roles or platform_admin. support remains read-only by default.';

create or replace function public.staynex_can_manage_hotel(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.staynex_can_write_hotel(target_hotel_id, array['owner', 'admin', 'manager']::text[]);
$$;

comment on function public.staynex_can_manage_hotel(uuid) is
  'RLS Phase 2 hotel management guard for owner/admin/manager or platform_admin.';

do $$
declare
  config record;
  table_name text;
  roles_sql text;
  read_policy text;
  insert_policy text;
  update_policy text;
  delete_policy text;
begin
  for config in
    select *
    from (values
      ('reservations', array['owner', 'admin', 'manager']::text[], array['owner', 'admin', 'manager']::text[]),
      ('conversations', array['owner', 'admin', 'manager', 'receptionist']::text[], array['owner', 'admin', 'manager']::text[]),
      ('tickets', array['owner', 'admin', 'manager', 'receptionist', 'housekeeping', 'maintenance']::text[], array['owner', 'admin', 'manager', 'receptionist', 'housekeeping', 'maintenance']::text[]),
      ('hotel_experiences', array['owner', 'admin', 'manager', 'receptionist']::text[], array['owner', 'admin', 'manager']::text[]),
      ('local_knowledge_items', array['owner', 'admin', 'manager', 'receptionist']::text[], array['owner', 'admin', 'manager']::text[]),
      ('experience_booking_requests', array['owner', 'admin', 'manager', 'receptionist']::text[], array['owner', 'admin', 'manager', 'receptionist']::text[]),
      ('guest_memory', array['owner', 'admin', 'manager', 'receptionist']::text[], array['owner', 'admin', 'manager']::text[]),
      ('upsell_conversions', array['owner', 'admin', 'manager']::text[], array['owner', 'admin', 'manager']::text[]),
      ('ai_offers', array['owner', 'admin', 'manager', 'receptionist']::text[], array['owner', 'admin', 'manager']::text[])
    ) as t(table_name, write_roles, delete_roles)
  loop
    table_name := config.table_name;

    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('create index if not exists %I on public.%I(hotel_id)', table_name || '_hotel_id_rls_idx', table_name);
      execute format('alter table public.%I enable row level security', table_name);

      read_policy := 'staynex_tenant_read_' || table_name;
      insert_policy := 'staynex_tenant_insert_' || table_name;
      update_policy := 'staynex_tenant_update_' || table_name;
      delete_policy := 'staynex_tenant_delete_' || table_name;

      execute format('drop policy if exists %I on public.%I', read_policy, table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.staynex_can_read_hotel(hotel_id))',
        read_policy,
        table_name
      );

      roles_sql := 'array[' || (
        select string_agg(quote_literal(role_name), ', ')
        from unnest(config.write_roles) as roles(role_name)
      ) || ']::text[]';

      execute format('drop policy if exists %I on public.%I', insert_policy, table_name);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.staynex_can_write_hotel(hotel_id, %s))',
        insert_policy,
        table_name,
        roles_sql
      );

      execute format('drop policy if exists %I on public.%I', update_policy, table_name);
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.staynex_can_write_hotel(hotel_id, %s)) with check (public.staynex_can_write_hotel(hotel_id, %s))',
        update_policy,
        table_name,
        roles_sql,
        roles_sql
      );

      roles_sql := 'array[' || (
        select string_agg(quote_literal(role_name), ', ')
        from unnest(config.delete_roles) as roles(role_name)
      ) || ']::text[]';

      execute format('drop policy if exists %I on public.%I', delete_policy, table_name);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.staynex_can_write_hotel(hotel_id, %s))',
        delete_policy,
        table_name,
        roles_sql
      );

      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);

      execute format(
        'comment on policy %I on public.%I is %L',
        insert_policy,
        table_name,
        'RLS Phase 2: inserts must use a hotel_id the authenticated actor can write for. support is read-only; service_role bypass remains enabled.'
      );
      execute format(
        'comment on policy %I on public.%I is %L',
        update_policy,
        table_name,
        'RLS Phase 2: updates require both old and new row hotel_id to be writable by the authenticated actor, preventing hotel_id reassignment across tenants.'
      );
      execute format(
        'comment on policy %I on public.%I is %L',
        delete_policy,
        table_name,
        'RLS Phase 2: deletes are limited to allowed roles within the row hotel_id. support is read-only by default.'
      );
    else
      raise notice 'RLS Phase 2 skipped missing table public.%', table_name;
    end if;
  end loop;
end $$;

commit;
