// Offline, append-only plan. No client, secrets, provider or remote execution.
import {demoMessageStageId} from '../shared/demo-message-stages/server-provenance.js';
import {checkinAiCases,syntheticKnowledgeAdditions} from './checkin-ai-cases.js';
import {guardedDelete} from './demo-message-replacement.js';
const q = value => "'"+String(value).replaceAll("'","''")+"'";
const j = value => q(JSON.stringify(value))+'::jsonb';
const tables = ['guests','reservations','conversations','messages','hotel_knowledge','conversation_ai_state'];
export function prepareCheckinAiLoad({backup,generations}) {
  const h=backup.hotel?.id;
  if (!h || backup.hotel.slug !== 'hotel-demo-checkin' || backup.hotel.name !== 'Hotel Demo Checkin' || !backup.actorId) throw Error('Verified consistent backup required');
  const oldIds=backup.rows.conversations.filter(c=>backup.rows.messages.some(m=>m.conversation_id===c.id)).map(c=>c.id);
  if (oldIds.length !== 9 || generations.length !== 21 || new Set(generations.map(g=>g.conversationId+':'+g.turn)).size !== 21) throw Error('Expected 9 existing and 6 two-turn cases');
  const added=Object.fromEntries(tables.map(t=>[t,[]])),updates=[];
  for (const c of checkinAiCases) {
    const cid=demoMessageStageId(h,c.slot,'conversation'),gid=demoMessageStageId(h,c.slot,'guest'),rid=demoMessageStageId(h,c.slot,'reservation');
    const records=generations.filter(g=>g.conversationId===cid).sort((a,b)=>a.turn-b.turn);
    if(records.length!==2||records.some((r,i)=>r.slot!==c.slot||r.guestId!==gid||r.reservation.id!==rid||r.turn!==i||r.message!==c.turns[i]||r.existing))throw Error('Synthetic input mismatch');
    const first=records[0],last=records.at(-1),room=c.stage==='pre'?null:'DEMO-'+(401+checkinAiCases.indexOf(c));
    added.guests.push({id:gid,hotel_id:h,phone_number:'synthetic-only:'+gid,current_room:room});
    added.reservations.push({id:rid,hotel_id:h,guest_id:gid,pms_provider:'checkin_demo_mock',pms_reservation_id:rid,guest_name:c.name,arrival_date:first.reservation.arrival_date,departure_date:first.reservation.departure_date,status:first.reservation.status});
    added.conversations.push({id:cid,hotel_id:h,guest_id:gid,last_message_at:last.generatedAt,created_at:first.guestAt});
    if(c.slot==='ai-noise')added.conversation_ai_state.push({id:demoMessageStageId(h,c.slot,'state'),hotel_id:h,conversation_id:cid,state_metadata:{demo:true,fixture:'checkin_ai_v1',conversation_ai_mode:'human_takeover',human_takeover:{reason:'Ensayo: revisión humana requerida, sin aviso externo'}},updated_at:last.generatedAt});
  }
  for(const g of generations){
    if(g.response.ai_provider!=='openai'||g.response.fallback_used||!g.response.reply?.trim()||!g.inputHash||!g.outputHash||!Number.isFinite(Date.parse(g.generatedAt))||Date.parse(g.generatedAt)<Date.parse(g.guestAt))throw Error('Genuine provider provenance required');
    if(g.existing){
      if(!oldIds.includes(g.conversationId)||g.turn!==0)throw Error('Foreign or unexpected existing conversation');
      const before=backup.rows.conversations.find(c=>c.id===g.conversationId);
      const original=backup.rows.messages.filter(m=>m.conversation_id===before.id);
      if(original.length!==1||original[0].content!==g.message||before.guest_id!==g.guestId||before.hotel_id!==h)throw Error('Backup message differs');
      if(Date.parse(g.generatedAt)<Date.parse(original[0].created_at))throw Error('Cannot backdate reply');
      const state=backup.rows.conversation_ai_state.find(s=>s.conversation_id===before.id);
      if(['human_takeover','ai_paused','escalation_lock'].includes(state?.state_metadata?.conversation_ai_mode)&&!g.draft)throw Error('Human control requires draft');
      updates.push({table:'conversations',before,after:{...before,last_message_at:g.generatedAt}});
    } else if(!checkinAiCases.some(c=>c.slot===g.slot))throw Error('Unknown case');
    const meta={demo:true,fixture:'checkin_ai_v1',reservation_id:g.reservation.id,demo_sequence:g.turn*2};
    if(!g.existing)added.messages.push({id:demoMessageStageId(h,g.slot,'guest-turn-'+g.turn),hotel_id:h,conversation_id:g.conversationId,sender_type:'guest',content:g.message,original_language:'es',created_at:g.guestAt,metadata:meta});
    added.messages.push({id:demoMessageStageId(h,g.slot,'ai-turn-'+g.turn),hotel_id:h,conversation_id:g.conversationId,sender_type:'ai',content:g.response.reply,original_language:'es',created_at:g.generatedAt,metadata:{...meta,demo_sequence:g.turn*2+1,demo_ai:{version:1,draft:Boolean(g.draft),delivery:'not_sent',provider:g.response.ai_provider,model:g.response.ai_model,generated_at:g.generatedAt,input_hash:g.inputHash,output_hash:g.outputHash,proposed_ticket:Boolean(g.response.create_ticket),human_review:Boolean(g.response.escalate_to_human)}}});
  }
  for(const k of syntheticKnowledgeAdditions)added.hotel_knowledge.push({id:demoMessageStageId(h,'ai-knowledge',k.key),hotel_id:h,key:k.key,value:k.value,is_active:true,metadata:{demo:true,fixture:'checkin_ai_v1'}});
  const oldGuard=['messages','conversation_ai_state','reservations','guests'].flatMap(t=>(backup.rows[t]||[]).filter(r=>r.hotel_id===h).map(r=>`if not exists(select 1 from public.${t} r where to_jsonb(r)=${j(r)}) then raise exception 'Snapshot changed: ${t}'; end if;`)).join('\n');
  const counts=['messages','conversation_ai_state','reservations','guests'].map(t=>`if (select count(*) from public.${t} where hotel_id=${q(h)} and id not in (${added[t].map(r=>q(r.id)).join(',')||"null"})) <> ${(backup.rows[t]||[]).filter(r=>r.hotel_id===h).length} then raise exception 'Snapshot row set changed: ${t}'; end if;`).join('\n');
  const operations=tables.flatMap(t=>added[t].map(r=>`if exists(select 1 from public.${t} where id=${q(r.id)}) then
    if not exists(select 1 from public.${t} r where ${Object.keys(r).map(k=>'r.'+k+' is not distinct from (jsonb_populate_record(null::public.'+t+','+j(r)+')).'+k).join(' and ')}) then raise exception 'Identity collision ${t}'; end if;
    else insert into public.${t}(${Object.keys(r).join(',')}) select ${Object.keys(r).join(',')} from jsonb_populate_record(null::public.${t},${j(r)}); end if;`)).join('\n');
  const change=updates.map(u=>`if exists(select 1 from public.conversations r where to_jsonb(r)=${j(u.before)}) then update public.conversations set last_message_at=${q(u.after.last_message_at)} where id=${q(u.before.id)} and hotel_id=${q(h)};
    elsif not exists(select 1 from public.conversations r where to_jsonb(r)=to_jsonb(jsonb_populate_record(null::public.conversations,${j(u.after)}))) then raise exception 'Conversation changed'; end if;`).join('\n');
  const sql=`begin; set local lock_timeout='5s'; set local statement_timeout='30s';
lock table ${tables.map(t=>'public.'+t).join(',')} in share row exclusive mode;
do $load$ begin
 if current_setting('staynex.demo_isolated',true) is distinct from 'on' or current_setting('staynex.send_automations',true) is distinct from 'false' then raise exception 'Isolation acknowledgement required'; end if;
 if not exists(select 1 from public.hotels where id=${q(h)} and slug='hotel-demo-checkin' and name='Hotel Demo Checkin') then raise exception 'Wrong demo hotel'; end if;
 if not exists(select 1 from public.hotel_users where hotel_id=${q(h)} and user_id=${q(backup.actorId)} and status='active' and role in ('owner','admin','manager','receptionist') and coalesce(platform_role,'none')<>'support') then raise exception 'Authorized demo operator required'; end if;
 if exists(select 1 from pg_trigger where not tgisinternal and tgenabled<>'D' and tgrelid in (${tables.map(t=>q('public.'+t)+'::regclass').join(',')})) then raise exception 'Enabled user trigger; inspect first'; end if;
 ${oldGuard}
 ${counts}
 ${operations}
 ${change}
end $load$; commit;`;
  const recovery=after=>{
    const reverse=Object.fromEntries(['messages','conversation_ai_state','conversations','reservations','guests','hotel_knowledge'].map(t=>[t,(after.rows[t]||[]).filter(r=>added[t].some(a=>a.id===r.id))]));
    for(const t of tables)if(reverse[t].length!==added[t].length)throw Error('Complete post-load backup required');
    const restore=updates.map(u=>{const current=after.rows.conversations.find(c=>c.id===u.before.id);if(!current)throw Error('Missing updated conversation');return `if not exists(select 1 from public.conversations r where to_jsonb(r)=${j(current)}) then raise exception 'Subsequent conversation activity'; end if; update public.conversations set last_message_at=${q(u.before.last_message_at)} where id=${q(u.before.id)} and hotel_id=${q(h)};`;}).join('\n');
    return `begin;set local lock_timeout='5s';set local statement_timeout='30s';lock table public.conversations in share row exclusive mode;\n${guardedDelete(reverse)}\ndo $restore$ begin ${restore} end $restore$;commit;`;
  };
  return {sql,added,updates,recovery};
}
