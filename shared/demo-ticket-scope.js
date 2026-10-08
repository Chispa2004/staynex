import {isCheckinDemoHotel} from './checkin-demo-view.js';
const editions=new Set(['staynex_message_stages_v1','checkin_natural_service_v1','checkin_additional_service_v1']);
export function demoTicketProvenance(ticket,{hotel,conversations,messages,receipts}) {
  if(!isCheckinDemoHotel(hotel))return 'operational';
  const conversation=conversations.find(c=>c.id===ticket.conversation_id && c.hotel_id===hotel.id && c.guest_id===ticket.guest_id);
  const links=receipts.filter(r=>r.ticket_id===ticket.id && r.hotel_id===hotel.id);
  const proven=links.length>0 && links.every(r=>messages.some(m=>m.id===r.source_message_id && m.hotel_id===hotel.id
    && m.conversation_id===ticket.conversation_id && m.metadata?.demo===true && editions.has(m.metadata.fixture)));
  if(!conversation || !proven)return 'review';
  return conversation.status==='closed'?'history':'current';
}
export const ticketInDemoScope=(ticket,scope='current')=>scope==='all' || ticket.demoProvenance==='operational'
  || (scope==='current'?ticket.demoProvenance!=='history':ticket.demoProvenance===scope);
