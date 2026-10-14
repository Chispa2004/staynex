import assert from 'node:assert/strict';
import fs from 'node:fs';
import {explicitArrivalDate} from '../shared/guest-service/arrival-details.js';
import {buildArrivalBookingContext,buildArrivalBookingDraft,arrivalBookingTopic,groundedArrivalReply} from '../shared/guest-service/arrival-booking.js';
import {finalizeServiceReply} from '../shared/guest-service/quality.js';
import {generateReceiptReply} from '../shared/guest-service/receipt-reply.js';
import {ticketReplyPlan} from '../shared/guest-service/ticket-context.js';
import {buildConversationCopilot} from '../dashboard/lib/ai-copilot.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/guest-service-quality/fresh-service-evaluation.json',import.meta.url)));
const hotel={id:'synthetic-b',timezone:'Europe/Madrid'},guest={id:'guest-b',hotel_id:hotel.id,preferred_language:'en'};
const hotelKnowledge=fixture.hotels.b.knowledge.map(([key,value])=>({hotel_id:hotel.id,key,value}));
const reservation={id:'stay-b',hotel_id:hotel.id,guest_id:guest.id,arrival_date:'2026-11-08',departure_date:'2026-11-10'};
const first='I arrive at 00:50 on November 8. How do I enter?';
const base={hotel,guest,hotelKnowledge,message:first,conversationContext:{reservation,language:'en',recentMessages:[]}};
const draft=overrides=>buildArrivalBookingDraft({...base,...overrides}).text;
let groups=0;
function test(name,fn){fn();groups++;console.log('PASS '+name);}
test('Named ES/EN and ISO dates are validated, bounded and never invented from booking alone',()=>{
 for(const date of ['November 8','8 de noviembre','2026-11-08'])assert.equal(explicitArrivalDate(date,'2026-11-08').date,'2026-11-08');
 assert.equal(explicitArrivalDate('November 9','2026-11-08').date,null);
 assert.equal(explicitArrivalDate('2026-02-30').label,null);
 assert.equal(explicitArrivalDate('November 31').label,null);
 assert(explicitArrivalDate('November 8 or November 9').ambiguous);
 assert.equal(explicitArrivalDate('at 00:50','2026-11-08').date,null);
});
test('D02 uses known date/time, useful conditioned entrance first, one room explanation',()=>{
 const text=draft();
 assert(text.startsWith('For your 00:50 arrival: Late arrival must be arranged'));
 for(const fact of ['20:00','7 November','00:50','06:00','21:00','side entrance','only after','8 November','16:30'])assert(text.includes(fact),text);
 assert.doesNotMatch(text,/\?|Hotel information|No room readiness is guaranteed/);
 assert.equal((text.match(/Building access/g)||[]).length,1);
});
test('D02 room and booking-date followups retain arrival context and do not repeat policy',()=>{
 const recentMessages=[{hotel_id:hotel.id,sender_type:'guest',content:first}];
 for(const message of ['Does an open entrance mean my room is ready?','My booked arrival date is November 8.']){
  const text=draft({message,conversationContext:{...base.conversationContext,recentMessages}});
  if(message.startsWith('Does'))assert.match(text,/Building access does not confirm room availability/);
  else assert.match(text,/Your 00:50 arrival/);
  assert.match(text,/before check-in at 16:30 on 8 November/);
  assert.doesNotMatch(text,/\?|20:00|Late arrival must/);
  recentMessages.push({sender_type:'guest',content:message});
 }
 assert.equal(arrivalBookingTopic('I need an invoice',recentMessages),null);
 const es=draft({message:'¿Entonces podemos entrar ya en la habitación a esa hora?',conversationContext:{...base.conversationContext,language:'es',recentMessages}});
 assert(es.length<250);assert.doesNotMatch(es,/20:00|21:00/);
});
test('Missing/invalid/ambiguous date asks why, previous-day stay is not labelled early',()=>{
 for(const message of ['I arrive at 00:50. How do I enter?','I arrive at 00:50 on November 31.','I arrive on November 8 or November 9 at 00:50.'])assert.match(draft({message}),/Which calendar date.*booked check-in/);
 const text=draft({conversationContext:{...base.conversationContext,reservation:{...reservation,arrival_date:'7 November'}}});
 assert.doesNotMatch(text,/your arrival is before check-in/);assert.match(text,/does not confirm room/);
 assert.doesNotMatch(draft({message:'Llego el 8 de noviembre a las 00:50.',conversationContext:{...base.conversationContext,language:'es'}}),/¿A qué fecha/);
});
test('Reported prior coordination is acknowledged conditionally, never promoted to verified access',()=>{
 const text=draft({message:'The hotel already confirmed arrangements for my arrival at 00:50 on November 8. How do I enter?'});
 assert.match(text,/If the confirmed instructions cover this arrival/);assert.match(text,/cannot verify/);
 assert.doesNotMatch(text,/must be arranged|we.have confirmed|use the side entrance/i);
});
test('Missing/conflicting/private/foreign access evidence cannot grant an entrance',()=>{
 for(const rows of [[],[...hotelKnowledge,{hotel_id:hotel.id,key:'night_access',value:'Use the main entrance without confirmation.'}],[{hotel_id:'foreign',key:'night_access',value:'Use the main entrance.'}]]){
  const text=draft({hotelKnowledge:rows});assert.match(text,/no confirmed access procedure|instructions conflict/);assert.doesNotMatch(text,/side entrance|Use the main entrance/);
 }
 assert.doesNotMatch(draft({hotelKnowledge:[...hotelKnowledge,{hotel_id:hotel.id,key:'security',value:'Door code PRIVATE-1234'}]}),/PRIVATE/);
 const foreign=buildArrivalBookingContext({...base,conversationContext:{...base.conversationContext,reservation:{...reservation,hotel_id:'foreign'},recentMessages:[{hotel_id:'foreign',sender_type:'guest',content:'I arrive 2026-10-01 at 00:30'}]}});
 assert.equal(foreign.stay,null);assert(!JSON.stringify(foreign).includes('2026-10-01'));
});
test('Final guard replaces fabricated room readiness and redundant date questions; Inbox stays read-only',()=>{
 for(const raw of ['Your room is ready.','Use the side entrance after confirmation before 20:00 the previous evening. Which calendar date is that arrival?']){
  const r=finalizeServiceReply({hotel,guestId:guest.id,message:first,language:'en',context:{...base.conversationContext,hotelKnowledge},primary:{reply:raw,confidence:.99,ai_provider:'openai'}});
  assert.match(r.reply,/before check-in/);assert.doesNotMatch(r.reply,/Which calendar date|Your room is ready/);
 }
 const input={hotel_id:hotel.id,hotelProfile:hotel,guest,reservation,hotelKnowledge,messages:[{sender_type:'guest',content:first,original_language:'en'}]};
 const snapshot=structuredClone(input),r=buildConversationCopilot(input);
 assert.deepEqual(input,snapshot);assert.equal(r.suggestedReply.draft,true);assert.doesNotMatch(r.suggestedReply.text,/Which calendar date/);
});
test('Quantity names the persisted subject, progress obeys each state, no detail readback means no receipt',()=>{
 const ticket={status:'open',description:'Two towels. Make it three.',request_context:{request_key:'towels',last_source_message_id:'m'}};
 assert.equal(ticketReplyPlan({ticket,message:'Make it three.',language:'en',detailConfirmed:true}).text,'Thanks, we’ve updated your request to 3 towels.');
 assert.match(ticketReplyPlan({ticket,message:'Mejor tres.',detailConfirmed:true}).text,/3 toallas/);
 assert.match(ticketReplyPlan({ticket,message:'Make it one.',language:'en',detailConfirmed:true}).text,/1 towel\./);
 assert.doesNotMatch(ticketReplyPlan({ticket,message:'Make it three.',language:'en'}).text,/updated/);
 for(const [status,match] of [['open',/still pending/],['pending',/still pending/],['in_progress',/working/],['completed',/completed/],['closed',/closed/],['cancelled',/closed/]]) {
  const text=ticketReplyPlan({ticket:{...ticket,status},message:'Any news?',language:'en'}).text;
  assert.match(text,match);if(!['open','pending'].includes(status))assert.doesNotMatch(text,/pending/);
 }
});
console.log(`${groups} arrival/turn context behavior groups passed; no provider or database transport`);

