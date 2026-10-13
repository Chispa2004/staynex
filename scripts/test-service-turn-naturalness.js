import assert from 'node:assert/strict';
import {finalizeServiceReply,buildServiceDraft,informationServiceDraft} from '../shared/guest-service/quality.js';
import {serviceTurn,ticketReplyPlan} from '../shared/guest-service/ticket-context.js';
import {recordOperationalRequest} from '../src/services/operational-request.service.js';
import {buildConversationCopilot} from '../dashboard/lib/ai-copilot.js';
import {shouldAiAutoRespond} from '../shared/pilot/ai-safety.js';
import {detectHumanEscalation} from '../src/services/human-escalation.service.js';

const hotel={id:'h'},guest={id:'g',hotel_id:'h'},conversation={id:'c',hotel_id:'h',guest_id:'g'};
const ticket={id:'t',hotel_id:'h',guest_id:'g',conversation_id:'c',room_number:'TEST-23',status:'open',category:'housekeeping',title:'Towels',description:'Two towels',request_context:{request_key:'towels',last_source_message_id:'old'}};
const context={operationalContext:{hotel_id:'h',guest_id:'g',conversation_id:'c'},tickets:[ticket],recentMessages:[],serviceCapabilities:{requestRecording:true}};
const sourceMessage={id:'m',hotel_id:'h',conversation_id:'c',sender_type:'guest'};
const base={hotelId:'h',guestId:'g',conversationId:'c',language:'en',context:{hotelKnowledge:[],recentMessages:[]},primary:{reply:'We have dispatched someone.',confidence:.99},operationalRequest:{status:'not_requested'}};
let writes=0;
const noWrites={rpc:async()=>{writes++;throw Error('Unexpected write');}};
for(const message of ['Gracias.','Vale, gracias, nada más.','Thank you!','Thanks, that is all.']) {
  assert.equal(serviceTurn(message).kind,'social');
  const outcome=await recordOperationalRequest({hotel,guest,conversation,sourceMessage,context,message,client:noWrites,aiResponse:{create_ticket:true,ticket:{title:'Towels',category:'housekeeping'}}});
  assert.equal(outcome.status,'not_requested');
  const final=finalizeServiceReply({...base,message,operationalRequest:outcome});
  assert.equal(final.service_quality.transformation,'social_no_action');
  assert.doesNotMatch(final.reply,/request|room|registr|habitaci|dispatch/);
  const draft=buildServiceDraft({message,recordedTicket:ticket,language:'en'});
  assert.equal(draft.requestStatus,'not_requested');assert(draft.draft);
}
assert.equal(writes,0);
for(const message of ['Gracias, pero necesito otra toalla.','Thanks, please bring a pillow.'])assert.equal(serviceTurn(message).social,false);
console.log('PASS complete social turns cannot reuse model tool proposals; mixed requests remain actionable');

const history=[{hotel_id:'h',sender_type:'guest',content:'When does breakfast start?'}];
const knowledge=[{hotel_id:'h',key:'breakfast',value:'Breakfast 07:00-10:00',is_active:true},{hotel_id:'h',key:'breakfast',value:'Breakfast 06:00-09:00',is_active:true}];
const query=(message,h=history,k=knowledge)=>informationServiceDraft({message,history:h,knowledge:k,hotelId:'h',language:'en'});
assert.match(query('When does breakfast start?').text,/conflicting/);
assert.match(query('Is 05:00 confirmed?').text,/can’t confirm/);
const location=query('Where is the gym?').text;
const hours=query('When does the pool close?').text;
const current=query('Is that current information?',[{hotel_id:'h',sender_type:'guest',content:'When does the pool close?'}]).text;
const booking=query('Do I need a booking?',[{hotel_id:'h',sender_type:'guest',content:'When does the pool close?'}]).text;
assert.match(location,/location.*gym/);assert.match(hours,/hours.*pool/);assert.match(current,/current.*pool/);assert.match(booking,/whether.*booking/);
assert.equal(new Set([location,hours,current,booking]).size,4);
assert.equal(query('Is that current information?',[{hotel_id:'other',sender_type:'guest',content:'When does the pool close?'}]),null);
assert(!location.includes('05:00'));assert(!booking.includes('not required'));
console.log('PASS unconfirmed information answers its topic and aspect, retaining uncertainty and tenant scope');

const multi={status:'needs_review',errorCode:'MULTIPLE_REQUESTS_REQUIRE_REVIEW'};
const f=message=>finalizeServiceReply({...base,message,operationalRequest:multi}).reply;
assert.match(f('Which request is being handled?'),/don’t have confirmation/);
assert.match(f('Please keep both needs visible.'),/remain in your message/);
assert.notEqual(f('Please bring towels and a pillow.'),f('Which request is being handled?'));
assert.notEqual(f('Which request is being handled?'),f('Please keep both needs visible.'));
const input={...conversation,guest,hotelProfile:hotel,tickets:[],messages:[{hotel_id:'h',sender_type:'guest',content:'Please bring towels and a pillow.'},{hotel_id:'h',sender_type:'guest',content:'Which request is being handled?'}]};
const unchanged=structuredClone(input),draft=buildConversationCopilot(input).suggestedReply;
assert.match(draft.text,/don’t have confirmation/);assert(draft.draft);assert.deepEqual(input,unchanged);assert.equal(writes,0);
console.log('PASS review limitation follows the current intention in guest replies and read-only Inbox');

