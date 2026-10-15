-- Execute only after both active Production server targets are accredited.
-- No RPC invocation, business function, DDL, write, email or guest directory.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT current_database(), current_user, current_setting('transaction_read_only') AS read_only, version();
SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
 pg_get_userbyid(c.relowner) AS owner,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('hotels','hotel_users','hotel_onboarding_state',
 'hotel_creation_requests','hotel_access_invitations','hotel_information_reviews',
 'hotel_knowledge','local_knowledge_items','hotel_pms_connections','reservations',
 'room_status_snapshots','hotel_occupancy_snapshots','guest_stay_context') ORDER BY c.relname;
SELECT table_schema,table_name,column_name,data_type,udt_name,is_nullable,column_default
FROM information_schema.columns
WHERE (table_schema='public' AND table_name IN ('hotels','hotel_users','hotel_onboarding_state',
 'hotel_creation_requests','hotel_access_invitations','hotel_information_reviews','hotel_knowledge',
 'local_knowledge_items','hotel_pms_connections','reservations','room_status_snapshots',
 'hotel_occupancy_snapshots','guest_stay_context'))
 OR (table_schema='auth' AND table_name='users' AND column_name IN ('id','email','email_confirmed_at','banned_until'))
ORDER BY table_schema,table_name,ordinal_position;
SELECT conrelid::regclass AS relation,conname,contype,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('hotels','hotel_users','hotel_onboarding_state','hotel_creation_requests',
 'hotel_access_invitations','hotel_information_reviews','hotel_pms_connections','reservations')) ORDER BY 1,2;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN
 ('hotels','hotel_users','hotel_onboarding_state','hotel_creation_requests','hotel_access_invitations',
 'hotel_information_reviews','hotel_pms_connections','reservations') ORDER BY 1,2;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('hotels','hotel_users','hotel_onboarding_state','hotel_creation_requests',
 'hotel_access_invitations','hotel_information_reviews','hotel_knowledge','local_knowledge_items','hotel_pms_connections','reservations') ORDER BY 2,3;
SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name IN ('hotels','hotel_users','hotel_access_invitations',
 'hotel_information_reviews','hotel_pms_connections','reservations') ORDER BY 1,2,3;
SELECT table_name,column_name,grantee,privilege_type FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name IN ('hotels','hotel_users','hotel_pms_connections','reservations') ORDER BY 1,2,3,4;
SELECT p.oid::regprocedure AS signature,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.provolatile,p.proconfig,p.proacl,
 pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('create_hotel_onboarding_v1','save_hotel_onboarding_v1','manage_hotel_invitation_v1',
 'accept_hotel_invitation_v1','hotel_identity_evidence_v1','hotel_information_review_v1',
 'guard_pms_connection_revision_v1','record_pms_evidence_v1','guard_apaleo_reservation_binding_v1') ORDER BY 1;
SELECT t.tgrelid::regclass AS relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN
 (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 AND c.relname IN ('hotels','hotel_users','hotel_pms_connections','reservations')) ORDER BY 1,2;
SELECT p.oid::regprocedure AS function,d.deptype,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS dependency
FROM pg_depend d JOIN pg_proc p ON d.classid='pg_proc'::regclass AND d.objid=p.oid
WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('create_hotel_onboarding_v1',
 'save_hotel_onboarding_v1','manage_hotel_invitation_v1','accept_hotel_invitation_v1',
 'hotel_identity_evidence_v1','hotel_information_review_v1','record_pms_evidence_v1') ORDER BY 1,3;
SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres','supabase_admin');
-- Aggregates only. No user/hotel UUID, email, invitation token or business contents.
SELECT a.status,a.role,(a.user_id IS NULL) AS without_identity,
 CASE WHEN a.user_id IS NULL THEN 'unbound' WHEN u.id IS NULL THEN 'missing_auth'
 WHEN u.banned_until>now() THEN 'banned' WHEN u.email_confirmed_at IS NULL THEN 'unverified' ELSE 'verified' END AS identity_category,
 count(*) AS assignments FROM public.hotel_users a LEFT JOIN auth.users u ON u.id=a.user_id GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;
SELECT provider,enabled,count(*) AS connections,
 count(*) FILTER(WHERE nullif(metadata->>'property_id','') IS NULL) AS without_explicit_property,
 count(*) FILTER(WHERE coalesce(metadata->>'environment','') NOT IN ('test','production')) AS without_environment
FROM public.hotel_pms_connections GROUP BY 1,2 ORDER BY 1,2;
ROLLBACK;
