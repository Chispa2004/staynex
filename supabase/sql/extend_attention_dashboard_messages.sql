-- Incremental, backend-only Dashboard listing. Install after create_message_attention.sql
-- and create_reservations_core.sql. v1 and its canonical KPI calculations remain intact.
begin;
create or replace function public.staynex_attention_dashboard_v2(p_hotel uuid,p_origin text,p_urgent_only boolean default false,p_cursor_at timestamptz default null,p_cursor_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog set statement_timeout='8s' as $f$
declare base jsonb; sample jsonb; next_page jsonb; now_at timestamptz:=clock_timestamp(); tz text;
begin
  -- Includes scope, origin, timezone and enabled-contract validation. Never widen origin.
  base:=public.staynex_attention_dashboard_v1(p_hotel,p_origin,p_urgent_only,p_cursor_at,p_cursor_id);
  tz:=base->>'timezone';
  with candidates as (
    select m.id,m.conversation_id as "conversationId",m.created_at as "createdAt",left(m.content,600) as title,
      coalesce(nullif(to_jsonb(g)->>'name',''),nullif(r.guest_name,''),'Huésped') as guest,g.current_room as room,
      case when e.status='resolved' then 'Resuelto' else 'Pendiente' end as status,
      case when e.status='pending' and s.escalation_level='urgent' and s.updated_at>=m.created_at and s.updated_at<=now_at then 'urgent' end as priority,
      case when e.status='resolved' then 2 when s.escalation_level='urgent' and s.updated_at>=m.created_at and s.updated_at<=now_at then 0 else 1 end as rank,
      case when exists(select 1 from pg_timezone_names where name=tz) and r.arrival_date is not null and r.departure_date>r.arrival_date then
        case when (m.created_at at time zone tz)::date<r.arrival_date then 'Antes de la llegada'
          when (m.created_at at time zone tz)::date>=r.departure_date then 'Después de la salida' else 'Durante la estancia' end end as "stayStage",
      p_origin as origin,e.version
    from public.messages m
    join public.conversations c on c.id=m.conversation_id and c.hotel_id=m.hotel_id
    left join public.guests g on g.id=c.guest_id and g.hotel_id=m.hotel_id
    left join public.message_attention a on a.message_id=m.id and a.hotel_id=m.hotel_id and a.conversation_id=m.conversation_id
    cross join lateral public.staynex_attention_effective(m.attention_inclusion_version,a.status,a.version) e
    left join public.conversation_ai_state s on s.conversation_id=m.conversation_id and s.hotel_id=m.hotel_id
    -- Use an explicit reservation link when present, otherwise only an unambiguous stay.
    -- Text comparison avoids casting untrusted legacy metadata to UUID.
    left join lateral (
      select x.* from public.reservations x where x.hotel_id=m.hotel_id and x.guest_id=c.guest_id
        and x.status not in ('cancelled','canceled','no_show')
        and (case when nullif(m.metadata->>'reservation_id','') is not null then x.id::text=m.metadata->>'reservation_id'
          else (select count(*) from public.reservations y where y.hotel_id=m.hotel_id and y.guest_id=c.guest_id and y.status not in ('cancelled','canceled','no_show'))=1 end)
    ) r on true
    where m.hotel_id=p_hotel and e.status in ('pending','resolved') and m.created_at<=now_at
      and public.staynex_attention_eligible(m.sender_type,m.metadata)
      and public.staynex_attention_origin(p_hotel,m.id,m.metadata)=p_origin
  ), page as (
    select q.* from candidates q where (not p_urgent_only or q.priority='urgent')
      and (p_cursor_id is null or exists(select 1 from candidates cursor_row
        where cursor_row.id=p_cursor_id and cursor_row."createdAt"=p_cursor_at
          and (q.rank>cursor_row.rank or (q.rank=cursor_row.rank and (q."createdAt",q.id)<(p_cursor_at,p_cursor_id)))))
    order by rank,"createdAt" desc,id desc limit 9
  ) select coalesce(jsonb_agg(to_jsonb(page) order by rank,"createdAt" desc,id desc),'[]'::jsonb) into sample from page;
  if jsonb_array_length(sample)>8 then
    next_page:=jsonb_build_object('at',sample->7->>'createdAt','id',sample->7->>'id');
    sample:=sample-8;
  end if;
  return base || jsonb_build_object('contract',2,'pending','[]'::jsonb,'messages',sample,'nextCursor',next_page);
end $f$;
revoke all on function public.staynex_attention_dashboard_v2(uuid,text,boolean,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.staynex_attention_dashboard_v2(uuid,text,boolean,timestamptz,uuid) to service_role;
commit;
