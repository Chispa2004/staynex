import {assertsAvailability} from './fixtures/guest-service-quality/evidence-assertions.js';
import assert from 'node:assert/strict';
import {informationEvidence,unambiguousKnowledge} from '../shared/guest-service/information-evidence.js';
import {serviceTurn,selectRelevantTicket,ticketReplyPlan} from '../shared/guest-service/ticket-context.js';
import {generateReceiptReply} from '../shared/guest-service/receipt-reply.js';
import {recordOperationalRequest} from '../src/services/operational-request.service.js';
import {buildConversationCopilot} from '../dashboard/lib/ai-copilot.js';

const hotel={id:'h'},guest={id:'g',hotel_id:'h'},conversation={id:'c',hotel_id:'h',guest_id:'g'};
const ticket={id:'t',hotel_id:'h',guest_id:'g',conversation_id:'c',status:'open',category:'housekeeping',
 description:'One pillow',request_context:{request_key:'pillow',last_source_message_id:'old'}};
for(const message of ['Make that four instead.','Mejor cinco, en lugar de una.','I no longer need it.','Ya no hace falta.']) {
 assert(serviceTurn(message).clarification,message);
 assert.equal(selectRelevantTicket({tickets:[ticket],hotelId:'h',guestId:'g',conversationId:'c',message}).ticket.id,'t');
 assert.equal(selectRelevantTicket({tickets:[ticket,{...ticket,id:'t2'}],hotelId:'h',guestId:'g',conversationId:'c',message}).status,'ambiguous');
}
const facts={hotelId:'h',guestId:'g',conversationId:'c',ticket,language:'en',message:'Is it cancelled?',
 operationalRequest:{status:'observed',ticket,sourceMessageId:'m'},context:{}};
for(const reply of ['It is cancelled.','It is cancelled, not delivered.']) {
 assert.equal(await generateReceiptReply(facts,async()=>({reply})),null);
}
const plan=ticketReplyPlan({ticket,message:'I no longer need it.',language:'en',detailConfirmed:true});
assert.equal(ticket.status,'open');assert(plan.turn.withdrawal);assert.match(plan.text,/confirmation/);
for(const status of ['open','in_progress','completed']) {
 const changed={...ticket,status};
 assert.equal(await generateReceiptReply({...facts,ticket:changed,message:'Has it been sent?',operationalRequest:{...facts.operationalRequest,ticket:changed}},async()=>({reply:'We sent it.'})),null);
 assert.match(ticketReplyPlan({ticket:changed,message:'Has it been sent?',language:'en'}).text,/confirmation/);
}
console.log('PASS quantity/withdrawal select only one scoped ticket; cancellation and delivery require independent evidence');

let writes=0;
const client={rpc:async()=>{writes++;throw Error('Unexpected RPC');}};
const context={operationalContext:{hotel_id:'h',guest_id:'g',conversation_id:'c'},tickets:[],recentMessages:[]};
for(const message of ['Please bring towels and a pillow.','Cancel my request.']) {
 const outcome=await recordOperationalRequest({hotel,guest,conversation,context,message,client,
  sourceMessage:{id:'m',hotel_id:'h',conversation_id:'c',sender_type:'guest'},aiResponse:{create_ticket:true}});
 assert.equal(outcome.status,'needs_review');assert.equal(outcome.ticket,null);
}
assert.equal(writes,0);
console.log('PASS multiple independent needs and unknown cancellation target never claim a partial tool success');

const rows=[{hotel_id:'h',key:'breakfast',value:'Breakfast 07:00-10:00',is_active:true},
 {hotel_id:'h',key:'breakfast',value:'Breakfast 04:00-05:00',is_active:true},
 {hotel_id:'other',key:'pool',value:'Foreign pool'}, {hotel_id:'h',key:'pool',value:'Old pool',is_active:false}];
assert.deepEqual(unambiguousKnowledge(rows,'h'),[]);
assert.equal(informationEvidence({message:'When is breakfast?',hotelId:'h',knowledge:rows}).confirmed,false);
assert.equal(informationEvidence({message:'Is 07:20 confirmed?',history:[{sender_type:'guest',content:'When is breakfast?'}],hotelId:'h',knowledge:rows}).topic,'breakfast');
const history=[{sender_type:'guest',content:'Where is the pool?'},{sender_type:'guest',content:'Is it open?'}];
assert.equal(informationEvidence({message:'Do I need a reservation?',history,hotelId:'h',knowledge:rows}).confirmed,false);
assert.equal(informationEvidence({message:'Please bring a pillow.',history,hotelId:'h',knowledge:rows}),null);
const input={...conversation,hotelProfile:hotel,guest,tickets:[ticket],messages:[{sender_type:'guest',content:'I no longer need it.'}],hotelKnowledge:rows};
const original=structuredClone(input),draft=buildConversationCopilot(input).suggestedReply;
assert.deepEqual(input,original);assert(draft.draft);assert.equal(writes,0);
console.log('PASS missing/conflicting/inactive/foreign Knowledge and bounded information followups; Inbox remains read-only');

assert.equal(assertsAvailability('Check-in time does not guarantee your room is ready.'),false);
assert.equal(assertsAvailability('Your room is ready.'),true);
assert.equal(assertsAvailability('We cannot guarantee your room is ready. Your booking is confirmed.'),true);
console.log('PASS evaluator distinguishes a bounded negated guarantee without exempting other affirmative claims');
