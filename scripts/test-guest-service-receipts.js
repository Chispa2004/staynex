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
for(const [status,reply] of [['in_progress','Estamos atendiendo la incidencia.'],['completed','La incidencia está resuelta.']]){
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
