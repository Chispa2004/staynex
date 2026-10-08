import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateReceiptReply,receiptFacts,safeReceiptReply,sanitizeReceiptReply} from '../shared/guest-service/receipt-reply.js';
import {finalizeServiceReply} from '../shared/guest-service/quality.js';
import {interpretOperationalRequest} from '../shared/guest-service/operational-request.js';
import {captureFinalOutput} from './fixtures/guest-service-quality/final-output-harness.js';
const ticket={id:'t',hotel_id:'a',guest_id:'g',conversation_id:'c',status:'open',room_number:'209',
  category:'housekeeping',priority:'normal',description:'Necesito dos toallas',request_context:{request_key:'towels'}};
const args={hotelId:'a',guestId:'g',conversationId:'c',language:'es',ticket,
  operationalRequest:{status:'recorded',ticket,sourceMessageId:'m'},message:'Dos toallas, por favor.',
  context:{recentMessages:[{hotel_id:'a',sender_type:'guest',content:'Dos toallas'},{hotel_id:'b',content:'SECRET B'}]}};
let calls=0;
const complete=async payload=>{calls++;assert(!JSON.stringify(payload).includes('SECRET B'));assert.equal(payload.facts.room,'209');
  return {reply:'¡Claro! Ya tenemos tu solicitud de dos toallas para la habitación 209.'};};
const receipt=await generateReceiptReply(args,complete);
assert.equal(calls,1);assert(receipt);
const final=(patch={})=>finalizeServiceReply({...args,primary:{reply:'He avisado a mantenimiento'},receiptReply:receipt,...patch});
assert.equal(final().reply,receipt.reply);assert.equal(final().service_quality.notification_confirmed,false);
for(const patch of [{hotelId:'b'},{guestId:'other'},{conversationId:'other'},{operationalRequest:{status:'unconfirmed'}}]){
  assert.equal(receiptFacts({...args,...patch}),null);assert.equal(await generateReceiptReply({...args,...patch},complete),null);
}
assert.equal(calls,1);assert.notEqual(final({receiptReply:{...receipt,sourceMessageId:'old'}}).reply,receipt.reply);
assert.notEqual(final({receiptReply:{...receipt,hotelId:'b'}}).reply,receipt.reply);
console.log('PASS recorded reply: scoped committed evidence before generation, foreign/stale receipt and history isolation');
for(const reply of ['Ya hemos avisado a mantenimiento.','Ya van de camino.','Te enviaremos novedades.','We will bring them shortly.',
  'La factura está emitida.','Hemos encontrado el objeto.','Tu reserva está confirmada.','Estamos atendiendo la incidencia.','La incidencia está resuelta.']){
  assert.equal(safeReceiptReply(reply,receiptFacts(args),'es'),false,reply);
  assert.equal(await generateReceiptReply(args,async()=>({reply})),null);
}
for(const [status,reply] of [['in_progress','Estamos atendiendo la incidencia.'],['completed','Hemos completado esta petición.']]){
  const updated={...args,ticket:{...ticket,status},operationalRequest:{...args.operationalRequest,ticket:{...ticket,status}}};
  assert(await generateReceiptReply(updated,async()=>({reply})));
}
for(const status of ['closed','cancelled'])assert.equal(safeReceiptReply('La incidencia está resuelta.',{...receiptFacts(args),status}),false);
assert.equal(await generateReceiptReply(args,async()=>{throw Error('provider timeout')}),null);
assert.equal(final({receiptReply:null}).service_quality.request_status,'recorded');
assert.doesNotMatch(final({receiptReply:null}).reply,/actuación|avisado|camino/);
assert.doesNotMatch(final({ticket:null,operationalRequest:{status:'unconfirmed'}}).reply,/ya tenemos|hemos recibido/i);
console.log('PASS no dispatch, ETA, outcome or availability invented; actual in-progress/completed distinct; provider failure preserves receipt');
for(const [message,key] of [['Necesito una cuna, tiene nueve meses','cot'],['Solicito factura','invoice'],['Quisiera un traslado','airport_transfer']]){
  assert.equal(interpretOperationalRequest({message,aiResponse:{create_ticket:true}}).key,key);
  assert.equal(interpretOperationalRequest({message:'Estos son los detalles solicitados',aiResponse:{create_ticket:true,ticket:{title:message}}}).key,key);
}
assert.equal(interpretOperationalRequest({message:'¿A qué hora es el desayuno?',aiResponse:{create_ticket:true}}),null);
assert.notEqual(interpretOperationalRequest({message:'Necesito dos toallas'}).key,interpretOperationalRequest({message:'El aire acondicionado pierde agua'}).key);
console.log('PASS useful bounded keys preserve details/follow-up deduplication and independent requests; information needs no ticket');

