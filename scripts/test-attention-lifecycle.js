import assert from 'node:assert/strict';
import {attentionSelection,mergeTicketVersion,validTicketOperation} from '../shared/attention-lifecycle.js';
import {demoTicketProvenance,ticketInDemoScope} from '../shared/demo-ticket-scope.js';
import {CHECKIN_DEMO_HOTEL_ID} from '../shared/checkin-demo-view.js';
import {ticketReplyPlan,serviceTurn} from '../shared/guest-service/ticket-context.js';
import {generateReceiptReply} from '../shared/guest-service/receipt-reply.js';
import {finalizeServiceReply} from '../shared/guest-service/quality.js';
const rows=new Map(['a','b','c'].map(id=>[id,{messageId:id,status:'pending',version:1}]));
const groups=[{ticketId:'t',title:'Toallas',status:'completed',messageIds:['a','b']}];
assert.deepEqual(attentionSelection(['a'],rows,groups,'resolved'),['a','b']);
assert.deepEqual(attentionSelection(['c'],rows,groups,'resolved'),['c']);
assert.throws(()=>attentionSelection(['a'],rows,[{...groups[0],status:'open'}],'resolved'),/actuación/);
assert.throws(()=>attentionSelection(['a'],new Map([['a',rows.get('a')]]),groups,'resolved'),/Faltan/);
assert.deepEqual(attentionSelection(['a'],rows,[{...groups[0],status:'open'}],'pending'),['a']);
console.log('PASS complete receipt group selection, independent information, incomplete scope and pending action');
const current={id:'t',hotel_id:'h',status:'completed',status_version:3};
for(const next of [{...current,status:'open',status_version:2},{...current,hotel_id:'foreign',status_version:4},{...current,status_version:undefined}])assert.equal(mergeTicketVersion(current,next),current);
assert.equal(mergeTicketVersion(current,{...current,status:'open',status_version:4}).status,'open');
assert.equal(validTicketOperation({status:'completed'}),false);
console.log('PASS late realtime/response cannot revert confirmed revision; unversioned request rejected');
const hotel={id:CHECKIN_DEMO_HOTEL_ID,slug:'hotel-demo-checkin'},ticket={id:'t',hotel_id:hotel.id,conversation_id:'c',guest_id:'g',status:'open'};
const context={hotel,conversations:[{id:'c',hotel_id:hotel.id,guest_id:'g',status:'closed'}],messages:[{id:'m',hotel_id:hotel.id,conversation_id:'c',metadata:{demo:true,fixture:'staynex_message_stages_v1'}}],receipts:[{hotel_id:hotel.id,ticket_id:'t',source_message_id:'m'}]};
assert.equal(demoTicketProvenance(ticket,context),'history');
assert.equal(ticketInDemoScope({...ticket,demoProvenance:'history'}),false);
assert.equal(ticketInDemoScope({...ticket,demoProvenance:'history'},'history'),true);
for(const c of [{...context,receipts:[]},{...context,messages:[{...context.messages[0],conversation_id:'other'}]},{...context,messages:[{...context.messages[0],metadata:{fixture:'unknown',demo:true}}]}])assert.equal(demoTicketProvenance(ticket,c),'review');
assert.equal(ticketInDemoScope({...ticket,demoProvenance:'review'}),true);
assert.equal(demoTicketProvenance(ticket,{...context,hotel:{...hotel,id:'real-hotel'}}),'operational');
assert.equal(ticketInDemoScope({...ticket,demoProvenance:'operational'}),true);
console.log('PASS proven demo edition only; ambiguity visible, closed real-hotel tickets retained');
for(const language of ['es','en']) {
 const message=language==='es'?'Sigue sin funcionar el wifi; quiero hablar con una persona.':'The Wi-Fi is still not working. I want to speak with a person.';
 const linked={id:'t',hotel_id:'a',guest_id:'g',conversation_id:'c',status:'open',description:message,request_context:{request_key:'wifi_support'}};
 const args={ticket:linked,hotelId:'a',guestId:'g',conversationId:'c',language,message,operationalRequest:{status:'observed',ticket:linked}};
 assert(serviceTurn(message).human);assert.equal(ticketReplyPlan(args).turn.kind,'human_request');
 const rejected=await generateReceiptReply(args,async()=>({reply:language==='es'?'Hemos recibido su mensaje y tomamos nota de su atención personalizada.':'We will notify a person immediately.'}));assert.equal(rejected,null);
 const final=finalizeServiceReply({...args,receiptReply:rejected,primary:{reply:'Persona avisada'}});
 assert.match(final.reply,language==='es'?/Claro.*persona/:/Of course.*person/);assert.doesNotMatch(final.reply,/atención personalizada|avisad|notify|tomamos nota/);
 assert.equal(final.service_quality.notification_confirmed,false);
 const completed={...linked,status:'completed'};
 const follow=finalizeServiceReply({...args,ticket:completed,message:language==='es'?'Sigue sin funcionar el wifi.':'The Wi-Fi is still not working.',operationalRequest:{status:'observed',ticket:completed}});
 assert.match(follow.reply,language==='es'?/necesita revisión/:/needs review/);
}
console.log('PASS human-request natural fallback and final output, no dispatch claim; unresolved followup does not assert fixed');

