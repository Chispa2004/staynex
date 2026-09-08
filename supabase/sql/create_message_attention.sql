-- Apply only after preflight_message_attention.sql has passed. No backfill.
begin;
-- Refuse name collisions rather than silently accepting incompatible objects.
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

-- Historical rows remain NULL. Only subsequent INSERTs receive the default.
alter table public.messages add column attention_inclusion_version smallint;
alter table public.messages add constraint message_attention_inclusion_version_check check(attention_inclusion_version=1);
alter table public.messages alter column attention_inclusion_version set default 1;
comment on column public.messages.attention_inclusion_version is 'Attention inclusion v1 for new inserts; NULL historical/unclassified. Eligibility remains canonical sender + metadata. Never backfill on update.';
create unique index message_attention_message_identity on public.messages(id,hotel_id,conversation_id);
create table public.message_attention (
  message_id uuid primary key,
  hotel_id uuid not null references public.hotels(id),
  conversation_id uuid not null references public.conversations(id),
  status text not null check(status in ('pending','resolved')),
  version bigint not null check(version>0),
  changed_at timestamptz not null,
  changed_by uuid not null,
  actor_kind text not null check(actor_kind='user'),
  last_operation_id uuid not null,
  foreign key(message_id,hotel_id,conversation_id) references public.messages(id,hotel_id,conversation_id) on delete cascade
);
alter table public.message_attention enable row level security;
revoke all on public.message_attention from public, anon, authenticated, service_role;
create index message_attention_hotel_state_date on public.message_attention(hotel_id,status,changed_at,message_id);
create index message_attention_conversation on public.message_attention(hotel_id,conversation_id,message_id);
create unique index message_attention_operation_audit on public.enterprise_audit_logs(entity_id)
  where entity_type='message_attention_operation';
create index message_attention_received_day on public.messages(hotel_id,created_at,id) where sender_type='guest';
create index message_attention_included on public.messages(hotel_id,created_at,id) where sender_type='guest' and attention_inclusion_version=1;

create function public.staynex_attention_eligible(p_sender text,p_metadata jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $f$
  select p_sender='guest' and not(coalesce(p_metadata,'{}'::jsonb) ?| array['system_event','preview','draft','translation_only','automation_type'])
$f$;

-- Pure canonical resolver, shared by Inbox, transitions and Dashboard. No reads or writes.
create function public.staynex_attention_effective(p_inclusion smallint,p_status text,p_version bigint)
returns table(status text,version bigint) language sql immutable set search_path=pg_catalog as $f$
  select coalesce(p_status,case when p_inclusion=1 then 'pending' else 'untracked' end),
    coalesce(p_version,case when p_inclusion=1 then 1::bigint else 0::bigint end)
$f$;

create function public.staynex_attention_origin(p_hotel uuid,p_id uuid,p_metadata jsonb)
returns text language sql stable security definer set search_path=pg_catalog as $f$
  select case
    when coalesce(p_metadata,'{}'::jsonb) @> '{"demo":true}'::jsonb
      or coalesce(p_metadata,'{}'::jsonb) @> '{"checkin_demo":true}'::jsonb
      or coalesce(p_metadata,'{}'::jsonb) @> '{"simulation":true}'::jsonb
      or nullif(p_metadata->>'fixture','') is not null
      or coalesce(p_metadata->>'source','') ~* '^(demo|mock|simulation|checkin_demo)([_-]|$)' then 'simulated'
    when exists(select 1 from public.twilio_inbound_message_claims c where c.hotel_id=p_hotel and c.message_id=p_id and c.message_sid is not null) then 'traced'
    else 'unknown' end
$f$;

create function public.staynex_attention_require_contract()
returns void language plpgsql security definer set search_path=pg_catalog as $f$
begin
  if not exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.messages'::regclass and a.attname='attention_inclusion_version'
      and not a.attisdropped and pg_get_expr(d.adbin,d.adrelid)='1') then
    raise exception using errcode='55000', message='Attention contract disabled';
  end if;
end $f$;

