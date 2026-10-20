-- PMS 1.22: catalogue only, except the minimal hotel/binding duplicate inventory.
-- Run only in the confirmed project vblxmnqbatqrynfaasmf. No business RPC invoked.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,
   'type',data_type,'nullable',is_nullable,'default',column_default) ORDER BY table_name,ordinal_position)
   FROM information_schema.columns WHERE table_schema='public' AND table_name IN
   ('hotels','hotel_users','hotel_onboarding_state','hotel_creation_requests','hotel_pms_connections','enterprise_audit_logs')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,
   'arguments',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),
   'security_definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl,
   'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('create_hotel_onboarding_v1','save_hotel_onboarding_v1')),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
   'service_select',has_table_privilege('service_role',c.oid,'SELECT'),
   'service_insert',has_table_privilege('service_role',c.oid,'INSERT'),
   'service_update',has_table_privilege('service_role',c.oid,'UPDATE')))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('hotels','hotel_users','hotel_onboarding_state',
   'hotel_creation_requests','hotel_pms_connections','enterprise_audit_logs')),
 'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public'
   AND tablename IN ('hotels','hotel_users','hotel_onboarding_state','hotel_creation_requests','hotel_pms_connections')),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,
   'definition',pg_get_constraintdef(c.oid))) FROM pg_constraint c
   WHERE c.conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN
   ('hotels','hotel_users','hotel_onboarding_state','hotel_creation_requests','hotel_pms_connections'))),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,
   'definition',pg_get_triggerdef(t.oid),'function_definition',pg_get_functiondef(t.tgfoid)))
   FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN
   (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN
   ('hotels','hotel_users','hotel_onboarding_state','hotel_creation_requests','hotel_pms_connections'))),
 'matching_hotels',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]'::jsonb)
   FROM public.hotels WHERE lower(name) LIKE '%camino%granada%'),
 'matching_bindings',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'hotel_id',hotel_id,
   'provider',provider,'enabled',enabled,'account_code',account_code,'property_id',metadata->>'property_id',
   'webhook_enabled',webhook_enabled,'sync_status',sync_status)),'[]'::jsonb)
   FROM public.hotel_pms_connections WHERE provider='ubikos' AND
   (account_code='10318' OR metadata->>'property_id'='10318'))
) AS preflight;
ROLLBACK;

-- Separate catalogue supplement: unique indexes may not be constraint objects.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT jsonb_build_object(
 'indexes',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef))
   FROM pg_indexes WHERE schemaname='public' AND tablename IN
   ('hotels','hotel_users','hotel_onboarding_state','hotel_creation_requests','hotel_pms_connections')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'bypass_rls',rolbypassrls))
   FROM pg_roles WHERE rolname IN ('service_role','anon','authenticated')),
 'schema_usage',has_schema_privilege('service_role','public','USAGE')
) AS supplement;
ROLLBACK;