const {readFileSync}=await import('node:fs');
const evaluation=JSON.parse(readFileSync(new URL('./fixtures/attention-lifecycle-evaluation.json',import.meta.url),'utf8'));
let replayed=0;
for(const round of evaluation.rounds)for(const row of round.rows){
 const c=row.input;let final;
 if(c.args){const receiptReply=await generateReceiptReply(c.args,async()=>row.raw.output);final=finalizeServiceReply({...c.args,receiptReply});
 assert.equal(final.service_quality.notification_confirmed,false);
 assert.doesNotMatch(final.reply,/entregadas|vamos a|pronto|tomamos nota|atención personalizada|aquí para ayudarte/i);
 if(c.kind==='unresolved')assert.match(final.reply,/necesita revisión/);
 if(c.kind.startsWith('human'))assert.match(final.reply,/tenemos tu petición/i);
 if(c.kind==='done')assert.match(final.reply,/completado/);
 }else{const i=c.input;final=finalizeServiceReply({primary:{...row.raw.output,ai_provider:'openai'},message:i.message,hotelId:i.hotel.id,hotel:i.hotel,context:{...i.conversationContext,hotelKnowledge:i.hotelKnowledge},operationalRequest:{status:'not_requested'}});
 for(const fact of c.id.startsWith('a')?['07:00','09:30','incluido']:['08:30','11:00','14 EUR'])assert(final.reply.includes(fact));
 assert.doesNotMatch(final.reply,c.id.startsWith('a')?/14 EUR|08:30/:/07:00|09:30/);
 }
 assert.equal(final.reply,row.final.reply);replayed++;
}
assert.equal(replayed,28);
console.log('PASS 28 real synthetic generations retained and replayed through final output: 2 policies, unfavorable results, no fabricated delivery, context-aware human replies');
// Actual loader must page on the real composite-key source column, not a nonexistent receipt id.
const {scopeDemoTickets}=await import('../dashboard/lib/demo-ticket-scope.js');
const longMessages=Array.from({length:501},(_,n)=>({id:'s'+n,hotel_id:hotel.id,conversation_id:'c',metadata:{demo:true,fixture:'staynex_message_stages_v1'}}));
const data={conversations:context.conversations,messages:longMessages,operational_request_receipts:longMessages.map(m=>({source_message_id:m.id,hotel_id:hotel.id,ticket_id:'t'}))};
const db={from(table){let key;const query={select(){return query},eq(k,v){assert.equal(k,'hotel_id');assert.equal(v,hotel.id);return query},order(k){key=k;assert.equal(k,table==='operational_request_receipts'?'source_message_id':'id');return query},range(a,b){return Promise.resolve({data:[...data[table]].sort((x,y)=>x[key].localeCompare(y[key])).slice(a,b+1)})}};return query}};
assert.equal((await scopeDemoTickets({supabase:db,hotel,tickets:[ticket]})).length,0);
assert.equal((await scopeDemoTickets({supabase:db,hotel,tickets:[ticket],scope:'history'}))[0].demoProvenance,'history');
console.log('PASS actual demo loader pages 501 receipt sources using the verified catalog key');
