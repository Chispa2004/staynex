-- READ ONLY. No migration, message mutation, providers or prosrc fingerprints.
-- Catalog and bounded contract checks complement the isolated functional/concurrency suite.
begin transaction read only;
do $verify$
declare f record; expected record; actual text; body text; lock_statement text; segment text;
begin
  if not exists(select 1 from pg_class where oid=to_regclass('public.message_attention') and relkind='r' and relrowsecurity) then raise exception 'Attention table/RLS missing'; end if;
  if exists(select 1 from pg_policy where polrelid='public.message_attention'::regclass) then raise exception 'Unexpected attention policy'; end if;
  if exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.messages'::regclass
    and (t.tgname='staynex_message_attention_insert' or p.proname like 'staynex_attention_%'
      or (not t.tgisinternal and p.prosrc ~* '(message_attention|enterprise_audit_logs)')))
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='staynex_attention_on_insert') then
    raise exception 'Inbound attention/audit trigger dependency must not exist';
  end if;
  if not exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.messages'::regclass and a.attname='attention_inclusion_version'
    and a.atttypid='smallint'::regtype and not a.attnotnull and not a.atthasmissing and not a.attisdropped
    and regexp_replace(pg_get_expr(d.adbin,d.adrelid),'[[:space:]()]','','g') in ('1','1::smallint')) then raise exception 'Invalid historical/future inclusion column or disabled default'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and contype='c' and convalidated
    and regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]()]','','g') in ('attention_inclusion_version=1','attention_inclusion_version=1::smallint')) then raise exception 'Invalid inclusion constraint'; end if;
  for expected in select * from (values ('message_id','uuid'),('hotel_id','uuid'),('conversation_id','uuid'),
    ('status','text'),('version','bigint'),('changed_at','timestamp with time zone'),('changed_by','uuid'),('actor_kind','text'),('last_operation_id','uuid')) v(col,typ) loop
    if not exists(select 1 from pg_attribute where attrelid='public.message_attention'::regclass and attname=expected.col
      and format_type(atttypid,atttypmod)=expected.typ and attnotnull and not attisdropped) then raise exception 'Invalid attention column %',expected.col; end if;
  end loop;
  if has_table_privilege('anon','public.message_attention','INSERT,UPDATE,DELETE,SELECT') or has_table_privilege('authenticated','public.message_attention','INSERT,UPDATE,DELETE,SELECT')
    or has_table_privilege('service_role','public.message_attention','INSERT,UPDATE,DELETE,SELECT') then raise exception 'Unexpected table privilege'; end if;
  if not exists(select 1 from pg_constraint k where k.conrelid='public.message_attention'::regclass and k.contype='f'
    and k.confrelid='public.messages'::regclass and k.convalidated and k.confdeltype='c'
    and (select array_agg(a.attname::text order by u.ord) from unnest(k.conkey) with ordinality u(num,ord) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=u.num)=array['message_id','hotel_id','conversation_id']
    and (select array_agg(a.attname::text order by u.ord) from unnest(k.confkey) with ordinality u(num,ord) join pg_attribute a on a.attrelid=k.confrelid and a.attnum=u.num)=array['id','hotel_id','conversation_id']) then raise exception 'Composite message relation missing or incompatible'; end if;
  for expected in select * from (values
    ('message_attention_pkey','message_attention',true,'message_id',''),
    ('message_attention_message_identity','messages',true,'id,hotel_id,conversation_id',''),
    ('message_attention_hotel_state_date','message_attention',false,'hotel_id,status,changed_at,message_id',''),
    ('message_attention_conversation','message_attention',false,'hotel_id,conversation_id,message_id',''),
    ('message_attention_operation_audit','enterprise_audit_logs',true,'entity_id','entity_type=''message_attention_operation''::text'),
    ('message_attention_received_day','messages',false,'hotel_id,created_at,id','sender_type=''guest''::text'),
    ('message_attention_included','messages',false,'hotel_id,created_at,id','sender_type=''guest''::textANDattention_inclusion_version=1')
  ) v(name,tab,uniq,cols,predicate) loop
    if not exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am am on am.oid=c.relam
      where i.indexrelid=to_regclass('public.'||expected.name) and i.indrelid=to_regclass('public.'||expected.tab)
      and i.indisvalid and i.indisready and i.indisunique=expected.uniq and am.amname='btree' and i.indexprs is null
      and (select string_agg(a.attname,',' order by u.ord) from unnest(i.indkey) with ordinality u(num,ord)
        join pg_attribute a on a.attrelid=i.indrelid and a.attnum=u.num where u.ord<=i.indnkeyatts)=expected.cols
      and regexp_replace(coalesce(pg_get_expr(i.indpred,i.indrelid),''),'[[:space:]()]','','g')=expected.predicate) then raise exception 'Required index missing or incompatible: %',expected.name; end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'staynex_attention_%')<>7 then raise exception 'Expected exactly seven attention functions, without extra overloads'; end if;
  for expected in select * from (values
    ('staynex_attention_eligible(text,jsonb)','boolean',false,'i',false,'p_sender,p_metadata'),
    ('staynex_attention_origin(uuid,uuid,jsonb)','text',false,'s',true,'p_hotel,p_id,p_metadata'),
    ('staynex_attention_require_contract()','void',false,'v',true,''),
    ('staynex_attention_effective(smallint,text,bigint)','record',true,'i',false,'p_inclusion,p_status,p_version'),
    ('staynex_attention_read_v1(uuid,uuid,uuid[])','jsonb',false,'v',true,'p_hotel,p_conversation,p_ids'),
    ('staynex_attention_transition_v1(uuid,uuid,uuid,uuid,text,jsonb)','jsonb',false,'v',true,'p_hotel,p_conversation,p_actor,p_operation,p_target,p_items'),
    ('staynex_attention_dashboard_v1(uuid,text,boolean,timestamptz,uuid)','jsonb',false,'s',true,'p_hotel,p_origin,p_urgent_only,p_cursor_at,p_cursor_id')
  ) v(sig,result,want_set,vol,definer,names) loop
    select p.* into f from pg_proc p where p.oid=to_regprocedure('public.'||expected.sig);
    if not found then raise exception 'Missing function signature %',expected.sig; end if;
    if f.prokind<>'f' or format_type(f.prorettype,null)<>expected.result or f.proretset<>expected.want_set
      or f.provolatile::text<>expected.vol or f.prosecdef<>expected.definer
      or coalesce(array_to_string(f.proargnames[1:f.pronargs],','),'')<>expected.names
      or not coalesce('search_path=pg_catalog'=any(f.proconfig),false) then raise exception 'Invalid function contract %',expected.sig; end if;
    if not exists(select 1 from pg_roles where oid=f.proowner and (rolsuper or rolbypassrls)) then raise exception 'Untrusted function owner %',expected.sig; end if;
    if exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.privilege_type='EXECUTE' and a.grantee not in (f.proowner,
      case when f.proname in ('staynex_attention_read_v1','staynex_attention_transition_v1','staynex_attention_dashboard_v1') then (select oid from pg_roles where rolname='service_role') else f.proowner end))
      or has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('authenticated',f.oid,'EXECUTE')
      or has_function_privilege('service_role',f.oid,'EXECUTE')<>(f.proname in ('staynex_attention_read_v1','staynex_attention_transition_v1','staynex_attention_dashboard_v1')) then raise exception 'Unexpected function grants %',expected.sig; end if;
    if f.proname='staynex_attention_dashboard_v1' and not coalesce(f.proconfig && array['statement_timeout=8s','statement_timeout=8000','statement_timeout=8000ms'],false) then raise exception 'Dashboard statement timeout must be 8 seconds'; end if;
    -- Bounded anchors tolerate comments, whitespace and CRLF. Behavioral proof lives in isolated tests.
    body:=lower(regexp_replace(regexp_replace(regexp_replace(f.prosrc,'/\*.*?\*/','','gs'),'--[^\r\n]*','','g'),'[[:space:]]','','g'));
    if f.proname in ('staynex_attention_read_v1','staynex_attention_transition_v1','staynex_attention_dashboard_v1') and position('performpublic.staynex_attention_require_contract();' in body)=0 then raise exception 'Missing disabled contract guard %',expected.sig; end if;
    if f.proname='staynex_attention_transition_v1' then
      select s into lock_statement from unnest(string_to_array(body,';')) s where s like '%frompublic.messages%forupdate%';
      if lock_statement is null or lock_statement not like '%m.id=any(ids)%' or lock_statement not like '%m.hotel_id=p_hotel%'
        or lock_statement not like '%m.conversation_id=p_conversation%' or lock_statement not like '%staynex_attention_eligible(m.sender_type,m.metadata)%'
        or lock_statement not like '%orderbym.idforupdate%' or body like '%skiplocked%' then raise exception 'Transition lock scope invalid'; end if;
      if body not like '%selectcount(*)frompublic.messages%))<>nthen%'
        or body not like '%oldrow.version<>entry."expectedversion"oroldrow.status<>entry."expectedstatus"%'
        or body not like '%insertintopublic.enterprise_audit_logs(%' or body not like '%h.user_id=p_actorandh.hotel_id=p_hotel%' then raise exception 'Transition batch/version/actor/audit guards missing'; end if;
    end if;
    if f.proname='staynex_attention_dashboard_v1' then
      foreach segment in array string_to_array(body,';') loop
        if segment like '%frompublic.messagesm%' or segment like '%frompublic.message_attentionajoinpublic.messagesm%' then
          if segment not like '%c.id=m.conversation_idandc.hotel_id=m.hotel_id%'
            and segment not like '%c.id=m.conversation_idandc.hotel_id=p_hotel%' then raise exception 'Dashboard conversation/hotel relation missing'; end if;
        end if;
      end loop;
      if body not like '%intopending,urgent%' or body not like '%m.attention_inclusion_version=1ora.message_idisnotnull%'
        or body not like '%notp_urgent_onlyor(s.escalation_level=''urgent''%' then raise exception 'Dashboard pending/urgent inclusion guards missing'; end if;
    end if;
  end loop;
  -- Pure synthetic values: historical/initial/explicit precedence, no message reads or writes.
  for expected in select * from (values
    (null::smallint,null::text,null::bigint,'untracked',0::bigint),(1::smallint,null,null,'pending',1),
    (null::smallint,'resolved',4,'resolved',4),(1::smallint,'resolved',2,'resolved',2),(1::smallint,'pending',3,'pending',3)
  ) v(inclusion,state,version,want_state,want_version) loop
    select * into f from public.staynex_attention_effective(expected.inclusion,expected.state,expected.version);
    if f.status is distinct from expected.want_state or f.version is distinct from expected.want_version then raise exception 'Invalid effective historical/initial/explicit state'; end if;
  end loop;
  if public.staynex_attention_eligible('guest','{}') is distinct from true or public.staynex_attention_eligible('staff','{}') is distinct from false
    or public.staynex_attention_eligible('ai','{}') is distinct from false then raise exception 'Invalid sender eligibility'; end if;
  foreach actual in array array['system_event','preview','draft','translation_only','automation_type'] loop
    if public.staynex_attention_eligible('guest',jsonb_build_object(actual,true)) is distinct from false then raise exception 'Invalid eligibility exclusion %',actual; end if;
  end loop;
  perform public.staynex_attention_require_contract();
end $verify$;
select 'PASS: read-only attention schema, function, privilege and contract checks' as verification_status;
rollback;
