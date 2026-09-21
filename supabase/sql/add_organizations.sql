-- Schema only. No hotel is assigned to an organization by this migration.
-- Requires hotel_users, platform_audit_logs and the phase 2 tenant RLS helpers.
begin;
set local lock_timeout = '5s';
do $$
begin
  if exists(select 1 from public.hotel_users where status='active' and user_id is null) then
    raise exception 'Bind active legacy identities to verified Auth users before this migration; never infer a privileged identity';
  end if;
  if to_regprocedure('public.staynex_can_read_hotel(uuid)') is null
    or to_regprocedure('public.staynex_can_write_hotel(uuid,text[])') is null then
    raise exception 'Install and verify the existing tenant RLS contract first';
  end if;
  if exists(select 1 from pg_indexes where schemaname='public' and tablename='hotel_users'
    and indexdef like 'CREATE UNIQUE INDEX%' and indexdef like '%user_id%' and indexdef like '%hotel_id%'
    and indexdef not like '%organization_user_id%'
    and indexname not in ('hotel_users_user_id_hotel_id','hotel_users_user_id_hotel_id_unique')) then
    raise exception 'Unknown independent assignment uniqueness: review preflight before index transition';
  end if;
end $$;
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  kind text not null check (kind in ('chain','independent')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);
create table if not exists public.organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid,
  email text not null check (email = lower(btrim(email)) and position('@' in email)>1),
  role text not null default 'member' check (role in ('member','org_admin')),
  status text not null default 'invited' check (status in ('active','invited','disabled')),
  created_at timestamptz not null default now(),
  unique (organization_id,email)
);
create unique index if not exists organization_users_identity on public.organization_users(organization_id,user_id) where user_id is not null;
alter table public.hotels add column if not exists organization_id uuid references public.organizations(id);
create index if not exists hotels_organization_id on public.hotels(organization_id);
-- Separate rows retain the original independent assignment, UUID and role.
alter table public.hotel_users add column if not exists organization_user_id uuid references public.organization_users(id);
alter table public.hotel_users add column if not exists organization_grant_revoked boolean not null default false;
drop index if exists public.hotel_users_user_id_hotel_id;
drop index if exists public.hotel_users_user_id_hotel_id_unique;
drop index if exists public.hotel_users_hotel_id_email_unique;
create unique index if not exists hotel_users_independent_identity on public.hotel_users(user_id,hotel_id) where user_id is not null and organization_user_id is null;
create unique index if not exists hotel_users_independent_email on public.hotel_users(hotel_id,lower(email)) where email is not null and organization_user_id is null;
create unique index if not exists hotel_users_organization_grant on public.hotel_users(organization_user_id,hotel_id) where organization_user_id is not null;
alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;
revoke all on public.organizations, public.organization_users from public, anon, authenticated;
grant select on public.organizations, public.organization_users to service_role;

-- A legacy table-wide UPDATE grant must not let a browser assign customer scope.
-- Invoker rights are deliberate: the management RPC runs as its trusted owner,
-- while a direct authenticated/anon write retains the caller role.
create or replace function public.staynex_guard_hotel_organization_write()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if current_user in ('anon','authenticated') and
    ((tg_op='INSERT' and new.organization_id is not null) or
     (tg_op='UPDATE' and new.organization_id is distinct from old.organization_id)) then
    raise exception 'Organization incorporation requires the Staynex management contract';
  end if;
  return new;
end $$;
revoke all on function public.staynex_guard_hotel_organization_write() from public,anon,authenticated;
drop trigger if exists organization_scope_write_guard on public.hotels;
create trigger organization_scope_write_guard before insert or update of organization_id on public.hotels
for each row execute function public.staynex_guard_hotel_organization_write();

