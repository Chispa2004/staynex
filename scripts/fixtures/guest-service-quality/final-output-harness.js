import fs from 'node:fs';
import {recordOperationalRequest as recordRequest} from '../../../src/services/operational-request.service.js';
import * as quality from '../../../shared/guest-service/quality.js';
import { chooseNaturalConciergeResponse } from '../../../src/services/natural-conversation.service.js';

const read = name => fs.readFileSync(new URL('../../../'+name, import.meta.url), 'utf8').replaceAll('\r\n','\n');
const source = read('src/services/staynex.service.js');
const segment = (start, end) => {
  const a=source.indexOf(start), b=source.indexOf(end,a);
  if(a<0 || b<=a) throw Error('Production boundary moved; update the behavioral harness');
  return source.slice(a,b);
};
// Execute the production persistence/finalization block and the actual send
// boundary. Only persistence and transport are doubles. Intermediate analytics,
// provider workflows and the earlier model call are deliberately not simulated.
const finalBody=segment('  const operationalRequest = await recordOperationalRequest(', '  const previousLastProviderExperience');
const transportBody=segment('  let twilioMessage = null;\n\n  if (sendReply)', "  logger.info('Guest message processed'");
const ticketSource=read('src/services/ticket.service.js').replace(/^import[^;]+;\r?\n/gm,'').replace('export const ','const ');
export async function captureFinalOutput(input, primaryOutput, {conciergeOutput=null, failTicket=false, foreignTicket=false, finalizer=quality.finalizeServiceReply}={}) {
  const calls=[];
  const raw={...primaryOutput,ai_provider:'openai',fallback_used:false};
  const primary=quality.applyServiceCapabilities(raw,input.conversationContext);
  const processed={...primary,reply:chooseNaturalConciergeResponse({baseResponse:primary.reply,openAiSuggestedResponse:conciergeOutput?.suggested_response})};
  const createTicketRecord=async values=>{
    calls.push({kind:'ticket',values});
    if(failTicket)throw Error('Synthetic ticket write failure');
    return {id:'synthetic-ticket',hotel_id:foreignTicket?'other-hotel':values.hotelId,guest_id:values.guestId,conversation_id:values.conversationId,category:values.category};
  };
  const createTicketFromAiResponse=new Function('createTicketRecord',ticketSource+';return createTicketFromAiResponse;')(createTicketRecord);
  const sourceMessage={id:'synthetic-source',hotel_id:input.hotel.id,conversation_id:'synthetic-conversation',sender_type:'guest'};
  let stored;
  const client={rpc:async(name,{p_request})=>{
    try{stored=await createTicketRecord({hotelId:input.hotel.id,guestId:input.guest.id,conversationId:'synthetic-conversation',category:p_request.category});
    return {data:{ticket:stored,source_message_id:sourceMessage.id}};}catch(error){return {error};}
  },from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:stored})};return q}};
  const bindings={...quality,finalizeServiceReply:finalizer,rawAiResponse:primary,aiResponseWithUpsell:processed,
    recordOperationalRequest:values=>recordRequest({...values,client}),guestMessage:sourceMessage,
    activeHotel:input.hotel,guest:input.guest,conversation:{id:'synthetic-conversation'},
    conversationContext:{...input.conversationContext,hotelKnowledge:input.hotelKnowledge,knownRoom:input.guest.current_room,operationalContext:{hotel_id:input.hotel.id,guest_id:input.guest.id,conversation_id:'synthetic-conversation',known_room:input.guest.current_room}},
    message:input.message,finalOfferSuppression:{suppress:false},humanEscalation:{humanReason:null},
    smarterResponse:{metadata:{}},providerExperienceOwnsResponse:false,experienceBookingIntent:{detected:false},experienceBookingRequest:null,
    upsellInterest:null,enhancedRisk:{hasRisk:false},createTicketFromAiResponse,
    createUpsellInterestTicket:async()=>{throw Error('Unexpected upsell');},createOperationalTicketForConciergeRisk:async()=>null,
    createMessage:async values=>{calls.push({kind:'message',values});return values;},
    sendReply:true,replyTo:'synthetic-recipient',phone:'synthetic-recipient',
    sendWhatsAppMessage:async values=>{calls.push({kind:'transport',values});return {id:'synthetic-delivery'};}};
  const body=(finalBody+transportBody).replaceAll('\r\n','\n');
  try {
    const result=await new Function(...Object.keys(bindings),'return (async()=>{'+body+';return {response:aiResponseWithUpsell,aiMessage,ticket};})()')(...Object.values(bindings));
    return {result,calls};
  } catch(error) {return {error:error.message,calls};}
}
