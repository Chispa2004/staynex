import { buildTicketCopilot } from './ai-copilot.js';
import { attachTicketCopilot } from './tickets.js';
import { reservationState, selectOperationalRows } from '../../shared/operational-metrics.js';

// Server-only complete scan. Never return the full inventory to the browser.
export async function readOperationalPages(supabase, table, columns, hotelId, configure = q => q) {
  const rows = [];
  for (let offset = 0;; offset += 500) {
    const {data,error} = await configure(supabase.from(table).select(columns).eq('hotel_id',hotelId)).order('id',{ascending:true}).range(offset,offset+499);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Lectura operativa incompleta.');
    if (data.some(row => row.hotel_id && row.hotel_id !== hotelId)) throw Object.assign(new Error('Acceso al hotel denegado.'),{status:403});
    rows.push(...data);
    if (data.length < 500) {
      if (new Set(rows.map(row=>row.id)).size !== rows.length) throw new Error('Los registros cambiaron durante la lectura. Actualiza para reintentar.');
      return rows;
    }
  }
}
export async function loadOperationalMetrics({supabase,hotel,kind,filter,now}) {
  const hotelId = hotel.id;
  const columns = kind === 'tickets'
    ? 'id,hotel_id,room_number,category,priority,status,created_at,completed_at,title,description,conversation_id,guest_id'
    : 'id,hotel_id,status,arrival_date,departure_date,guest_name,guest_email,guest_phone,pms_reservation_id,reservation_access_token';
  let rows = await readOperationalPages(supabase,kind,columns,hotelId);
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
