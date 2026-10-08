import {isCheckinDemoHotel} from '../../shared/checkin-demo-view.js';
import {demoTicketProvenance,ticketInDemoScope} from '../../shared/demo-ticket-scope.js';
import {readOperationalPages} from './operational-pages.js';
export async function scopeDemoTickets({supabase,hotel,tickets,scope='current'}) {
  if(!isCheckinDemoHotel(hotel))return tickets;
  const [conversations,messages,receipts]=await Promise.all([
    readOperationalPages(supabase,'conversations','id,hotel_id,guest_id,status',hotel.id),
    readOperationalPages(supabase,'messages','id,hotel_id,conversation_id,metadata',hotel.id),
    readOperationalPages(supabase,'operational_request_receipts','hotel_id,ticket_id,source_message_id',hotel.id,q=>q,'source_message_id')
  ]);
  return tickets.map(t=>({...t,demoProvenance:demoTicketProvenance(t,{hotel,conversations,messages,receipts})}))
    .filter(t=>ticketInDemoScope(t,scope));
}
