-- Incremental PostgreSQL 17+ privileges only; no data, policy, publication or schema changes.
-- Preserve authenticated SELECT under the reviewed repository tenant policy.
-- Unexpected policies/inherited grants abort atomically; never change global memberships.
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if current_setting('server_version_num')::int < 170000 then raise exception 'PostgreSQL 17+ required'; end if;
  if not exists(select 1 from pg_class where oid=to_regclass('public.messages') and relkind='r' and relrowsecurity) then
    raise exception 'messages ordinary table with RLS enabled required';
  end if;
  if (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role'))<>3 then raise exception 'Expected Supabase roles missing'; end if;
  if not exists(select 1 from pg_class where oid='public.messages'::regclass and pg_has_role(current_user,relowner,'USAGE')) then raise exception 'Table owner required'; end if;
  if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls and not rolsuper) then raise exception 'Expected service_role BYPASSRLS'; end if;
  if (select count(*) from pg_policy where polrelid='public.messages'::regclass)<>1
    or not exists(select 1 from pg_policies where schemaname='public' and tablename='messages'
      and policyname='staynex_tenant_read_messages' and cmd='SELECT' and permissive='PERMISSIVE'
      and roles=array['authenticated']::name[] and with_check is null
      and qual in ('staynex_can_read_hotel(hotel_id)','public.staynex_can_read_hotel(hotel_id)')) then
    raise exception 'Expected reviewed messages tenant SELECT policy only; inspect policy differences';
  end if;
  if not has_table_privilege('authenticated','public.messages','SELECT')
    or not has_schema_privilege('authenticated','public','USAGE')
    or not has_schema_privilege('service_role','public','USAGE')
    or not has_function_privilege('authenticated','public.staynex_can_read_hotel(uuid)','EXECUTE') then
    raise exception 'Existing authenticated read/backend prerequisites missing';
  end if;
end $guard$;

revoke all privileges on table public.messages from public, anon;
revoke insert,update,delete,truncate,references,trigger,maintain on table public.messages from authenticated;
revoke grant option for select on table public.messages from authenticated;
-- Application servers need CRUD, not table maintenance or delegating privileges.
revoke truncate,references,trigger,maintain on table public.messages from service_role;
revoke grant option for select,insert,update,delete on table public.messages from service_role;
grant select,insert,update,delete on table public.messages to service_role;

-- Table REVOKE does not revoke independent column grants. RESTRICT (default)
-- aborts on dependent grants, rather than cascading to objects outside this scope.
do $columns$
declare col record;
begin
  for col in select attname from pg_attribute where attrelid='public.messages'::regclass and attnum>0 and not attisdropped loop
    execute format('revoke all privileges (%I) on table public.messages from public, anon',col.attname);
    execute format('revoke insert (%1$I), update (%1$I), references (%1$I) on table public.messages from authenticated',col.attname);
    execute format('revoke grant option for select (%I) on table public.messages from authenticated',col.attname);
    execute format('revoke references (%I) on table public.messages from service_role',col.attname);
    execute format('revoke grant option for select (%1$I), insert (%1$I), update (%1$I) on table public.messages from service_role',col.attname);
  end loop;
end $columns$;

do $effective_guard$
declare browser record; reachable record;
begin
  for browser in select * from pg_roles where rolname in ('anon','authenticated') loop
    if browser.rolsuper or browser.rolbypassrls then raise exception 'Unexpected browser bypass role'; end if;
    for reachable in select * from pg_roles where oid=browser.oid or pg_has_role(browser.oid,oid,'SET') loop
      if reachable.rolsuper or reachable.rolbypassrls
        or has_table_privilege(reachable.oid,'public.messages','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION')
        or has_any_column_privilege(reachable.oid,'public.messages','INSERT,UPDATE,REFERENCES,SELECT WITH GRANT OPTION')
        or (browser.rolname='anon' and (has_table_privilege(reachable.oid,'public.messages','SELECT')
          or has_any_column_privilege(reachable.oid,'public.messages','SELECT'))) then
        raise exception 'Unexpected effective messages privileges (inherited/SET ROLE/column) for % via %',browser.rolname,reachable.rolname;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('authenticated','public.messages','SELECT') then raise exception 'Authenticated SELECT must remain'; end if;
  if has_table_privilege('service_role','public.messages','TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')
    or has_any_column_privilege('service_role','public.messages','REFERENCES,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION') then
    raise exception 'Unexpected effective backend messages administrative privileges; review inheritance';
  end if;
  if exists(select 1 from (values('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
    where not has_table_privilege('service_role','public.messages',p.privilege)) then raise exception 'Backend messages CRUD unavailable'; end if;
end $effective_guard$;
commit;
