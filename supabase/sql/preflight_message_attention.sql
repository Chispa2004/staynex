-- READ ONLY. Run before first installation. Refuses incompatible names/types.
begin transaction read only;
do $guard$
declare spec record; actual text;
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'PostgreSQL 15 or later required; locally validated on 17.10';
  end if;
  if not has_schema_privilege(current_user,'public','CREATE') or not has_schema_privilege(current_user,'public','USAGE')
    or not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Installer needs schema CREATE/USAGE and BYPASSRLS for backend function ownership';
  end if;
  if (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role'))<>3 then
    raise exception 'Required Supabase roles missing';
  end if;
  if not has_schema_privilege('service_role','public','USAGE') or to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception 'Required backend schema access or UUID dependency missing';
  end if;
  if to_regclass('public.message_attention') is not null
     or exists(select 1 from pg_attribute where attrelid=to_regclass('public.messages') and attname='attention_inclusion_version' and not attisdropped)
     or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'staynex_attention_%')
     or exists(select 1 from pg_trigger where tgname='staynex_message_attention_insert') then
    raise exception 'Attention objects already exist: inspect definition and verification before proceeding';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'message_attention_%')
    or exists(select 1 from pg_constraint where conrelid=to_regclass('public.messages') and conname='message_attention_inclusion_version_check') then
    raise exception 'Attention index/constraint name collision: review existing installation';
  end if;
  for spec in select * from (values
    ('messages','id','uuid'),('messages','hotel_id','uuid'),('messages','conversation_id','uuid'),
    ('messages','sender_type','text'),('messages','metadata','jsonb'),('messages','content','text'),('messages','created_at','timestamp with time zone'),
    ('conversations','id','uuid'),('conversations','hotel_id','uuid'),('conversations','guest_id','uuid'),
    ('hotel_users','user_id','uuid'),('hotel_users','hotel_id','uuid'),('hotel_users','role','text'),('hotel_users','status','text'),('hotel_users','platform_role','text'),
    ('hotels','id','uuid'),('hotels','timezone','text'),('guests','id','uuid'),('guests','hotel_id','uuid'),('guests','current_room','text'),
    ('enterprise_audit_logs','id','uuid'),('enterprise_audit_logs','entity_id','uuid'),('enterprise_audit_logs','hotel_id','uuid'),('enterprise_audit_logs','actor_user_id','uuid'),
    ('enterprise_audit_logs','actor_role','text'),('enterprise_audit_logs','action','text'),('enterprise_audit_logs','entity_type','text'),
    ('enterprise_audit_logs','old_values_summary','jsonb'),('enterprise_audit_logs','new_values_summary','jsonb'),
    ('enterprise_audit_logs','metadata','jsonb'),('enterprise_audit_logs','created_at','timestamp with time zone'),
    ('conversation_ai_state','conversation_id','uuid'),('conversation_ai_state','hotel_id','uuid'),('conversation_ai_state','escalation_level','text'),('conversation_ai_state','updated_at','timestamp with time zone'),
    ('twilio_inbound_message_claims','message_id','uuid'),('twilio_inbound_message_claims','hotel_id','uuid'),('twilio_inbound_message_claims','message_sid','text')
  ) v(tab,col,typ) loop
    select format_type(a.atttypid,a.atttypmod) into actual from pg_attribute a
      where a.attrelid=to_regclass('public.'||spec.tab) and a.attname=spec.col and not a.attisdropped;
    if actual is distinct from spec.typ then raise exception 'Incompatible %.%: expected %, found %',spec.tab,spec.col,spec.typ,actual; end if;
  end loop;
  for spec in select * from (values ('messages'),('conversations'),('hotel_users'),('hotels'),('guests'),
    ('enterprise_audit_logs'),('conversation_ai_state'),('twilio_inbound_message_claims')) v(tab) loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||spec.tab) and relkind='r')
      or not has_table_privilege(current_user,'public.'||spec.tab,'SELECT') then
      raise exception 'Expected readable ordinary table public.%',spec.tab;
    end if;
  end loop;
  for spec in select * from (values ('messages'),('enterprise_audit_logs')) v(tab) loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||spec.tab) and pg_has_role(current_user,relowner,'USAGE')) then
      raise exception 'Installer must own public.% (DDL/indexes)',spec.tab;
    end if;
  end loop;
  if not has_table_privilege(current_user,'public.messages','UPDATE')
    or not has_table_privilege(current_user,'public.conversations','UPDATE')
    or not has_table_privilege(current_user,'public.conversations','REFERENCES')
    or not has_table_privilege(current_user,'public.hotels','REFERENCES')
    or not has_table_privilege(current_user,'public.enterprise_audit_logs','INSERT') then
    raise exception 'Installer lacks required lock/write/reference privileges';
  end if;
  if not exists(select 1 from pg_constraint k where k.conrelid='public.messages'::regclass
    and k.confrelid='public.conversations'::regclass and k.contype='f' and k.convalidated
    and k.conkey=array[(select attnum from pg_attribute where attrelid=k.conrelid and attname='conversation_id'),
      (select attnum from pg_attribute where attrelid=k.conrelid and attname='hotel_id')]::smallint[]
    and k.confkey=array[(select attnum from pg_attribute where attrelid=k.confrelid and attname='id'),
      (select attnum from pg_attribute where attrelid=k.confrelid and attname='hotel_id')]::smallint[]) then
    raise exception 'Validated messages(conversation_id,hotel_id) foreign key required';
  end if;
  if exists(select 1 from public.enterprise_audit_logs where entity_type='message_attention_operation'
    group by entity_id having count(*)>1) then
    raise exception 'Existing attention audit identities conflict with unique operation index';
  end if;
  if not exists(select 1 from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
    where d.adrelid='public.enterprise_audit_logs'::regclass and a.attname='id' and pg_get_expr(d.adbin,d.adrelid) like '%gen_random_uuid()%') then
    raise exception 'Expected enterprise audit UUID identity default';
  end if;
  if exists(select 1 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.enterprise_audit_logs'::regclass and a.attnum>0 and not a.attisdropped and a.attnotnull and d.oid is null
      and a.attname not in ('hotel_id','action','entity_type','entity_id','new_values_summary','metadata','created_at')) then
    raise exception 'Enterprise audit has additional mandatory columns incompatible with inbound audit';
  end if;
  if not exists(select 1 from pg_index i where i.indrelid='public.conversation_ai_state'::regclass and i.indisunique and i.indpred is null
    and i.indnkeyatts=1 and i.indkey[0]=(select attnum from pg_attribute where attrelid='public.conversation_ai_state'::regclass and attname='conversation_id')) then
    raise exception 'Expected unique conversation_ai_state(conversation_id)';
  end if;
end $guard$;
select current_database(), current_user, version();
-- Metadata only: estimates are not exact counts; DDL scans messages and audit indexes.
select c.relname as table_name, c.reltuples::bigint as estimated_rows,
  pg_table_size(c.oid) as table_bytes, pg_indexes_size(c.oid) as index_bytes,
  pg_total_relation_size(c.oid) as total_bytes
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('messages','enterprise_audit_logs','conversations') order by c.relname;
select 'PASS: installation absent; schema and installer guards satisfied' as preflight_status;
rollback;
