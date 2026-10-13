import {correctedIncident} from './incident-correction.js';
import {serviceTurn,normalizeServiceText,requestTopic} from './ticket-context.js';
import {interpretOperationalRequest,independentRequestTopics} from './operational-request.js';

// A server-authored failure marker binds source messages to their original stay.
// No raw model output, priority or copied guest facts are persisted in this marker.
export function failedRequestMarker({operational,sourceMessage,ids=[sourceMessage.id]}) {
 return {version:1,hotel_id:operational.hotel_id,guest_id:operational.guest_id,conversation_id:operational.conversation_id,
  reservation_id:operational.reservation?.id||null,room:operational.known_room||null,phase:operational.phase||null,message_ids:[...new Set(ids)]};
}
const explicitContinuation=text=>/\b(?:mismo problema|misma (?:peticion|incidencia|solicitud)|same (?:problem|request|issue)|that same (?:problem|request))\b/.test(normalizeServiceText(text));
const correction=text=>/\b(?:corrijo|correccion|correction|to clarify)\s*:/.test(normalizeServiceText(text));
// Only this narrow replacement can remove a previous water-damage fact without
// human interpretation. Other corrections are retained for review, never guessed.
export function planFailedRequestRecovery({context,sourceMessage,message,hotel,guest,conversation}) {
 const turn=serviceTurn(message),history=(context.recentMessages||[]).filter(m=>m.hotel_id===hotel.id&&m.conversation_id===conversation.id);
 if(turn.social||turn.newIncident)return {status:'none'};
 const markers=new Map();
 for(const m of history) {
  if(m.sender_type!=='ai')continue;
  const sq=m.metadata?.service_quality;
  if(sq?.recovery_resolved_root)markers.delete(sq.recovery_resolved_root);
  const f=sq?.failed_request;
  if(sq?.request_status!=='unconfirmed'||f?.version!==1||f.hotel_id!==hotel.id||f.guest_id!==guest.id||f.conversation_id!==conversation.id||!Array.isArray(f.message_ids)||!f.message_ids.length)continue;
  markers.set(f.message_ids[0],f);
 }
 if(!markers.size) {
  const legacy=history.some(m=>m.sender_type==='ai'&&m.metadata?.service_quality?.request_status==='unconfirmed'&&!m.metadata.service_quality.failed_request);
  const scoped=(context.tickets||context.openTickets||[]).some(t=>t.hotel_id===hotel.id&&t.guest_id===guest.id&&t.conversation_id===conversation.id);
  return explicitContinuation(message)&&(legacy||!scoped)?{status:'review',reason:'RECOVERY_SOURCE_UNAVAILABLE'}:{status:'none'};
 }
 const related=explicitContinuation(message)||turn.clarification||turn.cancellation||correction(message)||(!turn.topic&&turn.kind!=='initial');
 if(!related) {
  const sameTopic=[...markers.values()].some(f=>requestTopic(history.find(m=>m.id===f.message_ids[0])?.content)===turn.topic);
  return sameTopic?{status:'review',reason:'RECOVERY_AMBIGUOUS'}:{status:'none'};
 } // Merely sharing a topic is never a link.
 const review=reason=>({status:'review',reason});
 // A later known correction must never be reordered before the current event.
 const sourceIndex=history.findIndex(m=>m.id===sourceMessage.id);
 if(sourceIndex>=0 && history.slice(sourceIndex+1).some(m=>m.sender_type!=='ai'))return review('RECOVERY_ORDER_CHANGED');
 const currentTime=Date.parse(sourceMessage.created_at);
 if(Number.isFinite(currentTime)&&history.some(m=>m.sender_type!=='ai'&&Date.parse(m.created_at)>currentTime))return review('RECOVERY_ORDER_CHANGED');
 if(markers.size!==1)return review('RECOVERY_AMBIGUOUS');
 const marker=[...markers.values()][0],op=context.operationalContext;
 if(op.ambiguous||marker.reservation_id!==(op.reservation?.id||null)||marker.room!==(op.known_room||null)||marker.phase!==(op.phase||null))return review('RECOVERY_STAY_CHANGED');
 const rootIndex=history.findIndex(m=>m.id===marker.message_ids[0]&&m.sender_type==='guest');
 if(rootIndex<0)return review('RECOVERY_SOURCE_UNAVAILABLE');
 const tail=history.slice(rootIndex).filter(m=>m.id!==sourceMessage.id);
 if(tail.some(m=>!['guest','ai'].includes(m.sender_type)))return review('RECOVERY_STAFF_INTERVENED');
 const messages=tail.filter(m=>m.sender_type==='guest');
 const root=interpretOperationalRequest({message:messages[0]?.content});
 if(!root||independentRequestTopics(messages[0].content).length>1)return review('RECOVERY_AMBIGUOUS');
 const all=[...messages,sourceMessage];
 if(marker.message_ids.some(id=>!messages.some(m=>m.id===id)))return review('RECOVERY_SOURCE_UNAVAILABLE');
 if(all.length>8||all.some(m=>!m.id||typeof m.content!=='string')||all.reduce((n,m)=>n+m.content.length,0)>8000)return review('RECOVERY_SOURCE_LIMIT');
 let effective=messages[0].content;
 for(const m of all.slice(1)) {
  const t=serviceTurn(m.content),n=normalizeServiceText(m.content),topic=requestTopic(m.content);
  if(t.cancellation)return review('RECOVERY_WITHDRAWN');
  if(/cambi.*(?:habitacion|estancia)|otra habitacion|room change|moved.*room|different room|new stay|otra estancia/.test(n))return review('RECOVERY_STAY_CHANGED');
  const declaredRoom=n.match(/(?:habitacion|room)\s+([a-z0-9-]+)/)?.[1];
  if(declaredRoom&&declaredRoom!==normalizeServiceText(marker.room))return review('RECOVERY_STAY_CHANGED');
  if(t.newIncident||independentRequestTopics(m.content).length>1||topic&&topic!==root.key&&!(root.category==='maintenance'&&topic==='water_leak'))return review('RECOVERY_AMBIGUOUS');
  if(correction(m.content)) {
   const replacement=correctedIncident(m.content);if(!replacement)return review('RECOVERY_CORRECTION_REVIEW');
   effective=replacement; // earlier damage no longer establishes current severity
  } else {
   if(/\b(?:no|not|never|ya no)\b/.test(n)&&/agua|fuga|gote|water|leak|smoke|humo|gas/.test(n))return review('RECOVERY_CORRECTION_REVIEW');
   if(!explicitContinuation(m.content)&&!t.clarification&&!t.social)return review('RECOVERY_AMBIGUOUS');
   effective+='\n'+m.content;
  }
 }
 const evaluated=interpretOperationalRequest({message:effective,aiResponse:{create_ticket:true,ticket:{title:root.title,category:root.category}}});
 if(!evaluated)return review('RECOVERY_CORRECTION_REVIEW');
 return {status:'recover',messages:all,marker:failedRequestMarker({operational:op,sourceMessage,ids:all.map(m=>m.id)}),
  request:{...root,priority:evaluated.priority,priority_reason:evaluated.priority_reason},effective};
}
