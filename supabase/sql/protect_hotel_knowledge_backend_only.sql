-- Prepared migration, NOT applied to production. Dashboard CRUD goes through authenticated server routes.
-- No browser reads/writes are needed; role/category authorization stays in dashboard/lib/knowledge.js.
-- Preserve legacy NULL ownership. No backfill, reassignment, deletion or NOT NULL change.
begin;
do $guard$
begin
  if not exists(select 1 from pg_class where oid=to_regclass('public.hotel_knowledge') and relkind='r') then raise exception 'hotel_knowledge ordinary table required'; end if;
  if not exists(select 1 from pg_attribute where attrelid='public.hotel_knowledge'::regclass and attname='hotel_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'hotel_knowledge.hotel_id UUID required'; end if;
  if (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role'))<>3 then raise exception 'Expected Supabase roles missing'; end if;
  if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls) then raise exception 'Expected backend service_role BYPASSRLS'; end if;
  if not exists(select 1 from pg_class where oid='public.hotel_knowledge'::regclass and pg_has_role(current_user,relowner,'USAGE')) then raise exception 'Table owner required to change RLS/grants'; end if;
  if exists(select 1 from pg_policy where polrelid='public.hotel_knowledge'::regclass) then raise exception 'Existing knowledge policies require explicit review; will not overwrite'; end if;
  if exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) acl where a.attrelid='public.hotel_knowledge'::regclass
    and acl.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'))) then raise exception 'Existing browser column grants require explicit review'; end if;
end $guard$;
alter table public.hotel_knowledge enable row level security;
revoke all on table public.hotel_knowledge from public,anon,authenticated;
grant select,insert,update,delete on table public.hotel_knowledge to service_role;
-- REVOKE on this table alone does not remove inherited role/column grants.
-- Abort the whole transaction if backend-only access cannot actually be enforced.
do $effective_guard$
begin
  if exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated') and (
    r.rolsuper or r.rolbypassrls
    or pg_has_role(r.oid,(select oid from pg_roles where rolname='service_role'),'MEMBER')
    or has_table_privilege(r.oid,'public.hotel_knowledge','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege(r.oid,'public.hotel_knowledge','SELECT,INSERT,UPDATE,REFERENCES')
  )) then raise exception 'Effective browser privileges remain; review inherited roles/column grants'; end if;
  if not has_schema_privilege('service_role','public','USAGE') then
    raise exception 'Backend service_role needs public schema USAGE';
  end if;
end $effective_guard$;
commit;
