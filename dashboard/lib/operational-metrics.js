import {scopeDemoTickets} from './demo-ticket-scope.js';
import { buildTicketCopilot } from './ai-copilot.js';
import { attachTicketCopilot } from './tickets.js';
import { reservationState, selectOperationalRows } from '../../shared/operational-metrics.js';

import {readOperationalPages} from './operational-pages.js';
export {readOperationalPages} from './operational-pages.js';
import {loadPendingTicketRows} from './pending-tickets.js';
export async function loadOperationalMetrics({supabase,hotel,kind,filter,now}) {
  const hotelId = hotel.id;
  const columns = kind === 'tickets'
    ? 'id,hotel_id,room_number,category,priority,status,created_at,completed_at,title,description,conversation_id,guest_id,request_context,status_version'
    : 'id,hotel_id,status,arrival_date,departure_date,guest_name,guest_email,guest_phone,pms_reservation_id,reservation_access_token';
  let rows = kind === 'tickets' && filter.metric === 'pending'
    ? await loadPendingTicketRows({supabase,hotel,origin:filter.ticketOrigin,demoScope:filter.demoScope,now})
    : await readOperationalPages(supabase,kind,columns,hotelId);
  if(kind==='tickets' && filter.metric!=='pending')rows=await scopeDemoTickets({supabase,hotel,tickets:rows,scope:filter.demoScope});
  if (kind === 'tickets') rows = rows.map(row=>({...row,copilot:buildTicketCopilot(row,[])}));
  rows.sort(kind === 'tickets'
    ? (a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')) || a.id.localeCompare(b.id)
    : (a,b)=>String(a.arrival_date||'9999').localeCompare(String(b.arrival_date||'9999')) || a.id.localeCompare(b.id));
  const result = selectOperationalRows(kind,rows,filter,{hotelId,timezone:hotel.timezone,now});
  if (kind === 'tickets') {
    result.items = await attachTicketCopilot({supabase,tickets:result.items,hotelId,allTickets:rows});
  } else if (result.items.length) {
    const ids = result.items.map(row=>row.id);
    const {data,error} = await supabase.from('reservations').select('*, automation_events(*)').eq('hotel_id',hotelId).in('id',ids);
    if (error) throw error;
    if (!data || data.length !== ids.length || data.some(row=>row.hotel_id!==hotelId)) throw new Error('Los registros cambiaron durante la lectura. Actualiza para reintentar.');
    // Refuse stale membership rather than presenting a row that no longer matches its card.
    const byId = new Map(data.map(row=>[row.id,row]));
    for (const original of result.items) for (const field of columns.split(',')) {
      if ((original[field]??null) !== (byId.get(original.id)[field]??null)) throw new Error('Los registros cambiaron durante la lectura. Actualiza para reintentar.');
    }
    const guestIds = [...new Set(data.map(row=>row.guest_id).filter(Boolean))];
    const conversations = guestIds.length ? await readOperationalPages(supabase,'conversations','id,hotel_id,guest_id,status,last_message_at,created_at',hotelId,q=>q.in('guest_id',guestIds)) : [];
    conversations.sort((a,b)=>String(b.last_message_at||'').localeCompare(String(a.last_message_at||'')) || a.id.localeCompare(b.id));
    result.items = ids.map(id=>{
      const row=byId.get(id),state=reservationState(row,result.filter.date),conversation=conversations.find(c=>c.guest_id===row.guest_id)||null;
      return {...row,computedStayStatus:state,computedJourneyStatus:state==='completed'?'post_stay':state==='upcoming'?'pre_arrival':state,linkedConversation:conversation,conversationId:conversation?.id||null};
    });
  }
  return result;
}
