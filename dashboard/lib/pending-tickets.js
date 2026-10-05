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
async function ticketGuests(supabase,hotelId,ids) {
  let columns='id,hotel_id,name,full_name';
  for(let attempt=0;attempt<3;attempt++) {
    try {return await relatedRows(supabase,'guests',columns,hotelId,'id',ids);}
    catch(error) {
      const missing=['name','full_name'].find(field=>columns.split(',').includes(field) && new RegExp('\\b'+field+'\\b').test(error.message||''));
      if(!['42703','PGRST204'].includes(error.code)||!missing||attempt===2)throw error;
      columns=columns.split(',').filter(field=>field!==missing).join(',');
    }
  }
}
export async function loadPendingTicketRows({supabase,hotel,origin='other',now=new Date().toISOString()}) {
  if(!['all','other','simulated'].includes(origin)) throw Object.assign(new Error('Filtro de tickets no válido.'),{status:400});
  if(!hotel?.id) throw Object.assign(new Error('Acceso al hotel denegado.'),{status:403});
  // Exhaust all authorized pages before priority ordering, counting or limiting.
  const tickets=await readOperationalPages(supabase,'tickets',columns,hotel.id,q=>q.in('status',PENDING_TICKET_STATUSES));
  const ids=key=>[...new Set(tickets.map(t=>t[key]).filter(Boolean))];
  const [guests,messages]=await Promise.all([
    ticketGuests(supabase,hotel.id,ids('guest_id')),
    relatedRows(supabase,'messages','id,hotel_id,conversation_id,metadata',hotel.id,'conversation_id',ids('conversation_id'))
  ]);
  const guestById=new Map(guests.map(g=>[g.id,g]));
  // Identity is optional on the legacy guest table. As in Inbox, use an
  // existing reservation identity without deriving a current room or stay.
  const missingNames=guests.filter(g=>!g.name&&!g.full_name).map(g=>g.id);
  const identities=await relatedRows(supabase,'reservations','id,hotel_id,guest_id,guest_name,arrival_date',hotel.id,'guest_id',missingNames);
  identities.sort((a,b)=>String(b.arrival_date||'').localeCompare(String(a.arrival_date||''))||a.id.localeCompare(b.id));
  const nameByGuest=new Map();for(const identity of identities)if(identity.guest_name&&!nameByGuest.has(identity.guest_id))nameByGuest.set(identity.guest_id,identity.guest_name);
  const messageById=new Map(messages.map(m=>[m.id,m]));
  const simulatedConversations=new Set(messages.filter(m=>attentionOrigin(m,new Set())==='simulated').map(m=>m.conversation_id));
  return tickets.map(ticket=>{
    const source=messageById.get(ticket.request_context?.source_message_id);
    const simulated=isDemoMessageStagesContext({hotelId:hotel.id,guestId:ticket.guest_id,conversationId:ticket.conversation_id})
      || (source && source.conversation_id===ticket.conversation_id
        ? attentionOrigin(source,new Set())==='simulated' : simulatedConversations.has(ticket.conversation_id));
    const guest=guestById.get(ticket.guest_id);
    const row={...ticket,guest_name:guest?.name || guest?.full_name || nameByGuest.get(ticket.guest_id) || null,
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