// Every real output is retained, including discarded action claims. Replay the
// complete finalizer against the committed disposable-PostgreSQL receipts.
const evaluation=JSON.parse(fs.readFileSync(new URL('./fixtures/guest-service-quality/natural-evaluation.json',import.meta.url)));
const results=[];
for(const row of evaluation){
  const c=row.input,primary={...row.raw.find(r=>r.path==='primary').output,ai_provider:'openai',fallback_used:false};
  const input={primary,ticket:row.outcome.ticket,operationalRequest:row.outcome,hotel:c.hotel,
    hotelId:c.hotel.id,guestId:c.guest.id,conversationId:c.conversation.id,language:'es',message:c.message,
    knownRoom:c.conversationContext.knownRoom,context:{...c.conversationContext,hotelKnowledge:c.hotelKnowledge}};
  const receiptReply=await generateReceiptReply(input,async()=>row.receipt?.output);
  const final=finalizeServiceReply({...input,receiptReply});results.push({...row,final});
  assert.doesNotMatch(final.reply,/actuación todavía|estamos gestion|gestion está en curso|en proceso de atención|informaremos|entregadas pronto/i,row.id);
  if(row.outcome.status==='recorded'){
    assert.equal(final.service_quality.ticket_id,row.outcome.ticket.id);
    assert.equal(final.service_quality.notification_confirmed,false);
    assert.doesNotMatch(final.reply,/¿[^?]*(?:edad|fechas completas|habitación).*\?/i);
  }
  if(c.key==='breakfast')assert.equal(final.service_quality.request_status,'not_requested');
  if(c.id==='2-transfer'){assert.equal(row.outcome.status,'not_requested');assert.match(final.reply,/No ofrecemos ese traslado/);assert.doesNotMatch(final.reply,/reserva.*confirmada/);}
  if(c.key==='night'&&row.round===2){assert.match(final.reply,/habitación.*confirmación/);assert(final.reply.length<250);}
  if(row.round===2&&row.outcome.status==='recorded'&&c.key!=='return'){
    const first=evaluation.find(r=>r.round===1&&r.id===row.id);assert.equal(row.outcome.ticket.id,first.outcome.ticket.id,'follow-up must reuse committed ticket');
  }
}
assert.equal(evaluation.flatMap(r=>r.raw).length,72);assert.equal(evaluation.filter(r=>r.receipt).length,23);
assert.equal(new Set(results.filter(r=>r.outcome.ticket).map(r=>r.outcome.ticket.id)).size,12);
console.log('PASS 95 real generations: 72 primary/Concierge + 23 post-commit; all 36 final turns, two hotel policies, 12 SQL tickets and follow-up reuse');

const ack='Hemos registrado la incidencia';
for(const claim of ['Estamos gestionándolo.','La gestión está en curso.','Por ahora está en curso la gestión de esta petición.','La reserva está en proceso.','Estamos gestionándola.']){
  assert.equal(sanitizeReceiptReply(ack+'. '+claim,receiptFacts(args),'es'),ack+'.');
}
assert.equal(sanitizeReceiptReply(ack+' y está en proceso de atención.',receiptFacts(args),'es'),ack+'.');
console.log('PASS observed unsupported progress removed without removing the saved acknowledgement');

