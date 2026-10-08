-- Additive rollout: install before Dashboard. No sends, cleanup or status backfill.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.tickets add column if not exists status_version bigint not null default 1;
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='tickets'
    and column_name='status_version' and data_type='bigint' and is_nullable='NO' and column_default='1') then
    raise exception 'Incompatible tickets.status_version';
  end if;
end $$;
create or replace function public.staynex_ticket_version() returns trigger
language plpgsql set search_path=pg_catalog as $$ begin
  -- Every writer advances the revision, including request clarification and legacy clients.
  if (new.status is distinct from old.status or new.completed_at is distinct from old.completed_at) and current_user not in ('postgres','supabase_admin') then
    raise exception using errcode='42501',message='Use the versioned ticket transition contract';
  end if;
  new.status_version:=old.status_version+1;
  return new;
end $$;
drop trigger if exists staynex_ticket_version on public.tickets;
create trigger staynex_ticket_version before update on public.tickets for each row execute function public.staynex_ticket_version();
revoke all on function public.staynex_ticket_version() from public,anon,authenticated,service_role;
create unique index if not exists ticket_operation_identity on public.enterprise_audit_logs(entity_id) where entity_type='ticket_status_operation';

create or replace function public.staynex_ticket_transition_v1(p_hotel uuid,p_ticket uuid,p_actor uuid,p_operation uuid,p_target text,p_version bigint,p_status text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare t public.tickets; original jsonb; result jsonb; operator_role text; ledger record; cid uuid;
begin
  if p_hotel is null or p_ticket is null or p_actor is null or p_operation is null or p_version is null or p_version<1
    or p_target is null or p_target not in ('open','in_progress','completed') or p_status is null then
    raise exception using errcode='22023',message='Expected ticket state required'; end if;
  perform 1 from public.hotels h where h.id=p_hotel and coalesce(h.status,'active')='active'
    and h.archived_at is null and h.deleted_at is null and coalesce(h.metadata->>'archive_operational_hold','false')<>'true' for share;
  if not found then raise exception using errcode='42501',message='Hotel unavailable'; end if;
  select h.role into operator_role from public.hotel_users h where h.hotel_id=p_hotel and h.user_id=p_actor and h.status='active'
    and coalesce(h.platform_role,'none')<>'support' limit 1 for share;
  if operator_role is null or exists(select 1 from public.hotel_users h where h.user_id=p_actor and h.status='active' and h.platform_role='support') then
    raise exception using errcode='42501',message='Ticket operator denied'; end if;
  select conversation_id into cid from public.tickets where id=p_ticket and hotel_id=p_hotel;
  -- Same lock order as request recording and attention: hotel, conversation, ticket.
  if cid is not null then perform 1 from public.conversations where id=cid and hotel_id=p_hotel for no key update; end if;
  select * into t from public.tickets where id=p_ticket and hotel_id=p_hotel for update;
  if not found or not (operator_role in ('owner','admin','manager','receptionist')
    or (operator_role='housekeeping' and t.category='housekeeping')
    or (operator_role='maintenance' and t.category in ('maintenance','emergency'))) then
    raise exception using errcode='42501',message='Ticket scope denied'; end if;
  select * into ledger from public.enterprise_audit_logs where entity_type='ticket_status_operation' and entity_id=p_operation;
  if found then
    if ledger.hotel_id is distinct from p_hotel or ledger.actor_user_id is distinct from p_actor
      or ledger.metadata->>'ticket_id' is distinct from p_ticket::text or ledger.metadata->>'target' is distinct from p_target
      or ledger.metadata->>'expected_status' is distinct from p_status or (ledger.metadata->>'expected_version')::bigint is distinct from p_version
      or (ledger.new_values_summary->>'status_version')::bigint is distinct from t.status_version then
      raise exception using errcode='40001',message='Operation superseded; refresh'; end if;
    return to_jsonb(t);
  end if;
  if t.status_version<>p_version or t.status is distinct from p_status then
    raise exception using errcode='40001',message='Ticket changed; refresh'; end if;
  original:=to_jsonb(t);
  if t.status is distinct from p_target then
    update public.tickets set status=p_target,completed_at=case when p_target='completed' then clock_timestamp() else null end
      where id=p_ticket and hotel_id=p_hotel returning * into t;
  end if;
  result:=to_jsonb(t);
  insert into public.enterprise_audit_logs(actor_user_id,actor_role,hotel_id,action,entity_type,entity_id,old_values_summary,new_values_summary,metadata,created_at)
    values(p_actor,operator_role,p_hotel,'ticket_updated','ticket_status_operation',p_operation,original,result,
      jsonb_build_object('ticket_id',p_ticket,'target',p_target,'expected_status',p_status,'expected_version',p_version,
      'notification_confirmed',false,'source','dashboard_ticket_status'),clock_timestamp());
  return result;
end $$;
revoke all on function public.staynex_ticket_transition_v1(uuid,uuid,uuid,uuid,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.staynex_ticket_transition_v1(uuid,uuid,uuid,uuid,text,bigint,text) to service_role;

-- Read the entire scoped receipt group. No grouping by names, room or model guess.
create or replace function public.staynex_attention_ticket_groups_v1(p_hotel uuid,p_conversation uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(jsonb_agg(g),'[]'::jsonb) from (
    select t.id as "ticketId",t.status,t.title,t.status_version as version,
      jsonb_agg(r.source_message_id order by r.source_message_id) as "messageIds"
    from public.tickets t join public.operational_request_receipts r on r.ticket_id=t.id and r.hotel_id=t.hotel_id
    join public.messages m on m.id=r.source_message_id and m.hotel_id=t.hotel_id and m.conversation_id=t.conversation_id
    where t.hotel_id=p_hotel and t.conversation_id=p_conversation and public.staynex_attention_eligible(m.sender_type,m.metadata)
    group by t.id
  ) g;
$$;
revoke all on function public.staynex_attention_ticket_groups_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.staynex_attention_ticket_groups_v1(uuid,uuid) to service_role;
-- The guarded replacement of the existing attention RPC follows below.

create or replace function public.staynex_attention_transition_v1(p_hotel uuid,p_conversation uuid,p_actor uuid,p_operation uuid,p_target text,p_items jsonb)
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
  -- Hold linked tickets through validation + commit. Receipt writers lock this same conversation.
  perform 1 from public.tickets t where t.hotel_id=p_hotel and t.conversation_id=p_conversation and exists(
    select 1 from public.operational_request_receipts r where r.hotel_id=p_hotel and r.ticket_id=t.id and r.source_message_id=any(ids)) order by t.id for update;
  if p_target='resolved' and exists(select 1 from public.tickets t where t.hotel_id=p_hotel and t.conversation_id=p_conversation and t.status is distinct from 'completed'
    and exists(select 1 from public.operational_request_receipts r where r.hotel_id=p_hotel and r.ticket_id=t.id and r.source_message_id=any(ids))) then
    raise exception using errcode='23514',message='Complete the linked action before resolving attention'; end if;
  if exists(select 1 from public.operational_request_receipts r join public.messages m on m.id=r.source_message_id and m.hotel_id=p_hotel and m.conversation_id=p_conversation
    left join public.message_attention a on a.message_id=m.id
    cross join lateral public.staynex_attention_effective(m.attention_inclusion_version,a.status,a.version) e
    where r.hotel_id=p_hotel and public.staynex_attention_eligible(m.sender_type,m.metadata)
      and e.status is distinct from p_target and not(m.id=any(ids))
      and r.ticket_id in(select linked.ticket_id from public.operational_request_receipts linked where linked.hotel_id=p_hotel and linked.source_message_id=any(ids))) then
    raise exception using errcode='23514',message='Review all pending messages of this request together'; end if;
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


notify pgrst, 'reload schema';
commit;
