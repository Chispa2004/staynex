// Meaning and evidence used by the guest reply and the read-only staff draft.
// Text can select a topic, never manufacture a ticket or an execution outcome.
export const normalizeServiceText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const requestTopics=[
  ['cot','reception',/cuna|\bcot\b|crib|lit bebe|babybett/],
  ['invoice','reception',/factura|invoice|rechnung|facture|fatura/],
  ['airport_transfer','reception',/traslado|transfer|shuttle/],
  ['new_booking','reception',/nueva (?:reserva|estancia)|proxima (?:reserva|estancia)|new (?:booking|reservation)|next stay/],
  ['air_conditioning','maintenance',/aire acondicionado|air condition|climatis|klimaanlage|aria condizion|ar condicionado/],
  ['water_leak','maintenance',/fuga|gote|inund|water leak|leaking|fuite|wasseraustritt|perdita d.acqua/],
  ['towels','housekeeping',/toallas?|towels?|serviettes?|handtuch|handtucher|asciugaman|toalhas?/],
  ['cleaning','housekeeping',/limpiez|limpiar|clean (?:my |the )?room|nettoy|reinig|pulizi|limpeza/],
  ['noise','complaint',/ruido|noise|bruit|larm|rumore|barulho/],
  ['lost_property','reception',/olvid|perdid|lost|left (?:my|a|the)|oublie|verlor|dimentic|esquec/]
];
export const requestTopic=message=>requestTopics.find(([, ,pattern])=>pattern.test(normalizeServiceText(message)))?.[0]||null;
export function serviceTurn(message='') {
  const text=normalizeServiceText(message);
  const receipt=/teneis|tienen (?:mi|la)|lo teneis|lo habeis (?:anotado|apuntado)|have (?:you|we)|do you have|did you (?:get|receive)|got (?:it|my)|is (?:my|the) request/.test(text);
  const progress=/novedad|como (?:va|esta)|ya (?:esta|han)|sigue|todavia|aun |confirmad|reservad|emitid|encontrad|terminad|hecho|actualizaci|news|update|progress|ready|finished|done|confirmed|booked|issued|found|still|status/.test(text);
  const clarification=/\b(?:son de|las dos|los dos|ambas|ambos|me refiero|en concreto|era una?|es (?:una?|la|el)|el numero|a nombre|para toda|llegamos en|ser[ií]amos|both|all (?:two|three|four|five|six|seven|eight|nine|ten|[0-9]+)|i mean|to clarify|specifically|they are|it's a|it is a|flight is|our flight|for the whole|the name is)\b/.test(text);
  const newIncident=/\b(?:otra incidencia|otro problema|nueva peticion|new issue|different problem|another request)\b/.test(text);
  return {kind:clarification?'clarification':receipt?'receipt':progress?'progress':'initial',receipt,progress,clarification,newIncident,topic:requestTopic(message)};
}

export function selectRelevantTicket({tickets=[],receipts=[],hotelId,guestId,conversationId,message,history=[],sourceMessageId,coverage='ready'}) {
  if(coverage!=='ready')return {status:'unavailable',ticket:null,candidates:[]};
  const scoped=tickets.filter(t=>t.hotel_id===hotelId && t.guest_id===guestId && t.conversation_id===conversationId);
  const exact=scoped.filter(t=>sourceMessageId && (receipts.some(r=>r.hotel_id===hotelId && r.source_message_id===sourceMessageId && r.ticket_id===t.id)
    || [t.request_context?.source_message_id,t.request_context?.last_source_message_id].includes(sourceMessageId)));
  if(exact.length===1)return {status:'selected',ticket:exact[0],candidates:exact,relation:'source_message'};
  const turn=serviceTurn(message);
  if(turn.newIncident)return {status:'none',ticket:null,candidates:[]};
  let candidates=scoped.filter(t=>turn.topic && (t.request_context?.request_key===turn.topic || requestTopic(t.title+' '+t.description)===turn.topic));
  // A follow-up with a pronoun is usable only with one scoped candidate. Do not
  // choose "latest" when several requests could be meant.
  if(!turn.topic && turn.kind!=='initial')candidates=scoped;
  if(candidates.length===1 && (turn.kind!=='initial' || exact.length))return {status:'selected',ticket:candidates[0],candidates,relation:'followup'};
  if(candidates.length>1)return {status:'ambiguous',ticket:null,candidates};
  return {status:'none',ticket:null,candidates:[]};
}

export function detailIsPersisted(ticket,message) {
  const detail=normalizeServiceText(message);
  return detail.length>0 && normalizeServiceText(ticket?.description).includes(detail);
}

export function ticketTurn(ticket,message) {
  const turn=serviceTurn(message);
  // Supplying the first actionable details creates an initial request even if
  // the sentence is grammatically a clarification of an earlier information query.
  if(turn.clarification && !ticket?.request_context?.last_source_message_id
    && normalizeServiceText(ticket?.description)===normalizeServiceText(message))return {...turn,kind:'initial',clarification:false};
  return turn;
}

export function ticketReplyPlan({ticket,message,language='es',detailConfirmed=false}) {
  const turn=ticketTurn(ticket,message), status=ticket?.status;
  const en=language.startsWith('en');
  if(!['es','en'].includes(language.slice(0,2)))return null;
  if(status==='completed')return {turn,...{text:en?'We’ve completed this request.':'Hemos completado esta petición.'}};
  if(status==='in_progress')return {turn,text:en?'We’re working on it.':'Nos estamos ocupando de ello.'};
  if(['closed','cancelled','canceled'].includes(status))return {turn,text:en?'This request is closed; that does not confirm it was completed.':'Esta petición está cerrada; no consta por ello que se haya completado.'};
  if(!['open','pending'].includes(status))return {turn,text:en?'I can’t confirm the current status of this request.':'No puedo confirmar ahora el estado de esta petición.'};
  if(turn.clarification)return {turn,text:detailConfirmed
    ? turn.receipt ? en?'Yes, we have it! We’ve added that detail.':'¡Sí, la tenemos! Hemos añadido ese detalle.' : en?'Thanks, we’ve added that detail.':'Gracias, hemos añadido ese detalle.'
    : en?'We have your request, but I can’t confirm that this detail has been added yet.':'Tenemos tu petición, pero aún no puedo confirmar que ese detalle se haya incorporado.'};
  if(turn.progress)return {turn,text:en?'We have it, but there’s no further update recorded yet.':'La tenemos, pero todavía no consta ninguna novedad.'};
  if(turn.receipt)return {turn,text:en?'Yes, we have it!':'¡Sí, la tenemos!'};
  const topic=ticket.request_context?.request_key||requestTopic(message);
  const labels=en?{cot:'a cot',invoice:'an invoice',airport_transfer:'an airport transfer',new_booking:'a new booking',air_conditioning:'the air conditioning issue',water_leak:'the leak',towels:'towels',cleaning:'room cleaning',noise:'the noise',lost_property:'the lost item'}:{cot:'una cuna',invoice:'la factura',airport_transfer:'el traslado',new_booking:'una nueva reserva',air_conditioning:'la incidencia del aire acondicionado',water_leak:'la fuga',towels:'toallas',cleaning:'limpieza',noise:'el ruido',lost_property:'el objeto perdido'};
  const subject=labels[topic] ? (en?` about ${labels[topic]}`:` sobre ${labels[topic]}`):'';
  const room=ticket.room_number ? (en?` for room ${ticket.room_number}`:` para la habitación ${ticket.room_number}`):'';
  if(['air_conditioning','water_leak'].includes(topic) && /fuga|gote|mojad|pierde agua|leak|wet floor/.test(normalizeServiceText(message+' '+ticket.description)))return {turn,text:en?`I’m sorry about the inconvenience. We have your report${room}. Please keep clear of the wet floor.`:`Siento las molestias. Tenemos tu aviso${room}. Evita pisar la zona mojada.`};
  const missingRoom=!room&&['maintenance','housekeeping','complaint'].includes(ticket.category) ? (en?' Which room is affected?':' ¿En qué habitación ocurre?'):'';
  return {turn,text:(en?`We have your request${subject}${room}.`:`Ya tenemos tu petición${subject}${room}.`)+missingRoom};
}