create or replace function public.staynex_sync_organization_grants(p_organization_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare r record;
begin
  perform 1 from public.organizations where id=p_organization_id for update;
  for r in
    insert into public.hotel_users(hotel_id,user_id,email,role,status,organization_user_id,accepted_at)
    select h.id,m.user_id,m.email,'admin','active',m.id,now()
    from public.organization_users m join public.organizations o on o.id=m.organization_id
    join public.hotels h on h.organization_id=o.id
    where o.id=p_organization_id and o.status='active' and m.status='active' and m.role='org_admin' and m.user_id is not null
    on conflict (organization_user_id,hotel_id) where organization_user_id is not null do nothing
    returning id,hotel_id,user_id,organization_user_id
  loop
    insert into public.platform_audit_logs(action,hotel_id,target_user_id,metadata)
    values ('organization_hotel_grant_created',r.hotel_id,r.user_id,jsonb_build_object('assignment_id',r.id,'organization_id',p_organization_id,'membership_id',r.organization_user_id));
  end loop;
  for r in
    update public.hotel_users hu set status='disabled',organization_grant_revoked=true,updated_at=now()
    from public.organization_users m
    where hu.organization_user_id=m.id and m.organization_id=p_organization_id
    and hu.status='active' and not hu.organization_grant_revoked and not exists (
      select 1 from public.organizations o join public.hotels h on h.organization_id=o.id
      where o.id=m.organization_id and h.id=hu.hotel_id and o.status='active' and m.status='active' and m.role='org_admin' and m.user_id is not null
    ) returning hu.id,hu.hotel_id,hu.user_id
  loop
    insert into public.platform_audit_logs(action,hotel_id,target_user_id,metadata)
    values ('organization_hotel_grant_revoked',r.hotel_id,r.user_id,jsonb_build_object('assignment_id',r.id,'organization_id',p_organization_id));
  end loop;
  -- A manually suspended assignment is not reactivated by reconciliation.
  for r in
    update public.hotel_users hu set status='active',organization_grant_revoked=false,updated_at=now()
    from public.organization_users m,public.organizations o,public.hotels h
    where hu.organization_user_id=m.id and m.organization_id=p_organization_id and o.id=m.organization_id
    and h.id=hu.hotel_id and h.organization_id=o.id and o.status='active' and m.status='active'
    and m.role='org_admin' and m.user_id is not null and hu.organization_grant_revoked
    returning hu.id,hu.hotel_id,hu.user_id
  loop
    insert into public.platform_audit_logs(action,hotel_id,target_user_id,metadata)
    values ('organization_hotel_grant_restored',r.hotel_id,r.user_id,jsonb_build_object('assignment_id',r.id,'organization_id',p_organization_id));
  end loop;
end $$;

create or replace function public.staynex_organization_membership_changed()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.email<>old.email or (old.user_id is not null and new.user_id is distinct from old.user_id)) then
    raise exception 'Membership identity and organization are immutable';
  end if;
  perform public.staynex_sync_organization_grants(new.organization_id);
  return new;
end $$;
drop trigger if exists organization_membership_changed on public.organization_users;
create trigger organization_membership_changed after insert or update on public.organization_users for each row execute function public.staynex_organization_membership_changed();

create or replace function public.staynex_organization_status_changed()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.staynex_sync_organization_grants(new.id); return new; end $$;
drop trigger if exists organization_status_changed on public.organizations;
create trigger organization_status_changed after update of status on public.organizations for each row execute function public.staynex_organization_status_changed();

create or replace function public.staynex_incorporate_hotel_members()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and old.organization_id is not null and new.organization_id is distinct from old.organization_id then
    raise exception 'Moving an incorporated hotel requires a separately reviewed transfer';
  end if;
  if new.organization_id is null then return new; end if;
  perform 1 from public.organizations where id=new.organization_id for update;
  if exists(select 1 from public.organizations where id=new.organization_id and kind='independent')
    and exists(select 1 from public.hotels where organization_id=new.organization_id and id<>new.id) then
    raise exception 'An independent organization has one hotel';
  end if;
  insert into public.organization_users(organization_id,user_id,email,role,status)
  select new.organization_id,hu.user_id,lower(btrim(hu.email)),'member',
    case when bool_or(hu.status='active') then 'active' when bool_or(hu.status='invited') then 'invited' else 'disabled' end
  from public.hotel_users hu where hu.hotel_id=new.id and hu.organization_user_id is null
    and coalesce(hu.platform_role,'none')='none' and hu.email is not null
  group by hu.user_id,lower(btrim(hu.email)) on conflict (organization_id,email) do nothing;
  -- Unidentified legacy users must be mapped before incorporation, not dropped.
  if exists (select 1 from public.hotel_users hu where hu.hotel_id=new.id and hu.organization_user_id is null
    and hu.status='active' and coalesce(hu.platform_role,'none')='none' and not exists (
      select 1 from public.organization_users m where m.organization_id=new.organization_id and m.status='active'
      and (m.user_id=hu.user_id or (hu.user_id is null and m.email=lower(hu.email)))
    )) then raise exception 'Active legacy assignments need compatible organization membership'; end if;
  perform public.staynex_sync_organization_grants(new.organization_id);
  return new;
