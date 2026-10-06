import {loadMessageMetrics} from './message-metrics';
import {getInboxConversations} from './inbox';
import {attentionOrigin} from '../../shared/message-attention/metrics.js';
import {isAttentionMessage,attentionDashboardUnavailable} from '../../shared/message-attention/contract.js';
import {isCheckinDemoHotel} from '../../shared/checkin-demo-view.js';

export const recentMessageOrder=(a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||a.id.localeCompare(b.id);
export async function loadDashboardMessages({supabase,hotel,origin='traced',urgentOnly=false}) {
  const demo=isCheckinDemoHotel(hotel);
  origin=demo?'all':origin;
  const period=demo?'history':undefined;
  try {
    const snapshot=await loadMessageMetrics({supabase,hotel,origin,period,includeSource:true});
    const {messages,attention,claimedIds}=snapshot.source;
    const candidates=urgentOnly ? snapshot.sets.urgent : messages.filter(m=>m.hotel_id===hotel.id && isAttentionMessage(m)
      && attention.has(m.id) && Date.parse(m.created_at)<=Date.parse(snapshot.readAt)
      && (origin==='all'||attentionOrigin(m,claimedIds)===origin));
    if(!candidates) throw new Error('Urgency unavailable');
    // All urgent candidates have the same accredited urgent level. Stable date/id
    // ordering breaks ties; latest is individual incoming messages, not threads.
    const selected=[...candidates].sort(recentMessageOrder).slice(0,5);
    const threads=selected.length ? await getInboxConversations({supabase,hotel,hotelId:hotel.id,
      conversationIds:[...new Set(selected.map(m=>m.conversation_id))],includeDetails:false}) : [];
    const urgentIds=new Set((snapshot.sets.urgent||[]).map(m=>m.id));
    const details={received:demo?'Mensajes entrantes · historial disponible':'Recibidos hoy',
      resolved:demo?'Actualmente resueltos · historial disponible':'Marcados como atendidos hoy y actualmente resueltos',
      pending:'Ahora · con seguimiento de atención',urgent:'Ahora · pendientes con alerta vigente'};
    return {coverage:'complete',origin,period,urgentOnly,metricDate:snapshot.date,timezone:hotel.timezone,
      counters:Object.fromEntries(Object.entries(details).map(([key,detail])=>[key,{value:snapshot.counters[key],detail}])),
      scope:'Recibidos: entradas válidas de hoy. Atención: históricos sin clasificar excluidos. Hoy usa la zona horaria del hotel.',
      messages:selected.map(m=>{
        const thread=threads.find(c=>c.id===m.conversation_id && c.hotel_id===hotel.id);
        const message=thread?.messages?.find(item=>item.id===m.id && item.hotel_id===hotel.id);
        if(!message) throw new Error('Message changed during read');
        const status=attention.get(m.id)?.status;
        const params=new URLSearchParams({hotelId:hotel.id,conversationId:m.conversation_id,messageId:m.id,origin:'all'});
        return {id:m.id,conversationId:m.conversation_id,guest:thread.guestName||thread.guest_name,
          room:message.metadata?.room_number || thread.room_number || null,title:message.content||'Mensaje sin texto',createdAt:m.created_at,
          origin:attentionOrigin(m,claimedIds),status:status==='resolved'?'Resuelto':status==='pending'?'Pendiente':'Sin seguimiento',
          priority:urgentIds.has(m.id)?'urgent':'normal',href:'/dashboard/inbox?'+params,actionLabel:'Abrir conversación'};
      })};
  } catch { return {...attentionDashboardUnavailable(),origin,period,urgentOnly}; }
}
