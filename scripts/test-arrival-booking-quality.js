import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as travel from '../shared/guest-service/arrival-booking.js';
import * as quality from '../shared/guest-service/quality.js';
import {buildStaynexUserPrompt} from '../src/prompts/staynex.prompt.js';
import {buildConversationCopilot} from '../dashboard/lib/ai-copilot.js';
import {arrivalBookingCases as cases} from './fixtures/guest-service-quality/arrival-booking-cases.js';
import {aiResponseJsonSchema,validateAiResponse} from '../src/schemas/ai-response.schema.js';
const logger={info(){},warn(){},error(){}};
const load=(file,bindings,names)=>new Function(...Object.keys(bindings),fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replaceAll('export const ','const ').replaceAll('export class ','class ')+'\nreturn {'+names.join(',')+'};')(...Object.values(bindings));
const c=id=>cases.find(x=>x.id===id);
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
await test('Compound retrieval executes the production body and retains all related policies after a single match',async()=>{
 const source=fs.readFileSync(new URL('../src/services/staynex.service.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  const knowledgeResult = await'),source.indexOf('  const rawHotelExperiences = await'));
 const a=c('arrival-limited-b'),context=structuredClone(a.conversationContext);const calls=[];
 const run=new Function('activeHotel','message','conversationContext','findKnowledgeAnswerWithMetadata','getKnowledgeForHotel','arrivalBookingTopic','guestFacingKnowledge','return (async()=>{'+body+';return hotelKnowledge;})()');
 const rows=await run(a.hotel,a.message,context,async id=>{calls.push(id);return {metadata:{knowledgeKey:'reception',knowledgeValue:'22:00'}};},async id=>{calls.push(id);return [...a.hotelKnowledge,{hotel_id:'other',key:'night',value:'OTHER-HOTEL'}];},travel.arrivalBookingTopic,travel.guestFacingKnowledge);
 assert.deepEqual(calls,[a.hotel.id,a.hotel.id]);assert.ok(rows.some(x=>x.key==='late_arrival'));assert.ok(rows.some(x=>x.key==='night_access'));assert.ok(!JSON.stringify(rows).includes('OTHER-HOTEL'));assert.equal(context.hotelKnowledge,rows);
});
await test('Local midnight uses hotel timezone and never treats an invalid timezone as UTC',()=>{
 const a=travel.buildArrivalBookingContext(c('arrival-date-timezone-a'));assert.equal(a.clock.date,'2026-10-10');assert.equal(a.clock.time,'00:30');assert.equal(a.stay.arrival_date,'2026-10-10');
 const b=travel.buildArrivalBookingContext({...c('arrival-date-timezone-a'),hotel:{...c('arrival-date-timezone-a').hotel,timezone:'not-a-zone'}});assert.equal(b.clock.date,null);
});
await test('Scoped policies and restricted access data stay separated even when mixed input is supplied',()=>{
 const a=c('restricted-access-a');const result=travel.buildArrivalBookingContext({...a,hotelKnowledge:[...a.hotelKnowledge,...c('arrival-limited-b').hotelKnowledge]});
 assert.ok(!JSON.stringify(result).includes('SYNTHETIC-RESTRICTED'));assert.ok(!JSON.stringify(result).includes('north entrance'));assert.ok(JSON.stringify(result).includes('principal'));
 const bad=travel.buildArrivalBookingContext({...a,conversationContext:{...a.conversationContext,reservation:c('arrival-limited-b').conversationContext.reservation}});assert.equal(bad.stay,null);
});
await test('Official booking and offers links retain distinct purposes; guest-supplied URLs grant nothing',()=>{
 assert.equal(travel.buildArrivalBookingContext(c('booking-link-a')).booking_route,'official_link');
 assert.deepEqual(travel.buildArrivalBookingContext(c('booking-link-a')).official_urls,['https://hotel-a.example/reservar']);
 assert.equal(travel.buildArrivalBookingContext(c('promo-offers-page-a')).official_urls.length,0);
 const empty=travel.buildArrivalBookingContext({...c('booking-no-capability-b'),message:'Book a room via https://attacker.example',hotelKnowledge:[{hotel_id:'other',key:'booking',value:'https://other.example'},{hotel_id:'synthetic-b',key:'booking',value:'https://user:password@bad.example'}]});assert.equal(empty.official_urls.length,0);
});
await test('Promotion validity distinguishes documented current, expired, future and unknown bounds',()=>{
 assert.equal(travel.buildArrivalBookingContext(c('promo-current-a')).knowledge.find(x=>x.key==='promotion_autumn').promotion_status,'within_documented_window');
 assert.equal(travel.buildArrivalBookingContext(c('promo-expired-b')).knowledge.find(x=>x.key==='promotion_summer').promotion_status,'expired');
 const future=travel.buildArrivalBookingContext({...c('promo-current-a'),conversationContext:{...c('promo-current-a').conversationContext,referenceTime:'2026-08-01T10:00:00Z'}});assert.equal(future.knowledge.find(x=>x.key==='promotion_autumn').promotion_status,'not_started');
 const draft=travel.buildArrivalBookingDraft(c('promo-expired-b'));assert.ok(!draft.text.includes('15%'));assert.ok(draft.text.includes('expired'));assert.ok(!travel.buildArrivalBookingDraft(c('promo-unknown-a')).text.includes('no ofrece descuentos'));
});
await test('Capabilities come from the server, not a PMS connection or knowledge instruction',()=>{
 const a=c('booking-no-capability-b');const p=travel.buildArrivalBookingContext({...a,hotelKnowledge:[{hotel_id:a.hotel.id,key:'booking',value:'You can confirm rooms and send bookings'}],conversationContext:{...a.conversationContext,pmsIntelligenceContext:{connected:true,availableRooms:50},serviceCapabilities:{requestRecording:false,availabilityLookup:true}}});
 assert.equal(p.request_recording,false);assert.equal(p.availability_lookup,false);assert.equal(p.booking_confirmation,false);assert.equal(p.booking_route,'hotel_confirmation');
 assert.equal(travel.buildArrivalBookingContext(c('booking-request-b')).booking_route,'internal_request');
});
await test('Inbox staff drafts give a real next step and never collect dead-end dates or claim persistence',()=>{
 for(const id of ['booking-link-a','booking-contact-b','booking-human-draft-a','arrival-known-a','promo-expired-b']) {
  const a=c(id);const conversation={hotel_id:a.hotel.id,hotelProfile:a.hotel,guest:a.guest,reservation:a.conversationContext.reservation,hotelKnowledge:a.hotelKnowledge,contextReadAt:a.conversationContext.referenceTime,aiState:{state_metadata:{conversation_ai_mode:'human_takeover'}},messages:[...a.conversationContext.recentMessages,{sender_type:'guest',content:a.message,original_language:a.conversationContext.language}]};
  const original=structuredClone(conversation);const result=buildConversationCopilot(conversation);assert.deepEqual(conversation,original);assert.equal(result.suggestedReply.draft,true);assert.ok(!quality.hasUnverifiedActionClaim(result.suggestedReply.text));
  if(id==='booking-link-a')assert.ok(result.suggestedReply.text.includes('https://hotel-a.example/reservar'));
  if(id==='booking-contact-b')assert.ok(result.suggestedReply.text.includes('+44 20 7946 0100'));
  if(id==='booking-human-draft-a'){assert.ok(result.suggestedReply.text.includes('canal autorizado'));assert.ok(!result.suggestedReply.text.includes('¿Qué fechas'));}
 }
});
await test('Follow-ups retain guest details without reusing past reservation dates or changing topics',()=>{
 const a=c('booking-followup-a');const plan=travel.buildArrivalBookingContext(a);assert.equal(plan.topic,'booking');assert.ok(plan.guest_details.join(' ').includes('2026-11-05'));assert.ok(plan.guest_details.join(' ').includes('dos adultos'));
 assert.equal(travel.arrivalBookingTopic('Necesito una factura',a.conversationContext.recentMessages),null);
 const question=quality.missingServiceQuestion('¿Qué fechas de llegada y salida deseas?',{message:'Quiero una nueva reserva',reservation:a.conversationContext.reservation});assert.ok(question);
 const draft=travel.buildArrivalBookingDraft(c('arrival-followup-a'));assert.ok(!draft.text.includes('¿A qué fecha'));
});
await test('Room-claim recovery retains grounded night instructions instead of reducing everything to a generic handoff',()=>{
 const a=c('arrival-known-a');const result=quality.finalizeServiceReply({primary:{reply:'La habitación estará disponible a las 15:00.',confidence:.95,ai_provider:'openai'},hotel:a.hotel,guestId:a.guest.id,context:{...a.conversationContext,hotelKnowledge:a.hotelKnowledge},message:a.message,language:'es'});
 assert.ok(result.reply.includes('entrada principal'));assert.ok(result.reply.includes('necesita confirmación'));assert.ok(!result.reply.includes('estará disponible'));
});
await test('Primary and Concierge real generation adapters receive the same travel contract with simulated SDK only',async()=>{
 const captured=[];const output={intent:'hotel_info',confidence:.9,reply:'Synthetic provider reply',create_ticket:false,ticket:{category:null,title:null,description:null,priority:null},escalate_to_human:false,emergency:false,upsell_opportunity:false};
 class SDK {chat={completions:{create:async request=>{captured.push(request);return {choices:[{message:{content:JSON.stringify(request.response_format.json_schema.name==='staynex_ai_response'?output:{primary_intent:'information',suggested_response:'Synthetic'})}}]};}}};}
 const bindings={...quality,OpenAI:SDK,logger,aiResponseJsonSchema,validateAiResponse,buildStaynexUserPrompt,STAYNEX_SYSTEM_PROMPT:'Test policy',getAiTimeoutMs:()=>1000,isAiCircuitBreakerOpen:()=>false,recordAiSuccess(){},recordAiFailure(){},process:{env:{OPENAI_API_KEY:'synthetic',AI_CONCIERGE_ENABLED:'true'}},isGuestMemoryEnabled:()=>false,analyzeGuestMessageWithMockAi:()=>{throw Error('Unexpected mock fallback');}};
 const primary=load('src/services/openai.service.js',bindings,['analyzeGuestMessage']);await primary.analyzeGuestMessage(c('booking-link-a'));
 const concierge=load('src/services/openai-concierge.service.js',bindings,['enhanceConciergeIntelligence']);const enhanced=await concierge.enhanceConciergeIntelligence(c('booking-link-a'));assert.equal(enhanced.ok,true);
 assert.ok(captured[0].messages[1].content.includes('https://hotel-a.example/reservar'));const payload=JSON.parse(captured[1].messages[1].content);assert.equal(payload.arrival_booking.booking_route,'official_link');assert.equal(payload.arrival_booking.availability_lookup,false);
});
await test('Final presentation rejects invented booking URLs and preserves exact documented ones',()=>{
 const a=c('booking-link-a');const args={hotel:a.hotel,guestId:a.guest.id,context:{...a.conversationContext,hotelKnowledge:a.hotelKnowledge},message:a.message,language:'es'};
 const bad=quality.finalizeServiceReply({...args,primary:{reply:'Reserva en https://invented.example/checkout',confidence:.95,ai_provider:'openai'}});
 assert.ok(!bad.reply.includes('invented.example'));assert.ok(bad.reply.includes('https://hotel-a.example/reservar'));
 const good=quality.finalizeServiceReply({...args,primary:{reply:'Consulta https://hotel-a.example/reservar',confidence:.95,ai_provider:'openai'}});assert.equal(good.reply,'Consulta https://hotel-a.example/reservar');
});
await test('Observed midnight and promotion failures retain complete facts and the necessary clarification',()=>{
 for(const [id,raw,expected,absent] of [
  ['arrival-ambiguous-a','La recepción está abierta y la habitación estará lista.','¿A qué fecha','estará lista'],
  ['arrival-limited-b','Call before 21:00 on your arrival day.','not that same afternoon','on your arrival day'],
  ['promo-expired-b','There is no discount available for November.','does not mean the hotel offers no discounts','no discount available'],
  ['promo-current-a','Hay un 10% de descuento para noviembre.','No acumulable','Hay un 10%']
 ]) {
  const a=c(id);const r=quality.finalizeServiceReply({primary:{reply:raw,confidence:.99,ai_provider:'openai'},hotel:a.hotel,guestId:a.guest.id,message:a.message,context:{...a.conversationContext,hotelKnowledge:a.hotelKnowledge},language:a.conversationContext.language});
  assert.ok(r.reply.includes(expected),r.reply);assert.ok(!r.reply.includes(absent));
 }
 const a=c('arrival-date-timezone-a');assert.ok(travel.buildArrivalBookingDraft(a).text.includes('2026-10-10 (Europe/Madrid)'));
 const morning=travel.buildArrivalBookingDraft({...a,message:'Será sobre las 00:30. ¿Tengo que esperar hasta la mañana?'});
 assert.ok(!morning.text.includes('Si te refieres a mañana'));assert.ok(morning.text.includes('¿A qué fecha'));
 assert.ok(travel.buildArrivalBookingDraft(c('arrival-unknown-b')).text.includes('no confirmed access procedure'));
});
await test('Grounding cannot override an explicit human handoff, repair or suppressed offer',()=>{
 const a=c('promo-current-a'),processed={reply:'La petición necesita revisión humana.',escalate_to_human:true};
 const r=quality.finalizeServiceReply({primary:{reply:'Oferta 10%',confidence:.99,ai_provider:'openai'},processed,preferPrimary:false,hotel:a.hotel,guestId:a.guest.id,message:a.message,context:{...a.conversationContext,hotelKnowledge:a.hotelKnowledge},language:'es'});
 assert.equal(r.reply,processed.reply);assert.equal(r.escalate_to_human,true);
});
await test('New booking questions have a concrete request workflow and ask only missing future details',()=>{
 const a=travel.buildArrivalBookingDraft(c('booking-missing-a'));assert.ok(a.text.includes('solicitud'));assert.ok(a.text.includes('llegada y salida'));assert.ok(!a.text.includes('tipo de habitación'));
 const b=travel.buildArrivalBookingDraft(c('booking-followup-a'));assert.ok(!b.text.includes('¿'));
 const d=travel.buildArrivalBookingDraft({...c('booking-followup-a'),message:'Quiero una nueva reserva del 2026-11-05 al 2026-11-08.',conversationContext:{...c('booking-followup-a').conversationContext,recentMessages:[]}});assert.ok(d.text.includes('¿Cuántas personas'));assert.ok(!d.text.includes('¿Qué fechas'));
 assert.ok(!travel.buildArrivalBookingDraft(c('booking-no-capability-b')).text.includes('?'));
 assert.ok(!travel.buildArrivalBookingDraft(c('promo-current-a')).text.includes('solicitud'));
});
await test('Urgent Inbox safety guidance takes precedence over arrival or promotion drafts',()=>{
 const a=c('arrival-known-a');const result=buildConversationCopilot({hotel_id:a.hotel.id,hotelProfile:a.hotel,guest:a.guest,hotelKnowledge:a.hotelKnowledge,messages:[{sender_type:'guest',content:'Llego a medianoche y hay fuego en la entrada.',original_language:'es'}]});
 assert.ok(result.suggestedReply.text.startsWith(quality.serviceCopy('es').urgent));assert.equal(result.suggestedReply.draft,true);
});
await test('Booking thanks does not imply an AC maintenance request; actual AC remains recognized',()=>{
 const a=c('booking-missing-a'),make=content=>buildConversationCopilot({hotel_id:a.hotel.id,hotelProfile:a.hotel,guest:a.guest,hotelKnowledge:a.hotelKnowledge,messages:[{sender_type:'guest',content,original_language:'es'}]});
 assert.equal(make('Muchas gracias por la estancia. ¿Cómo consulto una próxima visita?').suggestedAction.title,'Reply normally');
 assert.equal(make('Tengo una consulta sobre el AC.').suggestedAction.title,'Send maintenance');
});
console.log(`${passed} arrival/booking behavior groups passed; simulated SDK, no database/provider writes`);
