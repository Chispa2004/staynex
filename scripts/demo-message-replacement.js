// Offline SQL preparation. The caller supplies a private, consistent backup.
// No database, environment, provider access or private identities in this module.
import { demoMessageStages } from './demo-message-stages.js';
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>q(JSON.stringify(value))+'::jsonb';
const key=table=>table==='message_attention'?'message_id':'id';
const targets=['message_attention','conversation_ai_state','messages','conversations'];
const rowsSQL=rows=>Object.entries(rows).flatMap(([table,items])=>items.map(row=>`(${q('public.'+table)}::regclass,${q(key(table))},${json(row)})`)).join(',\n');

// A fresh dependency scan runs under locks. Even a new FK consumer, cross-hotel
// reference, or ON DELETE SET NULL must fail rather than lose another row's link.
export const guardedDelete=rows=>`
create temporary table demo_delete_targets(rel regclass,key text,data jsonb) on commit drop;
${rowsSQL(rows)?'insert into demo_delete_targets values '+rowsSQL(rows)+';':''}
do $guard$
declare t record; k record; actual jsonb; linked boolean;
begin
 for t in select distinct rel from demo_delete_targets loop
  execute format('lock table %s in share row exclusive mode',t.rel);
 end loop;
 for k in select c.oid,c.conrelid child,c.confrelid parent,
   string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' and ' order by u.ord) joins
   from pg_constraint c cross join lateral unnest(c.conkey,c.confkey) with ordinality u(ck,pk,ord)
   join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=u.ck
   join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=u.pk
   where c.contype='f' and c.confrelid in(select rel from demo_delete_targets)
   group by c.oid,c.conrelid,c.confrelid loop
  execute format('lock table %s in share row exclusive mode',k.child::regclass);
  execute format('select exists(select 1 from %s child join %s parent on %s join demo_delete_targets p on p.rel=$1 and to_jsonb(parent)->>p.key=p.data->>p.key where not exists(select 1 from demo_delete_targets d where d.rel=$2 and to_jsonb(child)=d.data))',k.child::regclass,k.parent::regclass,k.joins)
   into linked using k.parent,k.child;
  if linked then raise exception 'Unbacked dependent activity in %; no cascade or unlink allowed',k.child::regclass; end if;
 end loop;
 if exists(select 1 from pg_trigger where not tgisinternal and tgenabled<>'D' and tgrelid in(select rel from demo_delete_targets)) then raise exception 'Enabled user trigger; inspect before replacement'; end if;
 for t in select * from demo_delete_targets loop
  execute format('select to_jsonb(r) from %s r where r.%I::text=$1',t.rel,t.key) into actual using t.data->>t.key;
  if actual is distinct from t.data then raise exception 'Backup no longer matches %; preserve subsequent activity',t.rel; end if;
 end loop;
end $guard$;
${Object.keys(rows).map(table=>`delete from public.${table} r using demo_delete_targets d where d.rel='public.${table}'::regclass and r.${key(table)}::text=d.data->>${q(key(table))};`).join('\n')}
drop table demo_delete_targets;
`;

export function prepareDemoReplacement({backup,referenceDate}) {
 const {hotel,actorId,rows}=backup;
 if(!hotel?.id||hotel.slug!=='hotel-demo-checkin'||hotel.name!=='Hotel Demo Checkin')throw Error('Verified hotel backup required');
 const generated=demoMessageStages({hotelId:hotel.id,actorId,referenceDate});
 const newIds=generated.cases.map(c=>c.conversationId);
 const messages=rows.messages||[];
 if(messages.some(m=>m.hotel_id!==hotel.id)||rows.conversations.some(c=>c.hotel_id!==hotel.id))throw Error('Cross-hotel history excluded; resolve before replacement');
 if(messages.some(m=>newIds.includes(m.conversation_id)))throw Error('Backup already contains new edition; do not regenerate replacement');
 const safe=rows.conversations.filter(c=>!Object.entries(rows).some(([table,items])=>!targets.includes(table)&&items.some(r=>r.conversation_id===c.id)));
 const safeIds=safe.map(c=>c.id),messageIds=messages.map(m=>m.id);
 const deleted={message_attention:(rows.message_attention||[]).filter(r=>messageIds.includes(r.message_id)),
  conversation_ai_state:(rows.conversation_ai_state||[]).filter(r=>safeIds.includes(r.conversation_id)),messages,conversations:safe};
 if(Object.values(deleted).flat().some(r=>r.hotel_id!==hotel.id))throw Error('Cross-hotel dependent activity excluded');
 const body=generated.sql.slice(generated.sql.indexOf('begin;')+6).replace(/commit;\s*$/,'');
 const ids=generated.cases.map(c=>q(c.messageId)).join(',');
 const oldIds=messageIds.map(q).join(',')||'null';
 const cleanup=guardedDelete(deleted);
 // The temporary procedure is session-local and is dropped at transaction end
 // with its schema. No public RPC, table, grant or schema migration is installed.
 const sql=`begin;
set local lock_timeout='5s'; set local statement_timeout='30s';
lock table public.messages,public.conversations,public.message_attention,public.conversation_ai_state in share row exclusive mode;
create temporary table demo_replacement_state(applied boolean) on commit drop;
insert into demo_replacement_state select count(*)=9 from public.messages where hotel_id=${q(hotel.id)} and id in(${ids});
do $scope$ begin
 if exists(select 1 from public.messages where hotel_id=${q(hotel.id)} and id not in(${oldIds},${ids})) then raise exception 'Hotel history changed since backup'; end if;
 if (select applied from demo_replacement_state) and exists(select 1 from public.messages where id in(${oldIds})) then raise exception 'Mixed replacement state'; end if;
end $scope$;
${/* Use a temporary function so guardedDelete remains one atomic conditional. */''}
create function pg_temp.apply_demo_replacement() returns void language plpgsql as $replace$
begin
 if not (select applied from demo_replacement_state) then
  ${cleanup}
 end if;
end $replace$;
select pg_temp.apply_demo_replacement();
drop function pg_temp.apply_demo_replacement();
${body}
commit;
`;
 const restoreInserts=[...targets].reverse().map(t=>deleted[t].length?`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t},${json(deleted[t])});`:'').join('\n');
 // Recovery requires a post-load snapshot: exact comparisons reject subsequent
 // user activity. The recipe is fully prepared before applying the replacement.
 const recovery=postLoad=>{
  const post=postLoad.rows;
  const byIds=(t,field,values)=>(post[t]||[]).filter(r=>values.includes(r[field]));
  const reverse={message_attention:byIds('message_attention','message_id',generated.cases.map(c=>c.messageId)),
   conversation_ai_state:byIds('conversation_ai_state','conversation_id',newIds),
   messages:byIds('messages','id',generated.cases.map(c=>c.messageId)),conversations:byIds('conversations','id',newIds),
   reservations:byIds('reservations','id',generated.cases.map(c=>c.reservationId)),guests:byIds('guests','id',generated.cases.map(c=>c.guestId))};
  if(reverse.messages.length!==9||reverse.conversations.length!==9||reverse.guests.length!==9||reverse.reservations.length!==9)throw Error('Complete post-load snapshot required for guarded recovery');
  return `begin; set local lock_timeout='5s'; set local statement_timeout='30s';\n${guardedDelete(reverse)}\n${restoreInserts}\ncommit;`;
 };
 return {sql,recovery,generated,deleted,retainedConversations:rows.conversations.filter(c=>!safeIds.includes(c.id))};
}
