import { readAllInboxRows } from '../../shared/inbox/stay-stage.js';
import { isAttentionMessage, validAttentionSnapshot, attentionError } from '../../shared/message-attention/contract.js';
import { buildMessageMetrics, attentionOrigin } from '../../shared/message-attention/metrics.js';

// Read-only, scoped, paginated queries. No raw claims, message bodies or actors are
// returned in the metric DTO. Existing RPC checks the enabled attention contract.
export async function loadMessageMetrics({supabase,hotel,origin,date,verified=false,now=new Date().toISOString()}) {
  if (!verified) {
    const {data,error}=await supabase.rpc('staynex_attention_dashboard_v1',{p_hotel:hotel.id,p_origin:origin});
    if (error || data?.contract!==1 || data.hotelId!==hotel.id) throw attentionError('Seguimiento no disponible.',503);
  }
  const rows=(table,select,order='id')=>readAllInboxRows(()=>supabase.from(table).select(select).eq('hotel_id',hotel.id).order(order,{ascending:true}));
  const [messages,conversations,claims,states]=await Promise.all([
    rows('messages','id,hotel_id,conversation_id,sender_type,metadata,created_at'),
    rows('conversations','id,hotel_id'),
    rows('twilio_inbound_message_claims','id:message_sid,message_id','message_sid'),
    rows('conversation_ai_state','id:conversation_id,conversation_id,hotel_id,escalation_level,updated_at','conversation_id')
  ]);
  const claimedIds=new Set(claims.map(c=>c.message_id).filter(Boolean));
  const groups=new Map(), validConversations=new Set(conversations.map(c=>c.id));
  for (const m of messages) if (isAttentionMessage(m) && validConversations.has(m.conversation_id) && attentionOrigin(m,claimedIds)===origin) {
    if (!groups.has(m.conversation_id)) groups.set(m.conversation_id,[]);
    groups.get(m.conversation_id).push(m.id);
  }
  const attention=new Map(), jobs=[];
  for (const [conversationId,ids] of groups) for(let i=0;i<ids.length;i+=3000) jobs.push({conversationId,ids:ids.slice(i,i+3000)});
  for(let i=0;i<jobs.length;i+=4) await Promise.all(jobs.slice(i,i+4).map(async job=>{
    const {data,error}=await supabase.rpc('staynex_attention_read_v1',{p_hotel:hotel.id,p_conversation:job.conversationId,p_ids:job.ids});
    if(error || !validAttentionSnapshot(data,hotel.id,job.conversationId,job.ids)) throw attentionError('Seguimiento no disponible. Actualiza para reintentar.',503);
    for(const item of data.items) attention.set(item.messageId,item);
  }));
  return buildMessageMetrics({hotelId:hotel.id,timezone:hotel.timezone,origin,date,now,messages,conversations,attention,
    alerts:new Map(states.map(s=>[s.conversation_id,s])),claimedIds});
}
