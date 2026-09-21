-- Read-only catalog checks. Run against the explicitly confirmed target before publication.
begin read only;
-- Never report reassuring zero counts through a tenant-filtered inspection role.
set local row_security = off;
select current_database() as database_name, current_user as inspector,
  current_setting('server_version_num')::int >= 150000 as postgres_supported,
  to_regclass('public.hotel_users') is not null as hotel_assignments_exist,
  to_regclass('public.platform_audit_logs') is not null as audit_exists,
  to_regclass('public.enterprise_audit_logs') is not null as workspace_audit_exists,
  to_regprocedure('public.staynex_can_read_hotel(uuid)') is not null as tenant_read_contract,
  to_regprocedure('public.staynex_can_write_hotel(uuid,text[])') is not null as tenant_write_contract;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
  and (table_name in ('organizations','organization_users') or
    (table_name='hotels' and column_name in ('id','organization_id')) or
    (table_name='hotel_users' and column_name in ('id','hotel_id','user_id','email','role','status','platform_role','organization_user_id','organization_grant_revoked')))
order by table_name,ordinal_position;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
  and table_name in ('hotels','hotel_users','hotel_onboarding_state','platform_audit_logs','enterprise_audit_logs')
order by table_name,ordinal_position;
select indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('hotel_users','organization_users') order by tablename,indexname;
select c.relname as table_name,k.conname,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('hotels','hotel_users','organizations','organization_users') order by c.relname,k.conname;
select c.relname as table_name,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and c.relname in ('hotels','hotel_users','organizations','organization_users') order by c.relname,t.tgname;
select p.oid::regprocedure as function,p.prosecdef as security_definer,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('staynex_can_read_hotel','staynex_can_write_hotel','staynex_can_manage_hotel','staynex_is_platform_operator','staynex_is_platform_admin','staynex_manage_organization','staynex_accept_organization_invitations','staynex_create_organization_hotel','staynex_invite_hotel_user') order by 1;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('hotels','hotel_users','organizations','organization_users','messages','conversations','tickets') order by tablename,policyname;
select count(*) filter(where user_id is null and status='active') as unbound_active_assignments,
  count(*) filter(where email is null or btrim(email)='') as assignments_needing_email_mapping
from public.hotel_users;
select count(*) as duplicate_normalized_assignment_emails from (
  select hotel_id,lower(btrim(email)) from public.hotel_users where email is not null
  group by hotel_id,lower(btrim(email)) having count(*)>1
) conflicts;
-- After installation, separate independent/derived rows can explain duplicates;
-- compare origin before any action. This query never fixes or exports identities.
select r.rolname,c.relname,c.relrowsecurity,c.relforcerowsecurity,
  has_table_privilege(r.oid,c.oid,'SELECT') as can_select,
  has_table_privilege(r.oid,c.oid,'INSERT') as can_insert,
  has_table_privilege(r.oid,c.oid,'UPDATE') as can_update,
  has_table_privilege(r.oid,c.oid,'DELETE') as can_delete
from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
where r.rolname in ('anon','authenticated','service_role') and n.nspname='public'
  and c.relname in ('hotels','hotel_users','organizations','organization_users','messages','conversations','tickets') order by c.relname,r.rolname;
select pubname,schemaname,tablename from pg_publication_tables
where schemaname='public' and tablename in ('hotel_users','messages','conversations','tickets') order by pubname,tablename;
-- No names/emails/hotel data exported. Review identities privately when counts are nonzero.
rollback;