const persisted={id:'t',hotel_id:'h',guest_id:'g',conversation_id:'c',status:'open',description:'Two towels. Make it three.',request_context:{request_key:'towels',last_source_message_id:'m'}};
const receiptArgs={hotelId:'h',guestId:'g',conversationId:'c',ticket:persisted,message:'Make it three.',language:'en',operationalRequest:{status:'recorded',ticket:persisted,sourceMessageId:'m'}};
for(const text of ['We’ve noted the change to 3.','We’ve updated your request to five towels.'])assert.equal(await generateReceiptReply(receiptArgs,async()=>({reply:text})),null);
assert.equal((await generateReceiptReply(receiptArgs,async()=>({reply:'Thanks, we’ve updated your request to three towels.'}))).reply,'Thanks, we’ve updated your request to three towels.');
const notSaved={...persisted,description:'Two towels.'};
assert.equal(await generateReceiptReply({...receiptArgs,ticket:notSaved,operationalRequest:{status:'recorded',ticket:notSaved}},async()=>({reply:'We’ve updated your request to three towels.'})),null);
console.log('PASS post-commit wording: changed item and quantity required, natural complete acknowledgement retained, no receipt without readback');

assert.equal(await generateReceiptReply({...receiptArgs,ticket:notSaved,operationalRequest:{status:'recorded',ticket:notSaved}},async()=>({reply:'Updated your request to three towels.'})),null);

// Long documented instructions are not discarded just because they exceed a
// presentation threshold. This is a safety regression, not a style benchmark.
const longInstructions='Late arrival must be arranged before 20:00 on the previous evening. Use the side entrance only after confirmation. '+
 'Follow the pedestrian signs from the parking area to the garden path. Stay on the marked path alongside the building. At the end of the path the entrance is identified by the hotel sign. Keep the pedestrian route clear for other guests. Do not follow the vehicle route through the loading area. If the entrance is obstructed, do not try another door without instructions from the hotel. The access instructions apply only to the confirmed arrival arrangement. Keep the confirmation available so that you can check which entrance it covers. If the confirmation names a different entrance, ask the hotel to resolve that discrepancy before travelling. Early room access requires separate confirmation.';
assert(longInstructions.split(/\s+/).length>110);
assert(groundedArrivalReply(longInstructions,{...buildArrivalBookingContext(base),knowledge:[{value:longInstructions}]},first));
console.log('PASS documented access instructions above 110 words retain their relevant conditions');
