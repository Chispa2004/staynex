import {readOperationalPages} from './operational-pages.js';
import {buildTicketCopilot} from './ai-copilot.js';
import {attentionOrigin} from '../../shared/message-attention/metrics.js';
import {isDemoMessageStagesContext} from '../../shared/demo-message-stages/server-provenance.js';
import {PENDING_TICKET_STATUSES,comparePendingTickets,effectiveTicketPriority,isNewTicket} from '../../shared/pending-tickets.js';

const columns='id,hotel_id,guest_id,conversation_id,title,description,room_number,priority,status,category,created_at,request_context';
async function relatedRows(supabase,table,columns,hotelId,field,ids) {
  const rows=[];
  for(let i=0;i<ids.length;i+=200) rows.push(...await readOperationalPages(supabase,table,columns,hotelId,q=>q.in(field,ids.slice(i,i+200))));
  return rows;
}
export async function loadPendingTicketRows({supabase,hotel,origin='other',now=new Date().toISOString()}) {
  if(!['all','other','simulated'].includes(origin)) throw Object.assign(new Error('Filtro de tickets no válido.'),{status:400});
  if(!hotel?.id) throw Object.assign(new Error('Acceso al hotel denegado.'),{status:403});
  // Exhaust all authorized pages before priority ordering, counting or limiting.
  const tickets=await readOperationalPages(supabase,'tickets',columns,hotel.id,q=>q.in('status',PENDING_TICKET_STATUSES));
  const ids=key=>[...new Set(tickets.map(t=>t[key]).filter(Boolean))];
  const [guests,messages]=await Promise.all([
    relatedRows(supabase,'guests','id,hotel_id,name',hotel.id,'id',ids('guest_id')),
    relatedRows(supabase,'messages','id,hotel_id,conversation_id,metadata',hotel.id,'conversation_id',ids('conversation_id'))
  ]);
  const guestById=new Map(guests.map(g=>[g.id,g]));
  const messageById=new Map(messages.map(m=>[m.id,m]));
  const simulatedConversations=new Set(messages.filter(m=>attentionOrigin(m,new Set())==='simulated').map(m=>m.conversation_id));
  return tickets.map(ticket=>{
    const source=messageById.get(ticket.request_context?.source_message_id);
    const simulated=isDemoMessageStagesContext({hotelId:hotel.id,guestId:ticket.guest_id,conversationId:ticket.conversation_id})
      || (source && source.conversation_id===ticket.conversation_id
        ? attentionOrigin(source,new Set())==='simulated' : simulatedConversations.has(ticket.conversation_id));
    const row={...ticket,guest_name:guestById.get(ticket.guest_id)?.name || null,
      ticketOrigin:simulated?'simulated':'other',copilot:buildTicketCopilot(ticket,[]),isNew:isNewTicket(ticket,now)};
    return {...row,effectivePriority:effectiveTicketPriority(row)};
  }).filter(t=>origin==='all'||t.ticketOrigin===origin).sort(comparePendingTickets);
}
export async function loadDashboardPendingTickets(args) {
  const readAt=new Date().toISOString();
  const rows=await loadPendingTicketRows({...args,now:readAt});
  return {hotelId:args.hotel.id,timezone:args.hotel.timezone,origin:args.origin,total:rows.length,readAt,
    tickets:rows.slice(0,5).map(({id,title,description,room_number,guest_name,priority,effectivePriority,status,created_at,isNew,ticketOrigin})=>
      ({id,title:title || description,room_number,guest_name,priority,effectivePriority,status,created_at,isNew,ticketOrigin}))};
}