let composed=0;
const specimen=evaluation.find(r=>r.round===1&&r.id==='1-towels');
const natural='Ya tenemos la solicitud de dos toallas.';
const delivered=await captureFinalOutput(specimen.input,specimen.raw.find(r=>r.path==='primary').output,{composeReceipt:async input=>{
  composed++;assert.equal(input.operationalRequest.status,'recorded');assert(input.ticket.id);
  return generateReceiptReply(input,async()=>({reply:natural}));
}});
assert(!delivered.error,delivered.error);assert.equal(composed,1);
assert.equal(delivered.calls.find(c=>c.kind==='message').values.content,natural);
assert.equal(delivered.calls.find(c=>c.kind==='transport').values.body,natural);
assert(delivered.calls.findIndex(c=>c.kind==='ticket')<delivered.calls.findIndex(c=>c.kind==='message'));
console.log('PASS production finalization persists and transports the post-commit reply unchanged; only controlled transport used');

// Unfavorable first public-demo batch: preserve the raw promise as a regression.
const unsupported='El equipo encargado lo revisará a la mayor brevedad posible.';
assert.equal(safeReceiptReply(unsupported,receiptFacts(args),'es'),false);
assert.equal(sanitizeReceiptReply(ack+'. '+unsupported,receiptFacts(args),'es'),ack+'.');
const transfer=evaluation.find(r=>r.round===1&&r.id==='1-transfer');
const ct=transfer.input, ot=transfer.outcome;
const transferArgs={primary:{reply:'Por favor confirme el día y hora de llegada.',ai_provider:'openai',confidence:.9},ticket:ot.ticket,operationalRequest:ot,
 hotel:ct.hotel,hotelId:ct.hotel.id,guestId:ct.guest.id,conversationId:ct.conversation.id,language:'es',message:ct.message,
 context:{...ct.conversationContext,hotelKnowledge:ct.hotelKnowledge}};
const reply=await generateReceiptReply(transferArgs,async()=>({reply:'Hemos recibido su solicitud de traslado para dos adultos. ¿Podría indicarnos la fecha y hora aproximada de llegada?'}));
const missing=finalizeServiceReply({...transferArgs,receiptReply:reply});
assert.match(missing.reply,/vuelo.*hora/);assert.doesNotMatch(missing.reply,/indicar.*fecha/);
const provided=finalizeServiceReply({...transferArgs,message:'Llegamos en el vuelo DEMO123 a las 18:00. ¿Queda reservado?',receiptReply:reply});
assert.doesNotMatch(provided.reply,/¿.*(?:vuelo|hora).*\?/);assert.match(provided.reply,/traslado está por confirmar/);
const {buildArrivalBookingContext,groundedArrivalReply}=await import('../shared/guest-service/arrival-booking.js');
const arrival=evaluation.find(r=>r.round===1&&r.id==='1-night').input;
const travel=buildArrivalBookingContext(arrival);
assert(groundedArrivalReply('Puede acceder por la entrada principal; recepción abre 24 horas. No se garantiza disponibilidad anticipada de habitación antes de las 15:00.',travel,arrival.message));
assert(!groundedArrivalReply('La habitación estará lista a las 00:30. Recepción abre 24 horas en la entrada principal.',travel,arrival.message));
console.log('PASS observed future staff promise, known-date/missing-flight question, explicit unconfirmed outcome and negative room guarantee');

const {breakfastTimeFollowup}=await import('../shared/guest-service/quality.js');
for(const n of [1,2]){const c=evaluation.find(r=>r.round===2&&r.id===n+'-breakfast').input;
 const reply=breakfastTimeFollowup({message:c.message,context:{...c.conversationContext,hotelKnowledge:c.hotelKnowledge},hotelId:c.hotel.id});
 assert.match(reply,/10:15/);assert.match(reply,n===1?/10:30/:/11:00/);assert.doesNotMatch(reply,/piscina|recepci/);
 assert.equal(breakfastTimeFollowup({message:'Necesito ayuda, no puedo bajar a las 10:15',context:{...c.conversationContext,hotelKnowledge:c.hotelKnowledge},hotelId:c.hotel.id}),null);
 assert.equal(breakfastTimeFollowup({message:c.message,context:{...c.conversationContext,hotelKnowledge:c.hotelKnowledge},hotelId:'foreign'}),null);
}
console.log('PASS breakfast time-only follow-up uses only the authorized window, without inventing another amenity or referral');

