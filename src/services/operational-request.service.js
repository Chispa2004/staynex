import {getSupabase} from './supabase.service.js';
import {interpretOperationalRequest} from '../../shared/guest-service/operational-request.js';
import {selectRelevantTicket,serviceTurn,detailIsPersisted} from '../../shared/guest-service/ticket-context.js';

export async function recordOperationalRequest({hotel,guest,conversation,sourceMessage,context,aiResponse,message,client=getSupabase()}) {
  const operational=context?.operationalContext;
  if(!operational || operational.hotel_id!==hotel.id || operational.guest_id!==guest.id || operational.conversation_id!==conversation.id
    || sourceMessage?.hotel_id!==hotel.id || sourceMessage.conversation_id!==conversation.id || sourceMessage.sender_type!=='guest')throw new Error('Operational request context mismatch');
  const scoped=(context.tickets||context.openTickets||[]).filter(t=>t.hotel_id===hotel.id && t.conversation_id===conversation.id && t.guest_id===guest.id);
  const turn=serviceTurn(message);
  const relevant=selectRelevantTicket({tickets:scoped,hotelId:hotel.id,guestId:guest.id,conversationId:conversation.id,message,history:context.recentMessages,sourceMessageId:sourceMessage.id});
  if(relevant.status==='ambiguous')return {status:'ambiguous',ticket:null,sourceMessageId:sourceMessage.id};
  let request=interpretOperationalRequest({message,aiResponse,openTickets:scoped});
  if(relevant.ticket && turn.clarification && !['open','in_progress'].includes(relevant.ticket.status)) {
    return {status:'unconfirmed',ticket:null,sourceMessageId:sourceMessage.id,errorCode:'REQUEST_NOT_OPEN_FOR_DETAILS'};
  }
  if(relevant.ticket && turn.clarification && ['open','in_progress'].includes(relevant.ticket.status)) {
    request={key:relevant.ticket.request_context?.request_key,category:relevant.ticket.category,
      priority:relevant.ticket.priority,title:relevant.ticket.title,details:message,priority_reason:'guest_clarification',new_incident:false};
    if(!request.key)return {status:'unconfirmed',ticket:null,sourceMessageId:sourceMessage.id};
  }
  // A progress enquiry reads the current ticket; it never reopens completed work
  // or adds a receipt merely to generate a reply.
  if(relevant.ticket && !turn.clarification && ['progress','receipt'].includes(turn.kind)) {
    try {
      const {data:ticket,error}=await client.from('tickets').select('*').eq('id',relevant.ticket.id).eq('hotel_id',hotel.id).eq('conversation_id',conversation.id).eq('guest_id',guest.id).single();
      if(error || !ticket || ticket.hotel_id!==hotel.id || ticket.guest_id!==guest.id || ticket.conversation_id!==conversation.id)throw error||new Error('Invalid ticket readback');
      return {status:'observed',ticket,request:{key:ticket.request_context?.request_key},sourceMessageId:sourceMessage.id,detailConfirmed:false};
    }catch{return {status:'unconfirmed',ticket:null,sourceMessageId:sourceMessage.id};}
  }
  if(!request)return {status:'not_requested',ticket:null};
  if(context.serviceCapabilities?.requestRecording!==true || context.serviceCapabilities?.mode==='staff_draft')return {status:'proposed',ticket:null};
  const target=turn.clarification?relevant.ticket:null;
  const payload={...request,expected_ticket_id:target?.id||null,reservation_id:target?target.request_context?.reservation_id||null:operational.reservation?.id||null,room_number:target?target.room_number||null:operational.known_room,
    operational_context:{phase:operational.phase,room_source:operational.room_source,reason:operational.reason,
      reference_time:operational.reference_time,historical_room:operational.historical_room}};
  try {
    const {data,error}=await client.rpc('record_guest_operational_request_v1',{p_hotel_id:hotel.id,p_conversation_id:conversation.id,p_message_id:sourceMessage.id,p_request:payload});
    if(error)throw error;
    const receipt=data?.ticket;
    if(target && (data?.target_ticket_enforced!==true || data?.ticket?.id!==target.id))throw new Error('Target ticket not confirmed');
    if(data?.source_message_id!==sourceMessage.id || receipt?.hotel_id!==hotel.id || receipt?.guest_id!==guest.id || receipt?.conversation_id!==conversation.id || !receipt?.id)throw new Error('Incomplete request receipt');
    // The response is not enough: read the committed, scoped record before prose.
    const {data:ticket,error:readError}=await client.from('tickets').select('*').eq('id',receipt.id).eq('hotel_id',hotel.id).eq('conversation_id',conversation.id).eq('guest_id',guest.id).single();
    if(readError || ticket?.id!==receipt.id)throw readError||new Error('Ticket not confirmed');
    if(turn.clarification && !detailIsPersisted(ticket,message))throw new Error('Clarification not persisted');
    return {status:'recorded',ticket,request,sourceMessageId:sourceMessage.id,detailConfirmed:detailIsPersisted(ticket,message)};
  } catch(error) {
    // Original guest message already persists. A retry uses the same receipt key
    // even when commit succeeded but its response/readback was lost.
    return {status:'unconfirmed',ticket:null,request,sourceMessageId:sourceMessage.id,errorCode:error.code||'REQUEST_NOT_CONFIRMED'};
  }
}
