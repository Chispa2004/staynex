-- Run in the SQL editor/DB connection of the CONFIRMED demo project.
-- Observational only: no fixtures, DDL, grants, assignments or row contents.
-- Existing policies/grants are reported, not rejected before inspection.
begin transaction read only;

select current_database() as database_name, current_user as inspection_role,
  current_setting('server_version') as postgres_version,
  current_setting('transaction_read_only') as transaction_read_only;

select c.relkind, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls,
  pg_get_userbyid(c.relowner) as owner,
  pg_has_role(current_user,c.relowner,'USAGE') as inspector_has_owner_privileges
from pg_class c where c.oid=to_regclass('public.hotel_knowledge');

select a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null
from pg_attribute a where a.attrelid=to_regclass('public.hotel_knowledge')
  and a.attnum>0 and not a.attisdropped order by a.attnum;

select conname,contype,convalidated,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid=to_regclass('public.hotel_knowledge') order by conname;

select policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename='hotel_knowledge' order by policyname;

-- Effective privileges include inherited grants, unlike a raw table ACL.
select r.rolname,r.rolsuper,r.rolbypassrls,r.rolinherit,
  has_schema_privilege(r.oid,'public','USAGE') as schema_usage,
  pg_has_role(r.oid,s.oid,'MEMBER') as member_of_service_role,
  p.privilege,has_table_privilege(r.oid,c.oid,p.privilege) as allowed
from pg_roles r cross join pg_class c
left join pg_roles s on s.rolname='service_role'
cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
where r.rolname in ('anon','authenticated','service_role') and c.oid=to_regclass('public.hotel_knowledge')
order by r.rolname,p.privilege;

select r.rolname,a.attname,p.privilege,
  has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) as allowed
from pg_roles r cross join pg_attribute a
cross join (values('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
where r.rolname in ('anon','authenticated','service_role')
  and a.attrelid=to_regclass('public.hotel_knowledge') and a.attnum>0 and not a.attisdropped
order by r.rolname,a.attnum,p.privilege;

-- Raw ACLs identify what needs review/recovery; PUBLIC is grantee 0.
select case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  pg_get_userbyid(acl.grantor) as grantor,acl.privilege_type,acl.is_grantable
from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
where c.oid=to_regclass('public.hotel_knowledge');
select a.attname,case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  pg_get_userbyid(acl.grantor) as grantor,acl.privilege_type,acl.is_grantable
from pg_attribute a cross join lateral aclexplode(a.attacl) acl
where a.attrelid=to_regclass('public.hotel_knowledge') and not a.attisdropped;

-- Do not misrepresent RLS-filtered counts as a complete ownership inventory.
-- Metadata above remains useful if this final count prerequisite fails.
do $count_guard$
begin
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.hotel_knowledge')
    and attname='hotel_id' and atttypid='uuid'::regtype and not attisdropped) then
    raise exception 'Counts unavailable: hotel_knowledge.hotel_id UUID required';
  end if;
  if exists(select 1 from pg_class c where c.oid in (to_regclass('public.hotel_knowledge'),to_regclass('public.hotels'))
    and c.relrowsecurity and not (
      exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
      or (not c.relforcerowsecurity and pg_has_role(current_user,c.relowner,'USAGE'))
    )) then raise exception 'Counts unavailable: inspector needs full row visibility on both tables'; end if;
end $count_guard$;
select count(*) filter(where k.hotel_id is null) as unowned_rows,
  count(*) filter(where k.hotel_id is not null and h.id is null) as orphan_rows
from public.hotel_knowledge k left join public.hotels h on h.id=k.hotel_id;

-- This is inventory, NOT an automatic PASS or evidence of tenant RLS isolation.
rollback;