create function public.staynex_attention_read_v1(p_hotel uuid,p_conversation uuid,p_ids uuid[])
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare result jsonb;
begin
  perform public.staynex_attention_require_contract();
  if p_hotel is null or p_conversation is null or p_ids is null or cardinality(p_ids)>3000 then
    raise exception using errcode='22023',message='Invalid attention read scope';
  end if;
  if not exists(select 1 from public.conversations where id=p_conversation and hotel_id=p_hotel) then
    raise exception using errcode='42501',message='Conversation unavailable';
  end if;
  if exists(select 1 from unnest(p_ids) id where not exists(select 1 from public.messages m
    where m.id=id and m.hotel_id=p_hotel and m.conversation_id=p_conversation and public.staynex_attention_eligible(m.sender_type,m.metadata))) then
    raise exception using errcode='42501',message='Invalid message scope';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('messageId',m.id,'status',e.status,
    'version',e.version,'changedAt',coalesce(a.changed_at,case when m.attention_inclusion_version=1 then m.created_at end),
    'changedBy',a.changed_by,'actorKind',coalesce(a.actor_kind,case when m.attention_inclusion_version=1 then 'inbound' end)) order by m.id),'[]'::jsonb)
    into result from public.messages m left join public.message_attention a on a.message_id=m.id and a.hotel_id=p_hotel and a.conversation_id=p_conversation
    cross join lateral public.staynex_attention_effective(m.attention_inclusion_version,a.status,a.version) e
    where m.hotel_id=p_hotel and m.conversation_id=p_conversation and m.id=any(p_ids);
  return jsonb_build_object('contract',1,'hotelId',p_hotel,'conversationId',p_conversation,'items',result);
end $f$;

create function public.staynex_attention_transition_v1(p_hotel uuid,p_conversation uuid,p_actor uuid,p_operation uuid,p_target text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $f$
declare hu record; entry record; oldrow record; auditrow record; canonical jsonb; after_rows jsonb;
  ids uuid[]; n int; at_time timestamptz; before_rows jsonb;
begin
  perform public.staynex_attention_require_contract();
  if p_hotel is null or p_conversation is null or p_actor is null or p_operation is null or p_target not in ('pending','resolved') or p_target is null
    or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode='22023',message='Invalid transition';
  end if;
  n:=jsonb_array_length(p_items);
  if n<1 or n>50 then raise exception using errcode='22023',message='Explicit batch must contain 1 to 50 messages'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) is distinct from 'object'
    or (x->>'expectedStatus') is null or (x->>'expectedStatus') not in ('untracked','pending','resolved')
    or (x->>'expectedVersion') is null or (x->>'expectedVersion') !~ '^[0-9]+$'
    or (x->>'messageId') is null) then raise exception using errcode='22023',message='Expected states required'; end if;
  select array_agg((x->>'messageId')::uuid order by x->>'messageId'),
    jsonb_agg(jsonb_build_object('messageId',(x->>'messageId')::uuid,'expectedVersion',(x->>'expectedVersion')::bigint,'expectedStatus',x->>'expectedStatus') order by x->>'messageId')
    into ids,canonical from jsonb_array_elements(p_items) x;
  if (select count(distinct id) from unnest(ids) id)<>n then raise exception using errcode='22023',message='Duplicate message identity'; end if;
  -- Same existing operator roles; no support/fallback/platform elevation. Actor is server-verified, then checked again here.
  select h.role into hu from public.hotel_users h where h.user_id=p_actor and h.hotel_id=p_hotel and h.status='active'
    and h.role in ('owner','admin','manager','receptionist') and coalesce(h.platform_role,'none')<>'support' limit 1;
  if not found or exists(select 1 from public.hotel_users h where h.user_id=p_actor and h.status='active' and h.platform_role='support') then
    raise exception using errcode='42501',message='Attention operator denied';
  end if;
  -- Lock only eligible explicit IDs inside the authorized hotel/conversation, in stable order.
  perform 1 from public.conversations where id=p_conversation and hotel_id=p_hotel for no key update;
  if not found then raise exception using errcode='42501',message='Conversation unavailable'; end if;
  perform 1 from public.messages m where m.id=any(ids) and m.hotel_id=p_hotel and m.conversation_id=p_conversation
    and public.staynex_attention_eligible(m.sender_type,m.metadata) order by m.id for update;
  if (select count(*) from public.messages m where m.id=any(ids) and m.hotel_id=p_hotel and m.conversation_id=p_conversation
      and public.staynex_attention_eligible(m.sender_type,m.metadata))<>n then
    raise exception using errcode='42501',message='Invalid message scope';
  end if;
  select * into auditrow from public.enterprise_audit_logs where entity_type='message_attention_operation' and entity_id=p_operation;
  if found then
    if auditrow.hotel_id is distinct from p_hotel or auditrow.actor_user_id is distinct from p_actor
      or auditrow.metadata->>'conversation_id' is distinct from p_conversation::text or auditrow.metadata->>'target' is distinct from p_target
      or auditrow.metadata->'expected' is distinct from canonical then
      raise exception using errcode='40001',message='Operation identity conflict';
    end if;
    if exists(select 1 from jsonb_array_elements(auditrow.new_values_summary->'items') x
      join public.messages m on m.id=(x->>'messageId')::uuid
      left join public.message_attention a on a.message_id=m.id
      cross join lateral public.staynex_attention_effective(m.attention_inclusion_version,a.status,a.version) e
      where e.version is distinct from (x->>'version')::bigint or e.status is distinct from x->>'status') then
      raise exception using errcode='40001',message='Operation superseded; refresh and review';
    end if;
    return public.staynex_attention_read_v1(p_hotel,p_conversation,ids);
  end if;
  -- Validate the entire batch BEFORE writing anything. Any exception also rolls back audit and states.
  for entry in select * from jsonb_to_recordset(canonical) as x("messageId" uuid,"expectedVersion" bigint,"expectedStatus" text) loop
    select e.* into oldrow from public.messages m left join public.message_attention a on a.message_id=m.id
      cross join lateral public.staynex_attention_effective(m.attention_inclusion_version,a.status,a.version) e
      where m.id=entry."messageId";
    if oldrow.version<>entry."expectedVersion" or oldrow.status<>entry."expectedStatus" then
      raise exception using errcode='40001',message='Attention conflict; refresh and review';
    end if;
  end loop;
  before_rows:=public.staynex_attention_read_v1(p_hotel,p_conversation,ids)->'items';
  at_time:=clock_timestamp();
  for entry in select * from jsonb_to_recordset(canonical) as x("messageId" uuid,"expectedVersion" bigint,"expectedStatus" text) loop
    if entry."expectedStatus"<>p_target then
      insert into public.message_attention(message_id,hotel_id,conversation_id,status,version,changed_at,changed_by,actor_kind,last_operation_id)
        values(entry."messageId",p_hotel,p_conversation,p_target,entry."expectedVersion"+1,at_time,p_actor,'user',p_operation)
      on conflict(message_id) do update set status=excluded.status,version=message_attention.version+1,
        changed_at=excluded.changed_at,changed_by=excluded.changed_by,actor_kind='user',last_operation_id=p_operation;
    end if;
  end loop;
  after_rows:=public.staynex_attention_read_v1(p_hotel,p_conversation,ids);
  insert into public.enterprise_audit_logs(actor_user_id,actor_role,hotel_id,action,entity_type,entity_id,old_values_summary,new_values_summary,metadata,created_at)
    values(p_actor,hu.role,p_hotel,'message_attention_transition','message_attention_operation',p_operation,
      jsonb_build_object('items',before_rows),jsonb_build_object('items',after_rows->'items'),
      jsonb_build_object('conversation_id',p_conversation,'target',p_target,'expected',canonical),at_time);
  return after_rows;
