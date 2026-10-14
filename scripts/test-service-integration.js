import assert from 'node:assert/strict';
import fs from 'node:fs';
import {detectUpsellInterest} from '../src/services/upsell.service.js';
import {recordOperationalRequest} from '../src/services/operational-request.service.js';
import {independentRequestTopics} from '../shared/guest-service/operational-request.js';
import * as quality from '../shared/guest-service/quality.js';

// Exercise the real post-generation branch including its alternative writer.
// The previous evaluator set upsellInterest=null and could not detect this path.
const pipeline=fs.readFileSync(new URL('../src/services/staynex.service.js',import.meta.url),'utf8');
const start=pipeline.indexOf('  const operationalRequest = await recordOperationalRequest(');
const end=pipeline.indexOf('  const previousLastProviderExperience',start);
assert(start>0&&end>start);
const body=pipeline.slice(start,end)+';return {operationalRequest,ticket};';
const hotel={id:'synthetic-hotel-a',timezone:'Europe/Madrid'},guest={id:'synthetic-guest',hotel_id:hotel.id},conversation={id:'synthetic-conversation',hotel_id:hotel.id,guest_id:guest.id};
const offer={id:'synthetic-offer',hotel_id:hotel.id,conversation_id:conversation.id,upsell_type:'late_checkout'};
for(const message of ['Mi reserva empieza el 12 de noviembre.','¿Necesito reserva para la piscina?','Do I need a booking for the pool?','Thanks, that is all.']) {
 let writes=0;
 const client={rpc:async()=>{writes++;throw Error('Unexpected RPC');},from:()=>{writes++;throw Error('Unexpected SQL');}};
 const context={language:'es',hotelKnowledge:[],recentMessages:[],serviceCapabilities:{requestRecording:true},operationalContext:{hotel_id:hotel.id,guest_id:guest.id,conversation_id:conversation.id,known_room:null,phase:'pre'}};
 const bindings={...quality,recordOperationalRequest:args=>recordOperationalRequest({...args,client}),composeRecordedGuestReply:async()=>null,
  activeHotel:hotel,guest,conversation,guestMessage:{id:'synthetic-message',hotel_id:hotel.id,conversation_id:conversation.id,sender_type:'guest',content:message},conversationContext:context,message,
  rawAiResponse:{reply:'Necesitamos confirmar ese dato.'},aiResponseWithUpsell:{reply:'Necesitamos confirmar ese dato.'},enhancedRisk:{hasRisk:false},
  upsellInterest:detectUpsellInterest({message,recentUpsells:[offer]}),providerExperienceOwnsResponse:false,experienceBookingIntent:{detected:false},experienceBookingRequest:null,
  finalOfferSuppression:{suppress:false},humanEscalation:{},smarterResponse:{metadata:{}},
  createUpsellInterestTicket:async()=>{writes++;return {id:'unexpected',hotel_id:hotel.id,guest_id:guest.id,conversation_id:conversation.id};},createMessage:async value=>value};
 const result=await new Function(...Object.keys(bindings),'return (async()=>{'+body+'})()')(...Object.values(bindings));
 assert.equal(writes,0,message);assert.equal(result.ticket,null);assert.equal(result.operationalRequest.status,'not_requested');
}
assert.equal(detectUpsellInterest({message:'Reserva el spa',recentUpsells:[offer]}).type,'spa');
assert.equal(detectUpsellInterest({message:'Me interesa el spa',recentUpsells:[offer]}).type,'spa');
assert.equal(detectUpsellInterest({message:'Yes, book it',recentUpsells:[offer]}).upsell.id,offer.id);
console.log('PASS integrated generation: arrival/information/social turns cannot fall through to the commercial ticket writer; explicit commercial interest retained');

assert.deepEqual(independentRequestTopics('Could we have another pillow for our next stay?'),['pillow']);
assert.deepEqual(independentRequestTopics('Necesito toallas para la próxima estancia.'),['towels']);
assert.equal(independentRequestTopics('I need a pillow and a new booking.').length,2);
console.log('PASS stay context does not manufacture a second independent request; explicit multiple needs remain blocked');
assert.deepEqual(independentRequestTopics('Necesito ayuda: el desagüe de la ducha está obstruido.'),['maintenance_incident']);
assert.equal(independentRequestTopics('La ducha está obstruida y hay ruido de una fiesta.').length,2);
