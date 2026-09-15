// SQL generator only. No database client, environment files or provider imports.
import { demoMessageStageId, DEMO_MESSAGE_STAGES_MARKER } from '../shared/demo-message-stages/server-provenance.js';
import { pathToFileURL } from 'node:url';
const marker=DEMO_MESSAGE_STAGES_MARKER;
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const uuid=value=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const demoMessageStages = ({hotelId,actorId,referenceDate,action='load',edition='nine'}) => {
  if (!uuid(hotelId)||!uuid(actorId)||!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)||!['load','remove'].includes(action)||!['legacy','nine'].includes(edition)) throw new Error('Explicit hotel UUID, actor UUID, YYYY-MM-DD reference date, load/remove and valid edition required');
  const id=(slot,entity)=>demoMessageStageId(hotelId,slot,entity);
  const legacy=[
    {slot:'ana',name:'Ana López',text:'Llegamos mañana a las 18:00. ¿Podéis ayudarnos a reservar un traslado desde el aeropuerto?',arrival:1,departure:4,room:null,status:'confirmed'},
    {slot:'carlos',name:'Carlos Ruiz',text:'El aire acondicionado pierde agua y está mojando el suelo. Necesitamos que venga mantenimiento',arrival:-1,departure:2,room:'208',status:'checked_in'},
    {slot:'lucia',name:'Lucía Martín',text:'Gracias, ya he recibido la factura de mi estancia. Todo correcto',arrival:-4,departure:-1,room:null,status:'checked_out'}
  ].map(c=>({...c,attention:c.slot==='lucia'?'resolved':'pending',urgent:c.slot==='carlos'}));
  const nine=[
    {...legacy[0],slot:'nine-ana'},
    {slot:'nine-bruno',name:'Bruno García',text:'Llegamos mañana a las 06:00 y todavía no sabemos cómo acceder si la recepción está cerrada. Necesitamos confirmarlo hoy, por favor.',arrival:1,departure:4,room:null,status:'confirmed',attention:'pending',urgent:true},
    {slot:'nine-carmen',name:'Carmen Vidal',text:'Gracias por la información. Ya tenemos claro el horario de entrada y cómo llegar al hotel.',arrival:1,departure:4,room:null,status:'confirmed',attention:'resolved'},
    {...legacy[1],slot:'nine-carlos',text:legacy[1].text+'.',room:'DEMO-208'},
    {slot:'nine-elena',name:'Elena Torres',text:'¿Podéis traer dos toallas más a la habitación cuando sea posible?',arrival:-1,departure:2,room:'DEMO-209',status:'checked_in',attention:'pending'},
    {slot:'nine-jorge',name:'Jorge Molina',text:'El wifi ya funciona correctamente. Muchas gracias por la ayuda.',arrival:-1,departure:2,room:'DEMO-210',status:'checked_in',attention:'resolved'},
    {...legacy[2],slot:'nine-lucia',text:legacy[2].text+'.',room:'DEMO-301'},
    {slot:'nine-marta',name:'Marta Gil',text:'Creo que olvidé un cargador en la habitación. ¿Podéis comprobar si lo habéis encontrado?',arrival:-4,departure:-1,room:'DEMO-302',status:'checked_out',attention:'pending'},
    {slot:'nine-pablo',name:'Pablo Sanz',text:'He dejado mi pasaporte en la caja fuerte y mi vuelo sale esta tarde. Necesito recuperarlo cuanto antes, por favor.',arrival:-4,departure:-1,room:'DEMO-303',status:'checked_out',attention:'pending',urgent:true}
  ];
  const cases=(edition==='legacy'?legacy:nine).map((c,ordinal)=>({...c,ordinal,guestId:id(c.slot,'guest'),reservationId:id(c.slot,'reservation'),conversationId:id(c.slot,'conversation'),messageId:id(c.slot,'message'),operationId:id(c.slot,'resolution'),phone:`synthetic-only:${id(c.slot,'guest')}`}));
  const values=cases.map(c=>`(${[c.slot,c.name,c.text,c.guestId,c.reservationId,c.conversationId,c.messageId,c.operationId,c.phone,c.room,c.status,c.attention].map(v=>v===null?'null':quote(v)).join(',')},${Boolean(c.urgent)},${c.ordinal},${c.arrival},${c.departure})`).join(',\n');
  return {cases,sql:`-- Generated synthetic demo ${marker}; never sends or connects to a provider.
-- Deploy the server identity guards on every consumer before loading in a shared project.
-- Review external DB/CDC consumers separately; these SET acknowledgements are not runtime switches.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create temporary table demo_cases(slot text,name text,content text,gid uuid,rid uuid,cid uuid,mid uuid,op uuid,phone text,room text,status text,attention text,urgent boolean,ordinal int,arrival int,departure int) on commit drop;
insert into demo_cases values ${values};
do $demo$
declare h uuid:=${quote(hotelId)}; actor uuid:=${quote(actorId)}; ref date:=${quote(referenceDate)}; tz text; c record; midnight timestamptz; received timestamptz; load_at timestamptz:=clock_timestamp(); dependency record; referenced boolean;
begin
  if current_setting('staynex.demo_isolated',true) is distinct from 'on' or current_setting('staynex.send_automations',true) is distinct from 'false' then
    raise exception 'Require explicit isolated demo acknowledgement and SEND_AUTOMATIONS=false; verify deployed identity guards and external DB consumers';
  end if;
  select timezone into tz from public.hotels where id=h and slug='hotel-demo-checkin' and name='Hotel Demo Checkin';
  if not found or not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'Expected Hotel Demo Checkin and valid timezone'; end if;
  perform public.staynex_attention_require_contract();
  if not exists(select 1 from public.hotel_users where hotel_id=h and user_id=actor and status='active' and role in ('owner','admin','manager','receptionist') and coalesce(platform_role,'none')<>'support') then raise exception 'Demo operator required'; end if;
  -- Lock before inspecting triggers so their definitions cannot change during the load.
  lock table public.guests,public.reservations,public.conversations,public.messages,public.message_attention,public.conversation_ai_state,public.enterprise_audit_logs in share row exclusive mode;
  if exists(select 1 from pg_trigger where not tgisinternal and tgenabled<>'D' and tgrelid in
    ('public.guests'::regclass,'public.reservations'::regclass,'public.conversations'::regclass,'public.messages'::regclass,'public.message_attention'::regclass,'public.conversation_ai_state'::regclass,'public.enterprise_audit_logs'::regclass)) then
    raise exception 'Enabled user trigger: inspect effects before demo loading; no triggers are disabled';
  end if;
  midnight:=ref::timestamp at time zone tz;
  if ${quote(action)}='load' and ref<>(clock_timestamp() at time zone tz)::date then raise exception 'Reference date must be today in hotel timezone; historical fixtures are never shifted'; end if;
  for c in select * from demo_cases loop
    -- Distinct elapsed times within the hotel's current day, fixed on insertion.
    -- Repeating the load never shifts an existing message or resets its attention.
    received:=case when ${quote(edition)}='legacy' then midnight else midnight+least(load_at-midnight,interval '9 hours')*((c.ordinal+1)::double precision/10) end;
    if exists(select 1 from public.messages where id=c.mid) then
      if not exists(select 1 from public.messages where id=c.mid and hotel_id=h and conversation_id=c.cid and sender_type='guest' and content=c.content
        and (case when ${quote(edition)}='legacy' then created_at=midnight else (created_at at time zone tz)::date=ref and created_at<=clock_timestamp() and metadata->>'edition'='nine' end)
        and metadata @> jsonb_build_object('fixture','${marker}','reference_date',ref::text,'reservation_id',c.rid::text,'demo',true))
        or not exists(select 1 from public.guests where id=c.gid and hotel_id=h and phone_number=c.phone)
        or not exists(select 1 from public.conversations where id=c.cid and hotel_id=h and guest_id=c.gid)
        or not exists(select 1 from public.reservations where id=c.rid and hotel_id=h and guest_id=c.gid and pms_provider='checkin_demo_mock' and pms_reservation_id=c.rid::text and arrival_date=ref+c.arrival and departure_date=ref+c.departure)
      then raise exception 'Fixture identity/content collision or different reference day: inspect; never overwrite'; end if;
      if ${quote(action)}='load' then continue; end if;
    elsif ${quote(action)}='remove' then
      if exists(select 1 from public.guests where id=c.gid) or exists(select 1 from public.reservations where id=c.rid) or exists(select 1 from public.conversations where id=c.cid) then raise exception 'Partial fixture: inspect before removal'; end if;
      continue;
    end if;
    if ${quote(action)}='remove' then
      -- Refuse cleanup after subsequent activity, rather than deleting its history.
      -- Other FK consumers (tickets, jobs, etc.) must not be cascaded or SET NULL.
      for dependency in select k.conrelid::regclass as child,k.confrelid::regclass as parent,
        string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' and ' order by ck.ord) as joins
        from pg_constraint k cross join lateral unnest(k.conkey,k.confkey) with ordinality ck(child_key,parent_key,ord)
        join pg_attribute ca on ca.attrelid=k.conrelid and ca.attnum=ck.child_key
        join pg_attribute pa on pa.attrelid=k.confrelid and pa.attnum=ck.parent_key
        where k.contype='f' and k.confrelid in ('public.guests'::regclass,'public.reservations'::regclass,'public.conversations'::regclass,'public.messages'::regclass,'public.conversation_ai_state'::regclass)
          and k.conrelid not in ('public.guests'::regclass,'public.reservations'::regclass,'public.conversations'::regclass,'public.messages'::regclass,'public.message_attention'::regclass,'public.conversation_ai_state'::regclass)
        group by k.oid,k.conrelid,k.confrelid loop
        execute format('select exists(select 1 from %s child join %s parent on %s where parent.id=any($1))',dependency.child,dependency.parent,dependency.joins)
          into referenced using array[c.gid,c.rid,c.cid,c.mid,(select id from public.conversation_ai_state where hotel_id=h and conversation_id=c.cid)];
        if referenced then raise exception 'Fixture has dependent activity in %; preserve it and review removal',dependency.child; end if;
      end loop;
      if exists(select 1 from public.messages where conversation_id=c.cid and id<>c.mid)
        or exists(select 1 from public.conversations where guest_id=c.gid and id<>c.cid)
        or exists(select 1 from public.reservations where guest_id=c.gid and id<>c.rid)
        or exists(select 1 from public.enterprise_audit_logs where metadata->>'conversation_id'=c.cid::text and entity_id<>c.op)
        or exists(select 1 from public.message_attention where message_id=c.mid and last_operation_id<>c.op) then raise exception 'Fixture has subsequent activity; preserve history and review removal'; end if;
      delete from public.enterprise_audit_logs where hotel_id=h and entity_type='message_attention_operation' and entity_id=c.op;
      delete from public.conversation_ai_state where hotel_id=h and conversation_id=c.cid;
      delete from public.messages where hotel_id=h and id=c.mid;
      delete from public.conversations where hotel_id=h and id=c.cid;
      delete from public.reservations where hotel_id=h and id=c.rid;
      delete from public.guests where hotel_id=h and id=c.gid;
    else
      insert into public.guests(id,hotel_id,phone_number,current_room) values(c.gid,h,c.phone,c.room);
      insert into public.reservations(id,hotel_id,guest_id,pms_provider,pms_reservation_id,guest_name,arrival_date,departure_date,status)
        values(c.rid,h,c.gid,'checkin_demo_mock',c.rid::text,c.name,ref+c.arrival,ref+c.departure,c.status);
      insert into public.conversations(id,hotel_id,guest_id,last_message_at) values(c.cid,h,c.gid,received);
      insert into public.messages(id,hotel_id,conversation_id,sender_type,content,original_language,metadata,created_at)
        values(c.mid,h,c.cid,'guest',c.content,'es',jsonb_build_object('demo',true,'fixture','${marker}','edition',${quote(edition)},'reference_date',ref::text,'reservation_id',c.rid::text),received);
      if c.urgent then
        insert into public.conversation_ai_state(hotel_id,conversation_id,escalation_level,updated_at,state_metadata)
          values(h,c.cid,'urgent',clock_timestamp(),jsonb_build_object('demo',true,'fixture','${marker}'));
      elsif c.attention='resolved' then
        perform public.staynex_attention_transition_v1(h,c.cid,actor,c.op,'resolved',jsonb_build_array(jsonb_build_object('messageId',c.mid,'expectedStatus','pending','expectedVersion',1)));
        update public.enterprise_audit_logs set metadata=metadata || jsonb_build_object('demo',true,'fixture','${marker}','reference_date',ref::text)
          where hotel_id=h and entity_type='message_attention_operation' and entity_id=c.op;
      end if;
    end if;
  end loop;
end $demo$;
commit;
`};
};
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [hotelId,actorId,referenceDate,action,edition]=process.argv.slice(2);
  process.stdout.write(demoMessageStages({hotelId,actorId,referenceDate,action,edition}).sql);
}
