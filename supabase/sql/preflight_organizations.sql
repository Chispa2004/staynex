-- Read-only catalog checks. Run against the explicitly confirmed target before publication.
begin read only;
select current_database() as database_name, current_user as inspector,
  current_setting('server_version_num')::int >= 150000 as postgres_supported,
  to_regclass('public.hotel_users') is not null as hotel_assignments_exist,
  to_regclass('public.platform_audit_logs') is not null as audit_exists,
  to_regprocedure('public.staynex_can_read_hotel(uuid)') is not null as tenant_read_contract,
  to_regprocedure('public.staynex_can_write_hotel(uuid,text[])') is not null as tenant_write_contract;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
  and (table_name in ('organizations','organization_users') or
    (table_name='hotels' and column_name in ('id','organization_id')) or
    (table_name='hotel_users' and column_name in ('id','hotel_id','user_id','email','role','status','platform_role','organization_user_id','organization_grant_revoked')))
order by table_name,ordinal_position;
select indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('hotel_users','organization_users') order by tablename,indexname;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('hotels','hotel_users','organizations','organization_users','messages','conversations','tickets') order by tablename,policyname;
select count(*) filter(where user_id is null and status='active') as unbound_active_assignments,
  count(*) filter(where email is null or btrim(email)='') as assignments_needing_email_mapping
from public.hotel_users;
-- No names/emails/hotel data exported. Review identities privately when counts are nonzero.
rollback;
