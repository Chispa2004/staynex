-- Future authorized publication only. Catalog reads, no guest rows or RPC execution.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT current_database() AS database_name, current_setting('server_version') AS postgres_version;
-- Project identity must separately match the effective server configuration of
-- backend AND Dashboard; a database name is not evidence of Supabase projectRef.
SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('hotels','guests','conversations','messages','reservations','tickets','hotel_users','conversation_ai_state','operational_request_receipts','enterprise_audit_logs');
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public' AND table_name IN
 ('hotels','guests','conversations','messages','reservations','tickets','hotel_users','conversation_ai_state','operational_request_receipts')
ORDER BY table_name,ordinal_position;
SELECT p.oid::regprocedure AS signature,p.prorettype::regtype AS return_type,
 p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,p.proacl,
 md5(pg_get_functiondef(p.oid)) AS catalog_definition_md5,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('record_guest_operational_request_v1','recover_guest_operational_request_v1','guard_ticket_request_context_v1','staynex_ticket_version','staynex_ticket_transition_v1','staynex_attention_ticket_groups_v1') ORDER BY p.proname;
SELECT r.rolname,p.oid::regprocedure AS signature,has_function_privilege(r.oid,p.oid,'execute') AS effective_execute
FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public'
AND p.proname IN ('record_guest_operational_request_v1','recover_guest_operational_request_v1');
SELECT r.rolname,c.relname,has_table_privilege(r.oid,c.oid,'select') AS can_select,
 has_table_privilege(r.oid,c.oid,'insert') AS can_insert,has_table_privilege(r.oid,c.oid,'update') AS can_update
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public'
AND c.relname IN ('messages','tickets','operational_request_receipts','hotels','guests','conversations','reservations','hotel_users','conversation_ai_state');
SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname IN ('tickets','messages','operational_request_receipts');
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('tickets','operational_request_receipts');
SELECT c.conrelid::regclass AS relation,c.conname,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c WHERE c.conrelid IN (to_regclass('public.tickets'),to_regclass('public.operational_request_receipts'));
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('tickets','messages','operational_request_receipts');
ROLLBACK;
