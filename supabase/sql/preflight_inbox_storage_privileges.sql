-- Metadata only. PostgreSQL 17+. Run in the confirmed demo project; return all result sets.
-- No knowledge/message contents, credentials, fixtures or mutations.
begin transaction read only;
select current_database(),current_user,current_setting('server_version') as postgres_version,
  current_setting('transaction_read_only') as read_only;

select c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,
  pg_get_userbyid(c.relowner) as owner
from pg_class c where c.oid in (to_regclass('public.messages'),to_regclass('public.hotel_knowledge'));

-- Column types/constraints must accompany the missing inventory. Defaults can
-- affect created_at / other NOT NULL columns omitted by the initial attempt INSERT.
select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,
  a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) as default_expression
from pg_class c join pg_attribute a on a.attrelid=c.oid
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where c.oid in (to_regclass('public.messages'),to_regclass('public.hotel_knowledge'))
  and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum;

select conrelid::regclass as table_name,conname,contype,convalidated,condeferrable,condeferred,
  pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in (to_regclass('public.messages'),to_regclass('public.hotel_knowledge'))
order by conrelid,conname;

-- Independent/partial unique indexes may also reject an attempt, even if the PK is correct.
select indrelid::regclass as table_name,indexrelid::regclass as index_name,
  indisprimary,indisunique,indisvalid,indisready,indimmediate,pg_get_indexdef(indexrelid) as definition
from pg_index where indrelid=to_regclass('public.messages') order by indexrelid::regclass::text;

-- Include disabled and internal triggers. Definitions contain trigger configuration,
-- not message values. The function hash allows comparison without emitting its body.
select t.tgrelid::regclass as table_name,t.tgname,t.tgenabled,t.tgisinternal,
  pg_get_triggerdef(t.oid) as definition,t.tgfoid::regprocedure as function_name,
  p.prosecdef,p.proconfig,md5(pg_get_functiondef(p.oid)) as function_definition_md5
from pg_trigger t join pg_proc p on p.oid=t.tgfoid
where t.tgrelid=to_regclass('public.messages') order by t.tgname;

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in ('messages','hotel_knowledge')
order by tablename,policyname;

select p.oid::regprocedure as function_name,p.prosecdef,p.proconfig,
  pg_get_userbyid(p.proowner) as owner,pg_get_functiondef(p.oid) as definition
from pg_proc p where p.oid in (to_regprocedure('public.staynex_can_read_hotel(uuid)'),
  to_regprocedure('public.staynex_is_platform_operator()'),to_regprocedure('public.staynex_rls_auth_email()'));

select r.rolname,r.rolsuper,r.rolbypassrls,r.rolinherit,c.relname,p.privilege,
  has_table_privilege(r.oid,c.oid,p.privilege) as allowed,
  has_table_privilege(r.oid,c.oid,p.privilege||' WITH GRANT OPTION') as grantable,
  has_schema_privilege(r.oid,'public','USAGE') as schema_usage
from pg_roles r cross join pg_class c
cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
where r.rolname in ('anon','authenticated','service_role')
  and c.oid in (to_regclass('public.messages'),to_regclass('public.hotel_knowledge'))
order by c.relname,r.rolname,p.privilege;

select r.rolname,a.attrelid::regclass as table_name,a.attname,p.privilege,
  has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) as allowed,
  has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege||' WITH GRANT OPTION') as grantable
from pg_roles r cross join pg_attribute a
cross join (values('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
where r.rolname in ('anon','authenticated','service_role')
  and a.attrelid in (to_regclass('public.messages'),to_regclass('public.hotel_knowledge'))
  and a.attnum>0 and not a.attisdropped order by a.attrelid,r.rolname,a.attnum,p.privilege;

select c.relname,case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  pg_get_userbyid(acl.grantor) as grantor,acl.privilege_type,acl.is_grantable
from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
where c.oid in (to_regclass('public.messages'),to_regclass('public.hotel_knowledge'));
select a.attrelid::regclass as table_name,a.attname,
  case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
  pg_get_userbyid(acl.grantor) as grantor,acl.privilege_type,acl.is_grantable
from pg_attribute a cross join lateral aclexplode(a.attacl) acl
where a.attrelid in (to_regclass('public.messages'),to_regclass('public.hotel_knowledge')) and not a.attisdropped;

-- Full effective inheritance and SET ROLE reachability, including NOINHERIT.
select b.rolname as api_role,r.rolname as reachable_role,r.rolsuper,r.rolbypassrls,
  pg_has_role(b.oid,r.oid,'USAGE') as inherited_now,pg_has_role(b.oid,r.oid,'SET') as can_set_role,
  c.relname,p.privilege,has_table_privilege(r.oid,c.oid,p.privilege) as allowed,
  has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') as any_column_privilege
from pg_roles b cross join pg_roles r cross join pg_class c
cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
where b.rolname in ('anon','authenticated','service_role') and b.oid<>r.oid
  and pg_has_role(b.oid,r.oid,'MEMBER')
  and c.oid in (to_regclass('public.messages'),to_regclass('public.hotel_knowledge'))
order by b.rolname,r.rolname,c.relname,p.privilege;

select pubname,schemaname,tablename,attnames,rowfilter from pg_publication_tables
where schemaname='public' and tablename='messages';
select pubname,puballtables,pubinsert,pubupdate,pubdelete,pubtruncate
from pg_publication where oid in (select p.oid from pg_publication p join pg_publication_tables t
  on t.pubname=p.pubname where t.schemaname='public' and t.tablename='messages');
rollback;