for(const line of ['La confirmación depende del equipo de recepción, le recomendamos verificar directamente con ellos.','Por favor, pregunte en recepción para confirmar la reserva de su traslado.'])assert.equal(safeReceiptReply(line,receiptFacts(args),'es'),false);
for(const [id,question] of [['1-towels','¿Desea que sean entregadas en alguna hora específica?'],['1-leak','¿Desea que le proporcionemos toallas extra mientras se soluciona el problema?'],['1-invoice','¿Podría proporcionarnos el número de habitación para localizar su estancia anterior?']]) {
 const r=evaluation.find(x=>x.round===2&&x.id===id),c=r.input;
 const a={primary:{reply:question},ticket:r.outcome.ticket,operationalRequest:r.outcome,hotelId:c.hotel.id,guestId:c.guest.id,conversationId:c.conversation.id,language:'es',message:c.message,context:{...c.conversationContext,hotelKnowledge:c.hotelKnowledge}};
 const receiptReply=await generateReceiptReply(a,async()=>({reply:'Hemos registrado su solicitud. '+question}));
 assert.doesNotMatch(finalizeServiceReply({...a,receiptReply}).reply,/¿/);
}
console.log('PASS observed redundant reception referrals, delivery scheduling, unrelated offers and repeat stay identification removed');

const {selectRelevantTicket,serviceTurn,ticketReplyPlan}=await import('../shared/guest-service/ticket-context.js');
const {recordOperationalRequest}=await import('../src/services/operational-request.service.js');
const {buildConversationCopilot}=await import('../dashboard/lib/ai-copilot.js');
const followup='Las dos son de baño. ¿Tenéis la petición?';
assert.equal(serviceTurn(followup).kind,'clarification');
const scopedTicket={...ticket,title:'Dos toallas',description:'Dos toallas, por favor.',request_context:{request_key:'towels',source_message_id:'first'}};
const selection={tickets:[scopedTicket],hotelId:'a',guestId:'g',conversationId:'c',message:followup,sourceMessageId:'followup'};
assert.equal(selectRelevantTicket(selection).ticket.id,'t');
assert.equal(selectRelevantTicket({...selection,hotelId:'b'}).ticket,null);
assert.equal(selectRelevantTicket({...selection,coverage:'error'}).status,'unavailable');
const another={...scopedTicket,id:'t2',title:'Fuga',description:'Fuga',request_context:{request_key:'water_leak'}};
assert.equal(selectRelevantTicket({...selection,tickets:[scopedTicket,another],message:'¿Alguna novedad?'}).status,'ambiguous');
assert.equal(selectRelevantTicket({...selection,tickets:[scopedTicket,another],receipts:[{hotel_id:'a',ticket_id:'t',source_message_id:'followup'}]}).ticket.id,'t');
let writeCalls=0,current=structuredClone(scopedTicket),failDetail=false;
const readonlyClient={from:()=>{const filters={};const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q;},single:async()=>({data:Object.entries(filters).every(([k,v])=>current[k]===v)?current:null})};return q;},rpc:async(name,p)=>{
  writeCalls++;if(!failDetail)current={...current,description:current.description+'\n'+followup,request_context:{...current.request_context,last_source_message_id:p.p_message_id}};
  return {data:{ticket:current,source_message_id:p.p_message_id,target_ticket_enforced:true}};
}};
const operation={hotel:{id:'a'},guest:{id:'g'},conversation:{id:'c'},sourceMessage:{id:'followup',hotel_id:'a',conversation_id:'c',sender_type:'guest'},message:followup,
 context:{operationalContext:{hotel_id:'a',guest_id:'g',conversation_id:'c',known_room:'209'},tickets:[scopedTicket],serviceCapabilities:{requestRecording:true}},aiResponse:{create_ticket:false},client:readonlyClient};
