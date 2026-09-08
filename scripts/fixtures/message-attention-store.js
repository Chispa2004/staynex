// Test double only. Models the RPC contract; it is NOT PostgreSQL concurrency evidence.
// Imported by tests (and by an ignored visual harness), never by product runtime.
import { isAttentionMessage } from '../../shared/message-attention/contract.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const failure=(code,message)=>Object.assign(new Error(message),{code});
export class AttentionStore {
  constructor({now='2026-09-08T12:00:00Z'}={}) {
    this.now=now;this.messages=new Map();this.states=new Map();this.conversations=new Map();this.users=new Map();this.guests=new Map();this.alerts=new Map();
    this.audit=new Map();this.claims=new Set();this.enabled=true;this.failAudit=false;this.failAttention=false;this.failRead=false;this.sequence=100;this.queue=Promise.resolve();this.sideEffects=[];
  }
  id(){return '00000000-0000-4000-8000-'+String(++this.sequence).padStart(12,'0');}
  historical(message){this.messages.set(message.id,copy({...message,attention_inclusion_version:null}));return message;}
  effective(id){const m=this.messages.get(id);return this.states.get(id)||{messageId:id,status:m?.attention_inclusion_version===1?'pending':'untracked',version:m?.attention_inclusion_version===1?1:0,changedAt:m?.attention_inclusion_version===1?m.created_at:null,changedBy:null,actorKind:m?.attention_inclusion_version===1?'inbound':null};}
  insert(message){
    if(this.messages.has(message.id))throw failure('23505','Duplicate message');
    const conversation=this.conversations.get(message.conversation_id);
    if(!conversation || conversation.hotel_id!==message.hotel_id)throw failure('42501','Tenant mismatch');
    const stored={attention_inclusion_version:this.enabled?1:null,...copy(message)};
    this.messages.set(message.id,stored);
    return copy(stored);
  }
  from(table){
    let data,filters={};
    const query={
      select(){return query;},eq(k,v){filters[k]=v;return query;},
      insert:record=>{try{data={data:this.insert({...record,id:record.id||this.id(),created_at:record.created_at||this.now}),error:null};}catch(e){data={data:null,error:e};}return query;},
      single:async()=>data,
      maybeSingle:async()=>({data:table==='conversations'?this.conversations.get(filters.id)||null:null,error:null})
    };
    return query;
  }
  read(args){
    if(!this.enabled)throw failure('55000','Schema disabled');
    if(this.failRead)throw failure('XX000','Attention read unavailable');
    const c=this.conversations.get(args.p_conversation);
    if(!c || c.hotel_id!==args.p_hotel)throw failure('42501','Invalid conversation');
    const items=args.p_ids.map(id=>{
      const m=this.messages.get(id);
      if(!m||m.hotel_id!==args.p_hotel||m.conversation_id!==args.p_conversation||!isAttentionMessage(m))throw failure('42501','Invalid message');
      return copy(this.effective(id));
    });
    return {contract:1,hotelId:args.p_hotel,conversationId:args.p_conversation,items};
  }
  transition(a){
    const user=this.users.get(a.p_actor+':'+a.p_hotel);
    if(!user||!['owner','admin','manager','receptionist'].includes(user.role)||user.status!=='active'||user.platformRole==='support')throw failure('42501','Operator denied');
    const ids=a.p_items.map(i=>i.messageId);
    const before=this.read({...a,p_ids:ids});
    const signature=JSON.stringify({...a,p_items:[...a.p_items].sort((x,y)=>x.messageId.localeCompare(y.messageId))});
    const previous=this.audit.get(a.p_operation);
    if(previous){
      if(previous.signature!==signature||previous.after.items.some(row=>this.effective(row.messageId).version!==row.version))throw failure('40001','Superseded operation');
      return before;
    }
    for(const expected of a.p_items){
      const actual=before.items.find(i=>i.messageId===expected.messageId);
      if(actual.version!==expected.expectedVersion||actual.status!==expected.expectedStatus)throw failure('40001','Stale state');
    }
    // Staged state and mandatory audit commit together, including injected failure.
    const staged=new Map(this.states);
    if(this.failAttention)throw failure('XX000','Attention write unavailable');
    for(const row of before.items)if(row.status!==a.p_target)staged.set(row.messageId,{messageId:row.messageId,status:a.p_target,version:row.version+1,changedAt:this.now,changedBy:a.p_actor,actorKind:'user'});
    if(this.failAudit)throw failure('XX000','Audit unavailable');
    this.states=staged;
    const after=this.read({...a,p_ids:ids});
    this.audit.set(a.p_operation,{signature,after:copy(after),actorId:a.p_actor,at:this.now});
    return after;
  }
  origin(m){return m.metadata?.demo||m.metadata?.checkin_demo||m.metadata?.simulation||m.metadata?.fixture?'simulated':this.claims.has(m.id)?'traced':'unknown';}
  urgent(m){const a=this.alerts.get(m.conversation_id);return a?.hotel_id===m.hotel_id&&a.escalation_level==='urgent'&&Date.parse(a.updated_at)>=Date.parse(m.created_at)&&Date.parse(a.updated_at)<=Date.parse(this.now);}
  dashboard(a){
    if(!this.enabled)throw failure('55000','Schema disabled');
    if(this.failRead)throw failure('XX000','Attention read unavailable');
    const c=[...this.conversations.values()].find(c=>c.hotel_id===a.p_hotel);
    const zone=c?.timezone||'Europe/Madrid';
    const day=value=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}catch{return null;}};
    const today=day(this.now);
    const messages=[...this.messages.values()].filter(m=>m.hotel_id===a.p_hotel&&this.conversations.get(m.conversation_id)?.hotel_id===a.p_hotel&&isAttentionMessage(m)&&this.origin(m)===a.p_origin&&m.created_at<=this.now);
    const pending=messages.filter(m=>this.effective(m.id).status==='pending');
    const candidates=pending.filter(m=>!a.p_urgent_only||this.urgent(m)).filter(m=>!a.p_cursor_at||m.created_at<a.p_cursor_at||(m.created_at===a.p_cursor_at&&m.id<a.p_cursor_id)).sort((x,y)=>y.created_at.localeCompare(x.created_at)||y.id.localeCompare(x.id));
    const page=candidates.slice(0,8);
    return {contract:1,hotelId:a.p_hotel,origin:a.p_origin,urgentOnly:a.p_urgent_only,
      counters:{received:today?messages.filter(m=>day(m.created_at)===today).length:null,
        resolved:today?messages.filter(m=>this.states.get(m.id)?.status==='resolved'&&day(this.states.get(m.id).changedAt)===today).length:null,
        pending:pending.length,urgent:pending.filter(m=>this.urgent(m)).length},
      pending:page.map(m=>({id:m.id,conversationId:m.conversation_id,createdAt:m.created_at,title:m.content,guest:this.guests.get(this.conversations.get(m.conversation_id).guest_id)?.name||'Prueba',room:this.guests.get(this.conversations.get(m.conversation_id).guest_id)?.current_room||null,status:'Pendiente',priority:this.urgent(m)?'urgent':null,origin:a.p_origin,version:this.effective(m.id).version})),
      nextCursor:candidates.length>8?{at:page[7].created_at,id:page[7].id}:null};
  }
  async rpc(name,args){
    const run=async()=>{try{return {data:copy(name==='staynex_attention_read_v1'?this.read(args):name==='staynex_attention_transition_v1'?this.transition(args):this.dashboard(args)),error:null};}catch(error){return {data:null,error:{code:error.code||'XX000',message:error.message}};}};
    const next=this.queue.then(run);this.queue=next.then(()=>{});return next;
  }
}
