begin transaction isolation level repeatable read read only;
select jsonb_build_object(
 'database',current_database(),
 'columns',(select jsonb_agg(to_jsonb(c)) from (select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name in ('tickets','message_attention','operational_request_receipts','enterprise_audit_logs','hotel_users','hotels') order by table_name,ordinal_position)c),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'acl',p.proacl,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('staynex_attention_transition_v1','staynex_attention_read_v1','record_guest_operational_request_v1','staynex_ticket_transition_v1','staynex_ticket_version','staynex_attention_ticket_groups_v1')),
 'ticket_triggers',(select jsonb_agg(pg_get_triggerdef(oid)) from pg_trigger where tgrelid='public.tickets'::regclass and not tgisinternal),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in ('tickets','message_attention','operational_request_receipts','enterprise_audit_logs')),
 'roles',(select jsonb_agg(jsonb_build_object('role',r,'ticket_write',has_table_privilege(r,'public.tickets','UPDATE'),'attention_execute',has_function_privilege(r,'public.staynex_attention_transition_v1(uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE'))) from unnest(array['anon','authenticated','service_role']) r)
) as preflight;
rollback;
