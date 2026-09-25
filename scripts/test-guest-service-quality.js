import assert from 'node:assert/strict';import fs from 'node:fs';
import * as quality from '../shared/guest-service/quality.js';
import {buildStaynexUserPrompt} from '../src/prompts/staynex.prompt.js';
import {evaluationCases} from './fixtures/guest-service-quality/cases.js';
import {buildConversationCopilot} from '../dashboard/lib/ai-copilot.js';
const logger={info(){},warn(){},error(){}};
const load=(file,bindings,names)=>new Function(...Object.keys(bindings),fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replaceAll('export const ','const ').replaceAll('export class ','class ')+'\nreturn {'+names.join(',')+'};')(...Object.values(bindings));
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
await test('Two hotels: prompt facts, language, known room, history and scoped knowledge remain distinct',()=>{
 const a=evaluationCases[0],b=evaluationCases[8];
 for(const c of [a,b]){const other=c===a?b:a;const text=buildStaynexUserPrompt({...c,hotelKnowledge:[...c.hotelKnowledge,...other.hotelKnowledge]});assert.ok(text.includes(c.guest.current_room));assert.ok(text.includes(c.hotelKnowledge[0].value));assert.ok(!text.includes(other.hotelKnowledge[0].value));assert.ok(text.includes(c.conversationContext.recentMessages[0].content));assert.ok(text.includes(c.conversationContext.language));assert.ok(!text.includes('reservation_access_token'));}
 assert.equal(quality.serviceContext({...a,conversationContext:{...a.conversationContext,reservation:b.conversationContext.reservation}}).reservation,null);
 assert.equal(quality.serviceContext({...a,conversationContext:{...a.conversationContext,reservationAmbiguous:true}}).reservation,null);
 assert.equal(quality.serviceContext({...a,conversationContext:{}}).request_recording,false);
});
await test('Reservation lookup refuses ambiguity and scopes every read to hotel and guest',async()=>{
 const rows=[{id:'a1',hotel_id:'a',guest_id:'g'},{id:'b1',hotel_id:'b',guest_id:'g'}],seen=[];
 const client={from(){const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},then(resolve){seen.push(filters);return Promise.resolve({data:rows.filter(r=>filters.every(([k,v])=>r[k]===v)),error:null}).then(resolve);}};return q;}};
 const {getLatestReservationForGuest}=load('src/services/reservation.service.js',{getSupabase:()=>client,logger},['getLatestReservationForGuest']);
 assert.equal((await getLatestReservationForGuest({hotelId:'a',guestId:'g',requireUnambiguous:true})).id,'a1');rows.push({id:'a2',hotel_id:'a',guest_id:'g'});assert.equal(await getLatestReservationForGuest({hotelId:'a',guestId:'g',requireUnambiguous:true}),null);assert.ok(seen.every(f=>f.some(([k,v])=>k==='hotel_id'&&v==='a')));
});
const pipeline=fs.readFileSync(new URL('../src/services/staynex.service.js',import.meta.url),'utf8');
const start=pipeline.indexOf('  let ticket = await createTicketFromAiResponse('),end=pipeline.indexOf('  const previousLastProviderExperience',start);
const actualFinalBody=pipeline.slice(start,end)+'\nreturn {ticket,aiMessage,response:aiResponseWithUpsell};';
async function execute({fail=false,available=true,foreign=false,reply='Necesito que revisen el ruido que continúa.',emergency=false}={}){
 const calls=[],primary={intent:'complaint',confidence:.95,reply,create_ticket:available,ticket:{category:'complaint',title:'Ruido persistente A-204',description:'No cesa después del primer mensaje; habitación A-204.',priority:'high'},ai_provider:'openai',fallback_used:false,emergency};
 const {createTicketFromAiResponse}=load('src/services/ticket.service.js',{createTicketRecord:async values=>{calls.push({type:'ticket',values});if(fail)throw Error('Synthetic write failure');return {id:'ticket',hotel_id:foreign?'b':values.hotelId,guest_id:values.guestId,conversation_id:values.conversationId};}},['createTicketFromAiResponse']);
 const bindings={...quality,finalOfferSuppression:{suppress:false},humanEscalation:{humanReason:null},smarterResponse:{metadata:{}},createTicketFromAiResponse,createUpsellInterestTicket:async()=>{throw Error('Unexpected upsell');},createOperationalTicketForConciergeRisk:async()=>null,createMessage:async v=>{calls.push({type:'message',values:v});return v;},rawAiResponse:primary,aiResponseWithUpsell:{...primary,reply:'Voy a avisar a recepción.'},activeHotel:{id:'a'},guest:{id:'g',current_room:'A-204'},conversation:{id:'c'},conversationContext:{language:'es'},upsellInterest:null,enhancedRisk:{hasRisk:false},providerExperienceOwnsResponse:false,experienceBookingIntent:{detected:false},experienceBookingRequest:null,message:'Noise continues'};
 const run=new Function(...Object.keys(bindings),'return (async()=>{'+actualFinalBody+'})()');
 try{return {result:await run(...Object.values(bindings)),calls};}catch(error){return {error,calls};}
}
await test('Actual final pipeline records request then confirms only scoped persistence, not notification or execution',async()=>{
 const {result,calls}=await execute();assert.equal(calls[0].type,'ticket');assert.equal(calls[1].type,'message');assert.equal(calls[0].values.roomNumber,'A-204');assert.equal(result.response.service_quality.request_status,'recorded');assert.equal(result.response.service_quality.notification_confirmed,false);assert.equal(result.response.reply,quality.serviceCopy('es').saved);assert.ok(result.response.reply.includes('pendiente de confirmación'));
});
await test('Failed registration prevents AI message/success; retry succeeds through the same production body',async()=>{
 const failed=await execute({fail:true});assert.ok(failed.error);assert.deepEqual(failed.calls.map(c=>c.type),['ticket']);const retry=await execute();assert.equal(retry.result.response.service_quality.request_status,'recorded');
});
await test('Absent capability and foreign receipt never certify a recorded request; unsupported promises are removed',async()=>{
 for(const args of [{available:false},{foreign:true}]){const {result}=await execute({...args,reply:'He avisado a mantenimiento y he registrado la solicitud.'});assert.equal(result.response.service_quality.request_status,'not_recorded');assert.ok(!quality.hasUnverifiedActionClaim(result.response.reply));}
});
await test('Immediate safety guidance survives while unsupported dispatch promises cannot become evidence',async()=>{
 const {result}=await execute({emergency:true,reply:'Avisaré al equipo.'});assert.ok(result.response.reply.startsWith(quality.serviceCopy('es').urgent));assert.equal(result.response.emergency,true);
});
await test('Informational answers are not replaced by generic handoffs; languages and provider workflow ownership persist',()=>{
 for(const language of ['es','en','fr','de','it','pt']){const primary={reply:'A factual answer',confidence:.95,ai_provider:'openai'};assert.equal(quality.finalizeServiceReply({primary,processed:{reply:'generic'},language}).reply,'A factual answer');}
 const processed={reply:'Provider receipt'};assert.equal(quality.finalizeServiceReply({primary:{},processed,providerOwned:true}),processed);
});
await test('Inbox drafts retain human control, known room and previously supplied details without claiming action',()=>{
 const conversation={guest:{current_room:'A-204',preferred_language:'es'},messages:[{sender_type:'guest',content:'Hay ruido en el pasillo',original_language:'es'}],aiState:{state_metadata:{conversation_ai_mode:'human_takeover'}}};
 const before=structuredClone(conversation);const result=buildConversationCopilot(conversation);assert.deepEqual(conversation,before);assert.equal(result.suggestedReply.draft,true);assert.ok(!quality.hasUnverifiedActionClaim(result.suggestedReply.text));assert.ok(!result.suggestedReply.text.includes('habitación'));
 const draft=quality.buildServiceDraft({message:'¿Está confirmada la cuna?',language:'es',history:[{sender_type:'guest',content:'Mi bebé tiene 9 meses'}]});assert.ok(!draft.text.includes('edad'));
});
await test('Receipt retains only useful missing questions and never repeats known room, dates or age',()=>{
 assert.equal(quality.missingServiceQuestion('¿Qué edad tiene el bebé?',{}),'¿Qué edad tiene el bebé?');
 for(const question of ['¿En qué habitación estás?','¿Qué fechas necesitas?','¿Qué edad tiene el bebé?','¿Cuáles son tus datos completos?'])assert.equal(quality.missingServiceQuestion(question,{knownRoom:'A-204',reservation:{arrival_date:'2026-10-10',departure_date:'2026-10-14'},message:'Mi bebé tiene 9 meses'}),null);
});
await test('Unavailable recording capability overrides model and mock proposals, without claiming an internal action',()=>{
 const proposal={reply:'I need the baby’s age.',create_ticket:true,ticket:{category:'housekeeping',title:'Cot',description:'Cot requested',priority:'normal'}};
 const blocked=quality.applyServiceCapabilities(proposal,{serviceCapabilities:{requestRecording:false}});
 assert.equal(blocked.create_ticket,false);assert.deepEqual(blocked.ticket,{category:null,title:null,description:null,priority:null});assert.equal(blocked.reply,proposal.reply);
 assert.equal(quality.applyServiceCapabilities(proposal,{serviceCapabilities:{requestRecording:true}}),proposal);
});
await test('A check-in policy never certifies a ready room; fiscal/contact data are not requested without a workflow',()=>{
 const primary={reply:'La habitación estará lista a partir de las 15:00. Puede esperar en áreas comunes.',confidence:.95,ai_provider:'openai'};
 const result=quality.finalizeServiceReply({primary,hotel:{check_in_time:'15:00'},language:'es'});
 assert.ok(result.reply.includes('15:00'));assert.ok(result.reply.includes('todavía no hay una actuación confirmada'));assert.ok(!result.reply.includes('áreas comunes'));
 assert.equal(quality.missingServiceQuestion('¿Puede indicarnos sus datos fiscales?'),null);
});
await test('Final presentation preserves offer suppression, explicit human handoff and repair decisions',()=>{
 const primary={reply:'A tempting model offer',confidence:.99,ai_provider:'openai',upsell_opportunity:true};
 const processed={reply:'Offer suppressed; a detail needs confirmation.',escalate_to_human:true};
 assert.equal(quality.finalizeServiceReply({primary,processed}).reply,processed.reply);
 assert.equal(quality.finalizeServiceReply({primary:{...primary,upsell_opportunity:false},processed,preferPrimary:false}).reply,processed.reply);
 assert.equal(quality.finalizeServiceReply({primary,processed}).escalate_to_human,true);
});
await test('Missing hotel knowledge never falls back to another hotel; AC drafts use known room',()=>{
 const c=evaluationCases[0];const text=buildStaynexUserPrompt({...c,hotelKnowledge:evaluationCases[8].hotelKnowledge});
 assert.ok(text.includes('No hay informacion adicional del hotel disponible.'));assert.ok(!text.includes('North room'));
 const draft=quality.buildServiceDraft({message:'El aire acondicionado no funciona',room:'A-204',language:'es'});
 assert.equal(draft.text,quality.serviceCopy('es').pending);assert.equal(draft.draft,true);
});
await test('Optional Concierge uses the same scoped capabilities and facts; handoff templates cannot claim dispatch',()=>{
 const {buildPromptPayload}=load('src/services/openai-concierge.service.js',{...quality,isGuestMemoryEnabled:()=>false},['buildPromptPayload']);
 const a=evaluationCases[0], b=evaluationCases[8];
 const payload=buildPromptPayload({...a,hotelKnowledge:[...a.hotelKnowledge,...b.hotelKnowledge],conversationContext:{...a.conversationContext,reservation:b.conversationContext.reservation}});
 assert.equal(payload.reservation,null);assert.equal(payload.service_capabilities.request_recording,true);
 assert.equal(payload.hotel_knowledge.length,a.hotelKnowledge.length);assert.ok(!JSON.stringify(payload).includes('North room'));
 for(const reply of ['Voy a derivar esto a recepción para ayudarte mejor','I will arrange delivery','Enviamos las toallas enseguida']){
  const output=quality.finalizeServiceReply({primary:{reply},language:'es'});assert.equal(output.reply,quality.serviceCopy('es').pending);
 }
});
await test('Publicly observed cot follow-up: written age is used without editing the historical conversation',()=>{
 const conversation={guest:{preferred_language:'es'},messages:[{sender_type:'guest',content:'Viajamos con un bebé y necesitamos una cuna.'},{sender_type:'guest',content:'Tiene nueve meses. ¿La cuna ya está confirmada?',original_language:'es'}]};
 const original=structuredClone(conversation);const result=buildConversationCopilot(conversation);
 assert.equal(result.suggestedReply.text,quality.serviceCopy('es').pending);assert.deepEqual(conversation,original);
 for(const age of ['9 meses','nueve meses','nine months','neuf mois','neun Monate','nove mesi','nove meses'])assert.equal(quality.hasKnownChildAge(age),true,age);
 for(const missing of ['¿Cuántos meses tiene?','a baby','necesito una cuna'])assert.equal(quality.hasKnownChildAge(missing),false,missing);
 assert.equal(quality.missingServiceQuestion('¿Qué edad tiene el bebé?',{message:'Tiene nueve meses.'}),null);
});
console.log(`${passed} guest service quality behavior groups passed; no remote/provider calls`);