failDetail=true;assert.equal((await recordOperationalRequest(operation)).status,'unconfirmed');
failDetail=false;const clarified=await recordOperationalRequest(operation);assert.equal(clarified.ticket.id,'t');assert.equal(clarified.detailConfirmed,true);assert(current.description.includes(followup));
const receiptInput={...args,message:followup,ticket:current,operationalRequest:clarified};
let payload;
const warm=await generateReceiptReply(receiptInput,async input=>{payload=input;return {reply:'¡Sí, la tenemos! Dos toallas de baño.'};});
assert.equal(payload.turn.kind,'clarification');assert.equal(payload.facts.detail_confirmed,true);
assert.equal(finalizeServiceReply({...receiptInput,primary:{reply:'¿En qué habitación?'},receiptReply:warm}).reply,'¡Sí, la tenemos! Dos toallas de baño.');
assert.equal(safeReceiptReply('Hemos añadido ese detalle.',{...receiptFacts(args),detail_confirmed:false}),false);
for(const status of ['open','in_progress','completed']){
 current={...current,status};const beforeWrites=writeCalls;
 const observed=await recordOperationalRequest({...operation,message:'¿Alguna novedad?',context:{...operation.context,tickets:[current]}});
 assert.equal(observed.status,'observed');assert.equal(writeCalls,beforeWrites);assert.equal(observed.ticket.status,status);
 const plan=ticketReplyPlan({ticket:current,message:'¿Alguna novedad?'});
 assert.match(plan.text,({open:/no consta/,in_progress:/ocupando/,completed:/completado/})[status]);
}
const conversation={id:'c',hotel_id:'a',guest_id:'g',guest:{id:'g',hotel_id:'a',preferred_language:'es'},ticketCoverage:'ready',
 messages:[{id:'followup',sender_type:'guest',content:followup}],tickets:[{...current,status:'open',priority:'high'}]};
const insights=buildConversationCopilot(conversation);
assert.equal(insights.priority.level,'high');assert.equal(insights.priority.source,'ticket');assert.equal(insights.priority.confidence,null);
assert.equal(insights.suggestedReply.ticketId,'t');assert.match(insights.suggestedReply.text,/añadido/);
assert.equal(buildConversationCopilot({...conversation,ticketCoverage:'error'}).suggestedReply.text,'');
assert.equal(buildConversationCopilot({...conversation,tickets:[scopedTicket,another],messages:[{sender_type:'guest',content:'Any update?'}]}).ticketContext.status,'ambiguous');
assert.equal(writeCalls,2,'read-only progress and copilot must not write');
console.log('PASS contextual followup: persisted clarification before acknowledgement, scoped/ambiguous tickets, progress without writes, official priority and unavailable draft');

assert.equal(sanitizeReceiptReply('Tenemos su petición.',receiptFacts(args),'en'),null);
assert.equal(safeReceiptReply('We will keep you informed.',receiptFacts(args),'en'),false);
assert.equal(safeReceiptReply('Allow us some time to arrange it.',receiptFacts(args),'en'),false);
assert(groundedArrivalReply('Recepción abre 24 horas; acceda por la entrada principal. La habitación puede no estar lista antes del check-in a las 15:00.',travel,arrival.message));
assert(!groundedArrivalReply('Recepción abre 24 horas; acceda por la entrada principal. Su habitación estará lista a las 00:30.',travel,arrival.message));
const noRoom=ticketReplyPlan({ticket:{...scopedTicket,room_number:null,category:'housekeeping'},message:'Can I have clean towels?',language:'en'});
assert.match(noRoom.text,/Which room/);assert.doesNotMatch(noRoom.text,/209/);
const transferOutcome=evaluation.find(r=>r.round===2&&r.id==='1-transfer').outcome;
const pendingOnce=finalizeServiceReply({...transferArgs,message:'¿Queda reservado?',ticket:transferOutcome.ticket,operationalRequest:transferOutcome,
 receiptReply:{reply:'Tenemos su solicitud. Actualmente no podemos confirmar la reserva del traslado.',ticketId:transferOutcome.ticket.id,hotelId:ct.hotel.id,guestId:ct.guest.id,conversationId:ct.conversation.id,sourceMessageId:transferOutcome.sourceMessageId,status:transferOutcome.ticket.status}});