const newIssue=ticketReplyPlan({ticket:{...ticket,description:'A different problem: another charge needs review.',request_context:{request_key:'billing_review'}},message:'A different problem: another charge needs review.',language:'en'});
assert.match(newIssue.text,/separate request/);
for(const status of ['open','in_progress','completed']) {
 const t={...ticket,status};
 const client={...noWrites,from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:t})};return q;}};
 const outcome=await recordOperationalRequest({hotel,guest,conversation,sourceMessage,context:{...context,tickets:[t]},message:'Any update?',client,aiResponse:{create_ticket:true}});
 assert.equal(outcome.status,'observed');assert.equal(outcome.ticket.status,status);
 const final=finalizeServiceReply({...base,ticket:t,message:'Any update?',operationalRequest:outcome});
 assert.match(final.reply,status==='open'?/still pending; we don’t have an update/:status==='in_progress'?/working on it/:/completed/);
 assert.doesNotMatch(final.reply,/TEST-23|dispatched|sent/);
}
assert.equal(writes,0);
assert.equal(ticketReplyPlan({ticket,message:'Any news?',language:'en'}).text,
  ticketReplyPlan({ticket,message:'Has anything changed?',language:'en'}).text,
  'Unchanged facts may justify the same progress answer; do not invent novelty');
const detail='Mejor tres, no dos.';
for(const persisted of [false,true]) {
 const t={...ticket,description:persisted?'Two towels\n'+detail:'Two towels'};
 const final=finalizeServiceReply({...base,ticket:t,message:detail,operationalRequest:{status:'recorded',ticket:t,sourceMessageId:'m'}});
 assert.match(final.reply,persisted?/updated your request to 3 towels/:/can’t confirm/);
}
const failed=finalizeServiceReply({...base,message:detail,operationalRequest:{status:'unconfirmed'}});
assert.match(failed.reply,/could not confirm/);assert.doesNotMatch(failed.reply,/we’ve added/);
assert.equal(shouldAiAutoRespond({hotel:{...hotel,ai_auto_reply_enabled:true},conversationState:{state_metadata:{conversation_ai_mode:'human_takeover'}},env:{STAYNEX_GLOBAL_AI_AUTO_REPLY:'on'}}).allowed,false);
await assert.rejects(recordOperationalRequest({hotel:{id:'other'},guest,conversation,sourceMessage,context,message:'Thanks',client:noWrites}),/context mismatch/);
console.log('PASS scoped readback controls progress and clarification; failed persistence, human pause and hotel authorization retained');

// N01-N04 exposed these failures. They are now regressions, no longer an
// independent holdout. F01-F03 remain unexecuted until the engine is frozen.
assert(serviceTurn('Corrijo la cantidad: cinco en total.').clarification);
assert.equal(serviceTurn('¿Habéis empezado?').kind,'progress');
assert.equal(serviceTurn('Has anything changed now?').kind,'progress');
assert.equal(serviceTurn('¿Se ha puesto en marcha alguna de las dos cosas?').clarification,false);
assert(serviceTurn('La almohada ya no la necesito, pero mantengo la limpieza.').withdrawal);
assert(serviceTurn('Prefiero que siga una persona.').human);
assert.equal(detectHumanEscalation({message:'Prefiero que siga una persona.',aiResponse:{confidence:.2}}).humanReason,'human_requested');
const combined=ticketReplyPlan({ticket:{...ticket,status:'completed'},message:'Is it finished, and did anyone send me a notice?',language:'en'}).text;
assert.match(combined,/completed/);assert.match(combined,/don’t have confirmation/);
for(const message of ['Necesito una almohada y que limpien el baño.','La almohada ya no la necesito, pero mantengo la limpieza.']) {
 const outcome=await recordOperationalRequest({hotel,guest,conversation,context:{...context,tickets:[]},message,client:noWrites,sourceMessage,aiResponse:{create_ticket:true}});
 assert.equal(outcome.status,'needs_review');
}
assert.match(query('Which breakfast opening time should I rely on?').text,/can’t confirm/);
assert.match(query('So you cannot confirm that time for tomorrow?').text,/can’t confirm/);
const noInfoWrite=await recordOperationalRequest({hotel,guest,conversation,context:{...context,tickets:[]},message:'Where is the gym?',client:noWrites,sourceMessage,aiResponse:{create_ticket:true,ticket:{title:'Gym'}}});
assert.equal(noInfoWrite.status,'not_requested');assert.equal(writes,0);
console.log('PASS reserved-case regressions: quantity, progress vs detail, mixed needs, explicit human request, completion vs notification, information without tools');