end $f$;

create function public.staynex_attention_dashboard_v1(p_hotel uuid,p_origin text,p_urgent_only boolean default false,p_cursor_at timestamptz default null,p_cursor_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog set statement_timeout='8s' as $f$
declare tz text; day_start timestamptz; day_end timestamptz; now_at timestamptz:=clock_timestamp();
  received bigint; resolved bigint; pending bigint; urgent bigint; sample jsonb; next_page jsonb;
begin
  perform public.staynex_attention_require_contract();
  if p_hotel is null or p_origin is null or p_origin not in ('traced','simulated','unknown')
    or ((p_cursor_at is null)<>(p_cursor_id is null)) then raise exception using errcode='22023',message='Invalid dashboard scope'; end if;
  select timezone into tz from public.hotels where id=p_hotel;
  if not found then raise exception using errcode='42501',message='Hotel unavailable'; end if;
  if tz is not null and exists(select 1 from pg_timezone_names where name=tz) then
    day_start:=((now_at at time zone tz)::date)::timestamp at time zone tz;
    day_end:=(((now_at at time zone tz)::date)+1)::timestamp at time zone tz;
    select count(*) into received from public.messages m where m.hotel_id=p_hotel and m.created_at>=day_start and m.created_at<day_end and m.created_at<=now_at
      and public.staynex_attention_eligible(m.sender_type,m.metadata) and public.staynex_attention_origin(p_hotel,m.id,m.metadata)=p_origin
      and exists(select 1 from public.conversations c where c.id=m.conversation_id and c.hotel_id=p_hotel);
    select count(*) into resolved from public.message_attention a join public.messages m on m.id=a.message_id and m.hotel_id=a.hotel_id and m.conversation_id=a.conversation_id
      where a.hotel_id=p_hotel and a.status='resolved' and a.changed_at>=day_start and a.changed_at<day_end and a.changed_at<=now_at
      and public.staynex_attention_eligible(m.sender_type,m.metadata) and public.staynex_attention_origin(p_hotel,m.id,m.metadata)=p_origin
      and exists(select 1 from public.conversations c where c.id=m.conversation_id and c.hotel_id=m.hotel_id);
  end if;
  select count(*),count(*) filter(where s.escalation_level='urgent' and s.updated_at>=m.created_at and s.updated_at<=now_at)
    into pending,urgent
    from public.messages m left join public.message_attention a on m.id=a.message_id and m.hotel_id=a.hotel_id and m.conversation_id=a.conversation_id
    cross join lateral public.staynex_attention_effective(m.attention_inclusion_version,a.status,a.version) e
    left join public.conversation_ai_state s on s.conversation_id=m.conversation_id and s.hotel_id=m.hotel_id
    where m.hotel_id=p_hotel and (m.attention_inclusion_version=1 or a.message_id is not null)
      and e.status='pending' and m.created_at<=now_at and public.staynex_attention_eligible(m.sender_type,m.metadata)
      and public.staynex_attention_origin(p_hotel,m.id,m.metadata)=p_origin
      and exists(select 1 from public.conversations c where c.id=m.conversation_id and c.hotel_id=m.hotel_id);
  if exists(select 1 from public.messages m left join public.message_attention a on a.message_id=m.id and a.hotel_id=m.hotel_id
    cross join lateral public.staynex_attention_effective(m.attention_inclusion_version,a.status,a.version) e
    join public.conversation_ai_state s on m.conversation_id=s.conversation_id and m.hotel_id=s.hotel_id
    where m.hotel_id=p_hotel and e.status='pending' and public.staynex_attention_eligible(m.sender_type,m.metadata)
      and public.staynex_attention_origin(p_hotel,m.id,m.metadata)=p_origin
      and exists(select 1 from public.conversations c where c.id=m.conversation_id and c.hotel_id=m.hotel_id)
      and (s.updated_at is null or s.updated_at>now_at)) then urgent:=null; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q."createdAt" desc,q.id desc),'[]'::jsonb) into sample from (
    select m.id,m.conversation_id as "conversationId",m.created_at as "createdAt",left(m.content,600) as title,coalesce(nullif(to_jsonb(g)->>'name',''),'Huésped') as guest,g.current_room as room,
      'Pendiente'::text as status,case when s.escalation_level='urgent' and s.updated_at>=m.created_at and s.updated_at<=now_at then 'urgent' end as priority,
      p_origin as origin,e.version
    from public.messages m left join public.message_attention a on m.id=a.message_id and m.hotel_id=a.hotel_id and m.conversation_id=a.conversation_id
    cross join lateral public.staynex_attention_effective(m.attention_inclusion_version,a.status,a.version) e
    join public.conversations c on c.id=m.conversation_id and c.hotel_id=m.hotel_id
    left join public.guests g on g.id=c.guest_id and g.hotel_id=m.hotel_id
    left join public.conversation_ai_state s on s.conversation_id=m.conversation_id and s.hotel_id=m.hotel_id
    where m.hotel_id=p_hotel and (m.attention_inclusion_version=1 or a.message_id is not null)
      and e.status='pending' and m.created_at<=now_at and public.staynex_attention_eligible(m.sender_type,m.metadata)
      and public.staynex_attention_origin(p_hotel,m.id,m.metadata)=p_origin
      and (not p_urgent_only or (s.escalation_level='urgent' and s.updated_at>=m.created_at and s.updated_at<=now_at))
      and (p_cursor_at is null or (m.created_at,m.id)<(p_cursor_at,p_cursor_id))
    order by m.created_at desc,m.id desc limit 9
  ) q;
  if jsonb_array_length(sample)>8 then
    next_page:=jsonb_build_object('at',sample->7->>'createdAt','id',sample->7->>'id');
    sample:=sample-8;
  end if;
  return jsonb_build_object('contract',1,'hotelId',p_hotel,'origin',p_origin,'urgentOnly',p_urgent_only,
    'counters',jsonb_build_object('received',received,'resolved',resolved,'pending',pending,'urgent',urgent),'pending',sample,'nextCursor',next_page,'timezone',tz);
end $f$;

-- RPCs are backend-only. No authenticated/anon/public execution or browser table writes.
do $grants$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'staynex_attention_%' loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',f.sig);
  end loop;
end $grants$;
grant execute on function public.staynex_attention_read_v1(uuid,uuid,uuid[]) to service_role;
grant execute on function public.staynex_attention_transition_v1(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.staynex_attention_dashboard_v1(uuid,text,boolean,timestamptz,uuid) to service_role;
commit;
