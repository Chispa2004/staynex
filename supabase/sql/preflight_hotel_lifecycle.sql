-- READ ONLY: no guest content, names, addresses or credentials.
BEGIN TRANSACTION READ ONLY;
SELECT current_database(), current_user;
SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns
 WHERE table_schema='public' AND table_name='hotels' AND column_name IN
 ('id','name','status','metadata','archived_at','deleted_at','archived_by','archived_reason','updated_at') ORDER BY column_name;
SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hotel_users'
 AND column_name IN ('hotel_id','user_id','status','platform_role');
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.hotels'::regclass,'public.hotel_users'::regclass);
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid IN ('public.hotels'::regclass,'public.hotel_users'::regclass) AND NOT tgisinternal;
SELECT to_regclass('public.hotel_lifecycle_history'),to_regprocedure('public.hotel_lifecycle_v1(uuid,uuid,text,timestamp with time zone,timestamp with time zone)');
SELECT count(*) AS historical_archive_count FROM public.hotels WHERE to_jsonb(hotels)->>'status'='archived'
 OR to_jsonb(hotels)->>'archived_at' IS NOT NULL OR to_jsonb(hotels)->>'deleted_at' IS NOT NULL;
SELECT count(*) AS incompatible_metadata FROM public.hotels WHERE metadata IS NOT NULL AND jsonb_typeof(metadata)<>'object';
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('hotels','hotel_users','hotel_lifecycle_history');
SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name IN ('hotels','hotel_users','hotel_lifecycle_history')
 AND grantee IN ('anon','authenticated','service_role');
ROLLBACK;
