-- READ ONLY. No guest rows, token values or provider configuration are returned.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'database',current_database(),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'udt',udt_name,'nullable',is_nullable,'default',column_default) ORDER BY table_name,ordinal_position)
   FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('hotels','guests','conversations','messages','tickets','reservations','hotel_users','conversation_ai_state','operational_request_receipts')),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) FROM pg_constraint c
   WHERE c.conrelid IN ('public.tickets'::regclass,'public.messages'::regclass,'public.conversations'::regclass,'public.conversation_ai_state'::regclass)),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'definition',pg_get_triggerdef(oid))) FROM pg_trigger
   WHERE NOT tgisinternal AND tgrelid IN ('public.tickets'::regclass,'public.conversations'::regclass,'public.conversation_ai_state'::regclass)),
 'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('tickets','operational_request_receipts')),
 'service_privileges',(SELECT jsonb_agg(jsonb_build_object('table',t,'select',has_table_privilege('service_role',t,'SELECT'),'insert',has_table_privilege('service_role',t,'INSERT'),'update',has_table_privilege('service_role',t,'UPDATE'))) FROM unnest(ARRAY['public.hotels','public.guests','public.conversations','public.messages','public.tickets','public.reservations','public.hotel_users','public.conversation_ai_state']) t),
 'contract',to_regprocedure('public.record_guest_operational_request_v1(uuid,uuid,uuid,jsonb)')::text
) AS operational_request_preflight;
ROLLBACK;
