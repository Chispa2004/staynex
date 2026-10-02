import {getSupabase} from './supabase.service.js';
import {interpretOperationalRequest} from '../../shared/guest-service/operational-request.js';

export async function recordOperationalRequest({hotel,guest,conversation,sourceMessage,context,aiResponse,message,client=getSupabase()}) {
  const operational=context?.operationalContext;
  if(!operational || operational.hotel_id!==hotel.id || operational.guest_id!==guest.id || operational.conversation_id!==conversation.id
    || sourceMessage?.hotel_id!==hotel.id || sourceMessage.conversation_id!==conversation.id || sourceMessage.sender_type!=='guest')throw new Error('Operational request context mismatch');
  const request=interpretOperationalRequest({message,aiResponse,openTickets:(context.openTickets||[]).filter(t=>t.hotel_id===hotel.id && t.conversation_id===conversation.id && t.guest_id===guest.id)});
  if(!request)return {status:'not_requested',ticket:null};
  if(context.serviceCapabilities?.requestRecording!==true || context.serviceCapabilities?.mode==='staff_draft')return {status:'proposed',ticket:null};
  const payload={...request,reservation_id:operational.reservation?.id||null,room_number:operational.known_room,
    operational_context:{phase:operational.phase,room_source:operational.room_source,reason:operational.reason,
      reference_time:operational.reference_time,historical_room:operational.historical_room}};
  try {
    const {data,error}=await client.rpc('record_guest_operational_request_v1',{p_hotel_id:hotel.id,p_conversation_id:conversation.id,p_message_id:sourceMessage.id,p_request:payload});
    if(error)throw error;
    const receipt=data?.ticket;
    if(data?.source_message_id!==sourceMessage.id || receipt?.hotel_id!==hotel.id || receipt?.guest_id!==guest.id || receipt?.conversation_id!==conversation.id || !receipt?.id)throw new Error('Incomplete request receipt');
    // The response is not enough: read the committed, scoped record before prose.
    const {data:ticket,error:readError}=await client.from('tickets').select('*').eq('id',receipt.id).eq('hotel_id',hotel.id).eq('conversation_id',conversation.id).eq('guest_id',guest.id).single();
    if(readError || ticket?.id!==receipt.id)throw readError||new Error('Ticket not confirmed');
    return {status:'recorded',ticket,request,sourceMessageId:sourceMessage.id};
  } catch(error) {
    // Original guest message already persists. A retry uses the same receipt key
    // even when commit succeeded but its response/readback was lost.
    return {status:'unconfirmed',ticket:null,request,sourceMessageId:sourceMessage.id,errorCode:error.code||'REQUEST_NOT_CONFIRMED'};
  }
}