end $$;
drop trigger if exists hotel_organization_changed on public.hotels;
create trigger hotel_organization_changed after insert or update of organization_id on public.hotels for each row execute function public.staynex_incorporate_hotel_members();

-- New ordinary hotel invitations receive membership, without reviving a revoked membership.
create or replace function public.staynex_hotel_member_created()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare oid uuid;
begin
  if new.organization_user_id is not null or coalesce(new.platform_role,'none')<>'none' then return new; end if;
  select organization_id into oid from public.hotels where id=new.hotel_id;
  if oid is not null then
    perform 1 from public.organizations where id=oid for update;
    insert into public.organization_users(organization_id,user_id,email,role,status)
    values(oid,new.user_id,lower(btrim(new.email)),'member',new.status)
    on conflict(organization_id,email) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists hotel_member_created on public.hotel_users;
create trigger hotel_member_created after insert on public.hotel_users for each row execute function public.staynex_hotel_member_created();
revoke all on function public.staynex_hotel_member_created() from public,anon,authenticated;

create or replace function public.staynex_manage_organization(p_actor uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare member_uid uuid; oid uuid := nullif(p_payload->>'organization_id','')::uuid; result jsonb;
begin
  if not exists(select 1 from public.hotel_users where user_id=p_actor and status='active' and platform_role in ('super_admin','platform_admin')) then
    raise exception 'Staynex administrator required' using errcode='42501';
  end if;
  if p_action='create' then
    insert into public.organizations(name,kind) values(btrim(p_payload->>'name'),p_payload->>'kind') returning to_jsonb(organizations.*) into result;
    oid := (result->>'id')::uuid;
  else
    perform 1 from public.organizations where id=oid for update;
    if not found then raise exception 'Organization not found'; end if;
    if p_action='incorporate' then
      update public.hotels set organization_id=oid where id=(p_payload->>'hotel_id')::uuid returning jsonb_build_object('id',id,'organization_id',organization_id) into result;
      if not found then raise exception 'Hotel not found'; end if;
    elsif p_action='member' then
      select id into member_uid from auth.users where lower(email)=lower(btrim(p_payload->>'email')) and email_confirmed_at is not null;
      if nullif(p_payload->>'user_id','') is not null and (p_payload->>'user_id')::uuid is distinct from member_uid then
        raise exception 'Membership identity must match Auth email';
      end if;
      if p_payload->>'status'='active' and member_uid is null then raise exception 'Invite an unregistered account before activating it'; end if;
      insert into public.organization_users(organization_id,user_id,email,role,status)
      values(oid,case when p_payload->>'status'='invited' then null else member_uid end,lower(btrim(p_payload->>'email')),p_payload->>'role',p_payload->>'status')
      on conflict (organization_id,email) do update set role=excluded.role,status=excluded.status,user_id=coalesce(organization_users.user_id,excluded.user_id)
      returning to_jsonb(organization_users.*) into result;
    elsif p_action='status' then
      update public.organizations set status=p_payload->>'status' where id=oid returning to_jsonb(organizations.*) into result;
    elsif p_action='reconcile' then
      perform public.staynex_sync_organization_grants(oid); result:=jsonb_build_object('organization_id',oid);
    else raise exception 'Unsupported organization action'; end if;
  end if;
  insert into public.platform_audit_logs(actor_user_id,action,metadata)
  values(p_actor,'organization_'||p_action,jsonb_build_object('organization_id',oid,'result',result));
  return result;
end $$;

create or replace function public.staynex_accept_organization_invitations(p_user uuid,p_email text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null) then
    raise exception 'Verified Auth identity required';
  end if;
  update public.organization_users set user_id=p_user,status='active'
  where user_id is null and status='invited' and email=lower(btrim(p_email));
end $$;

-- Identity is bound to user_id once accepted; email is only an invitation bridge.
create or replace function public.staynex_is_platform_operator()
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select exists(select 1 from public.hotel_users hu where hu.user_id=auth.uid() and hu.status='active'
 and hu.platform_role in ('super_admin','platform_admin','internal_only','support'));
$$;
create or replace function public.staynex_is_platform_admin()
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select exists(select 1 from public.hotel_users hu where hu.user_id=auth.uid() and hu.status='active'
 and hu.platform_role in ('super_admin','platform_admin','internal_only'));
$$;
create or replace function public.staynex_assignment_is_authorized(p_assignment uuid,p_user uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.hotel_users hu join public.hotels h on h.id=hu.hotel_id
 where hu.id=p_assignment and hu.user_id=p_user and hu.status='active'
 and coalesce(hu.platform_role,'none')='none'
 and (h.organization_id is null and hu.organization_user_id is null or exists (
   select 1 from public.organization_users m join public.organizations o on o.id=m.organization_id
   where m.organization_id=h.organization_id and m.user_id=p_user and m.status='active' and o.status='active'
   and (hu.organization_user_id is null or (hu.organization_user_id=m.id and m.role='org_admin' and not hu.organization_grant_revoked))
 )));
$$;
create or replace function public.staynex_can_read_hotel(target_hotel_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select target_hotel_id is not null and (public.staynex_is_platform_operator() or exists(
 select 1 from public.hotel_users hu where hu.hotel_id=target_hotel_id and public.staynex_assignment_is_authorized(hu.id,auth.uid())));
$$;
create or replace function public.staynex_can_write_hotel(target_hotel_id uuid,allowed_roles text[] default array['owner','admin','manager']::text[])
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select target_hotel_id is not null and (public.staynex_is_platform_admin() or exists(
 select 1 from public.hotel_users hu where hu.hotel_id=target_hotel_id and hu.role=any(allowed_roles)
 and public.staynex_assignment_is_authorized(hu.id,auth.uid())));
$$;
revoke all on function public.staynex_sync_organization_grants(uuid),public.staynex_organization_membership_changed(),public.staynex_organization_status_changed(),public.staynex_incorporate_hotel_members(),public.staynex_manage_organization(uuid,text,jsonb),public.staynex_accept_organization_invitations(uuid,text),public.staynex_assignment_is_authorized(uuid,uuid) from public,anon,authenticated;
grant execute on function public.staynex_manage_organization(uuid,text,jsonb),public.staynex_accept_organization_invitations(uuid,text) to service_role;
-- Existing policy entry points keep their signatures and Realtime subscriptions.
revoke all on function public.staynex_is_platform_operator(),public.staynex_is_platform_admin(),public.staynex_can_read_hotel(uuid),public.staynex_can_write_hotel(uuid,text[]) from public,anon;
grant execute on function public.staynex_is_platform_operator(),public.staynex_is_platform_admin(),public.staynex_can_read_hotel(uuid),public.staynex_can_write_hotel(uuid,text[]) to authenticated,service_role;
-- Restrictive scope guards also constrain any older permissive policies.
-- They do not grant new direct access or alter existing action-specific policies.
do $$
declare t text;
begin
  foreach t in array array['reservations','conversations','tickets','messages','guests','hotel_experiences',
    'local_knowledge_items','experience_booking_requests','guest_memory','upsell_conversions','ai_offers'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('drop policy if exists organization_scope_guard on public.%I',t);
      execute format('create policy organization_scope_guard on public.%I as restrictive for all to anon,authenticated using(public.staynex_can_read_hotel(hotel_id)) with check(public.staynex_can_read_hotel(hotel_id))',t);
    end if;
  end loop;
end $$;
alter table public.hotels enable row level security;
drop policy if exists organization_hotel_read_guard on public.hotels;
create policy organization_hotel_read_guard on public.hotels as restrictive for select to authenticated using(public.staynex_can_read_hotel(id));
-- Keep existing SELECT/Realtime policies, prohibit direct identity mutation.
alter table public.hotel_users enable row level security;
drop policy if exists organization_identity_read_guard on public.hotel_users;
create policy organization_identity_read_guard on public.hotel_users as restrictive for select to authenticated
  using(public.staynex_is_platform_operator() or (user_id=auth.uid() and public.staynex_can_read_hotel(hotel_id))
    or public.staynex_can_write_hotel(hotel_id,array['owner','admin']::text[]));
drop policy if exists organization_identity_insert_guard on public.hotel_users;
create policy organization_identity_insert_guard on public.hotel_users as restrictive for insert to anon,authenticated with check(false);
drop policy if exists organization_identity_update_guard on public.hotel_users;
create policy organization_identity_update_guard on public.hotel_users as restrictive for update to anon,authenticated using(false) with check(false);
drop policy if exists organization_identity_delete_guard on public.hotel_users;
create policy organization_identity_delete_guard on public.hotel_users as restrictive for delete to anon,authenticated using(false);
-- Ordinary onboarding is atomic and cannot create a legacy (unscoped) hotel.
create or replace function public.staynex_create_organization_hotel(p_actor uuid,p_organization uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare h public.hotels; hu public.hotel_users; uid uuid; v_email text:=lower(btrim(p_payload->>'admin_email'));
begin
  if not exists(select 1 from public.hotel_users where user_id=p_actor and status='active' and platform_role in ('super_admin','platform_admin')) then
    raise exception 'Staynex administrator required' using errcode='42501';
  end if;
  perform 1 from public.organizations where id=p_organization and status='active' for update;
  if not found then raise exception 'Active organization required'; end if;
  if coalesce(length(btrim(p_payload->>'name')),0)=0 or coalesce(position('@' in v_email),0)<2 then raise exception 'Hotel name and admin email required'; end if;
  if exists(select 1 from public.organization_users where organization_id=p_organization and organization_users.email=v_email and status='disabled') then
    raise exception 'Organization membership is revoked; review that access explicitly';
  end if;
  select id into uid from auth.users where lower(auth.users.email)=v_email and email_confirmed_at is not null;
  -- Explicit allowlist: ignore caller supplied provider configuration, metadata, flags and roles.
  insert into public.hotels(organization_id,name,brand_name,slug,workspace_slug,country_code,city,timezone,timezone_integrity_status,
    default_language,support_email,brand_color,subscription_plan,ai_auto_reply_enabled,hotel_live_mode,whatsapp_number,metadata)
  values(p_organization,btrim(p_payload->>'name'),p_payload->>'brand_name',p_payload->>'slug',p_payload->>'slug',p_payload->>'country_code',
    p_payload->>'city',p_payload->>'timezone',p_payload->>'timezone_integrity_status',coalesce(p_payload->>'default_language','es'),
    p_payload->>'support_email',p_payload->>'brand_color',p_payload->>'subscription_plan',false,false,null,'{}'::jsonb) returning * into h;
  insert into public.hotel_onboarding_state(hotel_id,current_step,completed_steps,onboarding_completed)
    values(h.id,'hotel_setup','[]'::jsonb,false);
  insert into public.hotel_users(hotel_id,user_id,email,role,status,is_default,invited_at,accepted_at)
    values(h.id,uid,v_email,'admin',case when uid is null then 'invited' else 'active' end,false,now(),case when uid is not null then now() end) returning * into hu;
  insert into public.platform_audit_logs(actor_user_id,action,hotel_id,target_user_id,metadata)
    values(p_actor,'hotel_created',h.id,uid,jsonb_build_object('organization_id',p_organization,'assignment_id',hu.id));
  return jsonb_build_object('hotel',to_jsonb(h),'hotelUser',to_jsonb(hu));
end $$;
revoke all on function public.staynex_create_organization_hotel(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.staynex_create_organization_hotel(uuid,uuid,jsonb) to service_role;

create or replace function public.staynex_invite_hotel_user(p_actor uuid,p_hotel uuid,p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare oid uuid; uid uuid; result jsonb;
begin
  select organization_id into oid from public.hotels where id=p_hotel;
  if not found then raise exception 'Hotel not found'; end if;
  if oid is not null then perform 1 from public.organizations where id=oid for update; end if;
  if not exists(select 1 from public.hotel_users hu where hu.user_id=p_actor and hu.status='active' and
    (hu.platform_role in ('super_admin','platform_admin','internal_only') or
      (hu.hotel_id=p_hotel and hu.role in ('owner','admin') and public.staynex_assignment_is_authorized(hu.id,p_actor)))) then
    raise exception 'Hotel team administrator required' using errcode='42501';
  end if;
  if p_role not in ('admin','receptionist') or p_role is null then raise exception 'Role not allowed'; end if;
  p_email:=lower(btrim(p_email));
  if coalesce(position('@' in p_email),0)<2 then raise exception 'Email required'; end if;
  if exists(select 1 from public.organization_users where organization_id=oid and email=p_email and status='disabled') then
    raise exception 'Organization membership is revoked; review that access explicitly';
  end if;
  select id into uid from auth.users where lower(email)=p_email and email_confirmed_at is not null;
  insert into public.hotel_users(hotel_id,user_id,email,role,status,invited_at,accepted_at)
    values(p_hotel,uid,p_email,p_role,case when uid is null then 'invited' else 'active' end,now(),case when uid is not null then now() end)
    returning to_jsonb(hotel_users.*) into result;
  insert into public.platform_audit_logs(actor_user_id,action,hotel_id,target_user_id,metadata)
    values(p_actor,'hotel_team_access_created',p_hotel,uid,jsonb_build_object('assignment_id',result->>'id','role',p_role,'status',result->>'status'));
  return result;
end $$;
revoke all on function public.staynex_invite_hotel_user(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.staynex_invite_hotel_user(uuid,uuid,text,text) to service_role;
commit;