assert.equal((pendingOnce.reply.match(/confirmar/g)||[]).length,1,'do not append the same uncertainty twice');
console.log('PASS observed language mismatch, future-update promise, known room, negative arrival guarantee and duplicate uncertainty regressions');

const contextEvaluation=JSON.parse(fs.readFileSync(new URL('./fixtures/guest-service-quality/contextual-evaluation.json',import.meta.url),'utf8'));
assert.equal(contextEvaluation.rows.length,34);
assert.equal(contextEvaluation.receiptIterations.reduce((n,r)=>n+r.outputs.length,0),125);
let contextualPaths=0;
for(const row of contextEvaluation.rows){
 const c=row.input,o=row.outcome;
 const a={ticket:o.ticket,operationalRequest:o,hotelId:c.hotel.id,guestId:c.guest.id,conversationId:c.conversation.id,
   message:c.message,language:c.conversationContext.language,knownRoom:c.conversationContext.knownRoom,hotel:c.hotel,context:{...c.conversationContext,hotelKnowledge:c.hotelKnowledge}};
 const postCommit=await generateReceiptReply(a,async()=>row.receipt?.output);
 for(const raw of row.raw){
  const p=row.raw.find(r=>r.path==='primary').output;
  const primary={...p,reply:raw.path==='primary'?p.reply:raw.output.suggested_response};
  const f=finalizeServiceReply({...a,primary,receiptReply:postCommit});contextualPaths++;
  assert(f.reply.length>0);assert.equal(f.service_quality.notification_confirmed,false);
  assert.doesNotMatch(f.reply,/QA-417.*QB-628|will check|are checking|verificaremos|de camino|on their way/i);
  if(c.key==='clarification'){assert.equal(o.status,'recorded');assert(o.ticket.description.includes(c.message));assert.match(f.reply,/sí|yes/i);}
  if(c.key==='progress'){assert.equal(o.status,'observed');assert.match(f.reply,/no consta|no further update/i);}
  if(c.key==='inprogress'){assert.equal(o.ticket.status,'in_progress');assert.match(f.reply,/atendiendo|attending|working on/i);}
  if(c.key==='completed'){assert.equal(o.ticket.status,'completed');assert.match(f.reply,/hemos completado|we.ve completed/i);}
  if(c.key==='failure'){assert.equal(o.status,'unconfirmed');assert.equal(f.service_quality.ticket_id,null);assert.match(f.reply,/no he podido confirmar|could not confirm/i);}
  if(c.key==='multiple'){assert.equal(o.status,'ambiguous');assert.match(f.reply,/qué petición|which request/i);}
  if(c.key==='ambiguous'){assert.equal(o.ticket.room_number,null);assert.match(f.reply,/habitación|which room/i);assert.doesNotMatch(f.reply,/QA-417|QB-628/);}
  if(c.id==='2-return'){for(const fact of ['10%','2026-11-01','2026-11-30','2026-09-01','2026-10-31','Non-combinable','availability'])assert(f.reply.includes(fact),fact);}
 }
}
assert.equal(contextualPaths,68);
assert.equal(serviceTurn('Es la factura de la estancia completa a mi nombre. ¿Ya está emitida?').kind,'clarification');
const initialDetails='Seríamos dos adultos. Quiero una nueva reserva.';
assert.doesNotMatch(ticketReplyPlan({ticket:{...scopedTicket,description:initialDetails,request_context:{request_key:'new_booking'}},message:initialDetails,detailConfirmed:true}).text,/añadido/);
console.log('PASS 193 retained real synthetic generations: 34 contexts / 68 final routes; clarification, no-update, completed, failure, ambiguity, distinct policies and all promotion conditions');
